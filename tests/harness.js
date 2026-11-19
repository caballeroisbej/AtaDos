// Carga los scripts globales del juego dentro de un contexto `vm` de Node.
// - load(['src/core/config.js', ...]) -> contexto con CONFIG, U, RNG, Rules, Flow...
// - Para probar generadores y jefes sin navegador, `stubs: true` reemplaza THREE,
//   VFX, AudioFX, HUD, Models y document por objetos que aceptan cualquier llamada.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// objeto "comodín": se puede llamar, construir, leer y asignar sin efectos
function anything() {
  const fn = function () {};
  const p = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      if (!(k in t)) t[k] = anything();
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return anything(); },
    construct() { return anything(); },
  });
  return p;
}

function load(files, opts = {}) {
  const ctx = { console, Math, Map, Set, Symbol, Array, Object, JSON, Number, String, Proxy };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.performance = { now: () => 0 };
  ctx.location = { search: '' };
  if (opts.stubs) {
    for (const k of ['THREE', 'VFX', 'AudioFX', 'HUD', 'Models', 'document', 'Readability']) ctx[k] = anything();
  }
  vm.createContext(ctx);
  // las declaraciones `const`/`class` de nivel superior no quedan en el objeto global:
  // se exportan explícitamente al final de cada archivo cargado.
  const names = opts.exports || [];
  let src = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  src += '\n;' + names.map((n) => `try { globalThis.${n} = ${n}; } catch (e) {}`).join('\n');
  vm.runInContext(src, ctx, { filename: files.join('+') });
  return ctx;
}

const CORE = ['src/core/config.js', 'src/core/rng.js', 'src/core/util.js'];
const CORE_EXPORTS = ['CONFIG', 'RNG', 'Clock', 'U'];

module.exports = { load, anything, CORE, CORE_EXPORTS, ROOT };
