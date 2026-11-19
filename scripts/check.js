// Revisa la sintaxis de todos los scripts del juego.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const walk = (d) => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
let fail = 0;
for (const f of walk('src')) { try { execSync(`node --check "${f}"`); } catch (e) { fail++; } }
console.log(fail ? `${fail} archivo(s) con error` : 'OK'); process.exit(fail ? 1 : 0);
