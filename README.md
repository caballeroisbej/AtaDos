# AtaDos

**Dos jugadores. Una cadena. Ningún arma más.**

Juego cooperativo local (mismo teclado o dos controles) contra jefes. Los dos
personajes están unidos por una cadena de energía y no tienen ataques: para
dañar al jefe hay que hacer pasar la cadena a través de él. Para sobrevivir
hay que separarse, juntarse y coordinarse contra sus mecánicas.

## Cómo correrlo

Doble click en `index.html`. No necesita instalación, servidor ni internet:
three.js r128 viene incluido en `vendor/`. Funciona en Chrome, Edge y Firefox.

Parámetros opcionales en la URL: `?dev` (panel de ajuste, F1), `?seed=123`
(fija el azar de los jefes para reproducir una pelea), `?manual` (el loop no
avanza solo; lo usan las pruebas).

## Cómo validar

Requiere Node ≥ 22 (sin `npm install`: no hay dependencias).

| Comando | Qué hace |
|---|---|
| `npm run check` | Sintaxis de `src/`, `tests/` y `scripts/`; que `index.html` cargue todo `src/` en orden y sin ES modules. |
| `npm test` | Pruebas de reglas en Node (`node --test`): cadena, TAJO, bloqueo, vida, fases, elección de ataques con semilla, lectura de amenazas y roles, tabla de estados, teclas y menús, y todos los ataques reales terminando y cancelándose con limpieza. |
| `npm run smoke` | Abre `index.html` por **file://** en Chrome headless local y juega el flujo con teclas reales (2 jugadores a la vez, dash, pausa/reanudar, despertar al jefe, amenaza visible, reinicio, derrota y reintento, mejora, menú, música, modo 1 jugador, práctica, panel `?dev`, determinismo con semilla). Falla ante errores de consola o cualquier pedido de red. Deja capturas y `smoke.json` en `test-results/`. Si no encuentra Chrome sale con código 2 y lo dice (define `CHROME=/ruta`). |
| `npm run verify` | Los tres seguidos. |

Esto NO reemplaza jugarlo: el playtest con dos personas (sensación de la
cadena, legibilidad real, dificultad, controles físicos) se anota aparte en
`docs/ITERACIONES.md`.

## Controles

| | Mover | Dash |
|---|---|---|
| **P1 · Lazo** (celeste) | W A S D | Espacio (o Shift izq.) |
| **P2 · Brasa** (naranjo) | Flechas (o I J K L) | Enter (o Shift der. / Ctrl der. / 0 del numérico) |

- **Controles:** con 2 controles, uno por jugador. Con 1 control en modo
  2 jugadores, el control es de P2. En modo **1 jugador**, un control maneja a
  los dos: stick izquierdo + LB/LT = P1, stick derecho + RB/RT = P2.
- **Esc / P:** pausa · **M:** música · En el título: **1** = 2 jugadores, **2** = 1 jugador.
- **En pausa:** Esc / Enter sigue · **R** reinicia el jefe actual · **Q** vuelve al menú.
- **Al perder:** Enter / R reintenta el mismo jefe · Esc vuelve al menú.

## Cómo se juega

- **La cadena es el arma.** Mientras más rápido barre al jefe, más daño hace.
  Quieta encima del jefe casi no hace nada: hay que moverse.
- **TAJO:** cruzar al jefe de un lado al otro con la cadena da un golpe extra.
  Varios seguidos suben el combo.
- **Carga:** la cadena bloquea los proyectiles **naranjos**; cada uno que
  atrapa le suma +10% al próximo TAJO (hasta +100%). Los **morados** la atraviesan.
- **Vida compartida:** los eslabones de abajo son la vida de los dos.
  Si uno juega mal, pierden ambos.
- **Rojo = peligro, azul = refugio.** Todo ataque avisa en el suelo antes de pegar.
- **Tirón:** si la cadena se estira al máximo, arrastra al compañero. El que
  hace dash pesa más: sirve para sacar al otro de un peligro.
- Cada jefe **duerme** hasta que la cadena lo atraviesa: así se aprende la
  mecánica sin presión.

### Leer la pelea (remake "Forja nocturna")

- **AMENAZA:** bajo la barra del jefe, una tarjeta con el color de la amenaza
  dice qué ataque viene y qué hacer (rojo peligro, azul refugio, amarillo
  eléctrico, dorado ancla, naranjo bloqueable, morado atraviesa). Un aro del
  mismo color rodea al jefe mientras ataca, y cada tipo tiene su timbre.
- **¡A TI!:** una marca roja en el piso y una etiqueta sobre la cabeza señalan
  al jugador apuntado (embestida, ráfaga, zarpazo, rayos).
- **Roles:** sobre cada jugador aparece lo que le toca: `QUIETO` / `AL DORADO`
  y `ATACA` en el ancla, `AL AZUL` en el terremoto, `SEPÁRENSE` en la caída,
  `DASH` en la onda, `LEJOS` con la cadena eléctrica.
- **BARRIDO:** el medidor sobre la vida muestra cuánto barre cada uno (celeste
  y naranjo), el multiplicador y el estado de la cadena: FLOJA, TENSA,
  ALINEADOS · ¡CRÚCENLO!, GOLPEANDO o ⚡ NO TOCAR.
- La **sombra de la cadena** en el piso se engrosa al tensarse, se pone dorada
  con carga, amarilla al electrificarse y blanca mientras golpea.
- Cada ayuda se puede apagar en `config.js` (`ui`) o en vivo con `?dev` + F1.

Dirección visual: siluetas con contorno de tinta, pizarra oscura de bajo
contraste y luz solo donde hay juego (cadena, avisos, jugadores); el
degradado celeste→naranjo de los dos jugadores es la única firma de color
propia. Todo por primitivas y código, sin assets externos.

### Los jefes

1. **Toro de Bronce** — embestida y anillo de proyectiles. Si choca contra el
   borde queda aturdido (+30% de daño). Truco: si la cadena queda cruzada en el
   camino de la embestida, el toro se corta solo.
2. **Sapo Sísmico** — salta y cae entre los jugadores (separarse) y el
   terremoto donde solo el círculo azul es seguro (juntarse). En fase 2, sus
   proyectiles morados atraviesan la cadena y lanza ondas que se cruzan con dash.
3. **Centinela de la Tormenta** — electrifica la cadena (no tocarlo mientras
   brille amarilla) y marca una zona dorada: uno se queda **quieto** adentro
   mientras el otro gira a su alrededor; si lo logran, el jefe queda expuesto.

Entre jefes se elige **1 de 3 mejoras** para la cadena (más larga, filo,
fuego, hielo, espejo, vampírica, impulso, remiendo). Al perder se reintenta
el mismo jefe al instante sin perder las mejoras.

## Balancear sin tocar código

Todos los números están en **`src/core/config.js`**: vida y velocidad de los
jugadores, largo y daño de la cadena, vida de cada jefe, cada ataque con sus
tiempos de aviso, y las mejoras. Los jefes son combinaciones de bloques de
ataque reutilizables (`charge`, `ring`, `volley`, `jumpSplit`, `jumpTogether`,
`swipe`, `shockwave`, `electrify`, `anchor`, `spiral`, `lightning`, `combo`):
para hacer un jefe nuevo basta con escribir su entrada en `config.js`.

Editar, guardar y recargar la página (F5).

**Modo desarrollo:** abrir `index.html?dev` muestra FPS y datos de la cadena, y
activa F2 (modo dios), F3 (despertar / matar al jefe) y F4 (quitarle 25%).

## Estructura

```
index.html, styles/style.css   pantallas y HUD
src/core/config.js             todos los números del juego (+ textos de AMENAZA y ayudas `ui`)
src/core/rng.js                azar con semilla y reloj controlable (pruebas)
src/core/util.js               utilidades matemáticas
src/core/flow.js               tabla de estados y teclas/botones -> acciones (sin efectos)
src/core/input.js              teclado compartido y controles
src/core/audio.js              efectos y música sintetizados (WebAudio)
src/render/vfx.js              partículas, anillos, estelas, temblor, números (pools)
src/render/telegraphs.js       avisos en el suelo
src/render/models.js           jugadores y jefes con primitivas + contorno de tinta
src/render/arena.js            isla flotante y temas por jefe
src/render/readability.js      lectura en el mundo: sombra de cadena, marca de objetivo, roles
src/gameplay/rules.js          reglas puras (cadena, TAJO, vida, fases, ataques, lectura)
src/gameplay/chain.js          la cadena: restricción, daño, TAJO, carga, electrificada
src/gameplay/player.js         movimiento con aceleración, dash, anillo de recarga
src/gameplay/projectiles.js    proyectiles con InstancedMesh (pool fijo)
src/gameplay/attacks.js        bloques de ataque (generadores) y peligros persistentes
src/gameplay/boss.js           máquina de estados del jefe
src/ui/hud.js                  interfaz (AMENAZA, BARRIDO, vida, combo)
src/ui/devpanel.js             panel de ajuste (?dev, F1)
src/game.js                    loop, estados, cámara y flujo entre jefes
tests/                         pruebas en Node (node --test) con stubs de render
scripts/check.js, smoke.js     sintaxis y smoke de Chrome headless por file://
```

Del **Skillshot Trainer** se rescató: modelos por primitivas con silueta
reconocible, la regla "modelo = hitbox", movimiento con aceleración y frenado
suaves, dash con estela, telegrafías con borde que pulsa, pools de VFX,
temblor y zoom de cámara, y audio sintetizado.

## Créditos y licencias

- [three.js](https://threejs.org) r128 — licencia MIT (`vendor/three.min.js`).
- Todo lo demás (modelos, texturas, efectos, música y sonidos) se genera por
  código en este proyecto. No hay assets de terceros.
