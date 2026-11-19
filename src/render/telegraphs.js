// ================= TELEGRAFÍAS =================
// Avisos en el suelo antes de cada golpe. Lectura universal:
//   relleno tenue + borde brillante que pulsa + relleno de progreso que crece
//   hasta el borde justo cuando el golpe cae.
// Rojo = peligro, azul = refugio, amarillo = eléctrico, dorado = ancla.

class Telegraphs {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    const disc = new THREE.CircleGeometry(1, 56); disc.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.93, 1, 64); ring.rotateX(-Math.PI / 2);
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2); plane.translate(0, 0, 0.5);
    this.geo = { disc, ring, plane };
    this._y = 0.035;
  }

  _mat(color, opacity, additive) {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }

  _make(kind, o) {
    const group = new THREE.Group();
    group.position.y = this._y + (o.layer || 0) * 0.004;
    this.scene.add(group);
    const h = {
      kind, group, t: 0, dur: o.dur || 1, owner: o.owner || null, alive: true,
      color: o.color !== undefined ? o.color : CONFIG.colors.danger,
      sync: o.sync !== false,
      mats: [], fill: null, prog: null, edges: [], fadeOut: 0, persist: !!o.persist,
      remove: () => this.remove(h),
    };
    this.list.push(h);
    return h;
  }

  _add(h, geo, mat, renderOrder) {
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = renderOrder || 2;
    h.group.add(m);
    h.mats.push(mat);
    return m;
  }

  // círculo de peligro (o de cualquier color)
  circle(x, z, r, o = {}) {
    const h = this._make('circle', o);
    h.group.position.x = x; h.group.position.z = z;
    h.fill = this._add(h, this.geo.disc, this._mat(h.color, 0.14), 2);
    h.prog = this._add(h, this.geo.disc, this._mat(h.color, 0.24), 3);
    const e = this._add(h, this.geo.ring, this._mat(h.color, 0.95), 4);
    h.edges.push(e);
    h.r = r;
    h.fill.scale.setScalar(r); e.scale.setScalar(r); h.prog.scale.setScalar(0.001);
    h.set = (nx, nz, nr) => { h.group.position.x = nx; h.group.position.z = nz; if (nr) { h.r = nr; h.fill.scale.setScalar(nr); e.scale.setScalar(nr); } };
    h.progFn = (k) => h.prog.scale.setScalar(Math.max(0.001, h.r * k));
    return h;
  }

  // rectángulo desde (x,z) hacia el ángulo 'ang' (yaw), largo 'len', ancho 'w'
  rect(x, z, ang, len, w, o = {}) {
    const h = this._make('rect', o);
    h.group.position.x = x; h.group.position.z = z; h.group.rotation.y = ang;
    h.fill = this._add(h, this.geo.plane, this._mat(h.color, 0.14), 2);
    h.prog = this._add(h, this.geo.plane, this._mat(h.color, 0.24), 3);
    const th = 0.12;
    const sideL = this._add(h, this.geo.plane, this._mat(h.color, 0.95), 4);
    const sideR = this._add(h, this.geo.plane, this._mat(h.color, 0.95), 4);
    const cap = this._add(h, this.geo.plane, this._mat(h.color, 0.95), 4);
    h.edges.push(sideL, sideR, cap);
    // flechas en el piso que indican la dirección
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 0, 0.55], 3));
    arrowGeo.setIndex([0, 1, 2]);
    h.ownGeo = [arrowGeo];
    h.arrows = [];
    for (let i = 0; i < 4; i++) {
      const a = this._add(h, arrowGeo, this._mat(h.color, 0.5, true), 4);
      h.arrows.push(a);
    }
    h.len = len; h.w = w;
    h.set = (nx, nz, nang, nlen) => {
      h.group.position.x = nx; h.group.position.z = nz; h.group.rotation.y = nang;
      if (nlen !== undefined) h.len = nlen;
      h.fill.scale.set(h.w, 1, h.len);
      sideL.scale.set(th, 1, h.len); sideL.position.x = -h.w / 2 + th / 2;
      sideR.scale.set(th, 1, h.len); sideR.position.x = h.w / 2 - th / 2;
      cap.scale.set(h.w, 1, th); cap.position.z = h.len - th;
    };
    h.set(x, z, ang, len);
    h.progFn = (k) => h.prog.scale.set(h.w, 1, Math.max(0.001, h.len * k));
    h.animFn = (time) => {
      for (let i = 0; i < h.arrows.length; i++) {
        const f = ((time * 1.6 + i / h.arrows.length) % 1);
        const a = h.arrows[i];
        a.position.z = f * h.len;
        a.scale.setScalar(h.w * 0.45);
        a.material.opacity = 0.55 * Math.sin(f * Math.PI);
      }
    };
    return h;
  }

  // cono desde (x,z) hacia 'ang', semiapertura 'half', alcance 'range'
  cone(x, z, ang, half, range, o = {}) {
    const h = this._make('cone', o);
    h.group.position.x = x; h.group.position.z = z; h.group.rotation.y = ang;
    const fan = new THREE.CircleGeometry(1, 40, -Math.PI / 2 - half, half * 2); fan.rotateX(-Math.PI / 2);
    const arc = new THREE.RingGeometry(0.94, 1, 40, 1, -Math.PI / 2 - half, half * 2); arc.rotateX(-Math.PI / 2);
    h.ownGeo = [fan, arc];
    h.fill = this._add(h, fan, this._mat(h.color, 0.14), 2);
    h.prog = this._add(h, fan, this._mat(h.color, 0.26), 3);
    const e = this._add(h, arc, this._mat(h.color, 0.95), 4);
    h.edges.push(e);
    // lados
    [-1, 1].forEach((s) => {
      const side = this._add(h, this.geo.plane, this._mat(h.color, 0.95), 4);
      side.scale.set(0.06, 1, 1); side.rotation.y = s * half;
      h.edges.push(side);
    });
    h.range = range;
    h.group.scale.setScalar(range);
    h.set = (nx, nz, nang) => { h.group.position.x = nx; h.group.position.z = nz; h.group.rotation.y = nang; };
    h.progFn = (k) => h.prog.scale.setScalar(Math.max(0.001, k));
    return h;
  }

  // terremoto: toda la arena en rojo salvo un círculo azul
  safeZone(sx, sz, safeR, arenaR, o = {}) {
    const h = this._make('safe', o);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, arenaR, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(sx, -sz, safeR + 0.08, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ShapeGeometry(shape, 64);
    geo.rotateX(-Math.PI / 2);
    h.fill = this._add(h, geo, this._mat(h.color, 0.1), 2);
    h.ownGeo = [geo];
    const safeCol = CONFIG.colors.safe;
    const sfill = this._add(h, this.geo.disc, this._mat(safeCol, 0.22), 3);
    sfill.position.set(sx, 0, sz); sfill.scale.setScalar(safeR);
    const sring = this._add(h, this.geo.ring, this._mat(safeCol, 1), 4);
    sring.position.set(sx, 0, sz); sring.scale.setScalar(safeR);
    h.edges.push(sring);
    // anillo rojo que se cierra desde el borde de la arena hacia el refugio
    const closing = this._add(h, this.geo.ring, this._mat(h.color, 0.9), 4);
    h.progFn = (k) => {
      const rr = U.lerp(arenaR, safeR + 0.6, U.easeInOut(k));
      closing.position.set(U.lerp(0, sx, k), 0, U.lerp(0, sz, k));
      closing.scale.setScalar(rr);
      h.fill.material.opacity = 0.08 + 0.18 * k;
    };
    return h;
  }

  remove(h) {
    if (!h || !h.alive) return;
    h.alive = false;
    h.fadeOut = 0.12;
  }

  clearOwner(owner) { for (const h of this.list) if (h.owner === owner) this.remove(h); }
  clearAll() { for (const h of this.list) this._dispose(h); this.list.length = 0; }

  _dispose(h) {
    this.scene.remove(h.group);
    for (const m of h.mats) m.dispose();
    if (h.ownGeo) for (const g of h.ownGeo) g.dispose();
  }

  update(dt, time) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      if (!h.alive) {
        h.fadeOut -= dt;
        const k = Math.max(0, h.fadeOut / 0.12);
        for (const m of h.mats) m.opacity *= k > 0 ? 0.7 : 0;
        if (h.fadeOut <= 0) { this._dispose(h); this.list.splice(i, 1); }
        continue;
      }
      // si el jefe está congelado ("hielo"), su aviso avanza igual de lento que su ataque
      const own = h.owner;
      h.t += dt * (h.sync && own && own.slowT > 0 ? 1 - Game.mods.slow : 1);
      const k = Math.min(1, h.t / h.dur);
      if (h.progFn) h.progFn(k);
      if (h.animFn) h.animFn(time);
      // pulso del borde, más rápido al final
      const pulse = 0.65 + 0.35 * Math.sin(time * (8 + k * 18));
      for (const e of h.edges) e.material.opacity = 0.95 * pulse;
      if (k >= 1 && !h.persist) this.remove(h);
    }
  }
}
