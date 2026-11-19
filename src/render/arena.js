// ================= ARENA =================
// Isla de piedra flotando en el vacío. Una sola pantalla, circular.
// Cada jefe cambia el tema (color de runas, fuegos, niebla y cielo).

const Arena = {
  build(scene, R) {
    this.scene = scene;
    this.R = R;
    this.time = 0;

    // ---- cielo (degradado radial pintado en canvas) ----
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 512; this.skyCanvas.height = 512;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    scene.background = this.skyTex;
    scene.fog = new THREE.Fog(0x000000, 34, 80);

    // ---- luces ----
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x241a14, 0.62);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.85);
    this.sun.position.set(-10, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -R - 3; sc.right = R + 3; sc.top = R + 3; sc.bottom = -R - 3; sc.near = 5; sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    scene.add(this.sun);
    this.accentLight = new THREE.PointLight(0xffffff, 0.9, 40, 1.6);
    this.accentLight.position.set(0, 7, 0);
    scene.add(this.accentLight);

    // ---- piso con textura procedural de baldosas concéntricas ----
    const tex = new THREE.CanvasTexture(this._floorCanvas());
    tex.anisotropy = 4;
    this.floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.0, color: 0xffffff });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 0.7, 96), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // costado de la isla y la roca de abajo
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x3b3a40 });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.7, R - 0.5, 2.2, 64, 1, true), sideMat);
    side.position.y = -1.1;
    scene.add(side);
    const under = new THREE.Mesh(new THREE.ConeGeometry(R - 0.5, 11, 24, 3), new THREE.MeshLambertMaterial({ color: 0x242329 }));
    under.position.y = -7.7; under.rotation.x = Math.PI;
    scene.add(under);
    // bordillo
    const curb = new THREE.Mesh(new THREE.TorusGeometry(R + 0.45, 0.32, 8, 96), new THREE.MeshLambertMaterial({ color: 0x6b6a73 }));
    curb.rotation.x = Math.PI / 2; curb.position.y = 0.1;
    curb.receiveShadow = true; curb.castShadow = true;
    scene.add(curb);

    // ---- runas brillantes ----
    this.runeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const runeRing = new THREE.Mesh(new THREE.RingGeometry(R - 0.75, R - 0.55, 128), this.runeMat);
    runeRing.rotation.x = -Math.PI / 2; runeRing.position.y = 0.02;
    scene.add(runeRing);
    const runeInner = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 96), this.runeMat);
    runeInner.rotation.x = -Math.PI / 2; runeInner.position.y = 0.02;
    scene.add(runeInner);
    // marcas rúnicas en el anillo
    this.runeMarks = new THREE.Group();
    const markGeo = new THREE.PlaneGeometry(0.22, 0.6); markGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const m = new THREE.Mesh(markGeo, this.runeMat);
      m.position.set(Math.cos(a) * (R - 1.15), 0.021, Math.sin(a) * (R - 1.15));
      m.rotation.y = -a;
      if (i % 3 === 0) m.scale.set(1, 1, 1.6);
      this.runeMarks.add(m);
    }
    scene.add(this.runeMarks);

    // ---- pilares con braseros ----
    this.flames = [];
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x77757e });
    const pillarDark = new THREE.MeshLambertMaterial({ color: 0x45444c });
    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      const x = Math.cos(a) * (R + 1.7), z = Math.sin(a) * (R + 1.7);
      // sin pilares en el frente: taparían el juego y el HUD
      if (z > R * 0.3) continue;
      const h = 3.6 + (i % 2) * 0.8;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, h, 8), pillarMat);
      p.position.set(x, h / 2 - 0.2, z);
      p.castShadow = true;
      scene.add(p);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.6, 0.35, 8), pillarDark);
      cap.position.set(x, h - 0.05, z);
      scene.add(cap);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.4, 0.4, 10), pillarDark);
      bowl.position.set(x, h + 0.3, z);
      scene.add(bowl);
      const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.3, 8), this.flameMat);
      f1.position.set(x, h + 1.05, z);
      const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 8), this.flameMat2);
      f2.position.set(x, h + 0.95, z);
      scene.add(f1); scene.add(f2);
      this.flames.push({ f1, f2, x, z, y: h + 0.6, seed: Math.random() * 10 });
    }

    // ---- rocas flotantes en el vacío ----
    this.rocks = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x3e3c45, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = R + 9 + Math.random() * 18;
      const s = 0.5 + Math.random() * 1.4;
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      r.position.set(Math.cos(a) * d, -6 - Math.random() * 12, Math.sin(a) * d);
      r.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(r);
      this.rocks.push({ m: r, y0: r.position.y, seed: Math.random() * 10, spin: (Math.random() - 0.5) * 0.3 });
    }
    return this;
  },

  _floorCanvas() {
    const S = 1024, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const cx = S / 2;
    // "Forja nocturna": pizarra oscura de bajo contraste para que avisos, cadena y jugadores resalten
    g.fillStyle = '#4c4a4a'; g.fillRect(0, 0, S, S);
    // baldosas en anillos concéntricos
    const ringW = 44;
    for (let r = 0; r < cx; r += ringW) {
      const r2 = r + ringW;
      const n = Math.max(1, Math.floor((Math.PI * 2 * (r + ringW / 2)) / 72));
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a0 = off + i / n * Math.PI * 2, a1 = off + (i + 1) / n * Math.PI * 2;
        const v = 84 + Math.floor(Math.random() * 18);
        const warm = Math.floor(Math.random() * 8);
        g.fillStyle = `rgb(${v + warm},${v + warm - 2},${v - 4})`;
        g.beginPath();
        g.arc(cx, cx, r2 - 2, a0 + 0.006, a1 - 0.006);
        g.arc(cx, cx, Math.max(0, r + 2), a1 - 0.006, a0 + 0.006, true);
        g.closePath(); g.fill();
      }
    }
    // grabado: anillos finos claros cada 2 hileras (ayudan a leer distancias)
    g.strokeStyle = 'rgba(235,228,214,0.10)'; g.lineWidth = 2;
    for (let r = ringW * 2; r < cx; r += ringW * 2) { g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke(); }
    // círculo central (sello de la cadena)
    g.strokeStyle = 'rgba(20,18,18,0.6)'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cx, 128, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * 80, cx + Math.sin(a) * 80, 34, 18, a, 0, Math.PI * 2);
      g.stroke();
    }
    // grietas y manchas
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(30,28,26,${0.15 + Math.random() * 0.25})`;
      g.lineWidth = 1 + Math.random() * 1.5;
      let x = Math.random() * S, y = Math.random() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 4000; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    // oscurecer hacia el borde
    const grd = g.createRadialGradient(cx, cx, cx * 0.55, cx, cx, cx);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    return c;
  },

  setTheme(theme) {
    this.theme = theme;
    const acc = new THREE.Color(theme.accent);
    this.runeMat.color.copy(acc);
    this.flameMat.color.copy(acc);
    this.flameMat2.color.copy(acc).lerp(new THREE.Color(0xffffff), 0.55);
    this.floorMat.color.setHex(theme.floor);
    this.accentLight.color.copy(acc);
    this.sun.color.setHex(theme.sun);
    this.scene.fog.color.setHex(theme.fog);
    // cielo
    const g = this.skyCanvas.getContext('2d');
    const grd = g.createRadialGradient(256, 190, 20, 256, 256, 380);
    grd.addColorStop(0, theme.sky1); grd.addColorStop(1, theme.sky2);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1, 1);
    }
    this.skyTex.needsUpdate = true;
  },

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.runeMat.opacity = 0.38 + Math.sin(t * 1.6) * 0.12;
    this.runeMarks.rotation.y = t * 0.03;
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 9 + f.seed) * 0.12 + Math.sin(t * 23 + f.seed * 2) * 0.06;
      f.f1.scale.set(1, k, 1); f.f2.scale.set(1, k * 1.1, 1);
      // brasas
      if (Math.random() < dt * 3) {
        VFX.parts.emit(f.x + (Math.random() - 0.5) * 0.5, f.y + 0.6, f.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 1.2, 0.18, this.theme ? this.theme.accent : 0xffaa55, { gravity: 0.5, drag: 0.5 });
      }
    }
    for (const r of this.rocks) {
      r.m.position.y = r.y0 + Math.sin(t * 0.5 + r.seed) * 0.6;
      r.m.rotation.y += r.spin * dt;
    }
    // motas flotando sobre la arena
    if (Math.random() < dt * 6) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * this.R;
      VFX.parts.emit(Math.cos(a) * d, 0.2, Math.sin(a) * d, 0, 0.4 + Math.random() * 0.4, 0, 3, 0.1,
        this.theme ? this.theme.accent : 0xffffff, { gravity: 0.05, drag: 0.1, alpha: 0.5 });
    }
    this.accentLight.intensity = 0.8 + Math.sin(t * 2.3) * 0.08;
  },
};
