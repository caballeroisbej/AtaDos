// ================= JUGADOR =================
// Movimiento con aceleración y frenado suaves (herencia del Skillshot Trainer),
// dash con invulnerabilidad corta y estela, anillo en el piso que muestra
// de quién es cada personaje y cuándo está listo el dash.

class Player {
  constructor(idx, game, scene) {
    this.idx = idx;
    this.g = game;
    this.color = idx === 0 ? CONFIG.colors.p1 : CONFIG.colors.p2;
    this.name = idx === 0 ? 'LAZO' : 'BRASA';
    this.radius = CONFIG.player.radius;
    this.model = Models.player(this.color, idx);
    this.model.root.scale.setScalar(this.radius / 0.5);
    scene.add(this.model.root);

    // anillo del piso + arco de recarga del dash
    const ringGeo = new THREE.RingGeometry(0.64, 0.76, 40); ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.renderOrder = 3;
    scene.add(this.ring);
    const arcGeo = new THREE.RingGeometry(0.8, 0.9, 32, 1, Math.PI / 2, Math.PI * 2); arcGeo.rotateX(-Math.PI / 2);
    this.arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: U.shade(this.color, 1.5) | 0x404040, transparent: true, opacity: 0.8, depthWrite: false }));
    this.arc.renderOrder = 3;
    scene.add(this.arc);
    // flecha de dirección
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0.98, 0.2, 0, 0.98, 0, 0, 1.3], 3));
    tri.setIndex([0, 1, 2]);
    this.arrow = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    this.arrow.renderOrder = 3;
    scene.add(this.arrow);

    this._pos = { x: 0, y: 0, z: 0 };
    this.reset(0, 0);
  }

  reset(x, z) {
    this.x = x; this.z = z; this.vx = 0; this.vz = 0;
    this.facing = Math.PI; // mirando hacia el jefe (hacia -Z)
    this.dashT = 0; this.dashCd = 0; this.iframes = 0; this.invuln = 0; this.stunT = 0;
    this.dashX = 0; this.dashZ = 0;
    this.walk = 0; this.handY = 0.85;
    this.readyFlash = 0;
    if (this.trail) { this.trail.release(); this.trail = null; }
  }

  get dashing() { return this.dashT > 0; }
  canBeHit() { return this.iframes <= 0 && this.invuln <= 0 && this.g.godMode !== true; }

  knock(nx, nz, strength) {
    this.vx = nx * strength; this.vz = nz * strength;
    this.stunT = 0.18;
    if (this.dashT > 0) { this.dashT = 0; if (this.trail) { this.trail.release(); this.trail = null; } }
  }

  update(dt, intent) {
    const P = CONFIG.player, m = this.g.mods;
    this.iframes -= dt; this.invuln -= dt; this.stunT -= dt;
    if (this.dashCd > 0) {
      this.dashCd -= dt;
      if (this.dashCd <= 0) this.readyFlash = 0.25;
    }

    if (intent.dash && this.dashCd <= 0 && this.stunT <= 0 && this.dashT <= 0) this._startDash(intent);

    if (this.dashT > 0) {
      this.dashT -= dt;
      const sp = P.dashSpeed * m.dashSpeed;
      this.vx = this.dashX * sp; this.vz = this.dashZ * sp;
      if (Math.random() < dt * 40) VFX.parts.emit(this.x, 0.15, this.z, -this.vx * 0.05, 0.6, -this.vz * 0.05, 0.35, 0.3, this.color, { gravity: 0, drag: 3, alpha: 0.7 });
      if (this.dashT <= 0) {
        this.vx = this.dashX * P.speed; this.vz = this.dashZ * P.speed;
        if (this.trail) { this.trail.release(); this.trail = null; }
      }
    } else if (this.stunT > 0) {
      const k = Math.exp(-7 * dt);
      this.vx *= k; this.vz *= k;
    } else {
      const tx = intent.x * P.speed, tz = intent.z * P.speed;
      const dvx = tx - this.vx, dvz = tz - this.vz;
      const dl = Math.sqrt(dvx * dvx + dvz * dvz);
      const moving = intent.x * intent.x + intent.z * intent.z > 0.01;
      const step = (moving ? P.accel : P.decel) * dt;
      if (dl <= step) { this.vx = tx; this.vz = tz; }
      else { this.vx += dvx / dl * step; this.vz += dvz / dl * step; }
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this._clampArena();

    const sp2 = this.vx * this.vx + this.vz * this.vz;
    if (sp2 > 0.3) this.facing = U.dampAngle(this.facing, Math.atan2(this.vx, this.vz), 16, dt);
  }

  _clampArena() {
    const R = this.g.arenaR - this.radius;
    const d = Math.sqrt(this.x * this.x + this.z * this.z);
    if (d > R) {
      const nx = this.x / d, nz = this.z / d;
      this.x = nx * R; this.z = nz * R;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) { this.vx -= nx * vn; this.vz -= nz * vn; }
    }
  }

  _startDash(intent) {
    const P = CONFIG.player, m = this.g.mods;
    let dx = intent.x, dz = intent.z;
    const l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.2) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    else { dx /= l; dz /= l; }
    this.dashX = dx; this.dashZ = dz;
    this.dashT = P.dashTime;
    this.dashCd = P.dashCooldown * m.dashCd;
    this.iframes = P.dashIframes;
    this.stunT = 0;
    this.facing = Math.atan2(dx, dz);
    AudioFX.play('dash');
    VFX.burst(this.x, 0.2, this.z, { count: 10, speed: 3, up: 1, color: 0xd8d0c0, size: 0.35, life: 0.4, dirX: -dx, dirZ: -dz, spread: 0.8 });
    VFX.ring(this.x, this.z, { color: this.color, from: 0.4, to: 1.4, dur: 0.25 });
    if (this.trail) this.trail.release();
    const self = this;
    this.trail = VFX.trail(() => { self._pos.x = self.x; self._pos.y = 0.9; self._pos.z = self.z; return self._pos; }, { color: this.color, width: 0.9, opacity: 0.55, fade: 0.2 });
    this.g.stats.dashes++;
  }

  // separación suave entre los dos jugadores
  static separate(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const min = a.radius + b.radius;
    if (d < min && d > 1e-5) {
      const push = (min - d) * 0.5;
      a.x -= dx / d * push; a.z -= dz / d * push;
      b.x += dx / d * push; b.z += dz / d * push;
    }
  }

  render(dt, time) {
    const M = this.model;
    M.root.position.set(this.x, 0, this.z);
    M.root.rotation.y = this.facing;
    const sp = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    const k = Math.min(1, sp / CONFIG.player.speed);
    this.walk += dt * (4 + sp * 1.6);
    const sw = Math.sin(this.walk) * 0.75 * k;
    M.legs[0].rotation.x = sw; M.legs[1].rotation.x = -sw;
    M.arms[0].rotation.x = -sw * 0.8; M.arms[1].rotation.x = sw * 0.8;
    M.body.position.y = Math.abs(Math.sin(this.walk)) * 0.07 * k;
    M.body.rotation.x = U.damp(M.body.rotation.x, this.dashing ? 0.55 : k * 0.12, 18, dt);
    if (M.root.userData.scarf) M.root.userData.scarf.rotation.x = -0.15 - k * 0.35 + Math.sin(time * 9 + this.idx) * 0.08 * (0.3 + k);
    // parpadeo al ser golpeado
    M.root.visible = this.invuln > 0 ? Math.floor(time * 18) % 2 === 0 : true;
    this.handY = (0.82 + M.body.position.y) * this.radius / 0.5;

    this.ring.position.set(this.x, 0.04, this.z);
    this.arrow.position.set(this.x, 0.045, this.z);
    this.arrow.rotation.y = this.facing;
    // arco del dash
    const cd = CONFIG.player.dashCooldown * this.g.mods.dashCd;
    const ready = this.dashCd <= 0 ? 1 : 1 - this.dashCd / cd;
    this.arc.position.set(this.x, 0.045, this.z);
    this.arc.geometry.setDrawRange(0, Math.floor(32 * ready) * 6);
    this.arc.material.opacity = this.dashCd <= 0 ? 0.85 : 0.35;
    if (this.readyFlash > 0) {
      this.readyFlash -= dt;
      this.arc.scale.setScalar(1 + this.readyFlash * 1.2);
    } else this.arc.scale.setScalar(1);
  }

  setVisible(v) {
    this.model.root.visible = v; this.ring.visible = v; this.arc.visible = v; this.arrow.visible = v;
  }
}
