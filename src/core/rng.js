// ================= AZAR Y RELOJ CONTROLABLES =================
// El gameplay pide azar a RNG (no a Math.random) y la hora de menú a Clock:
// así las pruebas pueden fijar la semilla y el tiempo.
//  - index.html?seed=123 fija la semilla de una partida (útil para reproducir bugs).
//  - En pruebas: RNG.seed(n); Clock.set(ms) / Clock.advance(ms).
// Los efectos puramente visuales (partículas) siguen usando Math.random.

const RNG = {
  _s: 0,
  _seeded: false,
  seed(n) {
    this._s = (n >>> 0) || 1;
    this._seeded = true;
  },
  // mulberry32: rápido, 32 bits, suficiente para gameplay
  next() {
    if (!this._seeded) return Math.random();
    let t = (this._s = (this._s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  unseed() { this._seeded = false; },
};

const Clock = {
  _fixed: null,
  now() { return this._fixed !== null ? this._fixed : (typeof performance !== 'undefined' ? performance.now() : Date.now()); },
  set(ms) { this._fixed = ms; },
  advance(ms) { this._fixed = (this._fixed === null ? 0 : this._fixed) + ms; },
  real() { this._fixed = null; },
};
