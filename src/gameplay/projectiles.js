// ================= PROYECTILES =================
// Pool fijo dibujado con InstancedMesh (3 draw calls para cientos de balas).
//  normal  -> naranjo, la cadena lo bloquea
//  pierce  -> morado y con púas, atraviesa la cadena
//  reflect -> rebotado por "Cadena espejo": vuela hacia el jefe y lo daña

class Projectiles {
  constructor(scene, game, max = 360) {
    this.g = game;
    this.max = max;
    this.pool = [];
    for (let i = 0; i < max; i++) this.pool.push({ alive: false, x: 0, z: 0, vx: 0, vz: 0, r: 0.3, kind: 'normal', dmg: 1, life: 0, spin: 0, trailT: 0 });
    this.active = [];

    const sph = new THREE.SphereGeometry(1, 12, 9);
    this.core = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.halo = new THREE.InstancedMesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), max);
    this.spike = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a0a40 }), max);
    const c = new THREE.Color(0xffffff);
    for (const m of [this.core, this.halo, this.spike]) {
      for (let i = 0; i < max; i++) m.setColorAt(i, c);
      m.frustumCulled = false; m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.halo.renderOrder = 9;
    this._d = new THREE.Object3D();
    this._col = new THREE.Color();
    this.colors = {
      normal: new THREE.Color(CONFIG.colors.projectile),
      pierce: new THREE.Color(CONFIG.colors.pierce),
      reflect: new THREE.Color(0xbff6ff),
    };
    this.coreColors = {
      normal: new THREE.Color(0xffe2b8),
      pierce: new THREE.Color(0xf0c8ff),
      reflect: new THREE.Color(0xffffff),
    };
  }

  spawn(x, z, vx, vz, o = {}) {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return null;
    p.alive = true; p.x = x; p.z = z; p.vx = vx; p.vz = vz;
    p.r = o.r || 0.3; p.kind = o.pierce ? 'pierce' : 'normal'; p.dmg = o.damage || 1;
    p.life = o.life || 7; p.spin = Math.random() * 6; p.trailT = 0;
    this.active.push(p);
    return p;
  }

  clear() { for (const p of this.active) p.alive = false; this.active.length = 0; }

  _kill(i) {
    const p = this.active[i];
    p.alive = false;
    this.active[i] = this.active[this.active.length - 1];
    this.active.pop();
  }

  update(dt) {
    const g = this.g, chain = g.chain, R = g.arenaR;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p) continue; // la lista pudo vaciarse (el jefe murió en este mismo paso)
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.life -= dt; p.spin += dt * 8;
      if (p.life <= 0 || p.x * p.x + p.z * p.z > (R + 3) * (R + 3)) { this._kill(i); continue; }

      // estela de partículas
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.035;
        const col = p.kind === 'pierce' ? CONFIG.colors.pierce : p.kind === 'reflect' ? 0xbff6ff : CONFIG.colors.projectile;
        VFX.parts.emit(p.x, 0.9, p.z, -p.vx * 0.08, 0.1, -p.vz * 0.08, 0.28, p.r * 1.3, col, { gravity: 0, drag: 2, alpha: 0.7 });
      }

      if (p.kind === 'reflect') {
        const b = g.boss;
        if (b && b.hittable && b.state !== 'dormant') {
          const dx = b.x - p.x, dz = b.z - p.z;
          const d = Math.sqrt(dx * dx + dz * dz);
          // leve autoguiado
          if (d > 0.01) {
            const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
            p.vx = U.lerp(p.vx, dx / d * sp, Math.min(1, dt * 4));
            p.vz = U.lerp(p.vz, dz / d * sp, Math.min(1, dt * 4));
          }
          if (d < b.radius + p.r) {
            const px = p.x, pz = p.z;
            this._kill(i); // primero sacarlo: el daño puede matar al jefe y vaciar la lista
            const dealt = b.damage(CONFIG.chain.reflectDamage * g.mods.damage, 'reflect');
            VFX.number(px, 1.6, pz, Math.round(dealt), 'cool');
            VFX.impact(px, 1, pz, { color: 0xbff6ff, size: 0.8 });
          }
        }
        continue;
      }

      // la cadena bloquea (salvo los morados)
      if (p.kind === 'normal' && chain.blocks(p.x, p.z, p.r)) {
        g.stats.blocks++;
        chain.addCharge(p.x, p.z);
        if (g.mods.reflect && g.boss) {
          p.kind = 'reflect';
          const b = g.boss;
          const dx = b.x - p.x, dz = b.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz) * 1.4;
          p.vx = dx / d * sp; p.vz = dz / d * sp; p.life = 3;
          AudioFX.play('reflect');
          VFX.impact(p.x, 0.9, p.z, { color: 0xbff6ff, size: 0.5, ring: false });
        } else {
          AudioFX.play('block');
          VFX.burst(p.x, 0.9, p.z, { count: 8, speed: 5, up: 3, color: 0xffd9a8, size: 0.22, life: 0.3 });
          VFX.glow(p.x, 0.9, p.z, { color: CONFIG.colors.projectile, size: 0.35, grow: 2.2, dur: 0.15 });
          this._kill(i);
        }
        continue;
      }

      // jugadores
      let hit = false;
      for (const pl of g.players) {
        const dx = pl.x - p.x, dz = pl.z - p.z;
        const rr = p.r + pl.radius * 0.85;
        if (dx * dx + dz * dz < rr * rr) {
          if (pl.canBeHit()) {
            const l = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1;
            g.hurtPlayer(pl, p.dmg, p.vx / l, p.vz / l);
            VFX.impact(p.x, 0.9, p.z, { color: p.kind === 'pierce' ? CONFIG.colors.pierce : CONFIG.colors.projectile, size: 0.8, ring: false });
            hit = true;
          }
          break;
        }
      }
      if (hit) this._kill(i);
    }
  }

  render() {
    const D = this._d;
    let nCore = 0, nSpike = 0;
    for (const p of this.active) {
      D.rotation.set(0, 0, 0);
      D.position.set(p.x, 0.9, p.z);
      D.scale.setScalar(p.r * 0.62);
      D.updateMatrix();
      this.core.setMatrixAt(nCore, D.matrix);
      this.core.setColorAt(nCore, this.coreColors[p.kind]);
      D.scale.setScalar(p.r * (1.35 + Math.sin(p.spin * 2) * 0.12));
      D.updateMatrix();
      this.halo.setMatrixAt(nCore, D.matrix);
      this.halo.setColorAt(nCore, this.colors[p.kind]);
      nCore++;
      if (p.kind === 'pierce') {
        D.rotation.set(p.spin, p.spin * 0.7, 0);
        D.scale.setScalar(p.r * 1.25);
        D.updateMatrix();
        this.spike.setMatrixAt(nSpike, D.matrix);
        this.spike.setColorAt(nSpike, this.colors.pierce);
        nSpike++;
      }
    }
    this.core.count = this.halo.count = nCore;
    this.spike.count = nSpike;
    for (const m of [this.core, this.halo, this.spike]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
