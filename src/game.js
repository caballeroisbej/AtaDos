// ================= JUEGO =================
// Loop, estados (título / jugando / mejora / pausa / victoria / derrota),
// cámara, y el flujo: jefe 1 -> mejora -> jefe 2 -> mejora -> jefe 3.

const Game = {
  state: 'boot',
  mode: 'coop',
  time: 0,
  hitstop: 0,
  timeScale: 1,
  slowmoT: 0,
  arenaR: CONFIG.arenaRadius,
  intents: [{ x: 0, z: 0, dash: false }, { x: 0, z: 0, dash: false }],
  dashBuf: [0, 0],
  hazards: [],
  seenHints: new Set(),
  godMode: false,
  dev: /[?&]dev/.test(location.search),
  bot: null,          // gancho de pruebas: fn(game, intents)
  pending: null,
  bossIndex: 0,
  taken: [],

  // ?seed=N fija el azar del gameplay; ?manual detiene el loop automático (lo avanzan las pruebas con step)
  manual: /[?&]manual/.test(location.search),

  init() {
    const sm = /[?&]seed=(\d+)/.exec(location.search);
    if (sm) RNG.seed(parseInt(sm[1], 10));
    const canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.camFocus = { x: 0, z: 0 };
    this.titleAngle = 0;

    Arena.build(this.scene, this.arenaR);
    VFX.init(this.scene, this.camera);
    Readability.init(this.scene, this.camera);
    this.tele = new Telegraphs(this.scene);
    this.mods = this.defaultMods();
    this.team = { links: CONFIG.team.links, maxLinks: CONFIG.team.links };
    this.stats = this.blankStats();
    this.players = [new Player(0, this, this.scene), new Player(1, this, this.scene)];
    this.chain = new Chain(this.scene, this);
    this.projectiles = new Projectiles(this.scene, this);
    HUD.init(this);
    Input.init();
    Input.onKey = (e) => this.onKey(e);
    this.bindUI();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
    window.addEventListener('pointerdown', () => AudioFX.init());
    this.resize();
    this.showTitle();
    this._last = performance.now();
    this._fpsT = 0; this._fpsN = 0;
    requestAnimationFrame((t) => this.loop(t));
    window.ATADOS = this;
  },

  defaultMods() {
    return { chainLength: 1, damage: 1, burnDps: 0, slow: 0, dashCd: 1, dashSpeed: 1, reflect: false, vamp: 0, thickness: 1 };
  },
  blankStats() {
    return { tajos: 0, bestTajo: 0, blocks: 0, hits: 0, linksLost: 0, dashes: 0, damage: 0, retries: 0, bossTimes: [], runTime: 0 };
  },

  // ---------- utilidades para los ataques ----------
  mid() {
    const a = this.players[0], b = this.players[1];
    return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  },
  pickPlayer(mode, boss) {
    const [a, b] = this.players;
    if (mode === 'random') return RNG.next() < 0.5 ? a : b;
    const da = (a.x - boss.x) ** 2 + (a.z - boss.z) ** 2;
    const db = (b.x - boss.x) ** 2 + (b.z - boss.z) ** 2;
    if (mode === 'farthest') return da > db ? a : b;
    return da < db ? a : b;
  },
  hintOnce(text) {
    if (this.seenHints.has(text)) return;
    this.seenHints.add(text);
    HUD.hint(text, 4.5);
  },
  banner(big, small, dur) { HUD.banner(big, small, dur); },

  // ---------- daño y curación del equipo ----------
  bossAlive() { return !this.boss || (this.boss.state !== 'dying' && this.boss.state !== 'dead'); },
  hurtPlayer(pl, dmg, nx, nz) {
    if (this.state !== 'playing' || !pl.canBeHit() || !this.bossAlive()) return false;
    pl.invuln = CONFIG.player.hurtInvuln;
    pl.knock(nx || 0, nz || 0, CONFIG.player.knockback);
    VFX.impact(pl.x, 1, pl.z, { color: 0xff4b4b, size: 1.2 });
    this.damageTeam(dmg, 'hit', pl.x, pl.z);
    return true;
  },
  damageTeam(n, src, x, z) {
    if (this.state !== 'playing' || !this.bossAlive()) return;
    if (x !== undefined) VFX.number(x, 2.4, z, '-' + n + (n > 1 ? ' eslabones' : ' eslabón'), 'hurt', 1.0);
    AudioFX.play('hurt');
    VFX.flash('rgba(255,40,40,1)', 0.32);
    VFX.shake(0.45, 0.3);
    if (this.godMode) return;
    const dead = Rules.damageTeam(this.team, n, false);
    this.stats.hits++;
    this.stats.linksLost += n;
    HUD.links(true);
    if (dead) this.defeat();
  },
  healTeam(n) {
    if (Rules.healTeam(this.team, n) > 0) {
      AudioFX.play('heal');
      for (const p of this.players) VFX.number(p.x, 2.3, p.z, '+' + n, 'heal');
      HUD.links(false);
    }
  },

  // ---------- flujo ----------
  // Todo cambio de estado pasa por aquí y respeta la tabla de Flow (src/core/flow.js).
  setState(to) {
    if (this.state === to) return true;
    if (!Flow.canGo(this.state, to)) {
      console.warn('[flow] transición inválida ' + this.state + ' -> ' + to);
      return false;
    }
    this.state = to;
    return true;
  },

  showTitle() {
    if (!this.setState('title')) return;
    this.bossIndex = 0;
    this.mods = this.defaultMods();
    this.setupBoss(0);
    this.showScreen('title');
    HUD.show(false);
    AudioFX.music('menu');
    this.refreshPadHints();
    let txt = '';
    try {
      const c = parseFloat(localStorage.getItem('atados_best_coop')), s = parseFloat(localStorage.getItem('atados_best_solo'));
      const parts = [];
      if (c) parts.push('2 jugadores ' + U.fmtTime(c));
      if (s) parts.push('1 jugador ' + U.fmtTime(s));
      if (parts.length) txt = '🏆 Récord: ' + parts.join(' · ');
    } catch (e) { /* sin almacenamiento */ }
    document.getElementById('bestTime').textContent = txt;
  },

  startRun(mode, bossIndex, practice) {
    if (!Flow.canGo(this.state, 'playing')) return;
    AudioFX.init();
    AudioFX.play('select');
    this.mode = mode;
    this.mods = this.defaultMods();
    this.taken = [];
    const extra = mode === 'solo' ? CONFIG.team.soloExtraLinks : 0;
    this.team = { links: CONFIG.team.links + extra, maxLinks: CONFIG.team.links + extra };
    this.stats = this.blankStats();
    this.seenHints.clear();
    this.practice = !!practice;
    // practicar un jefe avanzado: se reciben mejoras al azar para llegar en condiciones
    if (practice && bossIndex > 0) {
      const pool = U.shuffle(CONFIG.upgrades.slice());
      for (let i = 0; i < bossIndex; i++) this.applyUpgrade(pool[i], true);
    }
    HUD.setMods(this.taken);
    HUD.setControls(mode);
    this.setupBoss(bossIndex);
    this.showScreen(null);
    HUD.show(true);
    this.setState('playing');
    Input.clearPressed();
    HUD.hint('Pasen la CADENA a través del jefe para despertarlo.', 6);
  },

  setupBoss(i) {
    this.bossIndex = i;
    this.pending = null;
    const def = CONFIG.bosses[i];
    if (this.boss) { this.boss.cancelActionSafe(); this.boss.dispose(this.scene); }
    for (const h of this.hazards) { if (h.cancel) h.cancel(); h.dispose(); }
    this.hazards.length = 0;
    this.projectiles.clear();
    this.tele.clearAll();
    VFX.clear();
    Readability.clear();
    this.chain.reset();
    Arena.setTheme(def.theme);
    this.boss = new Boss(def, this, this.scene);
    this.players[0].reset(-1.8, 7.5);
    this.players[1].reset(1.8, 7.5);
    this.team.links = this.team.maxLinks;
    this.camFocus.x = 0; this.camFocus.z = 0;
    this.bossTime = 0;
    this.timeScale = 1; this.slowmoT = 0; this.hitstop = 0;
    this.dashBuf[0] = this.dashBuf[1] = 0;
    HUD.setBoss(this.boss);
    HUD.charge(0);
    HUD.resetCombo();
    HUD.links(false);
    HUD.clearHint();
    if (this.state !== 'title') AudioFX.music('menu');
  },

  // el jefe eligió un ataque: aviso sonoro distinto si apunta a alguien en particular
  onBossAttack(a) {
    const info = CONFIG.attackInfo[a.type === 'combo' ? a.parts[0].type : a.type];
    AudioFX.play('alert', { kind: info ? info.kind : 'danger' });
  },

  onBossWake() {
    AudioFX.music('fight');
    const d = this.boss.def;
    this.banner(d.name, d.epithet, 2.4);
    HUD.hint(d.intro, 5);
  },

  onBossDying() {
    for (const p of this.projectiles.active) VFX.burst(p.x, 0.9, p.z, { count: 4, speed: 3, color: 0xffffff, size: 0.2, life: 0.3 });
    this.projectiles.clear();
    for (const h of this.hazards) if (h.cancel) h.cancel();
    this.chain.electrified = false; this.chain.warning = false;
    this.timeScale = 0.3; this.slowmoT = 1.1;
    this.banner('¡DERROTADO!', this.boss.def.name, 2.2);
    HUD.clearHint();
  },

  onBossDead() {
    this.stats.bossTimes.push(this.bossTime);
    const last = this.bossIndex >= CONFIG.bosses.length - 1;
    this.pending = { t: 1.2, fn: () => (last || this.practice ? this.victory() : this.showUpgrade()) };
  },

  showUpgrade() {
    if (!this.setState('upgrade')) return;
    AudioFX.setChain(0, false, false);
    const pool = U.shuffle(CONFIG.upgrades.filter((u) => !this.taken.includes(u)));
    this.offer = pool.slice(0, 3);
    this.offerSel = 0;
    const box = document.getElementById('cards');
    box.innerHTML = '';
    this.offer.forEach((u, i) => {
      const c = document.createElement('button');
      c.className = 'card';
      c.innerHTML = `<div class="key">${i + 1}</div><div class="icon">${u.icon}</div><div class="name">${u.name}</div><div class="desc">${u.desc}</div>`;
      c.addEventListener('click', () => this.pickUpgrade(i));
      c.addEventListener('mouseenter', () => { this.offerSel = i; this.markOffer(); });
      box.appendChild(c);
    });
    this.markOffer();
    document.getElementById('upgradeNext').textContent = 'Siguiente: ' + CONFIG.bosses[this.bossIndex + 1].name;
    this.showScreen('upgradeScreen');
    this.inputLockUntil = Clock.now() + 700;
    AudioFX.music('menu');
    AudioFX.play('upgrade');
  },
  markOffer() {
    const cards = document.querySelectorAll('#cards .card');
    cards.forEach((c, i) => c.classList.toggle('sel', i === this.offerSel));
  },
  applyUpgrade(u, silent) {
    u.apply(this.mods, this);
    this.taken.push(u);
    if (!silent) AudioFX.play('upgrade');
  },
  pickUpgrade(i) {
    if (this.state !== 'upgrade') return;
    const u = this.offer[i];
    if (!u) return;
    this.applyUpgrade(u);
    HUD.setMods(this.taken);
    this.showScreen(null);
    this.setupBoss(this.bossIndex + 1);
    this.setState('playing');
    Input.clearPressed();
    HUD.show(true);
    this.banner(u.icon + ' ' + u.name, 'Siguiente: ' + this.boss.def.name, 2.2);
    HUD.hint('Despierten al jefe con la cadena cuando estén listos.', 5);
  },

  defeat() {
    if (this.state !== 'playing') return;
    this.setState('defeat');
    AudioFX.play('defeat');
    AudioFX.music('menu');
    AudioFX.setChain(0, false, false);
    const b = this.boss;
    const pct = Math.round((1 - b.hp / b.maxHp) * 100);
    document.getElementById('endTitle').textContent = 'LOS VENCIÓ EL ' + b.def.name;
    document.getElementById('endTitle').className = 'lose';
    document.getElementById('rank').style.display = 'none';
    document.getElementById('endStats').innerHTML = this.statRows([
      ['Daño al jefe', pct + '%'],
      ['Tajos', this.stats.tajos],
      ['Proyectiles bloqueados', this.stats.blocks],
      ['Tiempo', U.fmtTime(this.bossTime)],
    ]);
    document.getElementById('endTip').textContent = this.tipFor(b.def.id);
    document.getElementById('retryBtn').style.display = '';
    document.getElementById('retryBtn').textContent = '↻ Reintentar jefe (Enter)';
    this.endSel = 0;
    this.inputLockUntil = Clock.now() + 1500;
    setTimeout(() => { if (this.state === 'defeat') this.showScreen('endScreen'); }, 900);
  },

  tipFor(id) {
    const tips = {
      toro: 'Consejo: cuando embiste, sepárense hacia los lados. Si choca con el borde queda aturdido: ahí la cadena hace +30% de daño.',
      sapo: 'Consejo: rojo es peligro, azul es refugio. Cuando salta, sepárense; con el terremoto, los dos al círculo azul.',
      centinela: 'Consejo: con la cadena amarilla, aléjense del jefe. En el círculo dorado uno se queda QUIETO mientras el otro gira a su alrededor.',
    };
    return tips[id] || '';
  },

  retry() {
    if (this.state !== 'defeat' && this.state !== 'paused') return;
    this.stats.retries++;
    this.showScreen(null);
    this.setupBoss(this.bossIndex);
    this.setState('playing');
    Input.clearPressed();
    HUD.show(true);
    this._last = performance.now();
    HUD.hint('Pasen la cadena por el jefe para empezar.', 4);
  },
  // desde la pausa: volver a empezar el jefe actual (cuenta como reintento)
  restart() { if (this.state === 'paused') this.retry(); },

  victory() {
    if (!this.setState('victory')) return;
    AudioFX.play('victory');
    AudioFX.music('menu');
    AudioFX.setChain(0, false, false);
    const s = this.stats;
    const total = s.bossTimes.reduce((a, b) => a + b, 0);
    const rank = Rules.rank(s);
    let best = null;
    const key = 'atados_best_' + this.mode;
    if (!this.practice && !this.dev) {
      try {
        best = parseFloat(localStorage.getItem(key));
        if (!best || total < best) { localStorage.setItem(key, String(total)); }
      } catch (e) { /* sin almacenamiento */ }
    }
    document.getElementById('endTitle').textContent = this.practice ? '¡JEFE DERROTADO!' : '¡VICTORIA! LA CADENA AGUANTÓ';
    document.getElementById('endTitle').className = 'win';
    const rk = document.getElementById('rank');
    rk.style.display = ''; rk.textContent = rank; rk.className = 'rank r' + rank;
    const rows = [
      ['Tiempo de combate', U.fmtTime(total) + (best && total < best ? ' · ¡récord!' : best ? ' · récord ' + U.fmtTime(best) : '')],
      ['Tajos', s.tajos],
      ['Mejor tajo', Math.round(s.bestTajo)],
      ['Proyectiles bloqueados', s.blocks],
      ['Golpes recibidos', s.hits],
      ['Reintentos', s.retries],
    ];
    if (this.taken.length) rows.push(['Mejoras', this.taken.map((u) => u.icon).join(' ')]);
    document.getElementById('endStats').innerHTML = this.statRows(rows);
    document.getElementById('endTip').textContent = this.mode === 'solo' ? '¡Manejaste dos personajes a la vez! Prueben ahora en 2 jugadores.' : 'Gracias por jugar. Prueben en modo 1 jugador: un control, dos sticks.';
    document.getElementById('retryBtn').style.display = 'none';
    this.endSel = 1;
    this.inputLockUntil = Clock.now() + 1900;
    setTimeout(() => { if (this.state === 'victory') this.showScreen('endScreen'); }, 1200);
  },

  statRows(rows) {
    return rows.map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
  },

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    AudioFX.setChain(0, false, false);
    this.showScreen('pauseScreen');
  },
  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    Input.clearPressed();
    this.showScreen(null);
    this._last = performance.now();
  },
  toMenu() {
    this.showScreen(null);
    this.showTitle();
  },

  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  },

  // ---------- UI ----------
  bindUI() {
    const on = (id, fn) => document.getElementById(id).addEventListener('click', (e) => { e.currentTarget.blur(); AudioFX.init(); fn(); });
    on('btnCoop', () => this.startRun('coop', 0));
    on('btnSolo', () => this.startRun('solo', 0));
    on('btnPractice', () => { document.getElementById('practiceRow').classList.toggle('hidden'); AudioFX.play('ui'); });
    on('resumeBtn', () => this.resume());
    on('pauseMenuBtn', () => this.toMenu());
    on('restartBtn', () => this.restart());
    on('retryBtn', () => this.retry());
    on('menuBtn', () => this.toMenu());
    on('musicBtn', () => this.toggleMusic());
    const row = document.getElementById('practiceBosses');
    CONFIG.bosses.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'pbtn';
      btn.innerHTML = `<b>${i + 1}</b> ${b.name}`;
      btn.style.borderColor = '#' + new THREE.Color(b.theme.accent).getHexString();
      btn.addEventListener('click', (e) => {
        e.currentTarget.blur();
        const solo = document.getElementById('practiceSolo').checked;
        this.startRun(solo ? 'solo' : 'coop', i, true);
      });
      row.appendChild(btn);
    });
    window.addEventListener('gamepadconnected', () => { this.refreshPadHints(); HUD.setControls(this.mode); });
    window.addEventListener('gamepaddisconnected', () => { this.refreshPadHints(); HUD.setControls(this.mode); });
  },

  refreshPadHints() {
    const n = Input.padCount();
    const el = document.getElementById('padHint');
    if (!el) return;
    el.textContent = n === 0 ? 'Sin controles: todo con el teclado. Con un control: A = 2 jugadores, X = 1 jugador.'
      : n === 1 ? '🎮 1 control detectado — A: 2 jugadores (el control es P2) · X: 1 jugador (un stick por personaje)'
        : '🎮 2 controles detectados — A: 2 jugadores';
  },

  toggleMusic() {
    AudioFX.init();
    const on = AudioFX.toggleMusic();
    document.getElementById('musicBtn').textContent = on ? '♪ Música: sí (M)' : '♪ Música: no (M)';
  },

  // evita elegir mejora / reintentar sin querer por estar apretando dash
  locked() {
    return Flow.lockable.includes(this.state) && Clock.now() < this.inputLockUntil;
  },
  inputLockUntil: 0,

  // ejecuta una acción de Flow.keyAction / Flow.padAction
  act(a) {
    if (!a) return;
    switch (a) {
      case 'music': this.toggleMusic(); break;
      case 'coop': this.startRun('coop', 0); break;
      case 'solo': this.startRun('solo', 0); break;
      case 'pause': this.pause(); break;
      case 'resume': this.resume(); break;
      case 'restart': this.restart(); break;
      case 'retry': this.retry(); break;
      case 'menu': this.toMenu(); break;
      case 'sel:-1': this.offerSel = (this.offerSel + 2) % 3; this.markOffer(); break;
      case 'sel:1': this.offerSel = (this.offerSel + 1) % 3; this.markOffer(); break;
      case 'pick:sel': this.pickUpgrade(this.offerSel); break;
      default:
        if (a.startsWith('pick:')) this.pickUpgrade(parseInt(a.slice(5), 10));
    }
  },

  onKey(e) {
    AudioFX.init();
    if (e.repeat) return;
    if (this.dev) this.devKey(e.code);
    this.act(Flow.keyAction(this.state, e.code, this.locked()));
  },

  padMenu() {
    let a = Input.menuAction();
    if (this.state === 'title' && (Input.padPressedAny(0, [2]) || Input.padPressedAny(1, [2]))) a = 'x';
    if (!a) return;
    AudioFX.init();
    this.act(Flow.padAction(this.state, a, this.locked()));
  },

  devKey(c) {
    if (c === 'F2') { this.godMode = !this.godMode; this.banner('MODO DIOS', this.godMode ? 'activado' : 'desactivado', 1); }
    if (c === 'F3' && this.boss && this.state === 'playing') { if (this.boss.state === 'dormant') this.boss.wake(); else this.boss.damage(this.boss.hp + 1, 'dev'); }
    if (c === 'F4' && this.boss && this.boss.state === 'fight') this.boss.damage(this.boss.maxHp * 0.25, 'dev');
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const v = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(v);
    VFX.parts.uniforms.uScale.value = v.y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.W = w; this.H = h;
  },

  // ---------- loop ----------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let realDt = (now - this._last) / 1000;
    this._last = now;
    if (this.manual) return;
    if (!(realDt > 0)) realDt = 0;
    realDt = Math.min(realDt, 0.05);
    this._safeFrame(realDt);
  },
  _safeFrame(dt) {
    try {
      this.frame(dt);
    } catch (err) {
      // nunca dejar el juego congelado por un error: se registra y se sigue
      console.error(err);
      this.lastError = err;
    }
  },

  // ---------- ganchos de prueba (los usa scripts/smoke.js) ----------
  // avanza n frames de dt segundos sin depender del reloj real
  step(n, dt) { for (let i = 0; i < (n || 1); i++) this._safeFrame(dt || 1 / 60); },
  snapshot() {
    const b = this.boss, [p, q] = this.players;
    return {
      state: this.state, mode: this.mode, bossIndex: this.bossIndex, practice: !!this.practice,
      boss: b ? { id: b.def.id, state: b.state, x: b.x, z: b.z, hp: b.hp, maxHp: b.maxHp, phase: b.phase, attack: b.intent ? b.intent.def.type : null } : null,
      players: [{ x: p.x, z: p.z, dashCd: p.dashCd }, { x: q.x, z: q.z, dashCd: q.dashCd }],
      chain: { len: this.chain.len, contact: this.chain.contact, tajos: this.chain.tajos, charge: this.chain.charge },
      team: { links: this.team.links, maxLinks: this.team.maxLinks },
      stats: { retries: this.stats.retries, tajos: this.stats.tajos, dashes: this.stats.dashes },
      screen: [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).map((s) => s.id)[0] || null,
      threat: Readability.lastThreat, roles: Readability._roles.slice(),
      lastError: this.lastError ? String(this.lastError) : null,
    };
  },

  frame(realDt) {
    Input.pollPads();
    this.padMenu();
    if (this.pending && this.state === 'playing') {
      this.pending.t -= realDt;
      if (this.pending.t <= 0) { const fn = this.pending.fn; this.pending = null; fn(); }
    }
    // controles conectados/desconectados: actualizar los textos
    const pc = Input.padCount();
    if (pc !== this._padCount) { this._padCount = pc; this.refreshPadHints(); HUD.setControls(this.mode); }
    // cámara lenta (muerte del jefe)
    if (this.slowmoT > 0) { this.slowmoT -= realDt; if (this.slowmoT <= 0) this.timeScale = 1; }
    const dt = realDt * this.timeScale;
    let simDt = 0;

    if (this.state === 'playing') {
      Input.read(this.mode, this.intents);
      if (this.bot) this.bot(this, this.intents);
      for (let i = 0; i < 2; i++) {
        this.dashBuf[i] = Math.max(0, this.dashBuf[i] - realDt);
        if (this.intents[i].dash) this.dashBuf[i] = CONFIG.input.dashBuffer;
      }
      if (this.hitstop > 0) this.hitstop -= realDt;
      else { simDt = dt; this.simulate(dt); }
      AudioFX.setChain(this.chain.energy, this.chain.electrified, this.chain.len > CONFIG.chain.minLength);
    } else if (this.state === 'title') {
      simDt = dt;
      if (this.boss) this.boss.time += dt;
    } else if (this.state === 'victory' || this.state === 'upgrade') {
      simDt = dt; // dejar que terminen las partículas
    }

    this.time += simDt;
    VFX.update(simDt, realDt);
    Arena.update(this.state === 'paused' ? 0 : dt);
    this.tele.update(simDt, this.time);

    // render de entidades
    for (const p of this.players) p.render(this.state === 'paused' ? 0 : dt, this.time);
    if (this.boss) this.boss.render(this.state === 'paused' ? 0 : dt, this.time);
    this.chain.render(this.time);
    this.projectiles.render();
    Readability.update(this, this.state === 'paused' ? 0 : realDt, this.time);
    this.updateCamera(realDt);
    this.renderer.render(this.scene, this.camera);
    VFX.updateNumbers(this.state === 'paused' ? 0 : realDt, this.W, this.H);
    Readability.place(this.W, this.H);
    HUD.update(realDt);
    Input.endFrame();

    if (this.dev) {
      this._fpsT += realDt; this._fpsN++;
      if (this._fpsT > 0.5) {
        document.getElementById('devInfo').textContent = `${Math.round(this._fpsN / this._fpsT)} fps · energía ${this.chain.energy.toFixed(2)} · mult ${this.chain.mult.toFixed(2)} · hp ${this.boss ? Math.round(this.boss.hp) : '-'}${this.godMode ? ' · DIOS' : ''}`;
        this._fpsT = 0; this._fpsN = 0;
      }
    }
  },

  simulate(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    const [a, b] = this.players;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < 2; i++) {
        const it = this.intents[i];
        it.dash = this.dashBuf[i] > 0;
        const p = this.players[i];
        const before = p.dashT;
        p.update(h, it);
        if (p.dashT > 0 && before <= 0) this.dashBuf[i] = 0;
      }
      Player.separate(a, b);
      this.chain.constrain(a, b);
      if (this.boss) this.boss.update(h);
      this.chain.update(h);
      this.projectiles.update(h);
      for (let k = this.hazards.length - 1; k >= 0; k--) {
        const hz = this.hazards[k];
        if (!hz.update(h)) { hz.dispose(); this.hazards.splice(k, 1); }
      }
      if (this.state !== 'playing') break;
    }
    this.bossTime += dt;
    this.stats.runTime += dt;
  },

  updateCamera(dt) {
    const cam = this.camera;
    // pantallas angostas: alejar la cámara para que entre la arena completa
    const narrow = Math.max(1, 1.45 / Math.max(0.5, cam.aspect));
    if (this.state === 'title') {
      this.titleAngle += dt * 0.07;
      const r = 21 * narrow;
      cam.position.set(Math.sin(this.titleAngle) * r, 12 * narrow, Math.cos(this.titleAngle) * r);
      cam.lookAt(0, -1, 0);
      return;
    }
    const [a, b] = this.players;
    let fx = (a.x + b.x) * 0.5, fz = (a.z + b.z) * 0.5;
    if (this.boss && this.boss.state !== 'dead') { fx = fx * 0.6 + this.boss.x * 0.4; fz = fz * 0.6 + this.boss.z * 0.4; }
    fx *= 0.12; fz *= 0.12;
    this.camFocus.x = U.damp(this.camFocus.x, fx, 3, dt);
    this.camFocus.z = U.damp(this.camFocus.z, fz, 3, dt);
    // encuadre calculado: la arena completa (borde lejano a borde cercano) entra justo en pantalla
    const R = this.arenaR;
    const half = THREE.MathUtils.degToRad(cam.fov) / 2;
    const th = THREE.MathUtils.degToRad(56);
    const zFar = -R - 0.6, zNear = R + 1.4;
    const ka = 1 / Math.tan(th + half), kb = 1 / Math.tan(th - half);
    let H = (zNear - zFar) / (kb - ka);
    let back = H / Math.tan(th);
    const lookZ = zNear + ka * H - back;
    H *= narrow; back *= narrow;
    const z = 1 + VFX.zoomOff * 0.03;
    cam.position.set(this.camFocus.x + VFX.offX, H * z + VFX.offY, this.camFocus.z + lookZ + back * z + VFX.offZ);
    cam.lookAt(this.camFocus.x + VFX.offX * 0.5, 0, this.camFocus.z + lookZ);
  },
};

// cancelar sin riesgo (si el generador está corriendo, se cancela en el próximo frame)
Boss.prototype.cancelActionSafe = function () {
  try { this.cancelAction(); } catch (e) { this.action = null; }
};

window.addEventListener('load', () => Game.init());
