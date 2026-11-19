// Gameplay real (Chain, Player, Boss, Attacks, Projectiles, Game.simulate) con el render
// reemplazado por stubs. Verifica las reglas 3 (generadores cancelables con limpieza)
// y 5 (pools fijos), y que la cadena despierta, daña y corta al jefe.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, anything, CORE, CORE_EXPORTS } = require('./harness');

const FILES = [...CORE, 'src/core/flow.js', 'src/gameplay/rules.js', 'src/gameplay/chain.js', 'src/gameplay/player.js',
  'src/gameplay/projectiles.js', 'src/gameplay/attacks.js', 'src/gameplay/boss.js', 'src/game.js'];
const ctx = load(FILES, { stubs: true, exports: [...CORE_EXPORTS, 'Rules', 'Flow', 'Chain', 'Player', 'Projectiles', 'Attacks', 'Boss', 'Game', 'AnchorHazard'] });
// game.js se registra con window.addEventListener: el stub lo ignora
const { CONFIG, RNG, Chain, Player, Projectiles, Attacks, Boss, Game } = ctx;

// juego mínimo: estado real de gameplay, sin DOM ni WebGL
function makeGame(bossIndex = 0, seed = 1) {
  RNG.seed(seed);
  const scene = anything();
  const activeTelegraphs = new Set();
  const createTelegraph = () => {
    const telegraph = { set() {}, remove() { activeTelegraphs.delete(this); } };
    activeTelegraphs.add(telegraph);
    return telegraph;
  };
  const g = {
    state: 'playing', time: 0, arenaR: CONFIG.arenaRadius, hazards: [], godMode: false, bossTime: 0,
    mods: Game.defaultMods(), stats: Game.blankStats(), team: { links: 99, maxLinks: 99 },
    intents: [{ x: 0, z: 0, dash: false }, { x: 0, z: 0, dash: false }], dashBuf: [0, 0],
    tele: {
      circle: createTelegraph, rect: createTelegraph, cone: createTelegraph, safeZone: createTelegraph,
      clearOwner() { activeTelegraphs.clear(); },
    },
    activeTelegraphs, scene, hits: 0, events: [],
    mid: Game.mid, pickPlayer: Game.pickPlayer, bossAlive: Game.bossAlive,
    hurtPlayer(pl, dmg) { if (!pl.canBeHit()) return false; pl.invuln = CONFIG.player.hurtInvuln; this.hits += dmg; return true; },
    damageTeam(n) { this.hits += n; },
    healTeam() {}, hintOnce() {}, banner() {},
    onBossWake() { this.events.push('wake'); }, onBossAttack(a) { this.events.push('attack:' + a.type); },
    onBossDying() { this.events.push('dying'); }, onBossDead() { this.events.push('dead'); },
    simulate: Game.simulate,
  };
  g.players = [new Player(0, g, scene), new Player(1, g, scene)];
  g.chain = new Chain(scene, g);
  g.projectiles = new Projectiles(scene, g, 40);
  g.boss = new Boss(CONFIG.bosses[bossIndex], g, scene);
  return g;
}
const DT = 1 / 60;
function run(g, seconds, each) { for (let t = 0; t < seconds; t += DT) { if (each) each(g, t); g.simulate(DT); g.time += DT; } }

// invariantes que todo ataque debe dejar al terminar o al cancelarse
function assertClean(g, label) {
  const b = g.boss;
  assert.equal(b.airborne, false, label + ': quedó en el aire');
  assert.equal(b.y, 0, label + ': altura');
  assert.equal(b.stunned, false, label + ': aturdido');
  assert.equal(b.vuln, 1, label + ': vulnerable');
  assert.equal(g.chain.electrified, false, label + ': cadena electrificada');
  assert.equal(g.chain.warning, false, label + ': aviso eléctrico');
  assert.equal(g.activeTelegraphs.size, 0, label + ': aviso de suelo activo');
}

function attackDefs() {
  const list = [];
  for (const [bi, b] of CONFIG.bosses.entries()) for (const ph of b.phases) for (const a of ph.attacks) list.push({ bi, a });
  return list;
}

test('la cadena despierta al jefe dormido y después lo daña barriendo', () => {
  const g = makeGame(0);
  const b = g.boss;
  assert.equal(b.state, 'dormant');
  // jefe en (0,-4): cadena horizontal que baja y lo atraviesa
  g.players[0].reset(-3.2, -1); g.players[1].reset(3.2, -1);
  run(g, 0.8, (gg) => { gg.intents[0].z = -1; gg.intents[1].z = -1; });
  assert.ok(g.events.includes('wake'), 'despertó');
  run(g, 2.0, (gg) => { gg.intents[0].z = gg.intents[1].z = 0; });
  assert.equal(b.state, 'fight');
  const hp0 = b.hp;
  // barrer de un lado a otro sobre el jefe: hace daño y al cruzarlo, TAJO
  b.restT = 99; // que no ataque durante la prueba
  let dir = 1;
  run(g, 3, (gg, t) => {
    const mz = (gg.players[0].z + gg.players[1].z) / 2;
    if (mz < b.z - 1.5) dir = 1; else if (mz > b.z + 1.5) dir = -1;
    gg.intents[0].z = gg.intents[1].z = dir;
    gg.intents[0].x = -0.3; gg.intents[1].x = 0.3;
  });
  assert.ok(b.hp < hp0, 'el barrido hizo daño');
  assert.ok(g.chain.tajos >= 1, 'cruzarlo cuenta como TAJO');
});

test('cada ataque configurado termina solo y deja todo limpio', () => {
  for (const { bi, a } of attackDefs()) {
    const g = makeGame(bi, 3);
    const b = g.boss;
    b.state = 'fight';
    g.players[0].reset(-2, 4); g.players[1].reset(2, 4);
    b.intent = { def: a, targets: [false, false] };
    b.action = Attacks[a.type](b, g, a);
    let done = b.action.next(0).done;
    let t = 0;
    while (!done && t < 30) { g.simulate(DT); t += DT; done = !b.action; if (b.action) { /* lo avanza Boss.update */ } }
    assert.ok(done, `${a.type} (${CONFIG.bosses[bi].id}) no terminó en 30 s`);
    assertClean(g, a.type);
  }
});

test('cancelar cualquier ataque a mitad de camino limpia (regla de generadores)', () => {
  for (const { bi, a } of attackDefs()) {
    for (const frames of [1, 20, 70, 140]) {
      const g = makeGame(bi, 5);
      const b = g.boss;
      b.state = 'fight';
      g.players[0].reset(-2, 4); g.players[1].reset(2, 4);
      b.intent = { def: a, targets: [false, false] };
      b.action = Attacks[a.type](b, g, a);
      b.action.next(0);
      for (let i = 0; i < frames && b.action; i++) g.simulate(DT);
      // primero el 'finally' del propio generador (sin la red de seguridad de cancelAction)
      if (b.action) { b.action.return(); assertClean(g, `${a.type}: finally tras ${frames} frames`); }
      b.cancelAction();
      assert.equal(b.intent, null);
      assertClean(g, `${a.type} cancelado tras ${frames} frames`);
      // los peligros del jefe terminan solos después de cancelar
      run(g, 1.5, () => { b.restT = 99; });
      for (const h of g.hazards) assert.ok(h.done || h.dead || h.struck, `${a.type}: peligro vivo tras cancelar`);
    }
  }
});

test('los ataques apuntados marcan a quién van (lectura de la HUD)', () => {
  const g = makeGame(0, 9);
  const b = g.boss;
  b.state = 'fight';
  const charge = CONFIG.bosses[0].phases[0].attacks.find((a) => a.type === 'charge');
  b.intent = { def: charge, targets: [false, false] };
  b.action = Attacks.charge(b, g, charge);
  b.action.next(0);
  assert.equal(b.intent.targets.filter(Boolean).length, 1, 'la embestida apunta a uno solo');
  b.cancelAction();
});

test('cambio de fase cancela el ataque en curso y anuncia la nueva fase', () => {
  const g = makeGame(1, 2);
  const b = g.boss;
  b.state = 'fight';
  const jump = CONFIG.bosses[1].phases[0].attacks.find((a) => a.type === 'jumpSplit');
  b.intent = { def: jump, targets: [false, false] };
  b.action = Attacks.jumpSplit(b, g, jump);
  b.action.next(0);
  for (let i = 0; i < 40; i++) g.simulate(DT);
  assert.equal(b.airborne, true);
  b.airborne = false; // el daño solo entra con el jefe en el suelo
  b.damage(b.maxHp * 0.6, 'dev');
  assert.equal(b.phase, 1);
  assert.equal(b.state, 'phase');
  assert.equal(b.action, null);
  assertClean(g, 'tras fase');
});

test('muerte del jefe: una sola vez, sin daño posterior', () => {
  const g = makeGame(0);
  const b = g.boss;
  b.state = 'fight';
  b.damage(b.maxHp * 2, 'dev');
  assert.equal(b.state, 'dying');
  assert.equal(b.damage(50, 'dev'), 0, 'muriendo no recibe daño');
  run(g, 2.5);
  assert.equal(g.events.filter((e) => e === 'dead').length, 1);
});

test('proyectiles: pool fijo, la cadena bloquea naranjos y carga; los morados pasan', () => {
  const g = makeGame(0);
  g.boss.state = 'fight'; g.boss.restT = 99; g.boss.x = 0; g.boss.z = -9;
  for (let i = 0; i < 40; i++) assert.ok(g.projectiles.spawn(0, 0, 0, 0, {}));
  assert.equal(g.projectiles.spawn(0, 0, 0, 0, {}), null, 'sin espacio: no crea más');
  g.projectiles.clear();
  assert.equal(g.projectiles.active.length, 0);
  g.players[0].reset(-3, 0); g.players[1].reset(3, 0);
  g.projectiles.spawn(0, -3, 0, 6, {});
  g.projectiles.spawn(0.5, -3, 0, 6, { pierce: true });
  run(g, 0.6);
  assert.equal(g.chain.charge, 1, 'el naranjo cargó la cadena');
  assert.equal(g.stats.blocks, 1);
  assert.ok(g.projectiles.active.some((p) => p.kind === 'pierce') || g.hits > 0, 'el morado siguió de largo');
});

test('misma semilla, misma secuencia de ataques del jefe', () => {
  const seq = (seed) => {
    const g = makeGame(2, seed);
    const b = g.boss;
    b.state = 'fight'; b.restT = 0;
    g.players[0].reset(-2, 5); g.players[1].reset(2, 5);
    run(g, 25);
    return g.events.filter((e) => e.startsWith('attack:'));
  };
  const s1 = seq(77);
  assert.ok(s1.length >= 3, 'atacó varias veces');
  assert.deepEqual(seq(77), s1);
});
