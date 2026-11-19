// ================= FLUJO DE ESTADOS Y ATAJOS =================
// Tabla de estados del juego y traducción de teclas / botones a ACCIONES,
// sin efectos. Game.act(accion) ejecuta. Así las regresiones de entrada y de
// estados se prueban en Node (tests/flow.test.js) sin navegador.
//
// Estados: boot -> title -> playing <-> paused
//                           playing -> upgrade -> playing (siguiente jefe)
//                           playing -> defeat -> playing (reintento) | title
//                           playing -> victory -> title

const Flow = {
  next: {
    boot: ['title'],
    title: ['playing'],
    playing: ['paused', 'upgrade', 'defeat', 'victory'],
    paused: ['playing', 'title'],
    upgrade: ['playing', 'title'],
    defeat: ['playing', 'title'],
    victory: ['title'],
  },
  canGo(from, to) { return !!(this.next[from] && this.next[from].includes(to)); },

  // Estados de menú donde una tecla apretada al aparecer la pantalla no debe contar
  // (evita elegir mejora / reintentar sin querer por venir apretando dash).
  lockable: ['upgrade', 'defeat', 'victory'],

  // tecla (KeyboardEvent.code) -> acción, o null
  keyAction(state, code, locked) {
    if (code === 'KeyM') return 'music';
    if (locked && this.lockable.includes(state)) return null;
    switch (state) {
      case 'title':
        if (code === 'Digit1' || code === 'Numpad1') return 'coop';
        if (code === 'Digit2' || code === 'Numpad2') return 'solo';
        return null;
      case 'playing':
        return code === 'Escape' || code === 'KeyP' ? 'pause' : null;
      case 'paused':
        if (code === 'Escape' || code === 'KeyP' || code === 'Enter' || code === 'Space') return 'resume';
        if (code === 'KeyQ') return 'menu';
        if (code === 'KeyR') return 'restart';
        return null;
      case 'upgrade':
        if (code === 'Digit1' || code === 'Numpad1') return 'pick:0';
        if (code === 'Digit2' || code === 'Numpad2') return 'pick:1';
        if (code === 'Digit3' || code === 'Numpad3') return 'pick:2';
        if (code === 'ArrowLeft' || code === 'KeyA') return 'sel:-1';
        if (code === 'ArrowRight' || code === 'KeyD') return 'sel:1';
        if (code === 'Enter' || code === 'Space') return 'pick:sel';
        return null;
      case 'defeat':
        if (code === 'Enter' || code === 'KeyR' || code === 'Space') return 'retry';
        if (code === 'Escape') return 'menu';
        return null;
      case 'victory':
        return code === 'Enter' || code === 'Escape' || code === 'Space' ? 'menu' : null;
    }
    return null;
  },

  // acción de control ('confirm' | 'back' | 'start' | 'left' | 'right' | 'up' | 'down' | 'x') -> acción
  padAction(state, a, locked) {
    if (!a) return null;
    if (locked && this.lockable.includes(state)) return null;
    switch (state) {
      case 'title':
        if (a === 'x') return 'solo';
        return a === 'confirm' || a === 'start' ? 'coop' : null;
      case 'playing': return a === 'start' ? 'pause' : null;
      case 'paused':
        if (a === 'start' || a === 'confirm') return 'resume';
        return a === 'back' ? 'menu' : null;
      case 'upgrade':
        if (a === 'left') return 'sel:-1';
        if (a === 'right') return 'sel:1';
        return a === 'confirm' ? 'pick:sel' : null;
      case 'defeat':
        if (a === 'confirm' || a === 'start') return 'retry';
        return a === 'back' ? 'menu' : null;
      case 'victory': return a === 'confirm' || a === 'start' ? 'menu' : null;
    }
    return null;
  },
};
