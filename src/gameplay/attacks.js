// ================= BLOQUES DE ATAQUE =================
// Cada ataque es un generador: avisa (telegrafía), espera, golpea, se recupera.
// El jefe le pasa el dt en cada frame:  const dt = yield;
// Los jefes NO tienen código propio: combinan estos bloques desde config.js.
// Todo ataque limpia su estado en 'finally' (se puede cancelar en cualquier momento).

const Attacks = {
  // ---------- EMBESTIDA ----------
  *charge(b, g, p) {
    const reps = p.repeat || 1;
    const R = g.arenaR;
    let trail = null;
    try {
      for (let r = 0; r < reps; r++) {
        const tgt = g.pickPlayer(r === 0 ? 'random' : 'farthest', b);
        b.target(tgt, true);
        let ang = Math.atan2(tgt.x - b.x, tgt.z - b.z);
        const len = () => rayToCircle(b.x, b.z, Math.sin(ang), Math.cos(ang), R - b.radius) + b.radius;
        const tel = g.tele.rect(b.x, b.z, ang, len(), b.radius * 2, { owner: b, dur: p.windup });
        b.anim = 'windup';
        AudioFX.play('telegraph');
        yield* showTelegraph(tel, p.windup, (dt, e) => {
          if (e < p.aimTime) ang = U.dampAngle(ang, Math.atan2(tgt.x - b.x, tgt.z - b.z), 7, dt);
          b.facing = ang;
          tel.set(b.x, b.z, ang, len());
          if (Math.random() < dt * 12) VFX.burst(b.x - Math.sin(ang) * b.radius, 0.2, b.z - Math.cos(ang) * b.radius, { count: 3, speed: 2, up: 1.5, color: 0xb8a284, size: 0.4, life: 0.5 });
        });
        const dx = Math.sin(ang), dz = Math.cos(ang);
        b.anim = 'charge';
        AudioFX.play('charge');
        let trav = 0, crashed = false;
        const tp = { x: 0, y: 1.2, z: 0 }; // reutilizado por la estela (sin objetos por frame)
        trail = VFX.trail(() => { tp.x = b.x; tp.z = b.z; return tp; }, { color: b.def.theme.accent, width: b.radius * 2, opacity: 0.35, fade: 0.3 });
        while (true) {
          const dt = yield;
          const st = p.speed * dt;
          b.x += dx * st; b.z += dz * st; trav += st;
          b.vx = dx * p.speed; b.vz = dz * p.speed;
          if (Math.random() < dt * 30) VFX.burst(b.x - dx * b.radius, 0.2, b.z - dz * b.radius, { count: 2, speed: 2, up: 2, color: 0xb8a284, size: 0.5, life: 0.5 });
          if (Math.sqrt(b.x * b.x + b.z * b.z) > R - b.radius) { crashed = true; break; }
          if (trav > p.maxDist) break;
        }
        if (trail) { trail.release(); trail = null; }
        b.vx = b.vz = 0;
        U.clampToArena(b, R - b.radius);
        if (crashed) {
          AudioFX.play('crash'); AudioFX.play('stun');
          VFX.shake(0.7, 0.4);
          VFX.burst(b.x + dx * b.radius, 0.8, b.z + dz * b.radius, { count: 30, speed: 8, up: 6, colors: [0x8a8580, 0xb8a284, 0xffffff], size: 0.5, life: 0.8, gravity: -14 });
          VFX.ring(b.x + dx * b.radius, b.z + dz * b.radius, { color: 0xffffff, from: 0.5, to: 4, dur: 0.4 });
          VFX.number(b.x, 3.6, b.z, '¡ATURDIDO!', 'word good', 1.3);
          b.anim = 'stun'; b.stunned = true;
          yield* U.wait(p.stun);
          b.stunned = false;
        } else {
          b.anim = 'idle';
          yield* U.wait(0.35);
        }
        if (r < reps - 1) yield* U.wait(0.15);
      }
    } finally { if (trail) trail.release(); b.anim = 'idle'; b.stunned = false; b.vx = b.vz = 0; }
  },

  // ---------- ANILLO DE PROYECTILES ----------
  *ring(b, g, p) {
    const pierceCol = CONFIG.colors.projectile;
    const tel = g.tele.circle(b.x, b.z, b.radius + 1.0, { owner: b, dur: p.windup, color: pierceCol, layer: 1 });
    b.anim = 'cast';
    AudioFX.play('telegraph');
    yield* showTelegraph(tel, p.windup, () => tel.set(b.x, b.z));
    const base = RNG.next() * Math.PI * 2;
    for (let w = 0; w < p.waves; w++) {
      const off = base + w * (Math.PI / p.count) + (p.spin ? w * p.spin : 0);
      for (let i = 0; i < p.count; i++) {
        const a = off + i / p.count * Math.PI * 2;
        const sx = Math.sin(a), sz = Math.cos(a);
        const pierce = !!p.pierce || (p.pierceEvery ? i % p.pierceEvery === 0 : false);
        g.projectiles.spawn(b.x + sx * b.radius * 0.9, b.z + sz * b.radius * 0.9, sx * p.speed, sz * p.speed, { pierce, damage: p.damage, r: 0.32 });
      }
      AudioFX.play('shoot');
      VFX.ring(b.x, b.z, { color: CONFIG.colors.projectile, from: b.radius, to: b.radius + 2.5, dur: 0.3 });
      yield* U.wait(p.waveDelay);
    }
    b.anim = 'idle';
  },

  // ---------- RÁFAGA APUNTADA ----------
  *volley(b, g, p) {
    const col = p.pierce ? CONFIG.colors.pierce : CONFIG.colors.projectile;
    for (let k = 0; k < p.bursts; k++) {
      const tgt = g.pickPlayer('random', b);
      b.target(tgt, true);
      let ang = Math.atan2(tgt.x - b.x, tgt.z - b.z);
      const tel = g.tele.rect(b.x, b.z, ang, 10, 0.55, { owner: b, dur: p.windup, color: col });
      b.anim = 'cast';
      AudioFX.play('telegraph');
      yield* showTelegraph(tel, p.windup, (dt, e) => {
        if (e < p.windup * 0.7) ang = U.dampAngle(ang, Math.atan2(tgt.x - b.x, tgt.z - b.z), 9, dt);
        b.facing = ang;
        tel.set(b.x, b.z, ang);
      });
      for (let i = 0; i < p.count; i++) {
        const a = ang + (p.count > 1 ? (i / (p.count - 1) - 0.5) * p.spread : 0);
        const sx = Math.sin(a), sz = Math.cos(a);
        g.projectiles.spawn(b.x + sx * b.radius, b.z + sz * b.radius, sx * p.speed, sz * p.speed, { pierce: p.pierce, damage: p.damage, r: 0.3 });
      }
      AudioFX.play('shoot');
      VFX.glow(b.x + Math.sin(ang) * b.radius, 1.2, b.z + Math.cos(ang) * b.radius, { color: col, size: 0.6, dur: 0.2 });
      yield* U.wait(p.burstDelay);
    }
    b.anim = 'idle';
  },

  // ---------- SALTO ENTRE LOS JUGADORES (separarse) ----------
  *jumpSplit(b, g, p) {
    const reps = p.repeat || 1;
    const R = g.arenaR;
    try {
      for (let r = 0; r < reps; r++) {
        b.anim = 'crouch';
        yield* U.wait(0.28);
        b.anim = 'air'; b.airborne = true;
        AudioFX.play('jump');
        VFX.ring(b.x, b.z, { color: 0xd8cbb0, from: b.radius, to: b.radius + 2, dur: 0.4 });
        const m = g.mid();
        const t = { x: m.x, z: m.z };
        U.clampToArena(t, R - b.radius - 0.3);
        const tel = g.tele.circle(t.x, t.z, p.radius, { owner: b, dur: p.airTime });
        const sx = b.x, sz = b.z;
        yield* showTelegraph(tel, p.airTime, (dt, e) => {
          if (e < p.airTime - p.lock) {
            const mm = g.mid();
            t.x = U.damp(t.x, mm.x, 5, dt); t.z = U.damp(t.z, mm.z, 5, dt);
            U.clampToArena(t, R - b.radius - 0.3);
            tel.set(t.x, t.z);
          }
          const k = e / p.airTime;
          const H = 4.5;
          b.y = k < 0.3 ? U.easeOutCubic(k / 0.3) * H : k < 0.88 ? H + Math.sin(e * 9) * 0.12 : H * (1 - U.easeInCubic((k - 0.88) / 0.12));
          // llega sobre el objetivo en la primera mitad y después lo sigue desde arriba
          const kh = U.easeInOut(Math.min(1, k / 0.45));
          b.x = U.lerp(sx, t.x, kh); b.z = U.lerp(sz, t.z, kh);
          b.vx = b.vz = 0;
        });
        b.x = t.x; b.z = t.z; b.y = 0; b.airborne = false; b.anim = 'land';
        AudioFX.play('land');
        VFX.shake(0.55, 0.35);
        VFX.ring(t.x, t.z, { color: CONFIG.colors.danger, from: 0.5, to: p.radius * 1.1, dur: 0.35 });
        VFX.ring(t.x, t.z, { color: 0xffffff, from: 0.5, to: p.radius * 1.6, dur: 0.5, opacity: 0.5 });
        VFX.burst(t.x, 0.3, t.z, { count: 36, speed: 9, up: 3, colors: [0xcbbd9c, 0x8a8174], size: 0.55, life: 0.7, gravity: -10 });
        for (const pl of g.players) {
          const d = Math.sqrt((pl.x - t.x) ** 2 + (pl.z - t.z) ** 2);
          if (d < p.radius + pl.radius * 0.4) {
            const l = d || 1;
            g.hurtPlayer(pl, p.damage, (pl.x - t.x) / l, (pl.z - t.z) / l);
          }
        }
        yield* U.wait(0.25);
        b.anim = 'idle';
        yield* U.wait(p.recover);
      }
    } finally { b.airborne = false; b.y = 0; b.anim = 'idle'; }
  },

  // ---------- TERREMOTO (juntarse en el refugio azul) ----------
  *jumpTogether(b, g, p) {
    const R = g.arenaR;
    try {
      b.anim = 'crouch';
      yield* U.wait(0.3);
      b.anim = 'air'; b.airborne = true;
      AudioFX.play('jump');
      const m = g.mid();
      // refugio: a una distancia caminable del centro del equipo, dentro de la arena
      let S = null;
      for (let i = 0; i < 40 && !S; i++) {
        const a = RNG.next() * Math.PI * 2, d = U.rand(3.5, 7.5);
        const c = { x: m.x + Math.sin(a) * d, z: m.z + Math.cos(a) * d };
        if (Math.sqrt(c.x * c.x + c.z * c.z) < R - p.safeRadius - 1) S = c;
      }
      if (!S) S = { x: m.x * 0.5, z: m.z * 0.5 };
      // el jefe cae lejos del refugio
      let lx = -S.x, lz = -S.z;
      const ll = Math.sqrt(lx * lx + lz * lz);
      if (ll < 1) { lx = 0; lz = -1; } else { lx /= ll; lz /= ll; }
      const L = { x: lx * R * 0.55, z: lz * R * 0.55 };
      const tel = g.tele.safeZone(S.x, S.z, p.safeRadius, R, { owner: b, dur: p.time });
      const sx = b.x, sz = b.z;
      yield* showTelegraph(tel, p.time, (dt, e) => {
        const k = e / p.time;
        b.y = k < 0.15 ? U.easeOutCubic(k / 0.15) * 13 : k < 0.9 ? 13 : 13 * (1 - U.easeInCubic((k - 0.9) / 0.1));
        const kh = U.easeInOut(Math.min(1, k / 0.85));
        b.x = U.lerp(sx, L.x, kh); b.z = U.lerp(sz, L.z, kh);
        b.vx = b.vz = 0;
        if (k > 0.5 && Math.random() < dt * 20) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * R;
          VFX.parts.emit(Math.cos(a) * d, 0.1, Math.sin(a) * d, 0, 2 + Math.random() * 2, 0, 0.5, 0.35, 0xb8a284, { gravity: -8 });
        }
      });
      b.x = L.x; b.z = L.z; b.y = 0; b.airborne = false; b.anim = 'land';
      AudioFX.play('land'); AudioFX.play('thunder');
      VFX.shake(0.9, 0.6);
      VFX.flash('rgba(255,120,90,1)', 0.18);
      for (let i = 0; i < 4; i++) VFX.ring(L.x, L.z, { color: i % 2 ? 0xffffff : CONFIG.colors.danger, from: 1, to: R * 2.2, dur: 0.5 + i * 0.15, opacity: 0.7 });
      VFX.ring(S.x, S.z, { color: CONFIG.colors.safe, from: p.safeRadius, to: p.safeRadius + 1.5, dur: 0.5 });
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * R;
        VFX.parts.emit(Math.cos(a) * d, 0.2, Math.sin(a) * d, 0, 3 + Math.random() * 4, 0, 0.7, 0.45, i % 3 ? 0xb8a284 : CONFIG.colors.danger, { gravity: -14 });
      }
      for (const pl of g.players) {
        const dx = pl.x - S.x, dz = pl.z - S.z;
        if (Math.sqrt(dx * dx + dz * dz) > p.safeRadius + pl.radius * 0.3) {
          const ax = pl.x - L.x, az = pl.z - L.z, l = Math.sqrt(ax * ax + az * az) || 1;
          g.hurtPlayer(pl, p.damage, ax / l, az / l);
        }
      }
      yield* U.wait(0.3);
      b.anim = 'idle';
      yield* U.wait(p.recover);
    } finally { b.airborne = false; b.y = 0; b.anim = 'idle'; }
  },

  // ---------- ZARPAZO EN CONO ----------
  *swipe(b, g, p) {
    const tgt = g.pickPlayer('nearest', b);
    b.target(tgt, true);
    let ang = Math.atan2(tgt.x - b.x, tgt.z - b.z);
    const tel = g.tele.cone(b.x, b.z, ang, p.half, p.range, { owner: b, dur: p.windup });
    b.anim = 'windup';
    AudioFX.play('telegraph');
    yield* showTelegraph(tel, p.windup, (dt, e) => {
      if (e < p.aimTime) ang = U.dampAngle(ang, Math.atan2(tgt.x - b.x, tgt.z - b.z), 6, dt);
      b.facing = ang;
      tel.set(b.x, b.z, ang);
    });
    b.anim = 'swipe';
    AudioFX.play('swipe');
    for (let i = 0; i < 18; i++) {
      const a = ang + (i / 17 - 0.5) * p.half * 2;
      const r = p.range * (0.6 + Math.random() * 0.4);
      VFX.parts.emit(b.x + Math.sin(a) * r, 1.0, b.z + Math.cos(a) * r, Math.sin(a) * 4, 1, Math.cos(a) * 4, 0.3, 0.4, i % 2 ? 0xffffff : b.def.theme.accent);
    }
    for (const pl of g.players) {
      const dx = pl.x - b.x, dz = pl.z - b.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < p.range + pl.radius * 0.5 && Math.abs(U.angDiff(ang, Math.atan2(dx, dz))) < p.half + 0.12) {
        g.hurtPlayer(pl, p.damage, dx / (d || 1), dz / (d || 1));
      }
    }
    b.x += Math.sin(ang) * 0.6; b.z += Math.cos(ang) * 0.6;
    yield* U.wait(0.5);
    b.anim = 'idle';
  },

  // ---------- ONDA EXPANSIVA (se atraviesa con dash) ----------
  *shockwave(b, g, p) {
    b.anim = 'crouch';
    const tel = g.tele.circle(b.x, b.z, b.radius + 1.3, { owner: b, dur: p.windup, layer: 1 });
    AudioFX.play('telegraph');
    yield* showTelegraph(tel, p.windup, () => tel.set(b.x, b.z));
    for (let w = 0; w < p.waves; w++) {
      b.anim = 'land';
      g.hazards.push(new WaveHazard(g, b.x, b.z, b.radius, p.speed, p.damage, b));
      AudioFX.play('wave');
      VFX.shake(0.35, 0.25);
      yield* U.wait(0.15);
      b.anim = w < p.waves - 1 ? 'crouch' : 'idle';
      if (w < p.waves - 1) yield* U.wait(p.delay);
    }
    b.anim = 'idle';
    yield* U.wait(0.3);
  },

  // ---------- CADENA ELECTRIFICADA ----------
  *electrify(b, g, p) {
    try {
      b.anim = 'charge_e';
      g.chain.warning = true;
      AudioFX.play('charge_e');
      let e = 0;
      while (e < p.windup) {
        const dt = yield; e += dt;
        // arcos del jefe hacia la cadena
        if (Math.random() < dt * 30) {
          const m = g.mid();
          const t = Math.random();
          const x = U.lerp(b.x, m.x, t), z = U.lerp(b.z, m.z, t);
          VFX.parts.emit(x, 1.5 + Math.random(), z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.25, 0.25, CONFIG.colors.electric);
        }
      }
      g.chain.warning = false;
      g.chain.electrified = true;
      AudioFX.play('zap');
      VFX.flash('rgba(255,236,120,1)', 0.1);
      VFX.number(b.x, 3.8, b.z, '¡CADENA ELECTRIFICADA!', 'word warn', 1.4);
      b.anim = 'charge_e';
      e = 0;
      while (e < p.duration) {
        const dt = yield; e += dt;
        const m = g.mid();
        b.moveToward(m.x, m.z, p.chaseSpeed, dt);
      }
    } finally {
      g.chain.electrified = false; g.chain.warning = false;
      b.anim = 'idle'; b.moving = false; b.vx = b.vz = 0;
    }
  },

  // ---------- ZONA DE ANCLA ----------
  *anchor(b, g, p) {
    const R = g.arenaR;
    const m = g.mid();
    let dx = m.x - b.x, dz = m.z - b.z;
    let l = Math.sqrt(dx * dx + dz * dz);
    if (l < 0.5) { const a = RNG.next() * Math.PI * 2; dx = Math.sin(a); dz = Math.cos(a); l = 1; }
    const D = U.clamp(g.chain.maxLength * 0.6, b.radius + 2.4, 6.5);
    const z = { x: b.x + dx / l * D, z: b.z + dz / l * D };
    U.clampToArena(z, R - p.radius - 0.6);
    const zone = new AnchorHazard(g, z.x, z.z, p, b);
    g.hazards.push(zone);
    let fireT = p.fireInterval;
    try {
      b.anim = 'channel';
      while (!zone.done) {
        const dt = yield;
        b.vx = b.vz = 0;
        b.facing = U.dampAngle(b.facing, Math.atan2(zone.x - b.x, zone.z - b.z), 5, dt);
        fireT -= dt;
        if (fireT <= 0) {
          fireT = p.fireInterval;
          // dispara al que gira, no al que sostiene el ancla
          const tgt = zone.occupant ? g.players.find((q) => q !== zone.occupant) : g.pickPlayer('nearest', b);
          b.target(tgt, true);
          const a = Math.atan2(tgt.x - b.x, tgt.z - b.z);
          g.projectiles.spawn(b.x + Math.sin(a) * b.radius, b.z + Math.cos(a) * b.radius, Math.sin(a) * 6.5, Math.cos(a) * 6.5, { damage: p.damage, r: 0.32 });
          AudioFX.play('shoot');
        }
      }
      if (zone.success) {
        b.anim = 'stun'; b.stunned = true; b.vuln = p.vuln;
        VFX.number(b.x, 3.8, b.z, '¡EXPUESTO! x' + p.vuln, 'word good', 1.5);
        AudioFX.play('stun');
        yield* U.wait(p.stun);
      } else {
        yield* U.wait(0.6);
      }
    } finally {
      if (!zone.done) zone.cancel();
      b.stunned = false; b.vuln = 1; b.anim = 'idle';
    }
  },

  // ---------- ESPIRAL ----------
  *spiral(b, g, p) {
    const tel = g.tele.circle(b.x, b.z, b.radius + 1.0, { owner: b, dur: p.windup, color: CONFIG.colors.projectile, layer: 1 });
    b.anim = 'cast';
    AudioFX.play('telegraph');
    yield* showTelegraph(tel, p.windup, () => tel.set(b.x, b.z));
    let e = 0, fire = 0, ang = RNG.next() * Math.PI * 2;
    while (e < p.duration) {
      const dt = yield; e += dt; fire -= dt;
      ang += p.rotSpeed * dt;
      b.facing = ang;
      if (fire <= 0) {
        fire = p.interval;
        for (let k = 0; k < p.arms; k++) {
          const a = ang + k / p.arms * Math.PI * 2;
          const sx = Math.sin(a), sz = Math.cos(a);
          g.projectiles.spawn(b.x + sx * b.radius, b.z + sz * b.radius, sx * p.speed, sz * p.speed, { pierce: p.pierce, damage: p.damage, r: 0.3 });
        }
        AudioFX.play('shoot');
      }
    }
    b.anim = 'idle';
  },

  // ---------- RAYOS ----------
  *lightning(b, g, p) {
    const strikes = [];
    let complete = false;
    try {
      b.anim = 'cast';
      for (let s = 0; s < p.strikes; s++) {
        for (const pl of g.players) {
          b.target(pl);
          const strike = new LightningHazard(g, pl, p, b);
          strikes.push(strike);
          g.hazards.push(strike);
        }
        AudioFX.play('telegraph');
        yield* U.wait(p.delay);
      }
      yield* U.wait(p.windup);
      complete = true;
    } finally {
      if (!complete) for (const strike of strikes) strike.cancel();
      b.anim = 'idle';
    }
  },

  // ---------- DOS ATAQUES A LA VEZ ----------
  *combo(b, g, p) {
    yield* parallel(p.parts.map((part) => Attacks[part.type](b, g, part)));
  },
};

// ---------- helpers de generadores ----------
function* showTelegraph(tel, duration, update) {
  let elapsed = 0;
  try {
    while (elapsed < duration) {
      const dt = yield;
      elapsed += dt;
      update(dt, elapsed);
    }
  } finally {
    tel.remove();
  }
}
function* parallel(gens) {
  let active = gens.slice();
  try {
    let dt = 0;
    while (true) {
      active = active.filter((gn) => !gn.next(dt).done);
      if (!active.length) return;
      dt = yield;
    }
  } finally {
    for (const gn of active) gn.return();
  }
}
// distancia desde (x,z) en dirección (dx,dz) hasta el círculo de radio R centrado en el origen
function rayToCircle(x, z, dx, dz, R) {
  const b = x * dx + z * dz;
  const c = x * x + z * z - R * R;
  const disc = b * b - c;
  if (disc < 0) return 0;
  return Math.max(0, -b + Math.sqrt(disc));
}

// ================= PELIGROS PERSISTENTES =================
// Viven en g.hazards y se actualizan solos: update(dt) -> false cuando terminan.

class WaveHazard {
  constructor(g, x, z, r0, speed, dmg, owner) {
    this.g = g; this.x = x; this.z = z; this.r = r0; this.speed = speed; this.dmg = dmg; this.owner = owner;
    this.hit = new Set();
    const geo = new THREE.CylinderGeometry(1, 1, 0.9, 72, 1, true);
    geo.translate(0, 0.45, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.danger, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.set(x, 0, z);
    this.mesh.renderOrder = 6;
    const rg = new THREE.RingGeometry(0.97, 1.0, 72); rg.rotateX(-Math.PI / 2);
    this.top = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.top.position.set(x, 0.9, z);
    g.scene.add(this.mesh); g.scene.add(this.top);
  }
  cancel() { this.dead = true; }
  update(dt) {
    if (this.dead) return false;
    this.r += this.speed * dt;
    this.mesh.scale.set(this.r, 1, this.r);
    this.top.scale.setScalar(this.r);
    const R = this.g.arenaR;
    const fade = U.clamp((R + 1 - this.r) / 3, 0, 1);
    this.mat.opacity = 0.55 * fade; this.top.material.opacity = 0.9 * fade;
    for (const pl of this.g.players) {
      if (this.hit.has(pl)) continue;
      const d = Math.sqrt((pl.x - this.x) ** 2 + (pl.z - this.z) ** 2);
      if (Math.abs(d - this.r) < 0.35 + pl.radius * 0.5) {
        if (pl.canBeHit()) {
          this.hit.add(pl);
          const l = d || 1;
          this.g.hurtPlayer(pl, this.dmg, (pl.x - this.x) / l, (pl.z - this.z) / l);
        } else if (pl.iframes > 0) {
          this.hit.add(pl);
          VFX.number(pl.x, 2.2, pl.z, '¡ESQUIVA!', 'word good');
        }
      }
    }
    return this.r < R + 2;
  }
  dispose() {
    this.g.scene.remove(this.mesh); this.g.scene.remove(this.top);
    this.mesh.geometry.dispose(); this.mat.dispose(); this.top.geometry.dispose(); this.top.material.dispose();
  }
}

class LightningHazard {
  constructor(g, target, p, owner) {
    this.g = g; this.target = target; this.p = p; this.owner = owner;
    this.x = target.x; this.z = target.z; this.t = 0; this.struck = false; this.boltT = 0;
    this.tel = g.tele.circle(this.x, this.z, p.radius, { owner, dur: p.windup, color: CONFIG.colors.electric, sync: false });
    this.bolt = null;
  }
  update(dt) {
    this.t += dt;
    if (!this.struck) {
      if (this.t < this.p.track) {
        this.x = U.damp(this.x, this.target.x, 10, dt); this.z = U.damp(this.z, this.target.z, 10, dt);
        this.tel.set(this.x, this.z);
      }
      if (this.t >= this.p.windup) this._strike();
      return true;
    }
    this.boltT -= dt;
    if (this.bolt) {
      this.bolt.material.opacity = Math.max(0, this.boltT / 0.25);
      this.bolt.scale.x = this.bolt.scale.z = 0.5 + Math.random() * 0.8;
    }
    return this.boltT > 0;
  }
  _strike() {
    this.struck = true; this.boltT = 0.25;
    this.tel.remove();
    const geo = new THREE.CylinderGeometry(0.18, 0.32, 16, 6, 6, true);
    // zigzag
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (Math.abs(y) < 7.9) { pos.setX(i, pos.getX(i) + Math.sin(y * 2.3) * 0.25); pos.setZ(i, pos.getZ(i) + Math.cos(y * 1.7) * 0.25); }
    }
    geo.translate(0, 8, 0);
    this.bolt = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfff7c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bolt.position.set(this.x, 0, this.z);
    this.g.scene.add(this.bolt);
    AudioFX.play('thunder');
    VFX.shake(0.3, 0.2);
    VFX.glow(this.x, 0.5, this.z, { color: CONFIG.colors.electric, size: this.p.radius * 0.8, grow: 1.6, dur: 0.3, opacity: 0.8 });
    VFX.ring(this.x, this.z, { color: CONFIG.colors.electric, from: 0.3, to: this.p.radius * 1.4, dur: 0.3 });
    VFX.burst(this.x, 0.4, this.z, { count: 20, speed: 7, up: 4, color: CONFIG.colors.electric, size: 0.3, life: 0.4 });
    for (const pl of this.g.players) {
      const dx = pl.x - this.x, dz = pl.z - this.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < this.p.radius + pl.radius * 0.4) this.g.hurtPlayer(pl, this.p.damage, dx / (d || 1), dz / (d || 1));
    }
  }
  cancel() { this.tel.remove(); this.struck = true; this.boltT = 0; }
  dispose() { if (this.bolt) { this.g.scene.remove(this.bolt); this.bolt.geometry.dispose(); this.bolt.material.dispose(); } }
}

class AnchorHazard {
  constructor(g, x, z, p, owner) {
    this.g = g; this.x = x; this.z = z; this.p = p; this.owner = owner;
    this.charge = 0; this.t = 0; this.done = false; this.success = false; this.occupant = null;
    this.warnT = 0; this.endT = 0;
    const col = CONFIG.colors.anchor;
    const grp = new THREE.Group();
    grp.position.set(x, 0.04, z);
    const disc = new THREE.CircleGeometry(1, 48); disc.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.9, 1, 64); ring.rotateX(-Math.PI / 2);
    const arc = new THREE.RingGeometry(1.12, 1.24, 48, 1, Math.PI / 2, Math.PI * 2); arc.rotateX(-Math.PI / 2);
    const mk = (geo, op, add) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      m.renderOrder = 4; grp.add(m); return m;
    };
    this.base = mk(disc, 0.16); this.base.scale.setScalar(p.radius);
    this.fill = mk(disc, 0.5, true); this.fill.scale.setScalar(0.001);
    this.edge = mk(ring, 0.95, true); this.edge.scale.setScalar(p.radius);
    this.timer = mk(arc, 0.9, true); this.timer.scale.setScalar(p.radius);
    // pilar de luz para que se vea desde lejos
    const pg = new THREE.CylinderGeometry(1, 1, 6, 32, 1, true); pg.translate(0, 3, 0);
    this.pillar = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.pillar.scale.set(p.radius, 1, p.radius);
    grp.add(this.pillar);
    this.grp = grp;
    g.scene.add(grp);
    VFX.ring(x, z, { color: col, from: p.radius * 3, to: p.radius, dur: 0.4 });
  }
  update(dt) {
    if (this.done) {
      this.endT -= dt;
      const k = Math.max(0, this.endT / 0.4);
      this.grp.scale.setScalar(1 + (1 - k) * 0.6);
      this.grp.children.forEach((c) => { c.material.opacity *= 0.85; });
      return this.endT > 0;
    }
    const p = this.p;
    this.t += dt; this.warnT -= dt;
    // ¿alguien quieto adentro?
    let occ = null, inside = null;
    for (const pl of this.g.players) {
      const d = Math.sqrt((pl.x - this.x) ** 2 + (pl.z - this.z) ** 2);
      if (d < p.radius) {
        inside = pl;
        const sp = Math.sqrt(pl.vx * pl.vx + pl.vz * pl.vz);
        if (sp < p.stillSpeed) occ = pl;
      }
    }
    this.occupant = occ;
    if (occ) {
      this.charge += dt;
      AudioFX.play('anchor_tick', { mult: this.charge / p.charge });
      if (Math.random() < dt * 25) VFX.parts.emit(this.x + (Math.random() - 0.5) * p.radius, 0.1, this.z + (Math.random() - 0.5) * p.radius, 0, 3 + Math.random() * 2, 0, 0.6, 0.25, CONFIG.colors.anchor, { gravity: 0 });
    } else if (inside && this.warnT <= 0) {
      this.warnT = 0.9;
      VFX.number(inside.x, 2.3, inside.z, '¡QUIETO!', 'word warn', 0.8);
    }
    const kc = Math.min(1, this.charge / p.charge);
    this.fill.scale.setScalar(Math.max(0.001, p.radius * kc));
    const left = Math.max(0, 1 - this.t / p.timeLimit);
    this.timer.geometry.setDrawRange(0, Math.floor(48 * left) * 6);
    this.edge.material.opacity = 0.6 + 0.4 * Math.sin(this.t * (6 + (1 - left) * 18));
    this.pillar.material.opacity = 0.1 + kc * 0.25;
    if (left < 0.3) this.timer.material.color.setHex(CONFIG.colors.danger);

    if (this.charge >= p.charge) this._finish(true);
    else if (this.t >= p.timeLimit) this._finish(false);
    return true;
  }
  _finish(ok) {
    this.done = true; this.success = ok; this.endT = 0.4;
    const g = this.g, b = this.owner;
    if (ok) {
      AudioFX.play('anchor_done');
      VFX.ring(this.x, this.z, { color: CONFIG.colors.anchor, from: this.p.radius, to: this.p.radius * 3, dur: 0.5 });
      // rayo dorado del ancla al jefe
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        VFX.parts.emit(U.lerp(this.x, b.x, t), 1 + Math.sin(t * Math.PI) * 2, U.lerp(this.z, b.z, t), 0, 0.5, 0, 0.6, 0.35, CONFIG.colors.anchor, { gravity: 0 });
      }
      VFX.impact(b.x, 2, b.z, { color: CONFIG.colors.anchor, size: 2, shake: 0.35 });
    } else {
      AudioFX.play('thunder'); AudioFX.play('zap');
      VFX.flash('rgba(255,220,90,1)', 0.3);
      VFX.shake(0.6, 0.4);
      VFX.ring(this.x, this.z, { color: CONFIG.colors.danger, from: 0.5, to: g.arenaR * 2, dur: 0.6 });
      VFX.number(this.x, 2.5, this.z, 'La descarga los alcanzó', 'word warn', 1.3);
      g.damageTeam(this.p.failDamage, 'anchor', this.x, this.z);
    }
  }
  cancel() { if (!this.done) { this.done = true; this.success = false; this.endT = 0.3; } }
  dispose() {
    this.g.scene.remove(this.grp);
    this.grp.children.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
  }
}
