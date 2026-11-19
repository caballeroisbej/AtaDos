// ================= HUD =================
// DOM sobre el canvas. La vida compartida se dibuja como una cadena de eslabones.
const HUD = {
  init(g) {
    this.g = g;
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), bossName: $('bossName'), bossSub: $('bossSub'), bossFill: $('bossFill'), bossGhost: $('bossGhost'),
      bossNotches: $('bossNotches'), bossBar: $('bossBar'), links: $('links'), mods: $('mods'),
      p1dash: $('p1dash'), p2dash: $('p2dash'), p1keys: $('p1keys'), p2keys: $('p2keys'),
      combo: $('combo'), hint: $('hint'), banner: $('banner'), bannerBig: $('bannerBig'), bannerSmall: $('bannerSmall'),
      lifePanel: $('lifePanel'), status: $('bossStatus'), charge: $('charge'),
    };
    this.el.threat = $('threat'); this.el.threatLabel = $('threatLabel'); this.el.threatAdvice = $('threatAdvice');
    this.el.sweep = $('sweep'); this.el.swP1 = $('swP1'); this.el.swP2 = $('swP2'); this.el.swState = $('swState'); this.el.swMult = $('swMult');
    this.ghost = 1;
    this.hintT = 0; this.bannerT = 0; this.comboT = 0;
    this._maxLinks = -1;
    this._threatKey = null; this._swKey = null; this._swState = null;
  },

  // tarjeta AMENAZA: qué ataque viene y qué hacer (t = Rules.threat(...) o null)
  threat(t) {
    const key = t ? t.kind + '|' + t.label : '';
    if (key === this._threatKey) return;
    this._threatKey = key;
    const el = this.el.threat;
    if (!t) { el.classList.remove('on'); return; }
    el.className = 'on k-' + t.kind;
    this.el.threatLabel.textContent = t.label;
    this.el.threatAdvice.textContent = t.advice;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  },

  // medidor de BARRIDO: cuánto barre cada jugador y en qué estado está la cadena
  sweep(co, chain) {
    const el = this.el.sweep;
    if (!co) { if (this._swKey !== 'off') { this._swKey = 'off'; el.classList.add('off'); } return; }
    if (this._swKey === 'off') el.classList.remove('off');
    const C = CONFIG.chain;
    const live = chain.contact ? chain.mult : co.power;
    const total = U.clamp(live / C.maxMult, 0, 1) * 100;
    const p1 = total * co.share, p2 = total - p1;
    const key = p1.toFixed(0) + '|' + p2.toFixed(0) + '|' + live.toFixed(1);
    if (key !== this._swKey) {
      this._swKey = key;
      this.el.swP1.style.width = p1.toFixed(1) + '%';
      this.el.swP2.style.width = p2.toFixed(1) + '%';
      this.el.swMult.textContent = 'x' + live.toFixed(1);
    }
    let st, cls;
    if (chain.electrified) { st = '⚡ NO TOCAR AL JEFE'; cls = 'electric'; }
    else if (chain.warning) { st = '⚡ SE VA A ELECTRIFICAR'; cls = 'electric'; }
    else if (chain.contact) { st = 'GOLPEANDO'; cls = 'hit'; }
    else if (co.aligned) { st = 'ALINEADOS · ¡CRÚCENLO!'; cls = 'aligned'; }
    else if (co.tension > 0.92) { st = 'TENSA'; cls = 'taut'; }
    else if (co.tension < 0.2) { st = 'FLOJA · sepárense'; cls = 'slack'; }
    else { st = 'LISTA'; cls = ''; }
    if (st !== this._swState) {
      this._swState = st;
      this.el.swState.textContent = st;
      el.className = cls ? 's-' + cls : '';
    }
  },

  show(v) { this.el.hud.classList.toggle('hidden', !v); },

  setBoss(boss) {
    const d = boss.def;
    this.el.bossName.textContent = d.name;
    this.el.bossSub.textContent = d.epithet;
    this.el.bossName.style.color = '#' + new THREE.Color(d.theme.accent).getHexString();
    this.el.bossNotches.innerHTML = '';
    d.phases.forEach((ph, i) => {
      if (i === 0) return;
      const n = document.createElement('div');
      n.className = 'notch';
      n.style.left = (ph.at * 100) + '%';
      this.el.bossNotches.appendChild(n);
    });
    this.ghost = 1;
    this.el.bossFill.style.width = '100%';
    this.el.bossGhost.style.width = '100%';
  },

  setControls(mode) {
    const pads = Input.padCount();
    let k1 = 'WASD · ESPACIO', k2 = 'FLECHAS · ENTER';
    if (mode === 'solo' && pads) { k1 = '🎮 Stick izq · LB'; k2 = '🎮 Stick der · RB'; }
    else if (mode !== 'solo' && pads >= 2) { k1 = '🎮 Control 1'; k2 = '🎮 Control 2'; }
    else if (mode !== 'solo' && pads === 1) { k2 = '🎮 Control · A'; }
    this.el.p1keys.textContent = k1;
    this.el.p2keys.textContent = k2;
  },

  links(lostNow) {
    const t = this.g.team;
    if (t.maxLinks !== this._maxLinks) {
      this._maxLinks = t.maxLinks;
      this.el.links.innerHTML = '';
      for (let i = 0; i < t.maxLinks; i++) {
        const d = document.createElement('div');
        d.className = 'link ' + (i % 2 ? 'b' : 'a');
        this.el.links.appendChild(d);
      }
    }
    const nodes = this.el.links.children;
    for (let i = 0; i < nodes.length; i++) {
      const broken = i >= t.links;
      const was = nodes[i].classList.contains('broken');
      nodes[i].classList.toggle('broken', broken);
      if (broken && !was && lostNow) {
        nodes[i].classList.remove('lost', 'healed'); void nodes[i].offsetWidth; nodes[i].classList.add('lost');
      }
      if (!broken && was) {
        nodes[i].classList.remove('healed', 'lost'); void nodes[i].offsetWidth; nodes[i].classList.add('healed');
      }
    }
    this.el.lifePanel.classList.toggle('danger', t.links <= 2);
    if (lostNow) { this.el.lifePanel.classList.remove('shake'); void this.el.lifePanel.offsetWidth; this.el.lifePanel.classList.add('shake'); }
  },

  setMods(list) {
    this.el.mods.innerHTML = list.map((u) => `<span title="${u.name}: ${u.desc}">${u.icon}</span>`).join('');
  },

  combo(n) {
    this.el.combo.innerHTML = `TAJO <b>x${n}</b>`;
    this.el.combo.classList.remove('pop'); void this.el.combo.offsetWidth; this.el.combo.classList.add('pop');
    this.el.combo.style.opacity = 1;
    this.comboT = CONFIG.chain.comboWindow;
  },

  charge(n) {
    const el = this.el.charge;
    if (!n) { el.classList.remove('on'); return; }
    el.innerHTML = '⚡ CARGA <b>+' + Math.round(n * CONFIG.chain.chargePerBlock * 100) + '%</b>';
    el.classList.add('on');
    el.classList.toggle('full', n >= CONFIG.chain.chargeMax);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  },

  resetCombo() { this.comboT = 0; this.el.combo.style.opacity = 0; },

  hint(text, dur) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('on');
    this.hintT = dur || 4;
  },
  clearHint() { this.hintT = 0; this.el.hint.classList.remove('on'); },

  banner(big, small, dur) {
    this.el.bannerBig.textContent = big;
    this.el.bannerSmall.textContent = small || '';
    const b = this.el.banner;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    this.bannerT = dur || 2.2;
  },

  update(dt) {
    const g = this.g, b = g.boss;
    if (b) {
      const k = Math.max(0, b.hp / b.maxHp);
      this.el.bossFill.style.width = (k * 100).toFixed(2) + '%';
      this.ghost = this.ghost > k ? Math.max(k, this.ghost - dt * 0.35) : k;
      this.el.bossGhost.style.width = (this.ghost * 100).toFixed(2) + '%';
      let st = '';
      if (b.state === 'dormant') st = 'DORMIDO';
      else if (b.stunned || b.vuln > 1) st = b.vuln > 1 ? 'EXPUESTO x' + b.vuln : 'ATURDIDO · +30% daño';
      else if (b.slowT > 0) st = 'CONGELADO';
      else if (g.chain.electrified) st = '⚡ CADENA ELECTRIFICADA';
      if (this.el.status.textContent !== st) {
        this.el.status.textContent = st;
        this.el.status.className = st ? (g.chain.electrified ? 'warn' : 'good') : '';
      }
      this.el.bossBar.classList.toggle('vuln', !!(b.stunned || b.vuln > 1));
    }
    for (let i = 0; i < 2; i++) {
      const p = g.players[i];
      const cd = CONFIG.player.dashCooldown * g.mods.dashCd;
      const k = p.dashCd <= 0 ? 1 : 1 - p.dashCd / cd;
      const el = i === 0 ? this.el.p1dash : this.el.p2dash;
      el.style.width = (k * 100).toFixed(1) + '%';
      el.classList.toggle('ready', k >= 1);
    }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.el.hint.classList.remove('on'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.el.combo.style.opacity = 0; }
  },
};
