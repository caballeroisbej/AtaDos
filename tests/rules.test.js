// Reglas puras: cadena, TAJO, bloqueo, vida, fases, elección de ataques, lectura.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, CORE, CORE_EXPORTS } = require('./harness');

const ctx = load([...CORE, 'src/gameplay/rules.js'], { exports: [...CORE_EXPORTS, 'Rules'] });
const { Rules, CONFIG, RNG } = ctx;
const C = CONFIG.chain;
const P = (x, z, vx = 0, vz = 0, extra = {}) => ({ x, z, vx, vz, ...extra });
const mods = { damage: 1 };

test('chainContact: la cadena atraviesa al jefe y sabe de qué lado está', () => {
  const out = {};
  const boss = { x: 0, z: 0, radius: 1.8 };
  Rules.chainContact(P(-3, 0.5), P(3, 0.5), boss, C.minLength, out);
  assert.equal(out.inside, true);
  assert.ok(Math.abs(out.t - 0.5) < 1e-9);
  const sideA = out.side;
  Rules.chainContact(P(-3, -0.5), P(3, -0.5), boss, C.minLength, out);
  assert.equal(out.inside, true);
  assert.equal(out.side, -sideA, 'al pasar por encima del jefe cambia de lado');
  Rules.chainContact(P(-3, 4), P(3, 4), boss, C.minLength, out);
  assert.equal(out.inside, false, 'lejos no toca');
});

test('chainContact: con los jugadores pegados (cadena corta) no corta', () => {
  const out = {};
  Rules.chainContact(P(-0.5, 0), P(0.5, 0), { x: 0, z: 0, radius: 1.8 }, C.minLength, out);
  assert.equal(out.inside, false);
});

test('sweepMult: barrer perpendicular rinde; quieto rinde el mínimo; tiene tope', () => {
  const boss = { x: 0, z: 0, vx: 0, vz: 0 };
  // cadena horizontal: la normal es el eje z
  const still = Rules.sweepMult(P(-3, 0), P(3, 0), boss, 0.5, 0, 1, C);
  assert.equal(still, C.minMult);
  const ref = Rules.sweepMult(P(-3, 0, 0, C.refSpeed), P(3, 0, 0, C.refSpeed), boss, 0.5, 0, 1, C);
  assert.ok(Math.abs(ref - 1) < 1e-9, 'a la velocidad de referencia vale x1');
  const along = Rules.sweepMult(P(-3, 0, 6, 0), P(3, 0, 6, 0), boss, 0.5, 0, 1, C);
  assert.equal(along, C.minMult, 'moverse a lo largo de la cadena no barre');
  const fast = Rules.sweepMult(P(-3, 0, 0, 99), P(3, 0, 0, 99), boss, 0.5, 0, 1, C);
  assert.equal(fast, C.maxMult);
});

test('isTajo: solo cuando el jefe cruza de un lado al otro dentro del segmento', () => {
  const ct = { side: -1, t: 0.5, len: 6, d: 0.2 };
  assert.equal(Rules.isTajo(1, ct, 1.8, C.minLength), true);
  assert.equal(Rules.isTajo(-1, ct, 1.8, C.minLength), false, 'mismo lado');
  assert.equal(Rules.isTajo(0, ct, 1.8, C.minLength), false, 'sin lado previo');
  assert.equal(Rules.isTajo(1, { ...ct, t: 0.99 }, 1.8, C.minLength), false, 'por la punta no cuenta');
  assert.equal(Rules.isTajo(1, { ...ct, len: 1 }, 1.8, C.minLength), false, 'cadena demasiado corta');
});

test('tajoDamage: combo con tope y carga +10% por bloqueo', () => {
  const base = Rules.tajoDamage(C, 1, mods, 0, 0);
  assert.equal(base, C.slashDamage);
  assert.equal(Rules.tajoDamage(C, 0, mods, 0, 0), C.slashDamage * C.slashMinMult, 'un tajo lento igual pega el mínimo');
  const charged = Rules.tajoDamage(C, 1, mods, 0, C.chargeMax);
  assert.ok(Math.abs(charged - base * (1 + C.chargeMax * C.chargePerBlock)) < 1e-9);
  const capped = Rules.tajoDamage(C, 1, mods, 99, 0);
  assert.ok(Math.abs(capped - base * (1 + C.comboMax * C.comboBonus)) < 1e-9);
});

test('blocks: la cadena bloquea en el medio pero no en las manos', () => {
  const a = P(-3, 0), b = P(3, 0);
  assert.equal(Rules.blocks(a, b, 0, 0.1, 0.3, 0.55, C.thickness), true);
  assert.equal(Rules.blocks(a, b, -2.9, 0, 0.3, 0.55, C.thickness), false, 'pegado al jugador no');
  assert.equal(Rules.blocks(a, b, 0, 2, 0.3, 0.55, C.thickness), false, 'lejos no');
  assert.equal(Rules.blocks(P(0, 0), P(0.5, 0), 0.25, 0, 0.3, 0.55, C.thickness), false, 'cadena casi cerrada no bloquea');
});

test('constrain: nunca supera el largo y el que hace dash arrastra al otro', () => {
  const L = 7;
  const a = P(0, 0, -5, 0), b = P(9, 0, 5, 0);
  const r = Rules.constrain(a, b, L, C.dasherWeight);
  assert.ok(Math.abs((b.x - a.x) - L) < 1e-9);
  assert.ok(r.rv > 0, 'se anuló la velocidad que los separaba');
  assert.ok(Math.abs(a.vx - b.vx) < 1e-9);
  // dash: 'a' pesa más y se mueve menos
  const c = P(0, 0, 0, 0, { dashing: true }), d = P(9, 0);
  Rules.constrain(c, d, L, C.dasherWeight);
  assert.ok(Math.abs(c.x) < Math.abs(d.x - 9), 'el que hace dash se desplaza menos');
  // dentro del largo no toca nada
  const e = P(0, 0, 1, 1), f = P(3, 0);
  assert.equal(Rules.constrain(e, f, L, C.dasherWeight).rv, 0);
  assert.deepEqual([e.x, e.z, e.vx, e.vz], [0, 0, 1, 1]);
});

test('vida compartida: daño, muerte, curación con tope y modo dios', () => {
  const team = { links: 2, maxLinks: 8 };
  assert.equal(Rules.damageTeam(team, 1, false), false);
  assert.equal(Rules.damageTeam(team, 5, false), true);
  assert.equal(team.links, 0);
  assert.equal(Rules.healTeam(team, 20), 8);
  assert.equal(team.links, 8);
  assert.equal(Rules.damageTeam(team, 3, true), false);
  assert.equal(team.links, 8, 'modo dios no resta');
});

test('fases: se entra a la siguiente al cruzar el umbral y solo una vez', () => {
  const def = CONFIG.bosses[0];
  assert.equal(Rules.nextPhase(def, 0, 0.9), -1);
  assert.equal(Rules.nextPhase(def, 0, def.phases[1].at), 1);
  assert.equal(Rules.nextPhase(def, 1, 0.1), -1, 'no hay fase 3');
  assert.equal(Rules.bossDamageMult(true, 1, C), C.stunMult);
  assert.equal(Rules.bossDamageMult(true, 1.6, C), 1.6, 'expuesto gana a aturdido');
});

test('pickAttack: abre con el "first", respeta cooldown, no repite y es reproducible con semilla', () => {
  const atks = CONFIG.bosses[1].phases[0].attacks; // sapo fase 1
  const run = (seed) => {
    RNG.seed(seed);
    const st = { cd: new Map(), lastAttack: null, firstDone: false };
    const seq = [];
    for (let i = 0; i < 30; i++) seq.push(Rules.pickAttack(atks, st, i * 2, () => RNG.next()));
    return seq;
  };
  const seq = run(42);
  assert.equal(seq[0], atks.find((a) => a.first));
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], 'no repite el mismo ataque seguido');
  // cooldown del terremoto (9 s): con un ataque cada 2 s, nunca dos veces en menos de 9 s
  const quake = atks.find((a) => a.type === 'jumpTogether');
  let last = -99;
  seq.forEach((a, i) => { if (a === quake) { assert.ok(i * 2 - last >= quake.cooldown); last = i * 2; } });
  assert.deepEqual(run(42).map((a) => a.type), seq.map((a) => a.type), 'misma semilla, misma pelea');
  RNG.unseed();
});

test('threat: etiqueta, consejo y color de cada ataque (combo y morados incluidos)', () => {
  const info = CONFIG.attackInfo;
  assert.equal(Rules.threat(null, info), null);
  assert.deepEqual(Rules.threat({ type: 'jumpTogether' }, info).kind, 'safe');
  assert.equal(Rules.threat({ type: 'volley', pierce: true }, info).kind, 'pierce');
  assert.equal(Rules.threat({ type: 'volley' }, info).kind, 'projectile');
  const combo = Rules.threat(CONFIG.bosses[2].phases[1].attacks[0], info);
  assert.equal(combo.label, 'CADENA ELÉCTRICA + ESPIRAL');
  assert.equal(combo.kind, 'electric');
  // todo ataque configurado tiene lectura
  for (const b of CONFIG.bosses) for (const ph of b.phases) for (const a of ph.attacks) {
    const types = a.type === 'combo' ? a.parts.map((p) => p.type) : [a.type];
    for (const t of types) assert.ok(info[t], 'falta attackInfo.' + t);
  }
});

test('roles: ancla reparte QUIETO/ATACA, el terremoto junta, el apuntado lo sabe', () => {
  const out = [null, null];
  const players = [P(0, 0), P(5, 0)];
  const base = { type: null, targets: [false, false], electrified: false, warning: false, anchor: null, players, dormant: false };
  assert.deepEqual(Rules.roles({ ...base, dormant: true, targets: [true, true] }, out), [null, null]);
  assert.deepEqual(Rules.roles({ ...base, anchor: { x: 5, z: 0, occupant: -1 } }, out), ['ATACA', 'AL DORADO']);
  assert.deepEqual(Rules.roles({ ...base, anchor: { x: 5, z: 0, occupant: 1 } }, out), ['ATACA', 'QUIETO']);
  assert.deepEqual(Rules.roles({ ...base, type: 'jumpTogether' }, out), ['AL AZUL', 'AL AZUL']);
  assert.deepEqual(Rules.roles({ ...base, type: 'jumpSplit' }, out), ['SEPÁRENSE', 'SEPÁRENSE']);
  assert.deepEqual(Rules.roles({ ...base, type: 'charge', targets: [false, true] }, out), [null, '¡A TI!']);
  assert.deepEqual(Rules.roles({ ...base, type: 'spiral', electrified: true }, out), ['LEJOS', 'LEJOS']);
});

test('coordination: tensión, aporte de cada jugador y alineación con el jefe', () => {
  const out = {};
  Rules.coordination(P(-3.5, 0, 0, 4), P(3.5, 0, 0, 0), { x: 0, z: 1, radius: 1.8 }, 7, C, out);
  assert.equal(out.tension, 1);
  assert.equal(out.share, 1, 'solo P1 barre');
  assert.equal(out.aligned, true);
  Rules.coordination(P(0, 0), P(1, 0), null, 7, C, out);
  assert.equal(out.tension, 0);
  assert.equal(out.share, 0.5, 'quietos: aporte parejo');
  assert.equal(out.aligned, false);
});

test('rank y código de colores intactos', () => {
  assert.equal(Rules.rank({ retries: 0, hits: 2 }), 'S');
  assert.equal(Rules.rank({ retries: 0, hits: 9 }), 'A');
  assert.equal(Rules.rank({ retries: 2, hits: 0 }), 'B');
  assert.equal(Rules.rank({ retries: 3, hits: 0 }), 'C');
  const col = CONFIG.colors;
  assert.equal(col.danger, 0xff3b3b, 'rojo = peligro');
  assert.equal(col.safe, 0x3bb6ff, 'azul = refugio');
  assert.equal(col.electric, 0xffe14a, 'amarillo = eléctrico');
  assert.equal(col.anchor, 0xffd34d, 'dorado = ancla');
});

test('RNG: misma semilla, misma secuencia; sin semilla usa Math.random', () => {
  RNG.seed(123); const a = [RNG.next(), RNG.next(), RNG.next()];
  RNG.seed(123); const b = [RNG.next(), RNG.next(), RNG.next()];
  assert.deepEqual(a, b);
  assert.ok(a.every((v) => v >= 0 && v < 1));
  RNG.unseed();
});
