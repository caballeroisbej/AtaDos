// Revisa la sintaxis de todos los scripts del juego, de las pruebas y de las herramientas,
// y que index.html cargue cada script de src/ (y en el orden core -> render -> gameplay -> ui -> game).
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; }) : [];
let fail = 0;
const files = [...walk('src'), ...walk('tests'), ...walk('scripts')];
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { fail++; console.error('Sintaxis: ' + f + '\n' + String(e.stderr || e.message)); }
}

const html = fs.readFileSync('index.html', 'utf8');
const loaded = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
for (const f of walk('src')) {
  const rel = f.split(path.sep).join('/');
  if (!loaded.includes(rel)) { fail++; console.error('index.html no carga ' + rel); }
}
const order = ['src/core/', 'src/render/', 'src/gameplay/', 'src/ui/hud.js', 'src/game.js'];
let last = -1;
for (const s of loaded.filter((x) => x.startsWith('src/'))) {
  const i = order.findIndex((o) => s.startsWith(o));
  if (i >= 0 && i < last) { fail++; console.error('Orden de <script> roto en ' + s); }
  if (i >= 0) last = Math.max(last, i);
}
if (/type="module"/.test(html) || /\bimport\s*\(/.test(files.filter((f) => f.startsWith('src')).map((f) => fs.readFileSync(f, 'utf8')).join('\n'))) {
  fail++; console.error('Nada de ES modules: el juego debe abrir por file://');
}
console.log(fail ? `${fail} problema(s)` : `OK (${files.length} archivos)`); process.exit(fail ? 1 : 0);
