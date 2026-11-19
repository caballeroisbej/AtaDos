# AtaDos

**Dos jugadores. Una cadena. Ningún arma más.**

Juego cooperativo local (mismo teclado o dos controles) contra jefes. Los dos
personajes están unidos por una cadena de energía y no tienen ataques: para
dañar al jefe hay que hacer pasar la cadena a través de él. Para sobrevivir
hay que separarse, juntarse y coordinarse contra sus mecánicas.

## Cómo correrlo

Doble click en `index.html`. No necesita instalación ni internet: three.js
viene incluido en `js/`. Funciona en Chrome, Edge y Firefox.

## Controles

| | Mover | Dash |
|---|---|---|
| **P1 · Lazo** (celeste) | W A S D | Espacio (o Shift izq.) |
| **P2 · Brasa** (naranjo) | Flechas (o I J K L) | Enter (o Shift der. / Ctrl der. / 0 del numérico) |

- **Controles:** con 2 controles, uno por jugador. Con 1 control en modo
  2 jugadores, el control es de P2. En modo **1 jugador**, un control maneja a
  los dos: stick izquierdo + LB/LT = P1, stick derecho + RB/RT = P2.
- **Esc / P:** pausa · **M:** música · En el título: **1** = 2 jugadores, **2** = 1 jugador.

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
index.html, style.css   pantallas y HUD
js/config.js            todos los números del juego
js/game.js              loop, estados, cámara y flujo entre jefes
js/chain.js             la cadena: restricción, daño, TAJO, carga, electrificada
js/player.js            movimiento con aceleración, dash, anillo de recarga
js/boss.js              máquina de estados del jefe y elección de ataques
js/attacks.js           bloques de ataque (generadores) y peligros persistentes
js/telegraphs.js        avisos en el suelo
js/projectiles.js       proyectiles con InstancedMesh
js/models.js            jugadores y jefes hechos con primitivas
js/arena.js             isla flotante y temas por jefe
js/vfx.js               partículas, anillos, estelas, temblor, números
js/audio.js             efectos y música sintetizados (WebAudio)
js/input.js             teclado compartido y controles
js/hud.js               interfaz
```

Del **Skillshot Trainer** se rescató: modelos por primitivas con silueta
reconocible, la regla "modelo = hitbox", movimiento con aceleración y frenado
suaves, dash con estela, telegrafías con borde que pulsa, pools de VFX,
temblor y zoom de cámara, y audio sintetizado.

## Créditos y licencias

- [three.js](https://threejs.org) r128 — licencia MIT (`vendor/three.min.js`).
- Todo lo demás (modelos, texturas, efectos, música y sonidos) se genera por
  código en este proyecto. No hay assets de terceros.
