// ================= AUDIO =================
// Todo sintetizado con WebAudio: sin archivos, sin licencias de terceros.
// - Efectos por nombre: AudioFX.play('tajo', {mult})
// - Zumbido continuo de la cadena según su velocidad (setChain)
// - Música por pasos con secuenciador (menu / fight / fight2)
const AudioFX = {
  ctx: null, master: null, sfx: null, musicBus: null, noiseBuf: null,
  musicOn: true,
  _last: {},       // anti-spam por efecto
  _chain: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(comp);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.32 : 0; this.musicBus.connect(this.master);
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._initChain();
      if (this._pendingMusic) this.music(this._pendingMusic);
    } catch (e) { this.ctx = null; }
  },

  now() { return this.ctx ? this.ctx.currentTime : 0; },

  tone(freq, dur, o = {}) {
    if (!this.ctx) return;
    const t = (o.at || this.ctx.currentTime) + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    const vol = o.vol !== undefined ? o.vol : 0.2;
    const att = o.attack || 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  },

  noise(dur, o = {}) {
    if (!this.ctx) return;
    const t = (o.at || this.ctx.currentTime) + (o.delay || 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 2000, t);
    if (o.freqTo) f.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    f.Q.value = o.q || 0.8;
    const g = this.ctx.createGain();
    const vol = o.vol !== undefined ? o.vol : 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  // evita que un mismo efecto suene 30 veces en un frame
  _gate(name, gap) {
    const t = performance.now();
    if (this._last[name] && t - this._last[name] < gap * 1000) return false;
    this._last[name] = t;
    return true;
  },

  play(name, o = {}) {
    if (!this.ctx) return;
    const m = o.mult || 1;
    switch (name) {
      case 'ui': this.tone(660, 0.07, { type: 'square', vol: 0.06 }); break;
      case 'select': this.tone(520, 0.09, { type: 'triangle', vol: 0.12, slide: 780 }); this.tone(780, 0.14, { type: 'triangle', vol: 0.1, delay: 0.07, slide: 1040 }); break;
      case 'dash':
        this.noise(0.2, { filter: 'bandpass', freq: 900, freqTo: 3400, vol: 0.2, q: 1.2 });
        this.tone(380, 0.14, { type: 'sine', vol: 0.06, slide: 900 });
        break;
      case 'hit': // contacto continuo de la cadena con el jefe
        if (!this._gate('hit', 0.09)) return;
        this.noise(0.07, { filter: 'bandpass', freq: 2400 + m * 600, vol: 0.06 + 0.05 * Math.min(m, 2), q: 3 });
        this.tone(900 + m * 250, 0.06, { type: 'square', vol: 0.025, lp: 3000 });
        break;
      case 'tajo':
        this.noise(0.28, { filter: 'highpass', freq: 1800, vol: 0.28 });
        this.tone(1250 + m * 120, 0.32, { type: 'sawtooth', vol: 0.09, slide: 520, lp: 5000, lpTo: 900 });
        this.tone(160, 0.22, { type: 'sine', vol: 0.3, slide: 55 });
        this.tone(2400, 0.2, { type: 'triangle', vol: 0.05, delay: 0.03, slide: 3200 });
        break;
      case 'block':
        if (!this._gate('block', 0.04)) return;
        this.tone(1900 + Math.random() * 500, 0.09, { type: 'triangle', vol: 0.09, slide: 1300 });
        this.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.08 });
        break;
      case 'reflect': this.tone(880, 0.16, { type: 'triangle', vol: 0.1, slide: 1760 }); break;
      case 'hurt':
        this.tone(220, 0.35, { type: 'sawtooth', vol: 0.2, slide: 70, lp: 1600 });
        this.noise(0.25, { freq: 900, vol: 0.25 });
        this.tone(90, 0.3, { type: 'sine', vol: 0.3, slide: 40 });
        break;
      case 'yank':
        if (!this._gate('yank', 0.25)) return;
        this.noise(0.12, { filter: 'bandpass', freq: 3200, vol: 0.12, q: 4 });
        this.tone(1400, 0.08, { type: 'square', vol: 0.04, lp: 4000 });
        break;
      case 'alert': { // el jefe elige ataque: un timbre por tipo de amenaza (se aprende de oído)
        if (!this._gate('alert', 0.3)) return;
        const k = o.kind;
        if (k === 'safe') { this.tone(392, 0.16, { type: 'sine', vol: 0.09 }); this.tone(587, 0.22, { type: 'sine', vol: 0.08, delay: 0.12 }); }
        else if (k === 'electric') { this.tone(1320, 0.07, { type: 'square', vol: 0.04, lp: 4000 }); this.tone(1320, 0.07, { type: 'square', vol: 0.04, lp: 4000, delay: 0.09 }); this.tone(1760, 0.1, { type: 'square', vol: 0.035, lp: 4000, delay: 0.18 }); }
        else if (k === 'anchor') { this.tone(523, 0.3, { type: 'triangle', vol: 0.08 }); this.tone(784, 0.35, { type: 'triangle', vol: 0.06, delay: 0.1 }); }
        else if (k === 'projectile' || k === 'pierce') { this.tone(660, 0.08, { type: 'triangle', vol: 0.07 }); this.tone(880, 0.1, { type: 'triangle', vol: 0.06, delay: 0.08 }); }
        else { this.tone(300, 0.14, { type: 'sawtooth', vol: 0.06, lp: 1400 }); this.tone(220, 0.2, { type: 'sawtooth', vol: 0.06, lp: 1200, delay: 0.12 }); }
        break;
      }
      case 'telegraph':
        if (!this._gate('telegraph', 0.12)) return;
        this.tone(740, 0.12, { type: 'square', vol: 0.05, lp: 2200 });
        this.tone(740, 0.12, { type: 'square', vol: 0.04, lp: 2200, delay: 0.14 });
        break;
      case 'roar':
        this.tone(95, 1.1, { type: 'sawtooth', vol: 0.22, slide: 60, lp: 700, attack: 0.08 });
        this.tone(142, 1.0, { type: 'sawtooth', vol: 0.12, slide: 80, lp: 600, attack: 0.1 });
        this.noise(1.0, { freq: 500, freqTo: 200, vol: 0.18, attack: 0.1 });
        break;
      case 'charge':
        this.noise(0.7, { filter: 'bandpass', freq: 300, freqTo: 1200, vol: 0.22 });
        this.tone(70, 0.6, { type: 'sawtooth', vol: 0.12, slide: 110, lp: 500 });
        break;
      case 'crash':
        this.noise(0.6, { freq: 700, freqTo: 120, vol: 0.45 });
        this.tone(70, 0.6, { type: 'sine', vol: 0.45, slide: 30 });
        this.tone(1300, 0.4, { type: 'triangle', vol: 0.06, slide: 900, delay: 0.05 });
        break;
      case 'stun':
        for (let i = 0; i < 3; i++) this.tone(1500 + i * 220, 0.12, { type: 'sine', vol: 0.06, delay: i * 0.08 });
        break;
      case 'shoot':
        if (!this._gate('shoot', 0.06)) return;
        this.tone(520, 0.12, { type: 'triangle', vol: 0.06, slide: 300 });
        break;
      case 'jump':
        this.noise(0.35, { filter: 'bandpass', freq: 400, freqTo: 1500, vol: 0.18 });
        this.tone(160, 0.35, { type: 'sine', vol: 0.15, slide: 420 });
        break;
      case 'land':
        this.noise(0.8, { freq: 600, freqTo: 80, vol: 0.5 });
        this.tone(55, 0.7, { type: 'sine', vol: 0.5, slide: 28 });
        break;
      case 'swipe':
        this.noise(0.22, { filter: 'bandpass', freq: 1200, freqTo: 400, vol: 0.25, q: 1 });
        break;
      case 'wave':
        this.tone(110, 0.6, { type: 'sawtooth', vol: 0.1, slide: 55, lp: 800 });
        this.noise(0.5, { freq: 400, vol: 0.2 });
        break;
      case 'charge_e': // carga eléctrica
        this.tone(220, 1.0, { type: 'sawtooth', vol: 0.06, slide: 880, lp: 2400, attack: 0.2 });
        this.noise(0.9, { filter: 'bandpass', freq: 3000, vol: 0.06, q: 6, attack: 0.3 });
        break;
      case 'zap':
        this.noise(0.25, { filter: 'highpass', freq: 2500, vol: 0.3 });
        this.tone(60, 0.25, { type: 'square', vol: 0.15, lp: 900 });
        this.tone(1800, 0.18, { type: 'sawtooth', vol: 0.06, slide: 300 });
        break;
      case 'thunder':
        this.noise(0.5, { freq: 3000, freqTo: 200, vol: 0.35 });
        this.tone(48, 0.5, { type: 'sine', vol: 0.35, slide: 30 });
        break;
      case 'anchor_tick':
        if (!this._gate('anchor_tick', 0.18)) return;
        this.tone(880 + m * 600, 0.08, { type: 'sine', vol: 0.06 });
        break;
      case 'anchor_done':
        [0, 4, 7, 12].forEach((s, i) => this.tone(523.25 * Math.pow(2, s / 12), 0.25, { type: 'triangle', vol: 0.1, delay: i * 0.06 }));
        break;
      case 'phase':
        this.tone(110, 1.2, { type: 'sawtooth', vol: 0.18, slide: 220, lp: 1200, attack: 0.05 });
        this.noise(1.0, { filter: 'bandpass', freq: 200, freqTo: 2000, vol: 0.2 });
        break;
      case 'death':
        this.noise(1.6, { freq: 1200, freqTo: 60, vol: 0.5 });
        this.tone(220, 1.5, { type: 'sawtooth', vol: 0.18, slide: 40, lp: 1500 });
        [0, 3, 7, 12, 15].forEach((s, i) => this.tone(330 * Math.pow(2, s / 12), 0.5, { type: 'triangle', vol: 0.08, delay: 0.5 + i * 0.09 }));
        break;
      case 'heal':
        [0, 7, 12].forEach((s, i) => this.tone(660 * Math.pow(2, s / 12), 0.2, { type: 'sine', vol: 0.09, delay: i * 0.05 }));
        break;
      case 'wake':
        this.tone(60, 0.8, { type: 'sawtooth', vol: 0.15, slide: 120, lp: 600 });
        break;
      case 'victory':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.35, { type: 'triangle', vol: 0.11, delay: i * 0.09 }));
        this.tone(392 * 4, 1.2, { type: 'sine', vol: 0.06, delay: 0.7 });
        break;
      case 'defeat':
        [12, 8, 5, 0].forEach((s, i) => this.tone(220 * Math.pow(2, s / 12), 0.5, { type: 'triangle', vol: 0.11, delay: i * 0.22 }));
        break;
      case 'upgrade':
        [0, 5, 9, 12].forEach((s, i) => this.tone(587 * Math.pow(2, s / 12), 0.22, { type: 'square', vol: 0.05, delay: i * 0.05, lp: 3000 }));
        break;
      case 'burn':
        if (!this._gate('burn', 0.3)) return;
        this.noise(0.18, { filter: 'bandpass', freq: 700, vol: 0.05 });
        break;
    }
  },

  // ---------- zumbido continuo de la cadena ----------
  _initChain() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.4;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start();
    // zumbido eléctrico
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 58;
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
    const g2 = c.createGain(); g2.gain.value = 0;
    osc.connect(f2); f2.connect(g2); g2.connect(this.sfx);
    osc.start();
    this._chain = { f, g, g2 };
  },

  setChain(energy, electric, active) {
    if (!this._chain) return;
    const t = this.ctx.currentTime;
    const e = active ? Math.min(1.5, energy) : 0;
    this._chain.g.gain.setTargetAtTime(e * e * 0.16, t, 0.05);
    this._chain.f.frequency.setTargetAtTime(350 + e * 1400, t, 0.05);
    this._chain.g2.gain.setTargetAtTime(active && electric ? 0.05 : 0, t, 0.05);
  },

  // ---------- música ----------
  _seq: { mode: null, step: 0, next: 0, timer: null, bpm: 120 },

  music(mode) {
    if (!this.ctx) { this._pendingMusic = mode; return; }
    const s = this._seq;
    if (s.mode === mode) return;
    s.mode = mode;
    s.bpm = mode === 'menu' ? 86 : mode === 'fight2' ? 132 : 120;
    if (!mode) return;
    if (!s.timer) {
      s.next = this.ctx.currentTime + 0.08;
      s.step = 0;
      s.timer = setInterval(() => this._schedule(), 25);
    }
  },

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, this.ctx.currentTime, 0.1);
    return this.musicOn;
  },

  _schedule() {
    const s = this._seq;
    if (!this.ctx || !s.mode) return;
    if (this.ctx.state !== 'running') { s.next = this.ctx.currentTime + 0.05; return; }
    // si la pestaña estuvo dormida, no "recuperar" cientos de notas
    if (s.next < this.ctx.currentTime - 0.2) s.next = this.ctx.currentTime + 0.05;
    while (s.next < this.ctx.currentTime + 0.12) {
      this._step(s.step, s.next);
      s.next += 60 / s.bpm / 4;
      s.step++;
    }
  },

  _step(step, t) {
    const mode = this._seq.mode;
    const bus = this.musicBus;
    const bar = Math.floor(step / 16) % 4;
    const st = step % 16;
    // progresión Am - F - C - G
    const roots = [110, 87.31, 130.81, 98];
    const chords = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar];

    if (mode === 'menu') {
      if (st === 0) {
        chords[bar].forEach((s, i) => this.tone(root * 2 * Math.pow(2, s / 12), 2.6, { at: t, type: 'sine', vol: 0.05 - i * 0.008, attack: 0.4, dest: bus }));
        this.tone(root, 2.6, { at: t, type: 'triangle', vol: 0.05, attack: 0.3, dest: bus });
      }
      if (st % 4 === 2) {
        const ch = chords[bar];
        const n = ch[(st / 4 | 0) % 3];
        this.tone(root * 4 * Math.pow(2, n / 12), 0.5, { at: t, type: 'triangle', vol: 0.025, dest: bus });
      }
      return;
    }

    if (mode === 'fight' || mode === 'fight2') {
      const hard = mode === 'fight2';
      // bombo
      if (st % 4 === 0 || (hard && st === 10)) {
        this.tone(150, 0.16, { at: t, type: 'sine', vol: 0.5, slide: 42, dest: bus });
      }
      // caja
      if (st === 4 || st === 12) {
        this.noise(0.14, { at: t, filter: 'bandpass', freq: 1800, vol: 0.16, q: 0.7, dest: bus });
        this.tone(190, 0.08, { at: t, type: 'triangle', vol: 0.08, slide: 140, dest: bus });
      }
      // hi-hat
      if (st % 2 === 1 || (hard && st % 4 === 2)) {
        this.noise(0.035, { at: t, filter: 'highpass', freq: 7000, vol: st % 4 === 3 ? 0.06 : 0.035, dest: bus });
      }
      // bajo
      if (st % 2 === 0) {
        const pat = [1, 1, 2, 1, 1, 1, 2, 1.5];
        const f = root * pat[(st / 2) | 0];
        this.tone(f, 0.18, { at: t, type: 'sawtooth', vol: 0.09, lp: 600, lpTo: 220, dest: bus });
      }
      // arpegio
      if (hard || bar >= 2) {
        const ch = chords[bar];
        const n = ch[st % 3] + (st % 6 >= 3 ? 12 : 0);
        if (hard || st % 2 === 0) {
          this.tone(root * 4 * Math.pow(2, n / 12), 0.12, { at: t, type: 'square', vol: hard ? 0.022 : 0.016, lp: 2400, dest: bus });
        }
      }
      // pad
      if (st === 0) {
        chords[bar].forEach((s) => this.tone(root * 2 * Math.pow(2, s / 12), 1.9, { at: t, type: 'sawtooth', vol: 0.014, lp: 900, attack: 0.2, dest: bus }));
      }
    }
  },
};
