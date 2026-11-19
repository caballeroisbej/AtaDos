// ================= INPUT =================
// Teclado compartido (dos jugadores en el mismo teclado) + hasta 2 controles.
// Modo coop: control 1 -> P1, control 2 -> P2 (con un solo control, maneja a P2).
// Modo solo: un control maneja a los dos (stick izq + LB/LT = P1, stick der + RB/RT = P2).
const KEYMAP = {
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dash: ['Space', 'ShiftLeft'] },
  p2: {
    up: ['ArrowUp', 'KeyI'], down: ['ArrowDown', 'KeyK'], left: ['ArrowLeft', 'KeyJ'], right: ['ArrowRight', 'KeyL'],
    dash: ['Enter', 'NumpadEnter', 'ShiftRight', 'ControlRight', 'Numpad0', 'KeyO'],
  },
};
const GAME_KEYS = new Set([].concat(...Object.values(KEYMAP.p1), ...Object.values(KEYMAP.p2)));

const Input = {
  down: new Set(),
  pressed: new Set(),     // teclas que bajaron en este frame
  padPrev: [[], []],
  padPressed: [[], []],   // botones que bajaron en este frame, por control
  pads: [null, null],
  onKey: null,            // callback para menús
  lastDevice: 'keyboard',

  init() {
    window.addEventListener('keydown', (e) => {
      // las flechas/espacio no deben desplazar la página ni "clickear" botones con foco
      if (GAME_KEYS.has(e.code) && Game.state === 'playing') e.preventDefault();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
      this.lastDevice = 'keyboard';
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  },

  any(codes) { for (const c of codes) if (this.down.has(c)) return true; return false; },
  anyPressed(codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; },

  pollPads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const found = [];
    for (let i = 0; i < list.length && found.length < 2; i++) if (list[i] && list[i].connected) found.push(list[i]);
    for (let k = 0; k < 2; k++) {
      const p = found[k] || null;
      this.pads[k] = p;
      const prev = this.padPrev[k];
      const pr = this.padPressed[k];
      pr.length = 0;
      if (!p) { prev.length = 0; continue; }
      for (let b = 0; b < p.buttons.length; b++) {
        const v = p.buttons[b] && (p.buttons[b].pressed || p.buttons[b].value > 0.5);
        if (v && !prev[b]) { pr.push(b); this.lastDevice = 'pad'; }
        prev[b] = v;
      }
    }
  },

  padCount() { return (this.pads[0] ? 1 : 0) + (this.pads[1] ? 1 : 0); },
  padPressedAny(k, buttons) {
    const pr = this.padPressed[k];
    for (const b of buttons) if (pr.indexOf(b) >= 0) return true;
    return false;
  },

  _stick(pad, ax, ay) {
    if (!pad) return [0, 0];
    let x = pad.axes[ax] || 0, y = pad.axes[ay] || 0;
    const m = Math.sqrt(x * x + y * y);
    if (m < 0.22) return [0, 0];
    const k = Math.min(1, (m - 0.22) / 0.7) / m; // zona muerta radial con reescalado
    return [x * k, y * k];
  },
  _dpad(pad) {
    if (!pad || pad.buttons.length < 16) return [0, 0];
    const b = (i) => (pad.buttons[i] && pad.buttons[i].pressed ? 1 : 0);
    return [b(15) - b(14), b(13) - b(12)];
  },

  // intención de cada jugador: { x, z, dash } con |(x,z)| <= 1
  read(mode, out) {
    for (let i = 0; i < 2; i++) {
      const km = i === 0 ? KEYMAP.p1 : KEYMAP.p2;
      let x = (this.any(km.right) ? 1 : 0) - (this.any(km.left) ? 1 : 0);
      let z = (this.any(km.down) ? 1 : 0) - (this.any(km.up) ? 1 : 0);
      let dash = this.anyPressed(km.dash);

      // controles
      const nPads = this.padCount();
      if (mode === 'solo' && this.pads[0]) {
        const pad = this.pads[0];
        const [sx, sy] = i === 0 ? this._stick(pad, 0, 1) : this._stick(pad, 2, 3);
        x += sx; z += sy;
        if (this.padPressedAny(0, i === 0 ? [4, 6] : [5, 7])) dash = true;
        if (i === 0) { const [dx, dy] = this._dpad(pad); x += dx; z += dy; }
      } else if (mode !== 'solo') {
        // coop: con 2 controles cada uno el suyo; con 1, el control es de P2
        const k = nPads >= 2 ? i : (i === 1 ? 0 : -1);
        if (k >= 0 && this.pads[k]) {
          const pad = this.pads[k];
          const [sx, sy] = this._stick(pad, 0, 1);
          const [dx, dy] = this._dpad(pad);
          x += sx + dx; z += sy + dy;
          if (this.padPressedAny(k, [0, 1, 2, 3, 4, 5, 6, 7])) dash = true;
        }
      }

      const m = Math.sqrt(x * x + z * z);
      if (m > 1) { x /= m; z /= m; }
      out[i].x = x; out[i].z = z; out[i].dash = dash;
    }
    return out;
  },

  // navegación de menús con control: devuelve 'left' | 'right' | 'confirm' | 'back' | 'start' | null
  menuAction() {
    for (let k = 0; k < 2; k++) {
      if (!this.pads[k]) continue;
      if (this.padPressedAny(k, [14])) return 'left';
      if (this.padPressedAny(k, [15])) return 'right';
      if (this.padPressedAny(k, [12])) return 'up';
      if (this.padPressedAny(k, [13])) return 'down';
      if (this.padPressedAny(k, [0])) return 'confirm';
      if (this.padPressedAny(k, [1])) return 'back';
      if (this.padPressedAny(k, [9])) return 'start';
    }
    return null;
  },

  endFrame() { this.pressed.clear(); },
  // al pasar de un menú al juego, la tecla que confirmó no debe contar como dash
  clearPressed() { this.pressed.clear(); this.padPressed[0].length = 0; this.padPressed[1].length = 0; },
};
