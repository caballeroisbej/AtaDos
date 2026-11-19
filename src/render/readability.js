// ================= LECTURA EN EL MUNDO =================
// Ayudas visuales que responden "¿qué hace cada uno?" y "¿qué amenaza ahora?":
//  - sombra de la cadena en el piso, coloreada por su estado (bloquea / carga / eléctrica / golpeando)
//  - marca roja bajo el jugador al que apunta el ataque en curso
//  - aro del color de la amenaza alrededor del jefe mientras ataca
//  - etiquetas de rol sobre cada jugador (QUIETO / ATACA / AL AZUL / SEPÁRENSE / ¡A TI!)
// Todo pre-asignado al iniciar (regla de pools): por frame solo se mueven y recolorean.
// Las decisiones salen de Rules.roles / Rules.threat / Rules.coordination (src/gameplay/rules.js).

const Readability = {
  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    const C = CONFIG.colors;
    this.kindColor = {
      danger: new THREE.Color(C.danger), safe: new THREE.Color(C.safe), electric: new THREE.Color(C.electric),
      anchor: new THREE.Color(C.anchor), projectile: new THREE.Color(C.projectile), pierce: new THREE.Color(C.pierce),
    };
    this._c = new THREE.Color();
    this._p1 = new THREE.Color(C.p1); this._p2 = new THREE.Color(C.p2);
    this._white = new THREE.Color(0xffffff); this._elec = new THREE.Color(C.electric); this._gold = new THREE.Color(0xffc94a);

    // ---- sombra de la cadena en el piso ----
    this.SEG = 24;
    const nv = (this.SEG + 1) * 2;
    this.tPos = new Float32Array(nv * 3);
    this.tCol = new Float32Array(nv * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s < this.SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(idx);
    this.tether = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.tether.frustumCulled = false; this.tether.renderOrder = 2;
    scene.add(this.tether);

    // ---- marcas de objetivo (una por jugador) ----
    const ringGeo = new THREE.RingGeometry(0.95, 1.12, 40); ringGeo.rotateX(-Math.PI / 2);
    const chev = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2;
      const ox = Math.sin(a), oz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a);
      // triángulo que apunta hacia el centro
      v.push(ox * 1.55 + px * 0.24, 0, oz * 1.55 + pz * 0.24, ox * 1.55 - px * 0.24, 0, oz * 1.55 - pz * 0.24, ox * 1.18, 0, oz * 1.18);
    }
    chev.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    this.markers = [];
    for (let i = 0; i < 2; i++) {
      const grp = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: C.danger, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      const r = new THREE.Mesh(ringGeo, mat); r.renderOrder = 4; grp.add(r);
      const c = new THREE.Mesh(chev, mat); c.renderOrder = 4; grp.add(c);
      grp.visible = false;
      scene.add(grp);
      this.markers.push({ grp, mat, k: 0 });
    }

    // ---- aro de amenaza alrededor del jefe ----
    const aro = new THREE.RingGeometry(1.0, 1.08, 64); aro.rotateX(-Math.PI / 2);
    this.bossRingMat = new THREE.MeshBasicMaterial({ color: C.danger, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.bossRing = new THREE.Mesh(aro, this.bossRingMat);
    this.bossRing.renderOrder = 3;
    scene.add(this.bossRing);

    // ---- etiquetas DOM: jugador 1, jugador 2, jefe ----
    const layer = document.getElementById('tags');
    this.tags = [];
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('div');
      el.className = 'tag ' + (i === 0 ? 'p1' : i === 1 ? 'p2' : 'boss');
      el.style.display = 'none';
      layer.appendChild(el);
      this.tags.push({ el, text: null, cls: null, x: 0, y: 0, z: 0 });
    }
    this._roles = [null, null];
    this._coord = { len: 0, tension: 0, share: 0.5, power: 0, aligned: false };
    this._ctx = { type: null, targets: [false, false], electrified: false, warning: false, anchor: null, players: null, dormant: false };
    this._anchor = { x: 0, z: 0, occupant: -1 };
    this._v = new THREE.Vector3();
    this.lastThreat = null; // la última amenaza calculada (la usan HUD y pruebas)
  },

  _setTag(i, text, cls) {
    const t = this.tags[i];
    if (t.text !== text) {
      t.text = text;
      t.el.textContent = text || '';
      t.el.style.display = text ? 'block' : 'none';
    }
    if (t.cls !== cls) { t.cls = cls; t.el.className = 'tag ' + (i === 0 ? 'p1' : i === 1 ? 'p2' : 'boss') + (cls ? ' ' + cls : ''); }
  },

  // lógica de lectura (por frame, sin crear objetos)
  update(g, dt, time) {
    const U_ = CONFIG.ui;
    const playing = g.state === 'playing' || g.state === 'paused';
    const a = g.players[0], b = g.players[1], boss = g.boss;
    const intent = boss && playing && boss.state === 'fight' ? boss.intent : null;

    // ---- amenaza en curso ----
    const threat = intent ? Rules.threat(intent.def, CONFIG.attackInfo) : null;
    this.lastThreat = threat;
    HUD.threat(U_.threatCard ? threat : null);

    // ---- roles ----
    const ctx = this._ctx;
    ctx.type = intent ? intent.def.type : null;
    ctx.targets[0] = !!(intent && intent.targets[0]);
    ctx.targets[1] = !!(intent && intent.targets[1]);
    ctx.electrified = !!(boss && playing && g.chain.electrified);
    ctx.warning = !!(boss && playing && g.chain.warning);
    ctx.players = g.players;
    ctx.dormant = !boss || boss.state === 'dormant';
    ctx.anchor = null;
    if (playing) {
      for (const h of g.hazards) {
        if (h instanceof AnchorHazard && !h.done) {
          this._anchor.x = h.x; this._anchor.z = h.z;
          this._anchor.occupant = h.occupant ? h.occupant.idx : -1;
          ctx.anchor = this._anchor;
          break;
        }
      }
    }
    const roles = playing ? Rules.roles(ctx, this._roles) : (this._roles[0] = this._roles[1] = null, this._roles);
    for (let i = 0; i < 2; i++) {
      const r = U_.roleTags ? roles[i] : null;
      const cls = r === '¡A TI!' ? 'danger' : r === 'QUIETO' || r === 'AL DORADO' ? 'anchor' : r === 'AL AZUL' ? 'safe' : r === 'LEJOS' ? 'electric' : r ? 'info' : null;
      this._setTag(i, r, cls);
      const p = g.players[i];
      const t = this.tags[i]; t.x = p.x; t.y = 2.55; t.z = p.z;
    }
    // jefe dormido: decir cómo despertarlo
    const sleeping = playing && boss && boss.state === 'dormant';
    this._setTag(2, sleeping && U_.roleTags ? 'CRÚCENLO CON LA CADENA' : null, 'info');
    if (boss) { const t = this.tags[2]; t.x = boss.x; t.y = 3.6 + boss.radius * 0.5; t.z = boss.z; }

    // ---- marcas de objetivo ----
    for (let i = 0; i < 2; i++) {
      const m = this.markers[i];
      const on = U_.targetMarkers && playing && ctx.targets[i];
      m.k = U.damp(m.k, on ? 1 : 0, 14, dt);
      m.grp.visible = m.k > 0.02;
      if (!m.grp.visible) continue;
      const p = g.players[i];
      m.grp.position.set(p.x, 0.06, p.z);
      m.grp.rotation.y = time * 2.2;
      m.grp.scale.setScalar((1.2 + 0.12 * Math.sin(time * 12)) * (0.6 + 0.4 * m.k));
      m.mat.opacity = 0.9 * m.k;
    }

    // ---- aro de amenaza en el jefe ----
    if (threat && boss) {
      this.bossRingMat.color.copy(this.kindColor[threat.kind] || this.kindColor.danger);
      this.bossRingMat.opacity = 0.55 + 0.35 * Math.sin(time * 9);
      this.bossRing.position.set(boss.x, 0.05, boss.z);
      this.bossRing.scale.setScalar(boss.radius + 0.55);
      this.bossRing.visible = !boss.airborne;
    } else this.bossRing.visible = false;

    // ---- coordinación: medidor de barrido ----
    const co = Rules.coordination(a, b, boss && boss.hittable && playing ? boss : null, g.chain.maxLength, CONFIG.chain, this._coord);
    HUD.sweep(U_.sweepMeter && playing ? co : null, g.chain);

    this._tetherRender(g, co, time);
  },

  _tetherRender(g, co, time) {
    const show = CONFIG.ui.floorTether && g.state !== 'title' && g.chain.visible;
    this.tether.visible = show;
    if (!show) return;
    const a = g.players[0], b = g.players[1], ch = g.chain;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-4;
    const ux = dx / d, uz = dz / d;
    // ancho: fina si está floja, gruesa si está tensa; más ancha mientras golpea
    const w = 0.05 + co.tension * 0.07 + (ch.contact ? 0.08 : 0);
    const P = this.tPos, Cc = this.tCol;
    const chg = ch.charge / CONFIG.chain.chargeMax;
    const hit = ch.contact ? Math.min(1, ch.mult / 2) : 0;
    for (let i = 0; i <= this.SEG; i++) {
      const t = i / this.SEG;
      const x = a.x + dx * t, z = a.z + dz * t;
      const o = i * 6;
      P[o] = x - uz * w; P[o + 1] = 0.05; P[o + 2] = z + ux * w;
      P[o + 3] = x + uz * w; P[o + 4] = 0.05; P[o + 5] = z - ux * w;
      const c = this._c.copy(this._p1).lerp(this._p2, t);
      if (ch.electrified || ch.warning) c.lerp(this._elec, ch.electrified ? 0.9 : 0.5 + 0.5 * Math.sin(time * 30));
      else if (chg > 0) c.lerp(this._gold, Math.min(0.8, chg));
      if (hit > 0) c.lerp(this._white, hit * 0.7);
      // los extremos se apagan: la cadena "nace" de cada jugador
      const k = (0.25 + co.tension * 0.35 + hit * 0.4) * Math.min(1, Math.min(t, 1 - t) * 6);
      Cc[o] = Cc[o + 3] = c.r * k; Cc[o + 1] = Cc[o + 4] = c.g * k; Cc[o + 2] = Cc[o + 5] = c.b * k;
    }
    this.tether.geometry.attributes.position.needsUpdate = true;
    this.tether.geometry.attributes.color.needsUpdate = true;
  },

  // posiciona etiquetas en pantalla (después de mover la cámara)
  place(w, h) {
    const v = this._v;
    for (const t of this.tags) {
      if (!t.text) continue;
      v.set(t.x, t.y, t.z).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      t.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    }
  },

  clear() {
    for (let i = 0; i < 3; i++) this._setTag(i, null, null);
    for (const m of this.markers) { m.k = 0; m.grp.visible = false; }
    this.bossRing.visible = false;
  },
};
