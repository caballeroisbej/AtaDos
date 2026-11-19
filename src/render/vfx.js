// ================= VFX =================
// Infraestructura visual con pools pre-asignados (nada se crea por frame):
// - partículas con tamaño y alfa por partícula (un solo draw call)
// - anillos expansivos, destellos (glow), estelas tipo cinta
// - temblor de cámara, números de daño (DOM), destello de pantalla
// Inspirado en el framework VFX del Skillshot Trainer.

class ParticleSystem {
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max);      // tamaño base
    this.alpha = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.shrink = new Float32Array(max);
    this.next = 0;
    this.alive = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute float psize; attribute vec4 pcolor; varying vec4 vColor; uniform float uScale;
        void main() {
          vColor = pcolor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d);
          float core = smoothstep(0.22, 0.0, d);
          gl_FragColor = vec4(vColor.rgb + core * 0.6, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  emit(x, y, z, vx, vy, vz, life, size, color, o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.base[i] = size; this.size[i] = size;
    const c = this._c.set(color);
    this.col[i4] = c.r; this.col[i4 + 1] = c.g; this.col[i4 + 2] = c.b;
    this.alpha[i] = o && o.alpha !== undefined ? o.alpha : 1;
    this.col[i4 + 3] = this.alpha[i];
    this.grav[i] = o && o.gravity !== undefined ? o.gravity : -6;
    this.drag[i] = o && o.drag !== undefined ? o.drag : 2;
    this.shrink[i] = o && o.shrink !== undefined ? o.shrink : 1;
  }

  update(dt) {
    const P = this.pos, V = this.vel, L = this.life;
    for (let i = 0; i < this.max; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt;
      const i3 = i * 3;
      if (L[i] <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 2] *= dr;
      V[i3 + 1] = V[i3 + 1] * dr + this.grav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      if (P[i3 + 1] < 0.03) { P[i3 + 1] = 0.03; V[i3 + 1] *= -0.3; }
      const k = L[i] / this.maxLife[i];
      this.size[i] = this.base[i] * (1 - this.shrink[i] + this.shrink[i] * k);
      this.col[i * 4 + 3] = this.alpha[i] * Math.min(1, k * 1.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.pcolor.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.size.fill(0); }
}

const VFX = {
  scene: null, camera: null,
  shakeAmp: 0, shakeT: 0, shakeDur: 0, offX: 0, offY: 0, offZ: 0,
  punchT: 0, punchDur: 0, punchAmt: 0, zoomOff: 0,
  flashA: 0, flashColor: '#fff',
  _rings: [], _glows: [], _trails: [], _nums: [],

  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.parts = new ParticleSystem(scene, 3500);

    // anillos expansivos planos
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.visible = false; m.renderOrder = 6;
      scene.add(m);
      this._rings.push({ m, t: 0, dur: 1, from: 1, to: 2, op: 1, alive: false });
    }
    // destellos esféricos
    const sph = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false; m.renderOrder = 7;
      scene.add(m);
      this._glows.push({ m, t: 0, dur: 1, base: 1, grow: 2, op: 1, alive: false });
    }
    // estelas (cintas)
    for (let i = 0; i < 6; i++) this._trails.push(new Trail(scene));

    // números de daño (DOM)
    const layer = document.getElementById('numbers');
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('div');
      el.className = 'num';
      el.style.display = 'none';
      layer.appendChild(el);
      this._nums.push({ el, x: 0, y: 0, z: 0, t: 0, dur: 1, alive: false, vx: 0 });
    }
    this._v = new THREE.Vector3();
    this.flashEl = document.getElementById('flash');
  },

  // ---------- partículas ----------
  // burst(x,y,z,{count,speed,up,life,size,color,spread,gravity,drag,colors})
  burst(x, y, z, o = {}) {
    const n = o.count || 12;
    const sp = o.speed !== undefined ? o.speed : 5;
    const up = o.up !== undefined ? o.up : 2;
    const life = o.life || 0.5;
    const size = o.size || 0.35;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.35 + Math.random() * 0.65);
      const col = o.colors ? o.colors[i % o.colors.length] : (o.color !== undefined ? o.color : 0xffffff);
      const dx = o.dirX !== undefined ? o.dirX + Math.cos(a) * (o.spread || 0.4) : Math.cos(a);
      const dz = o.dirZ !== undefined ? o.dirZ + Math.sin(a) * (o.spread || 0.4) : Math.sin(a);
      this.parts.emit(
        x + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0), y, z + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0),
        dx * s, up * (0.4 + Math.random() * 0.8), dz * s,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), col,
        { gravity: o.gravity, drag: o.drag, alpha: o.alpha }
      );
    }
  },

  // ---------- anillo expansivo ----------
  ring(x, z, o = {}) {
    const r = this._rings.find((q) => !q.alive);
    if (!r) return;
    r.alive = true; r.t = 0;
    r.dur = o.dur || 0.45; r.from = o.from !== undefined ? o.from : 0.3; r.to = o.to || 3;
    r.op = o.opacity !== undefined ? o.opacity : 0.9;
    r.m.material.color.set(o.color !== undefined ? o.color : 0xffffff);
    r.m.position.set(x, o.y !== undefined ? o.y : 0.06, z);
    r.m.visible = true;
    r.m.scale.setScalar(r.from);
  },

  glow(x, y, z, o = {}) {
    const g = this._glows.find((q) => !q.alive);
    if (!g) return;
    g.alive = true; g.t = 0;
    g.dur = o.dur || 0.25; g.base = o.size || 0.8; g.grow = o.grow || 2;
    g.op = o.opacity !== undefined ? o.opacity : 0.6;
    g.m.material.color.set(o.color !== undefined ? o.color : 0xffffff);
    g.m.position.set(x, y, z);
    g.m.scale.setScalar(g.base);
    g.m.visible = true;
  },

  impact(x, y, z, o = {}) {
    const c = o.color !== undefined ? o.color : 0xffffff;
    const s = o.size || 1;
    this.glow(x, y, z, { color: c, size: 0.5 * s, grow: 2.4, dur: 0.2, opacity: 0.7 });
    this.burst(x, y, z, { count: o.count || 14, speed: 6 * s, up: 3, life: 0.4, size: 0.3 * Math.sqrt(s), color: c });
    if (o.ring !== false) this.ring(x, z, { color: c, from: 0.2, to: 1.6 * s, dur: 0.35 });
    if (o.shake) this.shake(o.shake, 0.2);
  },

  trail(getPos, o) {
    const t = this._trails.find((q) => !q.active && !q.fading);
    if (!t) return null;
    t.attach(getPos, o);
    return t;
  },

  // ---------- cámara ----------
  shake(amp, dur = 0.25) {
    this.shakeAmp = Math.min(0.9, Math.max(this.shakeAmp * (this.shakeT / (this.shakeDur || 1)), amp));
    this.shakeDur = this.shakeT = Math.max(dur, this.shakeT);
  },
  punch(amt = 1, dur = 0.2) { this.punchAmt = amt; this.punchT = this.punchDur = dur; },
  flash(color, alpha) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, alpha);
    this.flashEl.style.background = color;
  },

  // ---------- números ----------
  number(x, y, z, text, cls, dur) {
    let n = this._nums.find((q) => !q.alive);
    if (!n) { // recicla el más viejo
      n = this._nums.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    }
    n.alive = true; n.t = 0; n.dur = dur || 0.9;
    n.x = x; n.y = y; n.z = z; n.vx = (Math.random() - 0.5) * 0.8;
    n.el.className = 'num ' + (cls || '');
    n.el.textContent = text;
    n.el.style.display = 'block';
  },

  clear() {
    this.parts.clear();
    for (const r of this._rings) { r.alive = false; r.m.visible = false; }
    for (const g of this._glows) { g.alive = false; g.m.visible = false; }
    for (const t of this._trails) t.kill();
    for (const n of this._nums) { n.alive = false; n.el.style.display = 'none'; }
  },

  update(dt, realDt) {
    this.parts.update(dt);
    for (const r of this._rings) {
      if (!r.alive) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      r.m.scale.setScalar(r.from + (r.to - r.from) * U.easeOutCubic(k));
      r.m.material.opacity = r.op * (1 - k);
      if (k >= 1) { r.alive = false; r.m.visible = false; }
    }
    for (const g of this._glows) {
      if (!g.alive) continue;
      g.t += dt;
      const k = Math.min(1, g.t / g.dur);
      g.m.scale.setScalar(g.base * (1 + (g.grow - 1) * U.easeOutCubic(k)));
      g.m.material.opacity = g.op * (1 - k);
      if (k >= 1) { g.alive = false; g.m.visible = false; }
    }
    for (const t of this._trails) t.update(dt);

    // la cámara usa tiempo real (sigue temblando durante el hitstop)
    if (this.shakeT > 0) {
      this.shakeT -= realDt;
      const k = Math.max(0, this.shakeT / this.shakeDur);
      const a = this.shakeAmp * k * k;
      this.offX = (Math.random() * 2 - 1) * a;
      this.offY = (Math.random() * 2 - 1) * a * 0.5;
      this.offZ = (Math.random() * 2 - 1) * a;
      if (this.shakeT <= 0) { this.shakeAmp = 0; this.offX = this.offY = this.offZ = 0; }
    }
    if (this.punchT > 0) {
      this.punchT -= realDt;
      const k = Math.max(0, this.punchT / this.punchDur);
      this.zoomOff = -this.punchAmt * Math.sin(k * Math.PI);
    } else this.zoomOff = 0;

    if (this.flashA > 0) {
      this.flashA = Math.max(0, this.flashA - realDt * 2.8);
      this.flashEl.style.opacity = this.flashA.toFixed(3);
    }
  },

  // posiciona los números en pantalla (después de mover la cámara)
  updateNumbers(dt, w, h) {
    const v = this._v;
    for (const n of this._nums) {
      if (!n.alive) continue;
      n.t += dt;
      const k = n.t / n.dur;
      if (k >= 1) { n.alive = false; n.el.style.display = 'none'; continue; }
      v.set(n.x + n.vx * k, n.y + 1.2 * U.easeOutCubic(k), n.z);
      v.project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
      n.el.style.opacity = k > 0.7 ? ((1 - k) / 0.3).toFixed(3) : '1';
    }
  },
};

// ---------- estela tipo cinta (grosor real, buffer fijo) ----------
class Trail {
  constructor(scene) {
    this.N = 18;
    this.verts = new Float32Array(this.N * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.verts, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s < this.N - 1; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.pts = Array.from({ length: this.N }, () => new THREE.Vector3());
    this.count = 0; this.active = false; this.fading = false; this.fadeT = 0;
  }
  attach(getPos, o = {}) {
    this.getPos = getPos; this.count = 0; this.active = true; this.fading = false;
    this.width = o.width || 0.6; this.op = o.opacity || 0.6; this.fade = o.fade || 0.22;
    this.mesh.material.color.set(o.color !== undefined ? o.color : 0xffffff);
    this.mesh.material.opacity = this.op;
    this.mesh.visible = true;
  }
  release() { if (!this.active) return; this.active = false; this.fading = true; this.fadeT = this.fade; }
  kill() { this.active = false; this.fading = false; this.mesh.visible = false; this.count = 0; }
  update(dt) {
    if (this.active) {
      const p = this.getPos();
      if (this.count < this.N) this.count++;
      for (let i = this.count - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]);
      this.pts[0].set(p.x, p.y, p.z);
    } else if (this.fading) {
      this.fadeT -= dt;
      this.mesh.material.opacity = this.op * Math.max(0, this.fadeT / this.fade);
      if (this.fadeT <= 0) { this.kill(); return; }
    } else return;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], q = this.pts[Math.min(i + 1, n - 1)];
      let dx = q.x - p.x, dz = q.z - p.z;
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const w = this.width * (1 - i / this.N) * 0.5;
      const o = i * 6;
      this.verts[o] = p.x - dz * w; this.verts[o + 1] = p.y; this.verts[o + 2] = p.z + dx * w;
      this.verts[o + 3] = p.x + dz * w; this.verts[o + 4] = p.y; this.verts[o + 5] = p.z - dx * w;
    }
    this.mesh.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}
