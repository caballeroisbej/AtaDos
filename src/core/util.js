// ================= UTILIDADES =================
// Gameplay en el plano XZ con números sueltos (x, z): cero allocaciones por frame.
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  // azar de gameplay: pasa por RNG (src/core/rng.js) para poder fijar la semilla
  rand: (a, b) => a + RNG.next() * (b - a),
  randi: (a, b) => Math.floor(a + RNG.next() * (b - a + 1)),
  choice: (arr) => arr[Math.floor(RNG.next() * arr.length)],
  len: (x, z) => Math.sqrt(x * x + z * z),
  dist: (a, b) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)),
  // ángulo de rotación Y para mirar hacia (dx, dz) — el frente de los modelos es +Z
  yaw: (dx, dz) => Math.atan2(dx, dz),
  // suavizado independiente del framerate
  damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
  angDiff: (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  dampAngle: (a, b, lambda, dt) => a + U.angDiff(a, b) * (1 - Math.exp(-lambda * dt)),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInCubic: (t) => t * t * t,
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(RNG.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  },

  // punto más cercano de un segmento AB a P. Devuelve un objeto compartido (no guardar).
  _sc: { t: 0, x: 0, z: 0, d: 0 },
  segClosest(ax, az, bx, bz, px, pz) {
    const abx = bx - ax, abz = bz - az;
    const l2 = abx * abx + abz * abz;
    let t = l2 > 1e-8 ? ((px - ax) * abx + (pz - az) * abz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const x = ax + abx * t, z = az + abz * t;
    const r = U._sc;
    r.t = t; r.x = x; r.z = z;
    r.d = Math.sqrt((px - x) * (px - x) + (pz - z) * (pz - z));
    return r;
  },

  // mantiene un punto dentro de un círculo de radio R centrado en el origen
  clampToArena(o, R) {
    const d = Math.sqrt(o.x * o.x + o.z * o.z);
    if (d > R) { o.x *= R / d; o.z *= R / d; return true; }
    return false;
  },

  shade(hex, k) {
    const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
    const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
    const b = Math.min(255, Math.round((hex & 255) * k));
    return (r << 16) | (g << 8) | b;
  },

  fmtTime(s) {
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + (r < 10 ? '0' : '') + r;
  },

  // espera dentro de un ataque (generador): yield* U.wait(0.5)
  *wait(t) {
    let e = 0;
    while (e < t) e += yield;
  },
};
