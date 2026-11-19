// ================= PANEL DE AJUSTE (solo con index.html?dev, tecla F1) =================
// Para balancear en vivo sin tocar código. "Copiar valores" deja en el
// portapapeles las líneas para pegar en config.js.
const DevPanel = {
  fields: [
    ['Cadena: largo', 'chain.length', 4, 12, 0.5],
    ['Cadena: daño/s', 'chain.dps', 10, 150, 1],
    ['Cadena: vel. de referencia', 'chain.refSpeed', 2, 10, 0.5],
    ['Cadena: mínimo quieta', 'chain.minMult', 0, 1, 0.05],
    ['TAJO: daño', 'chain.slashDamage', 0, 120, 1],
    ['Jugador: velocidad', 'player.speed', 3, 12, 0.1],
    ['Dash: velocidad', 'player.dashSpeed', 10, 40, 1],
    ['Dash: recarga (s)', 'player.dashCooldown', 0.2, 2, 0.05],
    ['Invulnerable tras golpe (s)', 'player.hurtInvuln', 0.2, 3, 0.1],
    ['Vida del equipo', 'team.links', 1, 20, 1],
  ],

  init() {
    if (!Game.dev) return;
    const el = document.createElement('div');
    el.id = 'devPanel';
    el.className = 'hidden';
    el.innerHTML = '<b>AJUSTE EN VIVO</b> <small>(F1)</small>' +
      this.fields.map(([label, path, min, max, step], i) =>
        `<label>${label} <span id="dv${i}"></span><input type="range" min="${min}" max="${max}" step="${step}" data-i="${i}"></label>`).join('') +
      '<label>Vida del jefe actual <span id="dvhp"></span><input type="range" min="50" max="5000" step="50" id="dvhpIn"></label>' +
      '<b>AYUDAS DE LECTURA</b>' +
      Object.keys(CONFIG.ui).map((k) => `<label class="dvchk"><input type="checkbox" data-ui="${k}" ${CONFIG.ui[k] ? 'checked' : ''}> ${k}</label>`).join('') +
      '<button id="dvCopy">Copiar valores</button><div id="dvMsg"></div>';
    document.body.appendChild(el);
    el.querySelectorAll('input[data-i]').forEach((inp) => {
      const f = this.fields[+inp.dataset.i];
      inp.value = this.get(f[1]);
      inp.addEventListener('input', () => { this.set(f[1], parseFloat(inp.value)); this.refresh(); });
    });
    // apagar/prender cada ayuda para comparar en playtest (CONFIG.ui)
    el.querySelectorAll('input[data-ui]').forEach((inp) => {
      inp.addEventListener('change', () => { CONFIG.ui[inp.dataset.ui] = inp.checked; inp.blur(); });
    });
    document.getElementById('dvhpIn').addEventListener('input', (e) => {
      const b = Game.boss; if (!b) return;
      const v = parseFloat(e.target.value);
      const k = b.hp / b.maxHp;
      b.maxHp = v; b.hp = v * k; b.def.hp = v;
      this.refresh();
    });
    document.getElementById('dvCopy').addEventListener('click', () => this.copy());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') { e.preventDefault(); el.classList.toggle('hidden'); this.refresh(); }
    });
    this.el = el;
    this.refresh();
  },

  get(path) { return path.split('.').reduce((o, k) => o[k], CONFIG); },
  set(path, v) {
    const ks = path.split('.');
    const last = ks.pop();
    ks.reduce((o, k) => o[k], CONFIG)[last] = v;
    if (path === 'team.links') { Game.team.maxLinks = v; Game.team.links = Math.min(Game.team.links, v); HUD.links(false); }
  },
  refresh() {
    if (!this.el) return;
    this.fields.forEach((f, i) => { document.getElementById('dv' + i).textContent = this.get(f[1]); });
    const b = Game.boss;
    if (b) { document.getElementById('dvhp').textContent = Math.round(b.maxHp) + ' (' + b.def.name + ')'; document.getElementById('dvhpIn').value = b.maxHp; }
  },
  copy() {
    const lines = this.fields.map(([label, path]) => `${path}: ${this.get(path)}`);
    CONFIG.bosses.forEach((b) => lines.push(`${b.id}.hp: ${b.hp}`));
    Object.keys(CONFIG.ui).forEach((k) => lines.push(`ui.${k}: ${CONFIG.ui[k]}`));
    const txt = lines.join('\n');
    const msg = document.getElementById('dvMsg');
    const done = () => { msg.textContent = 'Copiado. Pégalo y pásalo a config.js'; };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => { msg.textContent = txt; });
    else msg.textContent = txt;
  },
};
window.addEventListener('load', () => DevPanel.init());
