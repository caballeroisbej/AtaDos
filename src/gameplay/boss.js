// ================= JEFE =================
// Máquina de estados: dormido -> rugido -> pelea (moverse / atacar) -> fases -> muerte.
// Duerme hasta que la cadena lo atraviesa por primera vez: así el juego enseña
// su mecánica central sin presión y sin texto largo.

class Boss {
  constructor(def, game, scene) {
    this.def = def;
    this.g = game;
    this.radius = def.radius;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.model = Models[def.model]();
    Models.outline(this.model.root, 1.06);
    scene.add(this.model.root);
    // sombra de contacto (sirve de guía cuando salta)
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);
    for (const m of this.model.mats) m.userData.baseEmissive = m.emissive.clone();

    this.x = 0; this.z = -4; this.y = 0; this.vx = 0; this.vz = 0;
    this.facing = 0;
    this.state = 'dormant';
    this.anim = 'dormant';
    this.phase = 0;
    this.action = null;
    this.intent = null;     // { def, targets:[bool,bool] } del ataque en curso (lectura en HUD)
    this.restT = 1;
    this.cd = new Map();
    this.lastAttack = null;
    this.firstDone = false;
    this.moving = false; this.airborne = false; this.stunned = false; this.vuln = 1;
    this.slowT = 0; this.burnT = 0; this.burnAcc = 0; this.burnTick = 0;
    this.flashT = 0; this.zzzT = 1;
    this.orbit = RNG.next() * Math.PI * 2;
    this.time = 0;
  }

  get hittable() {
    return !this.airborne && (this.state === 'fight' || this.state === 'dormant');
  }

  wake() {
    if (this.state !== 'dormant') return;
    this.state = 'intro';
    this.introT = 1.5;
    this.anim = 'roar';
    AudioFX.play('wake'); AudioFX.play('roar');
    VFX.shake(0.5, 0.6);
    VFX.ring(this.x, this.z, { color: this.def.theme.accent, from: this.radius, to: this.radius + 6, dur: 0.6 });
    VFX.ring(this.x, this.z, { color: 0xffffff, from: this.radius, to: this.radius + 9, dur: 0.9, opacity: 0.4 });
    for (const pl of this.g.players) {
      const dx = pl.x - this.x, dz = pl.z - this.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < this.radius + 4) pl.knock(dx / (d || 1), dz / (d || 1), 9);
    }
    this.g.onBossWake();
  }

  // ---------- daño ----------
  damage(amount, kind) {
    if (this.state !== 'fight' || this.airborne) return 0;
    const mult = Rules.bossDamageMult(this.stunned, this.vuln, CONFIG.chain);
    const dealt = Math.min(this.hp, amount * mult);
    this.hp -= dealt;
    this.g.stats.damage += dealt;
    if (kind !== 'burn') this.flashT = kind === 'tajo' ? 0.14 : Math.max(this.flashT, 0.06);
    const next = Rules.nextPhase(this.def, this.phase, this.hp / this.maxHp);
    if (this.hp <= 0) this._die();
    else if (next >= 0) this._enterPhase(next);
    return dealt;
  }

  // ---------- lectura: a quién apunta el ataque en curso ----------
  target(pl, only) {
    if (!this.intent) return;
    if (only) this.intent.targets[0] = this.intent.targets[1] = false;
    this.intent.targets[pl.idx] = true;
  }

  cancelAction() {
    if (this.action) {
      const a = this.action;
      this.action = null;
      try { a.return(); } catch (e) { /* el generador estaba corriendo: queda descartado */ }
    }
    this.intent = null;
    this.g.tele.clearOwner(this);
    for (const h of this.g.hazards) if (h.owner === this && h.cancel) h.cancel();
    this.airborne = false; this.y = 0; this.stunned = false; this.vuln = 1;
    this.vx = this.vz = 0;
    this.g.chain.electrified = false; this.g.chain.warning = false;
  }

  _enterPhase(i) {
    this.cancelAction();
    this.phase = i;
    this.firstDone = false;
    this.state = 'phase';
    this.phaseT = 1.7;
    this.anim = 'roar';
    const ph = this.def.phases[i];
    AudioFX.play('phase'); AudioFX.play('roar');
    VFX.shake(0.6, 0.7);
    VFX.flash('rgba(255,255,255,1)', 0.2);
    VFX.ring(this.x, this.z, { color: this.def.theme.accent, from: this.radius, to: this.radius + 8, dur: 0.7 });
    for (const pl of this.g.players) {
      const dx = pl.x - this.x, dz = pl.z - this.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < this.radius + 5) pl.knock(dx / (d || 1), dz / (d || 1), 11);
    }
    this.g.banner(ph.banner || 'FASE ' + (i + 1), this.def.name);
    AudioFX.music('fight2');
  }

  _die() {
    this.hp = 0;
    this.cancelAction();
    this.state = 'dying';
    this.dyingT = 1.8;
    this.anim = 'stun';
    AudioFX.play('death');
    VFX.shake(0.9, 1.2);
    VFX.flash('rgba(255,255,255,1)', 0.5);
    this.g.onBossDying();
  }

  // ---------- elección de ataque ----------
  _startAttack() {
    const ph = this.def.phases[this.phase];
    // 'this' guarda cd / lastAttack / firstDone: Rules.pickAttack los actualiza
    const a = Rules.pickAttack(ph.attacks, this, this.time, () => RNG.next());
    if (a.hint) this.g.hintOnce(a.hint);
    if (a.type === 'combo') a.parts.forEach((pt) => { if (pt.hint) this.g.hintOnce(pt.hint); });
    this.intent = { def: a, targets: [false, false] };
    this.g.onBossAttack(a);
    this.action = Attacks[a.type](this, this.g, a);
    const r = this.action.next(0);
    if (r.done) { this.action = null; this.intent = null; }
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.05) { this.vx = this.vz = 0; this.moving = false; return; }
    const st = Math.min(d, speed * dt);
    this.vx = dx / d * speed; this.vz = dz / d * speed;
    this.x += dx / d * st; this.z += dz / d * st;
    this.moving = true;
    this.facing = U.dampAngle(this.facing, Math.atan2(dx, dz), 5, dt);
  }

  _move(dt) {
    const g = this.g;
    if (this.def.moveStyle === 'hover') {
      // mantiene distancia del equipo y orbita lentamente
      const m = g.mid();
      this.orbit += dt * 0.35;
      let dx = this.x - m.x, dz = this.z - m.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const want = 4.8;
      const ox = m.x + (dx / d) * want + Math.sin(this.orbit) * 2.5;
      const oz = m.z + (dz / d) * want + Math.cos(this.orbit) * 2.5;
      const t = { x: ox, z: oz };
      U.clampToArena(t, g.arenaR - this.radius - 1.5);
      this.moveToward(t.x, t.z, this.def.moveSpeed, dt);
      const tp = g.pickPlayer('nearest', this);
      this.facing = U.dampAngle(this.facing, Math.atan2(tp.x - this.x, tp.z - this.z), 4, dt);
    } else {
      const tp = g.pickPlayer('nearest', this);
      const dx = tp.x - this.x, dz = tp.z - this.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > this.radius + 1.4) this.moveToward(tp.x, tp.z, this.def.moveSpeed, dt);
      else { this.vx = this.vz = 0; this.moving = false; this.facing = U.dampAngle(this.facing, Math.atan2(dx, dz), 5, dt); }
    }
  }

  // ---------- actualización (por subpaso) ----------
  update(dt) {
    const g = this.g;
    this.time += dt;
    const slow = this.slowT > 0 ? 1 - g.mods.slow : 1;
    const sdt = dt * slow;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.flashT > 0) this.flashT -= dt;

    // quemadura
    if (this.burnT > 0 && this.state === 'fight') {
      this.burnT -= dt;
      const d = this.damage(g.mods.burnDps * dt, 'burn');
      this.burnAcc += d;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        if (this.burnAcc >= 1) VFX.number(this.x + (Math.random() - 0.5) * 1.6, 2.4, this.z, Math.round(this.burnAcc), 'burn', 0.7);
        this.burnAcc = 0;
        AudioFX.play('burn');
      }
    }

    switch (this.state) {
      case 'dormant':
        this.anim = 'dormant';
        this.vx = this.vz = 0;
        break;
      case 'intro':
        this.introT -= dt;
        if (this.introT <= 0) { this.state = 'fight'; this.anim = 'idle'; this.restT = 0.5; }
        break;
      case 'phase':
        this.phaseT -= dt;
        if (this.phaseT <= 0) { this.state = 'fight'; this.anim = 'idle'; this.restT = 0.3; }
        break;
      case 'fight':
        if (this.action) {
          const r = this.action.next(sdt);
          if (r.done) {
            this.action = null;
            this.intent = null;
            const rest = this.def.phases[this.phase].rest;
            this.restT = U.rand(rest[0], rest[1]);
            this.moving = false;
          }
        } else {
          this.restT -= sdt;
          this._move(sdt);
          if (this.restT <= 0) { this.moving = false; this._startAttack(); }
        }
        break;
      case 'dying':
        this.dyingT -= dt;
        if (Math.random() < dt * 14) {
          const a = Math.random() * Math.PI * 2;
          VFX.impact(this.x + Math.cos(a) * this.radius * 0.8, 1 + Math.random() * 2, this.z + Math.sin(a) * this.radius * 0.8,
            { color: Math.random() < 0.5 ? 0xffffff : this.def.theme.accent, size: 1.2, ring: false });
        }
        if (this.dyingT <= 0) {
          this.state = 'dead';
          this.model.root.visible = false;
          this.shadow.visible = false;
          VFX.burst(this.x, 1.5, this.z, { count: 120, speed: 14, up: 8, colors: [0xffffff, this.def.theme.accent, 0xffe08a], size: 0.6, life: 1.2, gravity: -8 });
          for (let i = 0; i < 3; i++) VFX.ring(this.x, this.z, { color: i ? this.def.theme.accent : 0xffffff, from: 1, to: 10 + i * 5, dur: 0.6 + i * 0.25 });
          VFX.glow(this.x, 1.5, this.z, { color: 0xffffff, size: 3, grow: 3, dur: 0.5, opacity: 0.9 });
          VFX.shake(0.8, 0.5);
          AudioFX.play('crash');
          g.onBossDead();
        }
        break;
    }

    if (this.state === 'dead') return;
    U.clampToArena(this, g.arenaR - this.radius);

    // cuerpo sólido: empuja a los jugadores y golpea al tocar
    if (!this.airborne) {
      for (const pl of g.players) {
        const dx = pl.x - this.x, dz = pl.z - this.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const min = this.radius + pl.radius;
        if (d < min) {
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          pl.x = this.x + nx * min; pl.z = this.z + nz * min;
          const vn = pl.vx * nx + pl.vz * nz;
          if (vn < 0) { pl.vx -= nx * vn; pl.vz -= nz * vn; }
          if (this.state === 'fight' && this.def.contactDamage && pl.canBeHit()) {
            g.hurtPlayer(pl, this.def.contactDamage, nx, nz);
          }
        }
      }
    }
  }

  // ---------- render (por frame) ----------
  render(dt, time) {
    const M = this.model;
    if (this.state === 'dead') return;
    M.root.position.set(this.x, this.y, this.z);
    M.root.rotation.y = this.facing;
    // rugido: sacudida
    if (this.anim === 'roar') M.root.position.x += Math.sin(time * 60) * 0.06;
    if (this.state === 'dying') {
      M.root.position.x += (Math.random() - 0.5) * 0.2;
      const k = Math.max(0, this.dyingT / 1.8);
      M.root.scale.setScalar(0.85 + 0.15 * k);
    }
    M.anim(this, dt, time);
    // en el aire no proyecta sombra direccional (confunde): queda solo la sombra de contacto
    if (this._air !== this.airborne) {
      this._air = this.airborne;
      M.root.traverse((o) => { if (o.isMesh && o.userData.cs === undefined) o.userData.cs = o.castShadow; if (o.isMesh) o.castShadow = !this.airborne && o.userData.cs; });
    }

    // destello al recibir daño
    const fk = this.flashT > 0 ? Math.min(1, this.flashT / 0.08) : 0;
    for (const m of M.mats) {
      if (fk > 0) m.emissive.copy(m.userData.baseEmissive).lerp(WHITE_C, fk * 0.75);
      else if (this._wasFlash) m.emissive.copy(m.userData.baseEmissive);
    }
    this._wasFlash = fk > 0;
    if (this.slowT > 0) for (const m of M.mats) m.emissive.lerp(ICE_C, 0.35);
    if (this.slowT > 0) this._wasFlash = true;

    // sombra
    const hk = U.clamp(1 - this.y / 16, 0.35, 1);
    this.shadow.position.set(this.x, 0.03, this.z);
    this.shadow.scale.setScalar(this.radius * (this.airborne ? 0.9 + (1 - hk) * 0.3 : 1.05));
    this.shadow.material.opacity = (this.airborne ? 0.55 : 0.35) * hk;

    // estado: aturdido (estrellas), quemado, dormido
    if (this.stunned && Math.random() < 0.4) {
      const a = time * 6 + Math.random();
      VFX.parts.emit(this.x + Math.cos(a) * this.radius * 0.7, 3 + this.radius * 0.3, this.z + Math.sin(a) * this.radius * 0.7, 0, 0.5, 0, 0.4, 0.3, 0xfff2a0, { gravity: 0 });
    }
    if (this.burnT > 0 && Math.random() < 0.6) {
      VFX.parts.emit(this.x + (Math.random() * 2 - 1) * this.radius * 0.7, 0.8 + Math.random() * 1.5, this.z + (Math.random() * 2 - 1) * this.radius * 0.7, 0, 2 + Math.random() * 2, 0, 0.45, 0.35, Math.random() < 0.5 ? 0xff7a2a : 0xffd04a, { gravity: 2 });
    }
    if (this.state === 'dormant') {
      this.zzzT -= dt;
      if (this.zzzT <= 0) { this.zzzT = 1.3; VFX.number(this.x + 0.6, 3.2, this.z, 'Zzz', 'zzz', 1.3); }
    }
  }

  dispose(scene) {
    scene.remove(this.model.root);
    scene.remove(this.shadow);
    const shared = new Set(Models._lam.values());
    const geometries = new Set();
    const materials = new Set();
    this.model.root.traverse((o) => {
      if (!o.isMesh) return;
      geometries.add(o.geometry);
      if (!shared.has(o.material)) materials.add(o.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}
const ICE_C = new THREE.Color(0x66ccff);
