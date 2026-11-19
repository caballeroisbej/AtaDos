// ================= LA CADENA =================
// La única arma. En gameplay es el SEGMENTO recto entre los dos jugadores:
//  - daña al jefe mientras lo atraviesa, más mientras más rápido barre
//  - TAJO: cruzar al jefe de un lado al otro da un golpe extra (y combo)
//  - bloquea proyectiles naranjos (los morados la atraviesan)
//  - tiene largo máximo: si se estira, arrastra al compañero (el que hace dash pesa más)
// Lo que se ve coincide con lo que golpea: los eslabones van sobre ese mismo segmento.

class Chain {
  constructor(scene, game) {
    this.g = game;
    this.MAX = 80;
    this.SEG = 40;

    // eslabones instanciados
    const lg = new THREE.TorusGeometry(0.15, 0.048, 6, 12);
    lg.scale(1, 1.6, 1);
    lg.rotateX(Math.PI / 2);
    this.linkMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 });
    this.links = new THREE.InstancedMesh(lg, this.linkMat, this.MAX);
    this.links.castShadow = true;
    this.links.frustumCulled = false;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < this.MAX; i++) this.links.setColorAt(i, white);
    scene.add(this.links);

    // cinta de energía aditiva sobre la cadena
    const nv = (this.SEG + 1) * 2;
    this.rPos = new Float32Array(nv * 3);
    this.rCol = new Float32Array(nv * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.rPos, 3).setUsage(THREE.DynamicDrawUsage));
    rg.setAttribute('color', new THREE.BufferAttribute(this.rCol, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s < this.SEG; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rg.setIndex(idx);
    this.ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 8;
    scene.add(this.ribbon);

    this._dummy = new THREE.Object3D();
    this._c1 = new THREE.Color(CONFIG.colors.p1);
    this._c2 = new THREE.Color(CONFIG.colors.p2);
    this._ce = new THREE.Color(CONFIG.colors.electric);
    this._tmp = new THREE.Color();
    this.reset();
  }

  reset() {
    this.energy = 0;
    this.len = 0;
    this.contact = false;
    this.prevSide = 0;
    this.accum = 0; this.tickT = 0;
    this.combo = 0; this.comboT = 0;
    this.tajos = 0;
    this.charge = 0;
    this.zapCd = 0;
    this.electrified = false;
    this.warning = false;
    this.contactX = 0; this.contactZ = 0;
    this.mult = 0;
    this.yankCd = 0;
    this.visible = true;
    this._ct = this._ct || { len: 0, t: 0, d: 0, cx: 0, cz: 0, nx: 0, nz: 0, side: 0, inside: false };
  }

  get maxLength() { return CONFIG.chain.length * this.g.mods.chainLength; }

  // ---------- restricción de largo máximo (por subpaso) ----------
  constrain(a, b) {
    const C = CONFIG.chain;
    const r = Rules.constrain(a, b, this.maxLength, C.dasherWeight);
    if (r.rv > C.yankSpeed && this.yankCd <= 0) {
      this.yankCd = C.yankCooldown;
      const pulled = r.pulled;
      AudioFX.play('yank');
      VFX.number(pulled.x, 2.0, pulled.z, '¡TIRÓN!', 'word');
      VFX.burst(pulled.x, 0.5, pulled.z, { count: 8, speed: 3, up: 1, color: 0xffffff, size: 0.25, life: 0.35 });
    }
  }

  addCharge(x, z) {
    const C = CONFIG.chain;
    if (this.charge >= C.chargeMax) return;
    this.charge++;
    HUD.charge(this.charge);
    VFX.glow(x, 0.9, z, { color: 0xffd36a, size: 0.4, grow: 2, dur: 0.18 });
  }

  // ¿el proyectil (x,z,r) choca con la cadena? (los extremos, pegados a los jugadores, no cuentan)
  blocks(x, z, r) {
    const a = this.g.players[0], b = this.g.players[1];
    return Rules.blocks(a, b, x, z, r, CONFIG.player.radius, CONFIG.chain.thickness * this.g.mods.thickness);
  }

  // ---------- lógica (por subpaso) ----------
  update(dt) {
    const g = this.g, C = CONFIG.chain;
    const a = g.players[0], b = g.players[1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const d = Math.sqrt(abx * abx + abz * abz);
    this.len = d;
    this.zapCd -= dt; this.yankCd -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    // energía visual: qué tan rápido barre la cadena (componente perpendicular)
    let nx = 0, nz = 0;
    if (d > 1e-4) { nx = -abz / d; nz = abx / d; }
    const pa = Math.abs(a.vx * nx + a.vz * nz), pb = Math.abs(b.vx * nx + b.vz * nz);
    const e = (pa + pb) * 0.5 / C.refSpeed;
    this.energy = U.damp(this.energy, e, 10, dt);

    const boss = g.boss;
    this.contact = false;
    this.mult = 0;
    if (!boss || !boss.hittable || d < 1e-4) { this.prevSide = 0; return; }

    const ct = Rules.chainContact(a, b, boss, C.minLength, this._ct);
    const inside = ct.inside;
    // velocidad de la cadena en el punto de contacto, relativa al jefe
    const mult = Rules.sweepMult(a, b, boss, ct.t, ct.nx, ct.nz, C);
    this.mult = inside ? mult : 0;

    // punto de impacto visual: borde del jefe hacia el segmento
    let px = ct.cx, pz = ct.cz;
    if (ct.d > 1e-3) { px = boss.x + (ct.cx - boss.x) / ct.d * Math.min(ct.d, boss.radius * 0.9); pz = boss.z + (ct.cz - boss.z) / ct.d * Math.min(ct.d, boss.radius * 0.9); }
    this.contactX = px; this.contactZ = pz;

    // de qué lado de la cadena está el jefe (para detectar el TAJO)
    const side = ct.side;

    if (boss.state === 'dormant') {
      if (inside) boss.wake();
      this.prevSide = side;
      return;
    }

    if (inside) {
      this.contact = true;
      if (this.electrified) {
        if (this.zapCd <= 0) this._zap(boss);
      } else {
        const dealt = boss.damage(Rules.tickDamage(C, mult, g.mods, this.combo, dt), 'chain');
        this.accum += dealt;
        this.tickT += dt;
        if (g.mods.burnDps > 0) boss.burnT = 3;
        if (this.tickT >= C.tickInterval) {
          if (this.accum >= 0.5) {
            VFX.number(px, 1.6, pz, Math.round(this.accum), mult > 1.6 ? 'hot' : '');
            const col = mult > 1.6 ? 0xffe08a : 0xffffff;
            VFX.burst(px, 1.0, pz, { count: 3 + Math.min(8, Math.round(mult * 3)), speed: 3 + mult * 3, up: 3, life: 0.35, size: 0.22, color: col });
            AudioFX.play('hit', { mult });
          }
          this.accum = 0; this.tickT = 0;
        }
      }
    }

    // TAJO: el jefe pasó de un lado de la cadena al otro, dentro del segmento
    if (boss.state === 'fight' && Rules.isTajo(this.prevSide, ct, boss.radius, C.minLength)) {
      if (!this.electrified) this._tajo(boss, Math.max(C.slashMinMult, mult), px, pz);
    }
    if (side !== 0) this.prevSide = side;
  }

  _tajo(boss, mult, px, pz) {
    const g = this.g, C = CONFIG.chain;
    const charged = this.charge > 0;
    const chargeF = 1 + this.charge * C.chargePerBlock;
    const dealt = boss.damage(Rules.tajoDamage(C, mult, g.mods, this.combo, this.charge), 'tajo');
    if (charged) {
      VFX.number(boss.x, 3.6 + boss.radius * 0.4, boss.z, '¡CARGADO! +' + Math.round(this.charge * C.chargePerBlock * 100) + '%', 'word warn', 1.1);
      VFX.ring(boss.x, boss.z, { color: 0xffd36a, from: boss.radius, to: boss.radius * 3.2, dur: 0.45 });
      VFX.shake(0.35, 0.3);
      this.charge = 0;
      HUD.charge(0);
    }
    this.combo++;
    this.comboT = C.comboWindow;
    this.tajos++;
    g.stats.tajos++;
    g.stats.bestTajo = Math.max(g.stats.bestTajo, dealt);
    const big = mult > 1.5 || chargeF > 1.45;
    VFX.number(boss.x, 2.6 + boss.radius * 0.4, boss.z, (big ? '¡TAJO! ' : 'TAJO ') + Math.round(dealt), big ? 'tajo big' : 'tajo');
    if (this.combo >= 2) HUD.combo(this.combo);
    g.hitstop = Math.max(g.hitstop, 0.04 + Math.min(0.05, mult * 0.02));
    VFX.shake(0.18 + Math.min(0.3, mult * 0.1), 0.22);
    if (big) VFX.punch(0.8, 0.16);
    VFX.flash('rgba(255,255,255,1)', big ? 0.12 : 0.06);
    VFX.ring(boss.x, boss.z, { color: 0xffffff, from: boss.radius * 0.6, to: boss.radius * 2.2, dur: 0.3 });
    // chispas a lo largo de la cadena
    const a = g.players[0], b = g.players[1];
    for (let i = 0; i < 10; i++) {
      const t = Math.random();
      VFX.parts.emit(U.lerp(a.x, b.x, t), 0.9, U.lerp(a.z, b.z, t), (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.4, 0.28, i % 2 ? 0xffffff : 0xffd27a);
    }
    VFX.burst(px, 1.2, pz, { count: 22, speed: 9, up: 4, life: 0.45, size: 0.32, colors: [0xffffff, 0xffe08a, boss.def.theme.accent] });
    AudioFX.play('tajo', { mult });
    if (g.mods.slow > 0) {
      boss.slowT = 2.5;
      VFX.burst(boss.x, 1.5, boss.z, { count: 14, speed: 3, up: 1, color: 0x9fe7ff, size: 0.3, life: 0.8 });
    }
    if (g.mods.vamp > 0 && this.tajos % g.mods.vamp === 0) g.healTeam(1);
  }

  _zap(boss) {
    const g = this.g;
    this.zapCd = CONFIG.chain.zapCooldown;
    g.damageTeam(1, 'zap', boss.x, boss.z);
    // empujar a ambos lejos del jefe
    for (const p of g.players) {
      let dx = p.x - boss.x, dz = p.z - boss.z;
      const l = Math.sqrt(dx * dx + dz * dz) || 1;
      p.knock(dx / l, dz / l, CONFIG.chain.zapKnock);
    }
    AudioFX.play('zap');
    VFX.flash('rgba(255,236,120,1)', 0.25);
    const a = g.players[0], b = g.players[1];
    for (let i = 0; i < 24; i++) {
      const t = Math.random();
      VFX.parts.emit(U.lerp(a.x, b.x, t), 0.9, U.lerp(a.z, b.z, t), (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, 0.3, 0.3, 0xfff07a);
    }
    VFX.number(boss.x, 3, boss.z, '¡ZAP!', 'word warn');
  }

  // ---------- render (por frame) ----------
  render(time) {
    const g = this.g;
    const a = g.players[0], b = g.players[1];
    this.links.visible = this.ribbon.visible = this.visible;
    if (!this.visible) return;
    const L = this.maxLength;
    let dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1e-4;
    const ux = dx / d, uz = dz / d;
    // las manos (grilletes) un poco hacia el compañero
    const ax = a.x + ux * 0.28, az = a.z + uz * 0.28, ay = a.handY;
    const bx = b.x - ux * 0.28, bz = b.z - uz * 0.28, by = b.handY;
    const slack = Math.max(0, L - d);
    const sag = Math.min(0.5, slack * 0.16);
    const elec = this.electrified, warn = this.warning && !elec;
    const jit = elec ? 0.12 : warn ? 0.04 : 0;
    const taut = U.clamp((d / L - 0.9) * 10, 0, 1);

    const SEG = this.SEG;
    const px = (t) => U.lerp(ax, bx, t);
    const pz = (t) => U.lerp(az, bz, t);
    const py = (t) => Math.max(0.12, U.lerp(ay, by, t) - sag * 4 * t * (1 - t));

    // eslabones
    const ddx = bx - ax, ddz = bz - az;
    const flat = Math.sqrt(ddx * ddx + ddz * ddz);
    const curveLen = flat + sag * 1.6;
    const count = U.clamp(Math.round(curveLen / 0.34), 2, this.MAX);
    const D = this._dummy;
    const e = Math.min(1.2, this.energy);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      const t2 = Math.min(1, t + 0.02);
      let x = px(t), y = py(t), z = pz(t);
      if (jit) { x += (Math.random() - 0.5) * jit; y += (Math.random() - 0.5) * jit; z += (Math.random() - 0.5) * jit; }
      D.position.set(x, y, z);
      D.lookAt(px(t2), py(t2), pz(t2));
      if (k % 2) D.rotateZ(Math.PI / 2);
      D.updateMatrix();
      this.links.setMatrixAt(k, D.matrix);
      const c = this._tmp.copy(this._c1).lerp(this._c2, t);
      if (elec) c.lerp(this._ce, 0.6 + Math.random() * 0.4);
      else if (warn) c.lerp(this._ce, 0.5 + 0.5 * Math.sin(time * 30));
      c.lerp(WHITE_C, Math.min(0.6, e * 0.35 + taut * 0.2));
      this.links.setColorAt(k, c);
    }
    this.links.count = count;
    this.links.instanceMatrix.needsUpdate = true;
    this.links.instanceColor.needsUpdate = true;
    const em = elec ? 0.55 : (0.08 + e * 0.32 + taut * 0.15);
    this.linkMat.emissive.setRGB(em, em * (elec ? 0.9 : 0.95), em * (elec ? 0.3 : 1));

    // cinta de energía
    const w = 0.12 + e * 0.22 + (elec ? 0.2 : 0);
    const P = this.rPos, Cc = this.rCol;
    const chg = this.charge / CONFIG.chain.chargeMax;
    const base = elec ? 0.9 : 0.18 + e * 0.6 + taut * 0.25 + chg * 0.45;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      let x = px(t), y = py(t) + 0.02, z = pz(t);
      if (jit) { x += (Math.random() - 0.5) * jit * 1.5; z += (Math.random() - 0.5) * jit * 1.5; }
      const o = i * 6;
      P[o] = x - uz * w; P[o + 1] = y; P[o + 2] = z + ux * w;
      P[o + 3] = x + uz * w; P[o + 4] = y; P[o + 5] = z - ux * w;
      const pulse = 0.55 + 0.45 * Math.sin(t * 18 - time * (8 + e * 18));
      const c = this._tmp.copy(this._c1).lerp(this._c2, t);
      if (elec) c.copy(this._ce);
      else if (chg > 0) c.lerp(GOLD_C, Math.min(0.85, chg));
      const k = base * pulse;
      Cc[o] = Cc[o + 3] = Math.min(1, c.r * k + k * 0.25);
      Cc[o + 1] = Cc[o + 4] = Math.min(1, c.g * k + k * 0.25);
      Cc[o + 2] = Cc[o + 5] = Math.min(1, c.b * k + k * 0.25);
    }
    this.ribbon.geometry.attributes.position.needsUpdate = true;
    this.ribbon.geometry.attributes.color.needsUpdate = true;

    // chispas sueltas cuando está electrificada o cuando barre muy rápido
    if (elec && Math.random() < 0.7) {
      const t = Math.random();
      VFX.parts.emit(px(t), py(t), pz(t), (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.25, 0.25, 0xfff07a);
    } else if (e > 0.9 && Math.random() < 0.5) {
      const t = Math.random();
      VFX.parts.emit(px(t), py(t), pz(t), 0, 0.5, 0, 0.3, 0.16, 0xffffff, { alpha: 0.6 });
    }
  }
}
const WHITE_C = new THREE.Color(0xffffff);
const GOLD_C = new THREE.Color(0xffc94a);
