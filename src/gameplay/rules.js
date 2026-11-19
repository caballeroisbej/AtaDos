// ================= REGLAS PURAS =================
// Matemática y decisiones del juego SIN three.js, DOM, audio ni entrada.
// Reciben objetos planos ({x, z, vx, vz, ...}) y números; devuelven resultados.
// Las clases de gameplay (Chain, Boss, Game) las usan y luego disparan efectos.
// Se prueban en Node con `npm test` (tests/rules.test.js).

const Rules = {
  // ---------- cadena contra el jefe ----------
  // Llena 'out' con la relación geométrica entre el segmento a-b y el jefe.
  //   len: largo de la cadena · t: posición del punto más cercano (0..1) · d: distancia al jefe
  //   nx,nz: normal del segmento · side: de qué lado está el jefe (-1, 0, 1)
  //   inside: la cadena atraviesa el cuerpo del jefe (lejos de las manos y con largo útil)
  chainContact(a, b, boss, minLength, out) {
    const abx = b.x - a.x, abz = b.z - a.z;
    const len = Math.sqrt(abx * abx + abz * abz);
    out.len = len;
    out.nx = 0; out.nz = 0;
    if (len > 1e-4) { out.nx = -abz / len; out.nz = abx / len; }
    const c = U.segClosest(a.x, a.z, b.x, b.z, boss.x, boss.z);
    out.t = c.t; out.d = c.d; out.cx = c.x; out.cz = c.z;
    const cross = abx * (boss.z - a.z) - abz * (boss.x - a.x);
    out.side = Math.abs(cross) < 1e-3 ? 0 : (cross > 0 ? 1 : -1);
    out.inside = c.d < boss.radius && c.t > 0.02 && c.t < 0.98 && len > minLength;
    return out;
  },

  // multiplicador de daño por velocidad de barrido en el punto de contacto (relativa al jefe)
  sweepMult(a, b, boss, t, nx, nz, C) {
    const vqx = a.vx * (1 - t) + b.vx * t - (boss.vx || 0);
    const vqz = a.vz * (1 - t) + b.vz * t - (boss.vz || 0);
    const sweep = Math.abs(vqx * nx + vqz * nz);
    return U.clamp(sweep / C.refSpeed, C.minMult, C.maxMult);
  },

  // TAJO: el jefe cambió de lado de la cadena dentro del segmento
  isTajo(prevSide, ct, bossRadius, minLength) {
    return ct.side !== 0 && prevSide !== 0 && ct.side !== prevSide &&
      ct.t > 0.02 && ct.t < 0.98 && ct.len > minLength && ct.d < bossRadius;
  },

  comboFactor(combo, C) { return 1 + Math.min(combo, C.comboMax) * C.comboBonus; },
  tickDamage(C, mult, mods, combo, dt) { return C.dps * mult * mods.damage * Rules.comboFactor(combo, C) * dt; },
  tajoDamage(C, mult, mods, combo, charge) {
    const m = Math.max(C.slashMinMult, mult);
    return C.slashDamage * m * mods.damage * Rules.comboFactor(combo, C) * (1 + charge * C.chargePerBlock);
  },

  // ¿el proyectil (x,z,r) choca con la cadena? Los extremos (pegados a los jugadores) no cuentan.
  blocks(a, b, x, z, r, playerRadius, thickness) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1.0) return false;
    const c = U.segClosest(a.x, a.z, b.x, b.z, x, z);
    const margin = (playerRadius + 0.12) / len;
    return c.t > margin && c.t < 1 - margin && c.d < r + thickness;
  },

  // Largo máximo de la cadena. Corrige posiciones y velocidades de a y b (objetos planos).
  // Devuelve la velocidad de separación anulada (0 si no tiró) y quién fue arrastrado.
  _cr: { rv: 0, pulled: null },
  constrain(a, b, L, dasherWeight) {
    const r = Rules._cr;
    r.rv = 0; r.pulled = null;
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= L || d < 1e-6) return r;
    const nx = dx / d, nz = dz / d;
    const ex = d - L;
    // fracción de la corrección que se lleva 'a': si 'a' hace dash pesa más y se mueve menos
    let wa = 0.5;
    if (a.dashing && !b.dashing) wa = dasherWeight;
    else if (b.dashing && !a.dashing) wa = 1 - dasherWeight;
    a.x += nx * ex * wa; a.z += nz * ex * wa;
    b.x -= nx * ex * (1 - wa); b.z -= nz * ex * (1 - wa);
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv > 0) {
      a.vx += nx * rv * wa; a.vz += nz * rv * wa;
      b.vx -= nx * rv * (1 - wa); b.vz -= nz * rv * (1 - wa);
      r.rv = rv;
      r.pulled = wa > 0.5 ? a : b;
    }
    return r;
  },

  // ---------- vida compartida ----------
  damageTeam(team, n, god) {
    if (god) return false;
    team.links = Math.max(0, team.links - n);
    return team.links <= 0;
  },
  healTeam(team, n) {
    const before = team.links;
    team.links = Math.min(team.maxLinks, team.links + n);
    return team.links - before;
  },

  // ---------- jefe ----------
  bossDamageMult(stunned, vuln, C) { return Math.max(stunned ? C.stunMult : 1, vuln); },

  // índice de la fase que corresponde a la vida, o -1 si no cambia
  nextPhase(def, phase, hpFrac) {
    const next = def.phases[phase + 1];
    return next && hpFrac <= next.at ? phase + 1 : -1;
  },

  // Elige el próximo ataque de la fase. 'st' guarda { cd: Map, lastAttack, firstDone } y se actualiza.
  pickAttack(attacks, st, now, rand) {
    let a = null;
    if (!st.firstDone) { a = attacks.find((q) => q.first) || null; st.firstDone = true; }
    if (!a) {
      const ready = (q) => (st.cd.get(q) || 0) <= now;
      let list = attacks.filter((q) => ready(q) && q !== st.lastAttack);
      if (!list.length) list = attacks.filter(ready);
      if (!list.length) list = attacks;
      let total = 0;
      for (const q of list) total += q.weight || 1;
      let r = rand() * total;
      for (const q of list) { r -= q.weight || 1; if (r <= 0) { a = q; break; } }
      if (!a) a = list[list.length - 1];
    }
    st.lastAttack = a;
    if (a.cooldown) st.cd.set(a, now + a.cooldown);
    return a;
  },

  // ---------- lectura: qué amenaza ahora ----------
  // Devuelve { label, advice, kind } para el ataque en curso (o null si no hay).
  // kind: danger | safe | electric | anchor | projectile | pierce (mismo código de colores del juego).
  threat(attackDef, info) {
    if (!attackDef) return null;
    if (attackDef.type === 'combo') {
      const parts = attackDef.parts.map((p) => Rules.threat(p, info)).filter(Boolean);
      if (!parts.length) return null;
      return { label: parts.map((p) => p.label).join(' + '), advice: parts.map((p) => p.advice).join(' · '), kind: parts[0].kind };
    }
    const base = info[attackDef.type];
    if (!base) return { label: attackDef.type.toUpperCase(), advice: '', kind: 'danger' };
    const pierce = attackDef.pierce || attackDef.pierceEvery;
    if (pierce && base.advicePierce) return { label: base.label, advice: base.advicePierce, kind: attackDef.pierce ? 'pierce' : base.kind };
    return { label: base.label, advice: base.advice, kind: base.kind };
  },

  // Etiqueta de rol de cada jugador (lo que tiene que hacer AHORA), o null.
  // ctx: { type, targets:[bool,bool], electrified, warning, anchor:{x,z,occupant(idx|-1)}|null, players:[{x,z}], dormant }
  roles(ctx, out) {
    out[0] = null; out[1] = null;
    if (ctx.dormant) return out;
    if (ctx.anchor) {
      const an = ctx.anchor;
      let holder = an.occupant;
      if (holder < 0) {
        const p = ctx.players;
        const d0 = (p[0].x - an.x) ** 2 + (p[0].z - an.z) ** 2, d1 = (p[1].x - an.x) ** 2 + (p[1].z - an.z) ** 2;
        holder = d0 <= d1 ? 0 : 1;
        out[holder] = 'AL DORADO';
      } else out[holder] = 'QUIETO';
      out[1 - holder] = 'ATACA';
      return out;
    }
    if (ctx.electrified || ctx.warning) { out[0] = out[1] = 'LEJOS'; return out; }
    switch (ctx.type) {
      case 'jumpTogether': out[0] = out[1] = 'AL AZUL'; return out;
      case 'jumpSplit': out[0] = out[1] = 'SEPÁRENSE'; return out;
      case 'shockwave': out[0] = out[1] = 'DASH'; return out;
    }
    for (let i = 0; i < 2; i++) if (ctx.targets[i]) out[i] = '¡A TI!';
    return out;
  },

  // ---------- lectura: cómo están coordinando ----------
  // Aporta lo que la HUD muestra en el medidor de BARRIDO.
  //   tension 0..1 (floja -> tensa), share 0..1 (cuánto barre P1 respecto de P2),
  //   power 0..maxMult (barrido medio), aligned: el jefe está dentro del alcance de la cadena.
  coordination(a, b, boss, maxLen, C, out) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    out.len = len;
    out.tension = U.clamp((len - C.minLength) / Math.max(0.01, maxLen - C.minLength), 0, 1);
    let nx = 0, nz = 0;
    if (len > 1e-4) { nx = -dz / len; nz = dx / len; }
    const pa = Math.abs(a.vx * nx + a.vz * nz), pb = Math.abs(b.vx * nx + b.vz * nz);
    out.share = pa + pb > 0.2 ? pa / (pa + pb) : 0.5;
    out.power = U.clamp((pa + pb) * 0.5 / C.refSpeed, 0, C.maxMult);
    out.aligned = false;
    if (boss && len > C.minLength) {
      const c = U.segClosest(a.x, a.z, b.x, b.z, boss.x, boss.z);
      out.aligned = c.t > 0.08 && c.t < 0.92 && c.d < boss.radius + 2.2;
    }
    return out;
  },

  // ---------- resultado ----------
  rank(stats) {
    if (stats.retries === 0 && stats.hits <= 3) return 'S';
    if (stats.retries === 0) return 'A';
    if (stats.retries <= 2) return 'B';
    return 'C';
  },
};
