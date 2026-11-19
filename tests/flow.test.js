// Estados del juego y entrada: regresiones de teclas y menús sin navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, CORE, CORE_EXPORTS } = require('./harness');

const ctx = load([...CORE, 'src/core/flow.js', 'src/core/input.js'], { exports: [...CORE_EXPORTS, 'Flow', 'KEYMAP', 'GAME_KEYS', 'Input'] });
const { Flow, KEYMAP, GAME_KEYS, Input } = ctx;
const STATES = Object.keys(Flow.next);

test('tabla de estados: los caminos del juego existen y los absurdos no', () => {
  for (const [a, b] of [['boot', 'title'], ['title', 'playing'], ['playing', 'paused'], ['paused', 'playing'],
    ['paused', 'title'], ['playing', 'upgrade'], ['upgrade', 'playing'], ['playing', 'defeat'], ['defeat', 'playing'],
    ['defeat', 'title'], ['playing', 'victory'], ['victory', 'title']]) assert.ok(Flow.canGo(a, b), a + ' -> ' + b);
  for (const [a, b] of [['title', 'paused'], ['victory', 'playing'], ['paused', 'upgrade'], ['title', 'victory'], ['boot', 'playing']])
    assert.ok(!Flow.canGo(a, b), a + ' -/-> ' + b);
});

test('título: 1 = 2 jugadores, 2 = 1 jugador', () => {
  assert.equal(Flow.keyAction('title', 'Digit1'), 'coop');
  assert.equal(Flow.keyAction('title', 'Numpad2'), 'solo');
  assert.equal(Flow.keyAction('title', 'Space'), null);
});

test('jugando: solo Esc/P pausan; ninguna tecla de jugador dispara acciones de menú', () => {
  assert.equal(Flow.keyAction('playing', 'Escape'), 'pause');
  assert.equal(Flow.keyAction('playing', 'KeyP'), 'pause');
  for (const code of GAME_KEYS) assert.equal(Flow.keyAction('playing', code), null, code + ' no debe pausar ni salir');
  assert.ok(!GAME_KEYS.has('Escape') && !GAME_KEYS.has('KeyP'), 'pausar no choca con mover/dash');
});

test('controles de los dos jugadores: P1 WASD+Espacio, P2 flechas+Enter, sin teclas compartidas', () => {
  assert.deepEqual([...KEYMAP.p1.up, ...KEYMAP.p1.left, ...KEYMAP.p1.down, ...KEYMAP.p1.right].slice(0, 4), ['KeyW', 'KeyA', 'KeyS', 'KeyD']);
  assert.ok(KEYMAP.p1.dash.includes('Space'));
  assert.ok(KEYMAP.p2.up.includes('ArrowUp') && KEYMAP.p2.dash.includes('Enter'));
  const p1 = new Set(Object.values(KEYMAP.p1).flat());
  for (const k of Object.values(KEYMAP.p2).flat()) assert.ok(!p1.has(k), k + ' está en los dos jugadores');
});

test('Input.read: dos jugadores a la vez en un teclado, diagonal normalizada, dash por flanco', () => {
  Input.down.clear(); Input.pressed.clear();
  const out = [{ x: 0, z: 0, dash: false }, { x: 0, z: 0, dash: false }];
  ['KeyW', 'KeyD', 'ArrowLeft'].forEach((k) => Input.down.add(k));
  Input.pressed.add('Enter');
  Input.read('coop', out);
  assert.ok(Math.abs(Math.hypot(out[0].x, out[0].z) - 1) < 1e-9, 'diagonal no es más rápida');
  assert.ok(out[0].x > 0 && out[0].z < 0);
  assert.deepEqual([out[1].x, out[1].z, out[1].dash, out[0].dash], [-1, 0, true, false]);
  Input.endFrame();
  Input.read('coop', out);
  assert.equal(out[1].dash, false, 'el dash cuenta una vez por pulsación');
  Input.down.clear();
});

test('pausa: Esc/P/Enter/Espacio siguen, Q menú, R reinicia el jefe', () => {
  for (const k of ['Escape', 'KeyP', 'Enter', 'Space']) assert.equal(Flow.keyAction('paused', k), 'resume');
  assert.equal(Flow.keyAction('paused', 'KeyQ'), 'menu');
  assert.equal(Flow.keyAction('paused', 'KeyR'), 'restart');
  assert.equal(Flow.keyAction('playing', 'KeyR'), null, 'R no reinicia en plena pelea');
});

test('mejora / derrota / victoria: bloqueadas al aparecer (no elegir sin querer)', () => {
  assert.equal(Flow.keyAction('upgrade', 'Enter', true), null);
  assert.equal(Flow.keyAction('defeat', 'Enter', true), null);
  assert.equal(Flow.keyAction('victory', 'Space', true), null);
  assert.equal(Flow.keyAction('upgrade', 'Digit2', false), 'pick:1');
  assert.equal(Flow.keyAction('upgrade', 'ArrowLeft', false), 'sel:-1');
  assert.equal(Flow.keyAction('upgrade', 'Enter', false), 'pick:sel');
  assert.equal(Flow.keyAction('defeat', 'KeyR', false), 'retry');
  assert.equal(Flow.keyAction('defeat', 'Escape', false), 'menu');
  assert.equal(Flow.keyAction('victory', 'Enter', false), 'menu');
  // el bloqueo no afecta a la pausa ni a la música
  assert.equal(Flow.keyAction('paused', 'Escape', true), 'resume');
  for (const s of STATES) assert.equal(Flow.keyAction(s, 'KeyM', true), 'music');
});

test('controles de juego (pad): A confirma, X = 1 jugador, Start pausa/sigue, B vuelve', () => {
  assert.equal(Flow.padAction('title', 'confirm'), 'coop');
  assert.equal(Flow.padAction('title', 'x'), 'solo');
  assert.equal(Flow.padAction('playing', 'start'), 'pause');
  assert.equal(Flow.padAction('playing', 'confirm'), null, 'A en pelea es dash, no menú');
  assert.equal(Flow.padAction('paused', 'start'), 'resume');
  assert.equal(Flow.padAction('paused', 'back'), 'menu');
  assert.equal(Flow.padAction('defeat', 'confirm', true), null);
  assert.equal(Flow.padAction('defeat', 'confirm', false), 'retry');
  assert.equal(Flow.padAction('upgrade', 'right', false), 'sel:1');
});

test('toda acción que devuelve Flow lleva a un estado permitido', () => {
  const target = { coop: 'playing', solo: 'playing', pause: 'paused', resume: 'playing', restart: 'playing', retry: 'playing', menu: 'title' };
  const codes = ['Digit1', 'Digit2', 'Digit3', 'Escape', 'KeyP', 'Enter', 'Space', 'KeyQ', 'KeyR', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
  for (const s of STATES) for (const c of codes) {
    const a = Flow.keyAction(s, c, false);
    if (a && target[a]) assert.ok(Flow.canGo(s, target[a]), `${s} + ${c} -> ${a} lleva a ${target[a]}, no permitido`);
  }
});
