// ================= MODELOS =================
// Todo con primitivas (sin archivos). El frente de cada modelo es +Z.
// Regla heredada del Skillshot Trainer: modelo = hitbox. El ancho del modelo
// coincide con el radio de colisión, y cada personaje se reconoce por su SILUETA.

const Models = {
  _lam: new Map(),
  lam(hex) {
    if (!this._lam.has(hex)) this._lam.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return this._lam.get(hex);
  },
  glowMat(hex, op) {
    return new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: op === undefined ? 1 : op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
  },
  // Contorno de tinta (casco invertido): la firma visual del remake. Se crea UNA vez
  // por modelo al construirlo; el material es compartido y comparte geometría.
  outline(root, k) {
    if (!this._lam.has('ink')) this._lam.set('ink', new THREE.MeshBasicMaterial({ color: 0x07060a, side: THREE.BackSide }));
    const ink = this._lam.get('ink');
    const list = [];
    root.traverse((o) => { if (o.isMesh && !o.material.transparent && o.material.side !== THREE.BackSide) list.push(o); });
    for (const m of list) {
      const hull = new THREE.Mesh(m.geometry, ink);
      hull.scale.setScalar(k || 1.08);
      hull.castShadow = false;
      hull.userData.cs = false;
      m.add(hull);
    }
    return root;
  },

  add(parent, geo, mat, x, y, z, rx, ry, rz, noShadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (!noShadow && !(mat.blending === THREE.AdditiveBlending)) m.castShadow = true;
    parent.add(m);
    return m;
  },

  // ---------------------------------------------------------
  // JUGADORES — variante 0: LAZO (capucha + bufanda), 1: BRASA (casco con cuernos + coleta)
  // ---------------------------------------------------------
  player(color, variant) {
    const A = this.add.bind(this);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const main = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: U.shade(color, 0.42) });
    const cloth = this.lam(variant === 0 ? 0x23304a : 0x3a2222);
    const skin = this.lam(0xf1c7a1);
    const metal = this.lam(0xc8d2e0);
    const glow = this.glowMat(color, 0.95);
    const mats = [main, dark];

    // piernas (pivote en la cadera)
    const legs = [];
    [-1, 1].forEach((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.15, 0.56, 0);
      body.add(hip);
      A(hip, new THREE.CylinderGeometry(0.1, 0.12, 0.46, 7), cloth, 0, -0.23, 0);
      A(hip, new THREE.BoxGeometry(0.19, 0.12, 0.3), dark, 0, -0.5, 0.04);
      legs.push(hip);
    });
    // torso
    A(body, new THREE.CylinderGeometry(0.34, 0.25, 0.58, 10), main, 0, 0.86, 0);
    A(body, new THREE.TorusGeometry(0.27, 0.05, 6, 14), dark, 0, 0.6, 0, Math.PI / 2);
    A(body, new THREE.BoxGeometry(0.42, 0.2, 0.06), dark, 0, 0.92, 0.29);
    // cabeza
    const head = new THREE.Group();
    head.position.set(0, 1.36, 0);
    body.add(head);
    A(head, new THREE.SphereGeometry(0.27, 14, 10), skin, 0, 0, 0);
    [-1, 1].forEach((s) => A(head, new THREE.SphereGeometry(0.045, 6, 5), this.lam(0x1a1a24), s * 0.1, 0.02, 0.24, 0, 0, 0, true));

    if (variant === 0) {
      // LAZO: capucha cónica + bufanda larga al viento
      A(head, new THREE.SphereGeometry(0.31, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), main, 0, 0.03, -0.03);
      A(head, new THREE.ConeGeometry(0.2, 0.42, 10), main, 0, 0.12, -0.3, -1.1);
      A(body, new THREE.TorusGeometry(0.22, 0.08, 6, 14), dark, 0, 1.13, 0, Math.PI / 2);
      const scarf = new THREE.Group();
      scarf.position.set(0.1, 1.12, -0.18);
      body.add(scarf);
      A(scarf, new THREE.BoxGeometry(0.16, 0.05, 0.6), dark, 0, 0, -0.3);
      A(scarf, new THREE.BoxGeometry(0.14, 0.05, 0.36), main, 0.03, -0.02, -0.72, 0, 0.15);
      root.userData.scarf = scarf;
    } else {
      // BRASA: casco con cuernos + coleta alta
      A(head, new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), metal, 0, 0.02, 0);
      A(head, new THREE.BoxGeometry(0.5, 0.06, 0.08), main, 0, 0.1, 0.24);
      [-1, 1].forEach((s) => {
        A(head, new THREE.ConeGeometry(0.07, 0.36, 7), main, s * 0.26, 0.24, 0.02, 0, 0, -s * 0.55);
      });
      const tail = new THREE.Group();
      tail.position.set(0, 0.22, -0.2);
      head.add(tail);
      A(tail, new THREE.SphereGeometry(0.09, 8, 6), dark, 0, 0, 0);
      A(tail, new THREE.ConeGeometry(0.1, 0.55, 8), dark, 0, -0.1, -0.24, -2.2);
      root.userData.scarf = tail;
      // hombreras
      [-1, 1].forEach((s) => A(body, new THREE.SphereGeometry(0.14, 8, 6), metal, s * 0.33, 1.08, 0));
    }

    // brazos (pivote en el hombro) con grillete brillante: ahí se engancha la cadena
    const arms = [];
    [-1, 1].forEach((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.36, 1.06, 0);
      body.add(sh);
      A(sh, new THREE.CylinderGeometry(0.075, 0.09, 0.42, 7), main, 0, -0.21, 0, 0, 0, s * 0.12);
      A(sh, new THREE.SphereGeometry(0.085, 7, 6), skin, s * 0.03, -0.45, 0);
      A(sh, new THREE.TorusGeometry(0.1, 0.035, 6, 12), glow, s * 0.025, -0.36, 0, Math.PI / 2);
      arms.push(sh);
    });

    // aura del piso
    root.scale.setScalar(1.0);
    return { root, body, legs, arms, head, mats, glow };
  },

  // ---------------------------------------------------------
  // JEFE 1 — TORO DE BRONCE (golem cuadrúpedo, cuernos de marfil, núcleo ardiente)
  // ---------------------------------------------------------
  toro() {
    const A = this.add.bind(this);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const bronze = new THREE.MeshLambertMaterial({ color: 0xb06a32, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x4f2d17, flatShading: true });
    const horn = new THREE.MeshLambertMaterial({ color: 0xece2c8 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xe0b04a });
    const fire = this.glowMat(0xff8a2a, 0.95);
    const mats = [bronze, dark, horn, gold];

    A(body, new THREE.SphereGeometry(1, 9, 7), bronze, 0, 1.45, -0.2).scale.set(1.2, 0.95, 1.45);
    A(body, new THREE.SphereGeometry(1, 8, 6), dark, 0, 2.05, 0.35).scale.set(1.05, 0.85, 0.85); // joroba
    // placas del lomo
    for (let i = 0; i < 4; i++) {
      A(body, new THREE.ConeGeometry(0.22, 0.55, 5), dark, 0, 2.75 - i * 0.18, 0.6 - i * 0.55, -0.4);
    }
    // grietas ardientes
    [-1, 1].forEach((s) => {
      A(body, new THREE.BoxGeometry(0.05, 0.5, 0.9), fire, s * 1.18, 1.5, -0.2, 0.3, 0, 0, true);
      A(body, new THREE.BoxGeometry(0.05, 0.35, 0.5), fire, s * 1.12, 1.35, 0.6, -0.4, 0, 0, true);
    });
    // cabeza
    const head = new THREE.Group();
    head.position.set(0, 1.75, 1.45);
    body.add(head);
    A(head, new THREE.BoxGeometry(1.05, 0.95, 0.95), bronze, 0, 0, 0);
    A(head, new THREE.BoxGeometry(0.8, 0.55, 0.45), dark, 0, -0.25, 0.55);
    A(head, new THREE.TorusGeometry(0.17, 0.05, 6, 14), gold, 0, -0.52, 0.8, 0.3);
    [-1, 1].forEach((s) => {
      A(head, new THREE.SphereGeometry(0.11, 8, 6), fire, s * 0.3, 0.15, 0.48, 0, 0, 0, true);
      // cuerno en dos piezas curvándose hacia adelante
      A(head, new THREE.CylinderGeometry(0.15, 0.22, 0.85, 8), horn, s * 0.82, 0.3, 0.05, 0, 0, -s * 1.3);
      A(head, new THREE.ConeGeometry(0.15, 0.95, 8), horn, s * 1.28, 0.72, 0.3, 0.6, 0, -s * 0.45);
      A(head, new THREE.BoxGeometry(0.22, 0.32, 0.08), dark, s * 0.56, 0.05, -0.2, 0, 0, s * 0.4); // orejas
    });
    // patas
    const legs = [];
    [[-0.72, 0.85], [0.72, 0.85], [-0.72, -1.1], [0.72, -1.1]].forEach(([x, z]) => {
      const hip = new THREE.Group();
      hip.position.set(x, 1.15, z);
      body.add(hip);
      A(hip, new THREE.CylinderGeometry(0.3, 0.24, 0.95, 8), dark, 0, -0.45, 0);
      A(hip, new THREE.CylinderGeometry(0.3, 0.32, 0.22, 8), gold, 0, -1.02, 0);
      legs.push(hip);
    });
    // núcleo en el pecho
    const core = A(body, new THREE.SphereGeometry(0.28, 12, 10), fire, 0, 1.2, 1.1, 0, 0, 0, true);
    // cola
    A(body, new THREE.CylinderGeometry(0.05, 0.07, 0.9, 6), dark, 0, 1.7, -1.75, 0.6);

    return {
      root, body, mats, legs, head, core,
      anim(b, dt, t) {
        const breathe = Math.sin(t * 2.2) * 0.03;
        body.scale.y = 1 + breathe;
        core.scale.setScalar(1 + Math.sin(t * 6) * 0.15 + (b.anim === 'windup' ? 0.5 : 0));
        let headX = 0, lean = 0, gallop = 0;
        if (b.anim === 'windup') { headX = 0.35; lean = 0.08; }
        if (b.anim === 'charge') { headX = 0.4; lean = 0.18; gallop = 1; }
        if (b.anim === 'stun') { headX = -0.2; body.rotation.z = Math.sin(t * 9) * 0.08; } else body.rotation.z = U.damp(body.rotation.z, 0, 8, dt);
        if (b.anim === 'dormant') { body.position.y = U.damp(body.position.y, -0.55, 3, dt); headX = 0.5; } else body.position.y = U.damp(body.position.y, 0, 6, dt);
        head.rotation.x = U.damp(head.rotation.x, headX, 10, dt);
        body.rotation.x = U.damp(body.rotation.x, lean, 8, dt);
        const walk = gallop ? t * 14 : t * 6;
        const amp = gallop ? 0.7 : (b.moving ? 0.35 : 0);
        legs.forEach((l, i) => { l.rotation.x = Math.sin(walk + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * amp; });
      },
    };
  },

  // ---------------------------------------------------------
  // JEFE 2 — SAPO SÍSMICO (enorme, cristales morados en el lomo)
  // ---------------------------------------------------------
  sapo() {
    const A = this.add.bind(this);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const skinM = new THREE.MeshLambertMaterial({ color: 0x5f7d4c });
    const darkM = new THREE.MeshLambertMaterial({ color: 0x34452b });
    const belly = new THREE.MeshLambertMaterial({ color: 0xc8bf86 });
    const crystal = new THREE.MeshLambertMaterial({ color: 0x9a5cff, emissive: 0x3a1066 });
    const eyeY = this.glowMat(0xffe94a, 1);
    const mats = [skinM, darkM, belly, crystal];

    const torso = A(body, new THREE.SphereGeometry(1, 20, 14), skinM, 0, 1.15, 0);
    torso.scale.set(1.75, 1.05, 1.55);
    const bellyM = A(body, new THREE.SphereGeometry(1, 18, 12), belly, 0, 0.9, 0.45);
    bellyM.scale.set(1.35, 0.78, 1.15);
    // boca
    A(body, new THREE.TorusGeometry(1.25, 0.06, 6, 30, Math.PI), darkM, 0, 1.18, 0.3, Math.PI / 2 + 0.25, 0, 0);
    // ojos saltones
    const eyes = [];
    [-1, 1].forEach((s) => {
      A(body, new THREE.SphereGeometry(0.46, 14, 10), skinM, s * 0.78, 1.95, 0.75);
      A(body, new THREE.SphereGeometry(0.36, 12, 10), this.lam(0xf4f0d8), s * 0.8, 2.02, 0.95);
      eyes.push(A(body, new THREE.SphereGeometry(0.17, 10, 8), eyeY, s * 0.82, 2.04, 1.26, 0, 0, 0, true));
    });
    // verrugas
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, h = 0.6 + Math.random() * 0.9;
      A(body, new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 6, 5), darkM, Math.cos(a) * 1.55, h, Math.sin(a) * 1.3 - 0.2);
    }
    // cristales en el lomo
    const crystals = [];
    [[0, 2.1, -0.5, 0.42], [-0.65, 1.9, -0.25, 0.3], [0.7, 1.85, -0.35, 0.33], [-0.3, 1.75, -1.05, 0.26], [0.35, 1.7, -1.15, 0.28]].forEach(([x, y, z, s]) => {
      const c = A(body, new THREE.OctahedronGeometry(s, 0), crystal, x, y, z, Math.random(), Math.random(), 0.3);
      c.scale.y = 1.9;
      crystals.push(c);
    });
    // patas traseras (ancas) y delanteras
    const haunches = [];
    [-1, 1].forEach((s) => {
      const h = new THREE.Group();
      h.position.set(s * 1.35, 0.75, -0.55);
      body.add(h);
      A(h, new THREE.SphereGeometry(0.75, 12, 10), skinM, 0, 0, 0).scale.set(0.8, 1, 1.2);
      A(h, new THREE.SphereGeometry(0.5, 10, 8), darkM, s * 0.15, -0.6, 0.55).scale.set(1.1, 0.35, 1.5);
      haunches.push(h);
      A(body, new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8), skinM, s * 1.05, 0.45, 1.1, 0.3, 0, s * 0.3);
      A(body, new THREE.SphereGeometry(0.35, 10, 8), darkM, s * 1.2, 0.08, 1.35).scale.set(1.2, 0.3, 1.2);
    });

    return {
      root, body, mats, crystals, eyes,
      anim(b, dt, t) {
        bellyM.scale.y = 0.78 + Math.sin(t * 3.2) * 0.05;
        crystals.forEach((c, i) => { c.rotation.y += dt * (0.4 + i * 0.1); });
        crystal.emissive.setHex(b.phase > 0 ? 0x7a22d0 : 0x3a1066);
        let sy = 1, sxz = 1;
        if (b.anim === 'crouch') { sy = 0.72; sxz = 1.15; }
        else if (b.anim === 'air') { sy = 1.25; sxz = 0.88; }
        else if (b.anim === 'land') { sy = 0.8; sxz = 1.18; }
        if (b.anim === 'dormant') { sy = 0.85; sxz = 1.05; }
        body.scale.y = U.damp(body.scale.y, sy, 14, dt);
        body.scale.x = body.scale.z = U.damp(body.scale.x, sxz, 14, dt);
        const hop = b.moving ? Math.abs(Math.sin(t * 5)) * 0.25 : 0;
        body.position.y = U.damp(body.position.y, hop, 12, dt);
        eyes.forEach((e) => e.scale.setScalar(b.anim === 'dormant' ? 0.2 : 1));
        body.rotation.x = U.damp(body.rotation.x, b.anim === 'swipe' ? 0.25 : 0, 10, dt);
      },
    };
  },

  // ---------------------------------------------------------
  // JEFE 3 — CENTINELA DE LA TORMENTA (núcleo flotante, anillos, placas orbitando)
  // ---------------------------------------------------------
  centinela() {
    const A = this.add.bind(this);
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.position.y = 2.1;
    root.add(body);
    const steel = new THREE.MeshLambertMaterial({ color: 0x2c3654, flatShading: true });
    const plateM = new THREE.MeshLambertMaterial({ color: 0x9db1d0 });
    const trim = new THREE.MeshLambertMaterial({ color: 0x55d8ff, emissive: 0x0e4a66 });
    const coreGlow = this.glowMat(0x7fe8ff, 0.85);
    const ringA = this.glowMat(0x55d8ff, 0.9);
    const ringB = this.glowMat(0xffe14a, 0.75);
    const mats = [steel, plateM, trim];

    A(body, new THREE.IcosahedronGeometry(0.8, 0), steel, 0, 0, 0);
    const inner = A(body, new THREE.SphereGeometry(0.62, 16, 12), coreGlow, 0, 0, 0, 0, 0, 0, true);
    const eye = A(body, new THREE.SphereGeometry(0.2, 12, 10), this.glowMat(0xffffff, 1), 0, 0.05, 0.72, 0, 0, 0, true);
    A(body, new THREE.ConeGeometry(0.35, 0.9, 6), steel, 0, 1.0, 0);
    A(body, new THREE.ConeGeometry(0.3, 0.7, 6), steel, 0, -0.95, 0, Math.PI);

    const plates = new THREE.Group();
    body.add(plates);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.rotation.y = i * Math.PI / 2 + Math.PI / 4;
      plates.add(g);
      const p = A(g, new THREE.BoxGeometry(0.85, 1.25, 0.16), plateM, 0, 0, 1.15);
      A(p, new THREE.BoxGeometry(0.12, 0.9, 0.05), trim, 0, 0, 0.09);
      g.userData.plate = p;
    }
    const r1 = A(body, new THREE.TorusGeometry(1.5, 0.05, 6, 48), ringA, 0, 0, 0, Math.PI / 2, 0, 0, true);
    const r2 = A(body, new THREE.TorusGeometry(1.75, 0.035, 6, 48), ringB, 0, 0, 0, 1.1, 0.4, 0, true);
    const shards = new THREE.Group();
    body.add(shards);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      A(shards, new THREE.OctahedronGeometry(0.2, 0), trim, Math.cos(a) * 2.05, Math.sin(i * 1.7) * 0.4, Math.sin(a) * 2.05).scale.y = 1.8;
    }
    // reflejo en el piso (marca su posición aunque flote)
    const floorGlow = A(root, new THREE.CircleGeometry(1.7, 40), this.glowMat(0x55d8ff, 0.18), 0, 0.05, 0, -Math.PI / 2, 0, 0, true);

    return {
      root, body, mats, inner, eye, plates, r1, r2,
      anim(b, dt, t) {
        const charging = b.anim === 'charge_e';
        const channel = b.anim === 'channel';
        body.position.y = (b.anim === 'dormant' ? 1.0 : 2.1) + Math.sin(t * 1.8) * 0.15;
        const sp = charging ? 6 : channel ? 2.5 : 1;
        plates.rotation.y += dt * 0.6 * sp;
        shards.rotation.y -= dt * 0.9 * sp;
        r1.rotation.z += dt * 1.4 * sp;
        r2.rotation.y += dt * 1.1 * sp;
        const spread = channel ? 1.6 : charging ? 1.25 : b.anim === 'stun' ? 1.9 : 1.15;
        plates.children.forEach((g) => { g.userData.plate.position.z = U.damp(g.userData.plate.position.z, spread, 6, dt); });
        ringB.opacity = charging ? 0.6 + Math.random() * 0.4 : 0.55;
        coreGlow.color.setHex(charging ? 0xfff07a : b.anim === 'stun' ? 0xffffff : 0x7fe8ff);
        inner.scale.setScalar(1 + Math.sin(t * 7) * 0.08 + (charging ? 0.2 : 0));
        floorGlow.material.opacity = 0.14 + Math.sin(t * 3) * 0.04;
        eye.scale.setScalar(b.anim === 'dormant' ? 0.15 : 1);
        body.rotation.z = b.anim === 'stun' ? Math.sin(t * 8) * 0.2 : U.damp(body.rotation.z, 0, 6, dt);
      },
    };
  },
};
