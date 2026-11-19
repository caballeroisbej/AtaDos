// Smoke real de navegador: abre index.html por file:// en Chrome headless local
// (sin servidor ni red) y juega el flujo básico con teclas de verdad vía DevTools Protocol.
// Sin dependencias: usa el WebSocket y fetch de Node >= 22.
//
//   npm run smoke                 (busca Chrome en las rutas habituales)
//   CHROME=/ruta/a/chrome npm run smoke
//
// Deja capturas en test-results/ y termina con código 1 si algo falla
// (incluye errores de consola, excepciones y cualquier pedido de red que no sea file://).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '✔' : '✖'} ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
}

async function main() {
  const chrome = CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) { console.log('SKIP: no se encontró Chrome (define CHROME=/ruta). Smoke NO ejecutado.'); process.exit(2); }
  if (typeof WebSocket === 'undefined') { console.log('SKIP: Node sin WebSocket global (usa Node >= 22).'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'atados-smoke-'));

  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,800', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  try {
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch (e) { /* aún no */ }
  }
  if (!port) throw new Error('Chrome no abrió el puerto de depuración');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0;
  const pending = new Map();
  const errors = [], warnings = [], network = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('excepción: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (m.params.type === 'error' || m.params.type === 'assert') errors.push('console.error: ' + txt);
      else if (m.params.type === 'warning') warnings.push(txt);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url;
      if (!/^(file:|data:|blob:|about:)/.test(u)) network.push(u);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const snap = () => evaluate('ATADOS.snapshot()');
  const waitFor = async (expr, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await evaluate(expr)) return true; await sleep(50); }
    return false;
  };
  const KEYS = {
    Digit1: ['1', 49], Digit2: ['2', 50], Digit3: ['3', 51], Escape: ['Escape', 27], Enter: ['Enter', 13], Space: [' ', 32],
    KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyQ: ['q', 81], KeyR: ['r', 82], KeyM: ['m', 77], KeyP: ['p', 80],
    ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], F1: ['F1', 112],
  };
  const keyDown = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEYS[code][0], windowsVirtualKeyCode: KEYS[code][1] });
  const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEYS[code][0], windowsVirtualKeyCode: KEYS[code][1] });
  const tap = async (code) => { await keyDown(code); await sleep(40); await keyUp(code); await sleep(60); };
  const step = (frames = 1) => evaluate(`ATADOS.step(${frames}, 1/30)`);
  const stepUntil = (condition, maxFrames) => evaluate(`(() => {
    const ready = () => (${condition});
    for (let i = 0; i < ${maxFrames} && !ready(); i++) ATADOS.step(1, 1/30);
    return !!ready();
  })()`);
  const withKeys = async (codes, action) => {
    for (const code of codes) await keyDown(code);
    try { return await action(); }
    finally { for (const code of codes) await keyUp(code); }
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  };

  await Promise.all([send('Runtime.enable'), send('Log.enable'), send('Network.enable'), send('Page.enable')]);
  const url = pathToFileURL(path.join(ROOT, 'index.html')).href;
  const t0 = Date.now();

  // ---------- 1. arranque por file:// ----------
  await send('Page.navigate', { url: url + '?seed=7' });
  check('arranca por file:// y llega al título', await waitFor("window.ATADOS && ATADOS.state === 'title'", 15000));
  const boot = await evaluate(`({ gl: !!ATADOS.renderer.getContext(), w: ATADOS.W, h: ATADOS.H, title: !document.getElementById('title').classList.contains('hidden'), three: THREE.REVISION })`);
  check('WebGL activo, canvas con tamaño y pantalla de título visible', boot.gl && boot.w > 0 && boot.title, boot);
  await sleep(500);
  await shot('01-titulo');

  // En una ventana angosta, el título sigue alcanzable al abrir práctica y el pie al desplazarse.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 740, deviceScaleFactor: 1, mobile: false });
  const layout = await evaluate(`(() => {
    const title = document.getElementById('title');
    document.getElementById('btnPractice').click();
    const logo = document.querySelector('.logo').getBoundingClientRect();
    const music = document.getElementById('musicBtn').getBoundingClientRect();
    title.scrollTop = title.scrollHeight;
    const bottom = document.getElementById('musicBtn').getBoundingClientRect().bottom;
    document.getElementById('btnPractice').click(); title.scrollTop = 0;
    return { logoTop: logo.top, musicWidth: music.width, bottom, height: innerHeight };
  })()`);
  check('ventana 390×740: título y música alcanzables con práctica abierta', layout.logoTop >= 0 && layout.musicWidth > 30 && layout.bottom <= layout.height, layout);
  await send('Emulation.clearDeviceMetricsOverride');

  // El arranque anterior usa el loop normal. A partir de aquí, mantenemos
  // la entrada real de Chrome y avanzamos la simulación entre keydown y keyup.
  await evaluate('ATADOS.manual = true; Clock.set(0)');

  // ---------- 2. acceso básico: tecla 1 = 2 jugadores ----------
  await tap('Digit1');
  let s = await snap();
  check('tecla 1 empieza en 2 jugadores contra el jefe 1', s.state === 'playing' && s.mode === 'coop' && s.bossIndex === 0 && s.boss.state === 'dormant', { state: s.state, mode: s.mode });
  check('HUD visible al jugar', await evaluate("!document.getElementById('hud').classList.contains('hidden')"));
  const hudLayout = await evaluate(`(() => {
    const threat = document.getElementById('threat'), combo = document.getElementById('combo');
    threat.classList.add('on'); document.getElementById('threatLabel').textContent = 'ESPIRAL';
    document.getElementById('threatAdvice').textContent = 'Giren la cadena con la espiral para bloquear.';
    combo.textContent = 'TAJO x2';
    const bottom = threat.getBoundingClientRect().bottom, top = combo.getBoundingClientRect().top;
    threat.classList.remove('on'); combo.textContent = '';
    return { bottom, top };
  })()`);
  check('TAJO queda bajo la tarjeta de amenaza', hudLayout.top >= hudLayout.bottom, hudLayout);

  // ---------- 3. dos jugadores en el mismo teclado a la vez ----------
  const before = s.players;
  await withKeys(['KeyD', 'ArrowLeft'], () => stepUntil(
    `ATADOS.players[0].x > ${before[0].x} + 0.3 && ATADOS.players[1].x < ${before[1].x} - 0.3`,
    30,
  ));
  s = await snap();
  check('P1 (D) y P2 (←) se mueven a la vez y en sentidos opuestos', s.players[0].x > before[0].x + 0.3 && s.players[1].x < before[1].x - 0.3,
    { p1: [before[0].x.toFixed(2), s.players[0].x.toFixed(2)], p2: [before[1].x.toFixed(2), s.players[1].x.toFixed(2)] });
  await withKeys(['Space', 'Enter'], () => step());
  s = await snap();
  check('dash de los dos (Espacio y Enter) sin pausar ni salir', s.stats.dashes >= 2 && s.state === 'playing', s.stats);

  // ---------- 4. pausa / reanudación ----------
  await tap('Escape');
  s = await snap();
  check('Esc pausa y muestra la pantalla de pausa', s.state === 'paused' && s.screen === 'pauseScreen', s.screen);
  const frozen = s.players[0];
  await withKeys(['KeyA'], () => step(9));
  s = await snap();
  check('en pausa no se mueve nadie', Math.abs(s.players[0].x - frozen.x) < 1e-6);
  await shot('03-pausa');
  await tap('Escape');
  s = await snap();
  check('Esc reanuda', s.state === 'playing' && !s.screen);

  // ---------- 5. la cadena (con teclas) despierta al jefe ----------
  // los dos caminan hacia el jefe separándose: la cadena lo cruza
  await withKeys(['KeyW', 'KeyA', 'ArrowUp', 'ArrowRight'], () => step(8));
  const woke = await withKeys(['KeyW', 'ArrowUp'], () => stepUntil(
    "ATADOS.boss.state !== 'dormant'",
    120,
  ));
  check('caminando con la cadena tensa se despierta al jefe (entrada real)', woke, (await snap()).boss.state);

  // ---------- 6. lectura: tarjeta AMENAZA y roles mientras ataca ----------
  const sawThreat = await stepUntil("ATADOS.boss.intent && document.getElementById('threat').classList.contains('on') && document.getElementById('threatLabel').textContent.length > 0", 240);
  const threat = await evaluate("({ label: document.getElementById('threatLabel').textContent, cls: document.getElementById('threat').className, attack: ATADOS.boss.intent && ATADOS.boss.intent.def.type, roles: ATADOS.snapshot().roles })");
  check('cuando el jefe ataca, la tarjeta AMENAZA dice qué es y con su color', sawThreat && /k-(danger|projectile)/.test(threat.cls), threat);
  check('medidor de BARRIDO visible en la pelea', await evaluate("!document.getElementById('sweep').classList.contains('off')"));
  await shot('02-pelea-amenaza');

  // ---------- 7. reinicio desde la pausa ----------
  await tap('Escape'); await tap('KeyR');
  s = await snap();
  check('pausa + R reinicia el jefe (dormido, reintento contado)', s.state === 'playing' && s.boss.state === 'dormant' && s.stats.retries === 1 && s.boss.hp === s.boss.maxHp, { boss: s.boss.state, retries: s.stats.retries });

  // ---------- 8. derrota, bloqueo anti-rebote y reintento ----------
  await evaluate('ATADOS.boss.wake(); ATADOS.damageTeam(99, "test")');
  s = await snap();
  check('sin vida: derrota', s.state === 'defeat', s.state);
  await tap('Enter');
  check('Enter apretado justo al perder NO reintenta (bloqueo)', (await snap()).state === 'defeat');
  check('aparece la pantalla de derrota', await waitFor("ATADOS.snapshot().screen === 'endScreen'", 4000));
  await evaluate('Clock.advance(1500)');
  await tap('Enter');
  s = await snap();
  check('Enter en la derrota reintenta el mismo jefe con vida llena', s.state === 'playing' && s.bossIndex === 0 && s.team.links === s.team.maxLinks, { state: s.state, links: s.team.links });

  // ---------- 9. jefe derrotado -> mejora -> jefe 2 ----------
  await evaluate('ATADOS.boss.wake()');
  await stepUntil("ATADOS.boss.state === 'fight'", 140);
  await evaluate('ATADOS.boss.damage(ATADOS.boss.hp + 1, "test")');
  check('jefe derrotado pasa a elegir mejora', await stepUntil("ATADOS.state === 'upgrade'", 240), (await snap()).state);
  await tap('Digit1'); // bloqueado al aparecer: no debe elegir
  check('la mejora no se elige sin querer al aparecer', (await snap()).state === 'upgrade');
  await evaluate('Clock.advance(700)');
  await tap('Digit1');
  s = await snap();
  check('1 elige mejora y empieza el jefe 2', s.state === 'playing' && s.bossIndex === 1 && s.boss.id === 'sapo', { state: s.state, boss: s.boss && s.boss.id });

  // ---------- 10. menú, música y modo 1 jugador ----------
  await tap('Escape'); await tap('KeyQ');
  s = await snap();
  check('pausa + Q vuelve al título', s.state === 'title' && s.screen === 'title');
  const m0 = await evaluate("document.getElementById('musicBtn').textContent");
  await tap('KeyM');
  const m1 = await evaluate("document.getElementById('musicBtn').textContent");
  check('M alterna la música', m0 !== m1, [m0, m1]);
  await tap('Digit2');
  s = await snap();
  check('tecla 2: modo 1 jugador con vida extra', s.state === 'playing' && s.mode === 'solo' && s.team.maxLinks === 11, { mode: s.mode, links: s.team.maxLinks });
  await tap('Escape'); await tap('KeyQ');

  // ---------- 11. práctica de un jefe (selección por menú) ----------
  await evaluate("document.getElementById('btnPractice').click(); document.querySelectorAll('#practiceBosses .pbtn')[2].click()");
  s = await snap();
  check('práctica: elegir el jefe 3 desde el menú', s.state === 'playing' && s.practice && s.boss.id === 'centinela', { state: s.state, boss: s.boss && s.boss.id });
  await tap('Escape'); await tap('KeyQ');

  // ---------- 12. panel de balance (?dev, F1) ----------
  await send('Page.navigate', { url: url + '?dev' });
  await waitFor("window.ATADOS && ATADOS.state === 'title'", 15000);
  await tap('F1');
  check('?dev + F1 abre el panel de ajuste', await evaluate("!!document.getElementById('devPanel') && !document.getElementById('devPanel').classList.contains('hidden')"));

  // ---------- 13. avance determinista con ?manual&seed (tiempo controlado) ----------
  await send('Page.navigate', { url: url + '?manual&seed=11' });
  await waitFor("window.ATADOS && ATADOS.state === 'title'", 15000);
  const det = await evaluate(`(() => {
    const run = () => { ATADOS.startRun('coop', 2, true); ATADOS.boss.wake(); ATADOS.step(600, 1/60); const s = ATADOS.snapshot(); ATADOS.pause(); ATADOS.toMenu(); return s; };
    RNG.seed(11); const a = run(); RNG.seed(11); const b = run();
    return { same: a.boss.attack === b.boss.attack && a.boss.x === b.boss.x && a.boss.z === b.boss.z && a.boss.hp === b.boss.hp && a.players[0].x === b.players[0].x, a: a.boss, b: b.boss, err: a.lastError };
  })()`);
  check('con semilla y pasos fijos la simulación se repite igual', det.same && !det.err, det);

  // ---------- 14. coordinación visible: el ancla reparte roles ----------
  const anchor = await evaluate(`(() => {
    ATADOS.startRun('coop', 2, true); ATADOS.boss.wake(); ATADOS.step(120, 1/60);
    const b = ATADOS.boss, def = CONFIG.bosses[2].phases[0].attacks.find((a) => a.type === 'anchor');
    b.cancelAction(); b.intent = { def, targets: [false, false] }; b.action = Attacks.anchor(b, ATADOS, def); b.action.next(0);
    ATADOS.step(20, 1/60);
    const s = ATADOS.snapshot();
    return { roles: s.roles, threat: s.threat, tags: [...document.querySelectorAll('#tags .tag')].filter((t) => t.style.display !== 'none').map((t) => t.textContent) };
  })()`);
  check('ancla: un jugador va AL DORADO y el otro ATACA, con etiquetas en pantalla', anchor.roles.includes('AL DORADO') && anchor.roles.includes('ATACA') && anchor.tags.length >= 2 && anchor.threat.kind === 'anchor', anchor);
  await shot('04-ancla-roles');
  await evaluate('ATADOS.pause(); ATADOS.toMenu()');

  // ---------- resultado ----------
  const lastErr = await evaluate('ATADOS.lastError ? String(ATADOS.lastError) : null');
  check('sin errores capturados por el loop', !lastErr, lastErr || undefined);
  check('sin errores ni excepciones en consola', errors.length === 0, errors.slice(0, 5));
  check('sin avisos de transición inválida', !warnings.some((w) => w.includes('[flow]')), warnings.filter((w) => w.includes('[flow]')));
  check('sin pedidos de red (todo local por file://)', network.length === 0, network.slice(0, 5));

  ws.close();
  const summary = { when: new Date().toISOString(), chrome: path.basename(chrome), seconds: ((Date.now() - t0) / 1000).toFixed(1), passed: results.length - failed, failed, results };
  fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${failed ? 'FALLÓ' : 'OK'}: ${results.length - failed}/${results.length} comprobaciones · ${summary.seconds}s · capturas y smoke.json en test-results/`);
  process.exitCode = failed ? 1 : 0;
  } finally {
    if (proc.exitCode === null && proc.signalCode === null) {
      const closed = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await closed;
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

main().catch((e) => { console.error('smoke: ' + e.stack); process.exit(1); });
