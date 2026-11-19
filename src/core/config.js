// ============================================================
// ATADOS — CONFIGURACIÓN
// Todos los números del juego viven aquí. Para balancear: editar y recargar
// la página (F5). No hace falta tocar ningún otro archivo.
//
// Unidades: distancias en metros del mundo (la arena mide 15 de radio),
// tiempos en segundos, velocidades en metros/segundo.
// Daño a los jugadores: en "eslabones" de la vida compartida.
// ============================================================
const CONFIG = {
  arenaRadius: 11.5,

  player: {
    radius: 0.55,
    speed: 6.6,            // velocidad máxima caminando
    accel: 55,             // qué tan rápido llega a la velocidad máxima
    decel: 38,             // qué tan rápido frena al soltar
    dashSpeed: 22,
    dashTime: 0.16,
    dashCooldown: 0.85,
    dashIframes: 0.24,     // invulnerable al inicio del dash (atravesar ondas)
    hurtInvuln: 1.2,       // invulnerable tras recibir un golpe
    knockback: 10,
  },

  chain: {
    length: 7,             // largo máximo de la cadena
    dps: 55,               // daño por segundo en contacto, a velocidad de referencia
    refSpeed: 4.5,           // velocidad de barrido que da multiplicador x1
    minMult: 0.1,          // cadena quieta sobre el jefe: 10% del daño (hay que moverse)
    maxMult: 3.0,          // tope del multiplicador por velocidad
    slashDamage: 36,       // TAJO: cruzar al jefe de lado a lado (× multiplicador)
    slashMinMult: 0.8,
    comboWindow: 2.6,      // segundos para encadenar tajos
    comboBonus: 0.12,      // +12% de daño por cada tajo del combo
    comboMax: 5,
    chargePerBlock: 0.1,   // cada proyectil bloqueado: +10% al próximo TAJO
    chargeMax: 10,         // hasta +100%
    minLength: 1.6,        // con los jugadores pegados la cadena no corta
    thickness: 0.24,       // grosor para bloquear proyectiles
    dasherWeight: 0.3,     // quien hace dash arrastra al compañero (0 = lo arrastra entero)
    tickInterval: 0.13,    // cada cuánto se muestran los números de daño
    yankSpeed: 9,          // tirón fuerte: muestra "¡TIRÓN!"
  },

  team: {
    links: 8,              // vida compartida (eslabones)
    soloExtraLinks: 3,     // en modo 1 jugador
  },

  // ----------------------------------------------------------
  // JEFES — cada jefe es una combinación de bloques de ataque.
  // Tipos de ataque disponibles:
  //   charge        embestida en línea recta (aturdido si choca con el borde)
  //   ring          anillo de proyectiles
  //   volley        ráfaga apuntada a un jugador
  //   jumpSplit     salta y cae entre los jugadores (separarse)
  //   jumpTogether  terremoto: solo el círculo azul es seguro (juntarse)
  //   swipe         zarpazo en cono
  //   shockwave     onda expansiva (se atraviesa con dash)
  //   electrify     electrifica la cadena (no tocar al jefe)
  //   anchor        zona dorada: uno se queda quieto y el jefe queda expuesto
  //   spiral        espiral de proyectiles
  //   lightning     rayos que caen sobre los jugadores
  //   combo         dos ataques a la vez (parts: [...])
  // Campos comunes: weight (probabilidad), cooldown (s), first (abre la pelea),
  //   damage (eslabones), hint (texto que aparece la primera vez).
  // pierce: true -> proyectiles morados que atraviesan la cadena.
  // ----------------------------------------------------------
  bosses: [
    {
      id: 'toro',
      name: 'TORO DE BRONCE',
      epithet: 'El Ariete',
      model: 'toro',
      radius: 1.8,
      hp: 600,
      moveSpeed: 2.3,
      moveStyle: 'chase',
      contactDamage: 1,
      theme: { accent: 0xff9a3c, floor: 0xb39d82, fog: 0x1a0d06, sky1: '#3a1c08', sky2: '#070302', sun: 0xffe2c0 },
      intro: 'Embiste en línea recta. Si choca contra el borde queda aturdido.',
      phases: [
        {
          at: 1.0, rest: [0.9, 1.6],
          attacks: [
            { type: 'charge', weight: 3, first: true, windup: 1.0, aimTime: 0.55, speed: 15, maxDist: 24, stun: 2.0, damage: 1,
              hint: '¡Embestida! Salgan del camino… pero dejen la cadena cruzada: se corta solo.' },
            { type: 'ring', weight: 2, windup: 0.75, count: 14, waves: 2, waveDelay: 0.5, speed: 5.5, damage: 1,
              hint: 'Atrapen proyectiles naranjos con la cadena: se CARGA y el próximo TAJO pega más fuerte.' },
          ],
        },
        {
          at: 0.4, rest: [0.6, 1.2], banner: '¡ENFURECIDO!',
          attacks: [
            { type: 'charge', weight: 3, first: true, windup: 0.85, aimTime: 0.45, speed: 17, maxDist: 24, stun: 1.7, repeat: 2, damage: 1 },
            { type: 'ring', weight: 2, windup: 0.6, count: 16, waves: 3, waveDelay: 0.42, speed: 6, spin: 0.25, damage: 1 },
          ],
        },
      ],
    },
    {
      id: 'sapo',
      name: 'SAPO SÍSMICO',
      epithet: 'El que cae del cielo',
      model: 'sapo',
      radius: 2.0,
      hp: 950,
      moveSpeed: 2.0,
      moveStyle: 'chase',
      contactDamage: 1,
      theme: { accent: 0xb06bff, floor: 0x8c9c84, fog: 0x0d0916, sky1: '#22123a', sky2: '#05030a', sun: 0xeee4ff },
      intro: 'Salta y cae sobre ustedes. Rojo = peligro, azul = refugio.',
      phases: [
        {
          at: 1.0, rest: [0.8, 1.4],
          attacks: [
            { type: 'jumpSplit', weight: 3, first: true, airTime: 1.5, lock: 0.45, radius: 2.8, recover: 1.3, damage: 1,
              hint: '¡Cae entre ustedes! Sepárense.' },
            { type: 'jumpTogether', weight: 2, cooldown: 9, time: 2.7, safeRadius: 2.4, recover: 1.0, damage: 1,
              hint: '¡Terremoto! Los dos al círculo azul.' },
            { type: 'swipe', weight: 2, windup: 0.7, aimTime: 0.4, range: 4.2, half: 0.95, damage: 1 },
            { type: 'volley', weight: 2, windup: 0.6, bursts: 2, count: 5, spread: 0.7, speed: 7, burstDelay: 0.45, damage: 1 },
          ],
        },
        {
          at: 0.5, rest: [0.6, 1.1], banner: 'FASE 2',
          attacks: [
            { type: 'jumpSplit', weight: 3, airTime: 1.25, lock: 0.4, radius: 2.9, recover: 0.9, repeat: 2, damage: 1 },
            { type: 'jumpTogether', weight: 2, cooldown: 8, time: 2.3, safeRadius: 2.3, recover: 0.8, damage: 1 },
            { type: 'volley', weight: 3, first: true, windup: 0.55, bursts: 3, count: 5, spread: 0.8, speed: 7.5, burstDelay: 0.4, pierce: true, damage: 1,
              hint: '¡Los proyectiles MORADOS atraviesan la cadena! Esquívenlos.' },
            { type: 'shockwave', weight: 2, windup: 0.8, waves: 2, speed: 7, delay: 0.75, damage: 1,
              hint: 'Onda expansiva: atraviésenla con un dash.' },
            { type: 'swipe', weight: 1, windup: 0.6, aimTime: 0.35, range: 4.5, half: 1.0, damage: 1 },
          ],
        },
      ],
    },
    {
      id: 'centinela',
      name: 'CENTINELA DE LA TORMENTA',
      epithet: 'Conducto viviente',
      model: 'centinela',
      radius: 1.6,
      hp: 1500,
      moveSpeed: 2.6,
      moveStyle: 'hover',
      contactDamage: 1,
      theme: { accent: 0x55d8ff, floor: 0x8494a6, fog: 0x050b14, sky1: '#0c2238', sky2: '#020409', sun: 0xdcf2ff },
      intro: 'Electrifica la cadena. No lo toquen mientras brille amarilla.',
      phases: [
        {
          at: 1.0, rest: [0.7, 1.3],
          attacks: [
            { type: 'electrify', weight: 3, first: true, cooldown: 7, windup: 1.3, duration: 4, chaseSpeed: 2.9, damage: 1,
              hint: '¡Cadena electrificada! Manténganla lejos del jefe.' },
            { type: 'anchor', weight: 2, cooldown: 12, radius: 1.3, charge: 2.5, timeLimit: 8, stillSpeed: 2.4, fireInterval: 1.1,
              stun: 3.5, vuln: 1.6, failDamage: 2, damage: 1,
              hint: 'Uno se queda QUIETO en el círculo dorado mientras el otro ataca.' },
            { type: 'spiral', weight: 2, windup: 0.6, duration: 3.5, arms: 3, interval: 0.17, rotSpeed: 1.6, speed: 5.5, damage: 1 },
            { type: 'lightning', weight: 2, strikes: 3, windup: 1.0, track: 0.55, radius: 1.25, delay: 0.45, damage: 1,
              hint: 'Rayos: muévanse fuera de los círculos.' },
          ],
        },
        {
          at: 0.5, rest: [0.5, 1.0], banner: 'FASE 2',
          attacks: [
            { type: 'combo', weight: 3, first: true, cooldown: 9, parts: [
              { type: 'electrify', windup: 1.0, duration: 4.5, chaseSpeed: 3.2, damage: 1 },
              { type: 'spiral', windup: 0.8, duration: 4, arms: 4, interval: 0.22, rotSpeed: -1.3, speed: 5.2, damage: 1 },
            ] },
            { type: 'anchor', weight: 2, cooldown: 12, radius: 1.3, charge: 2.5, timeLimit: 7, stillSpeed: 2.4, fireInterval: 0.8,
              stun: 3.5, vuln: 1.6, failDamage: 2, damage: 1 },
            { type: 'lightning', weight: 2, strikes: 4, windup: 0.85, track: 0.45, radius: 1.3, delay: 0.35, damage: 1 },
            { type: 'ring', weight: 2, windup: 0.6, count: 18, waves: 3, waveDelay: 0.45, speed: 6, pierceEvery: 3, damage: 1,
              hint: 'Algunos proyectiles son MORADOS: atraviesan la cadena.' },
          ],
        },
      ],
    },
  ],

  // ----------------------------------------------------------
  // MEJORAS — entre jefes se eligen 1 de 3 (sin repetir).
  // ----------------------------------------------------------
  upgrades: [
    { id: 'largo', icon: '⛓️', name: 'Eslabones extra', desc: 'La cadena es 30% más larga: barre más área y alcanza desde más lejos.',
      apply: (m) => { m.chainLength *= 1.3; } },
    { id: 'filo', icon: '🗡️', name: 'Filo dentado', desc: '+35% de daño de la cadena.',
      apply: (m) => { m.damage *= 1.35; } },
    { id: 'fuego', icon: '🔥', name: 'Cadena ígnea', desc: 'Cada contacto quema al jefe: 14 de daño por segundo durante 3 s.',
      apply: (m) => { m.burnDps += 14; } },
    { id: 'hielo', icon: '❄️', name: 'Cadena gélida', desc: 'Cada TAJO congela al jefe: va 35% más lento durante 2.5 s.',
      apply: (m) => { m.slow = 0.35; } },
    { id: 'impulso', icon: '💨', name: 'Impulso', desc: 'El dash se recarga 35% más rápido y llega más lejos.',
      apply: (m) => { m.dashCd *= 0.65; m.dashSpeed *= 1.15; } },
    { id: 'remiendo', icon: '❤️', name: 'Remiendo', desc: '+2 eslabones de vida máxima y curación completa.',
      apply: (m, g) => { g.team.maxLinks += 2; g.team.links = g.team.maxLinks; } },
    { id: 'espejo', icon: '🛡️', name: 'Cadena espejo', desc: 'Los proyectiles que bloquea la cadena rebotan contra el jefe.',
      apply: (m) => { m.reflect = true; } },
    { id: 'vampiro', icon: '🩸', name: 'Tajo vampírico', desc: 'Cada 4 TAJOS recuperan 1 eslabón de vida.',
      apply: (m) => { m.vamp = 4; } },
  ],

  // Colores de lectura (no cambiar sin pensarlo: rojo = peligro, azul = seguro)
  colors: {
    p1: 0x3fd4ff,
    p2: 0xff7a45,
    danger: 0xff3b3b,
    safe: 0x3bb6ff,
    electric: 0xffe14a,
    anchor: 0xffd34d,
    projectile: 0xff8a3d,
    pierce: 0xc24dff,
  },
};
