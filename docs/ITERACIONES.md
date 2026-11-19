# Iteraciones

- **v0.1** — prototipo: 3 jefes, cadena con daño por velocidad, TAJO, carga al bloquear, mejoras, modo 1 jugador.
- **v0.2** — revisión de bugs (rebote letal, avisos con hielo, ondas tras la muerte, input en menús, fugas de GPU).

## v0.3 — remake experimental "Forja nocturna" (rama `feature/remake-atados`, 2026-11-19)

El remake partió del prototipo jugable `2840228` en una rama experimental y se incorporó a la rama principal de AtaDos.

Objetivo: misma pieza jugable (coop local, la cadena como única arma, 3 jefes con
progresión y mejoras, práctica, panel de balance, pausa y reintentos, file:// sin red),
pero que **se lea**: cómo se coordinan los dos con la cadena y qué amenaza en cada momento.

### Qué cambió

**Lectura / coordinación (lo visible)**
- Tarjeta **AMENAZA** bajo la barra del jefe: nombre del ataque + qué hacer, con el
  color de su tipo (rojo/azul/amarillo/dorado/naranjo/morado). Textos en
  `CONFIG.attackInfo`. Aro del mismo color alrededor del jefe y timbre por tipo (`alert`).
- **¡A TI!**: marca roja en el piso + etiqueta sobre el jugador apuntado (embestida,
  ráfaga, zarpazo, rayos, disparos del ancla). Los ataques marcan objetivo con `boss.target()`.
- **Roles** sobre cada jugador: QUIETO / AL DORADO + ATACA (ancla), AL AZUL, SEPÁRENSE,
  DASH, LEJOS. Jefe dormido: "CRÚCENLO CON LA CADENA".
- Medidor **BARRIDO**: aporte de cada jugador (celeste/naranjo), multiplicador en vivo y
  estado de la cadena (FLOJA, TENSA, ALINEADOS · ¡CRÚCENLO!, GOLPEANDO, ⚡ NO TOCAR).
- **Sombra de la cadena** en el piso: grosor por tensión, dorada con carga, amarilla
  eléctrica, blanca al golpear.
- Pausa: botón y tecla **R** para reiniciar el jefe actual.
- Cada ayuda se apaga en `CONFIG.ui` o en vivo con `?dev` + F1 (para comparar en playtest).

**Dirección visual acotada**: contorno de tinta (casco invertido, creado una vez por
modelo), piso de pizarra oscura con anillos grabados, HUD de paneles rectos con el
degradado celeste→naranjo como firma; tipografía condensada del sistema (sin fuentes web).
Se arregló el botón de música del título, que heredaba el estilo de los eslabones de vida.

**Arquitectura (convenciones de Dani)**
- `src/gameplay/rules.js`: reglas puras sin three.js/DOM/audio (contacto de cadena,
  multiplicador, TAJO, daño, bloqueo, restricción de largo, vida, fases, elección de
  ataque, amenaza, roles, coordinación, rango). Chain/Boss/Game las usan.
- `src/core/flow.js`: tabla de estados + teclas/botones → acciones. `Game.act()` ejecuta y
  `Game.setState()` rechaza transiciones fuera de la tabla (`console.warn('[flow] …')`).
- `src/core/rng.js`: azar de gameplay con semilla (`?seed=N`, `RNG.seed`) y reloj de menús
  controlable (`Clock`). Partículas siguen con `Math.random` (solo cosmético).
- Ganchos de prueba: `?manual`, `ATADOS.step(n, dt)`, `ATADOS.snapshot()`.
- Números nuevos a `config.js` (`stunMult`, `zapCooldown`, `zapKnock`, `yankCooldown`,
  `reflectDamage`, `input.dashBuffer`). La estela de la embestida ya no crea un objeto por frame.

### Primera validación automatizada (macOS, Node v26.13.0, Chrome local headless)

```
$ npm run check
OK (26 archivos)

$ npm test            # node --test tests/
ℹ tests 32
ℹ pass 32
ℹ fail 0
```

- `tests/rules.test.js` (15): reglas puras y RNG con semilla; color semántico intacto.
- `tests/flow.test.js` (9): tabla de estados, teclas por estado, bloqueo anti-rebote,
  P1/P2 sin teclas compartidas, `Input.read` con dos jugadores a la vez, pad.
- `tests/gameplay.test.js` (8): clases reales con render en stubs. Los 21 ataques
  configurados (3 jefes × 2 fases) terminan solos. La cancelación en cuatro
  momentos comprueba banderas y avisos de suelo antes de la limpieza de respaldo
  del jefe. También verifica fases, muerte única, pool fijo de proyectiles,
  bloqueo, carga y repetición de la secuencia de ataques con la misma semilla.

```
$ npm run smoke       # Chrome headless, file://.../index.html, teclas reales por CDP
  (headless con render por software: ~10-14 fps)
OK: 31/31 comprobaciones · ~105-120 s
```

Recorre: arranque por file:// con WebGL; tecla 1 (2 jugadores); P1 `D` y P2 `←` a la vez;
dash de ambos (Espacio/Enter) sin salir del juego; Esc pausa (nada se mueve) y reanuda;
despertar al jefe caminando con las teclas; tarjeta AMENAZA con su color y rol `¡A TI!`;
medidor BARRIDO; pausa + R reinicia; derrota, Enter inmediato bloqueado, Enter reintenta
con vida llena; jefe derrotado → mejora bloqueada al aparecer → 1 elige → jefe 2; pausa + Q
al título; M música; tecla 2 modo 1 jugador (11 eslabones); práctica del jefe 3 por menú;
`?dev` + F1 panel; `?manual&seed=11` dos corridas idénticas; roles del ancla en pantalla.
Falla ante cualquier error/excepción de consola, `[flow]` inválido o pedido de red que no
sea file://: hubo 0. Capturas en `test-results/` (no versionadas).

Ajustes hechos a partir de las capturas: marca de objetivo más grande (quedaba bajo el
anillo del jugador) y la pista de texto subida para no tapar el medidor.

### Playtest y verificaciones pendientes

- No se jugó con dos personas reales ni con controles físicos (el smoke usa teclado
  sintético y a ~10 fps por render por software; no mide sensación ni rendimiento real).
- Pendiente medir si las ayudas sobrecargan la pantalla en el jefe 3 fase 2 (combo +
  espiral + roles); comparar con `CONFIG.ui` apagado.
- Balance sin cambios de números de jefes/cadena: la dificultad es la de v0.2.
- Firefox y Edge quedan por verificar. La navegación del menú se probó en Chrome a 390 × 740.
- Etapas no configuradas: el workflow `.github/workflows/pages.yml` sigue corriendo solo
  `npm run check` (no `npm test` ni el smoke); no se tocó la configuración de CI.

### Plantilla para la próxima ronda de playtest humano

| Fecha | Jugadores / dispositivo | Jefe y modo | Qué se entendió sin explicar | Qué confundió | Muertes / tiempo | Cambio propuesto |
|---|---|---|---|---|---|---|
| | | | | | | |

## Revisión adversarial independiente — 2026-11-19

- En Chrome headless a 390×740, abrir Práctica hacía inaccesible la parte superior del menú por el centrado en un contenedor desbordado. Se usa centrado seguro: el logo queda a 24 px y se puede desplazar hasta el botón de música (inferior a 740 px). El ancho del botón era correcto con la corrección previa de `button.link`.
- La tarjeta AMENAZA ocupaba entre y=89 y 139 y el TAJO entre y=84 y 120 en la vista angosta: se superponían. TAJO y carga ahora dependen de la altura real del panel de jefe. La tarjeta admite saltos de línea en pantalla angosta. Tras corregirlo, la tarjeta terminaba en y=153 y TAJO empezaba en y=159 en la misma prueba inducida.
- `scripts/smoke.js` usa un perfil temporal exclusivo y lo limpia incluso ante errores; ya no habilita acceso adicional a archivos ni reproducción automática. Añadidas comprobaciones de posición para el menú angosto y TAJO/AMENAZA. No se considera un playtest humano.
- Pasaron `npm run check` (26 archivos), `npm test` (32/32) y el smoke ampliado (33/33 en 109,8 s). Chrome abrió el juego por `file://` con su política normal, sin solicitudes de red ni errores.
- Terra detectó que la prueba original omitía los avisos de suelo cuando se cancelaba con `return()`. El orquestador añadió el registro de avisos vivos al test y reprodujo el fallo durante la embestida. Los avisos se retiran desde `finally` y los rayos pendientes se cancelan si el generador se interrumpe. `Boss.cancelAction()` conserva su limpieza de respaldo. La prueba corregida pasa para los 21 ataques, en cuatro momentos de cancelación.
- El orquestador eliminó estado sin lectores en la cadena y evitó liberar dos veces la geometría que comparten un jefe y su contorno.
- Las pruebas inducidas recorren controles de teclado, cadena, cancelaciones, vida, fases, pausa, reintento y progresión; no sustituyen dos personas jugando ni controles físicos. La combinación eléctrica/espiral conserva ambos consejos mientras dura el generador combinado; los proyectiles pueden permanecer en pantalla después de que deja de generarse la espiral. Sigue pendiente evaluar legibilidad y dificultad con jugadores.
- Revisor independiente: modelo efectivo `gpt-6.1-terra`, razonamiento `medium` (verificado por el orquestador en `turn_context`).

### Evidencia de ejecución

| Rol | Modelo efectivo | Esfuerzo | Evidencia |
| --- | --- | --- | --- |
| Orquestación | `gpt-6.2-sol` | `medium` | `turn_context` de Codex |
| Implementación | `claude-opus-5-5` | `medium` | `system.init.model`, `assistant.message.model` y `result.modelUsage` de Claude Code 2.1.311 |
| Revisión | `gpt-6.1-terra` | `medium` | `turn_context` del subagente de Codex |

Claude Code arrancó con `--model claude-opus-5-5 --effort medium`, con permisos
de edición y pruebas para el worktree. La sesión terminó con `result.subtype=success`.

### Validación final del orquestador

`npm run verify` terminó con código 0. Pasaron la revisión de sintaxis y carga
de 26 scripts, 32 pruebas de Node y las 33 comprobaciones de Chrome (109,1 s).
El navegador abrió `index.html` por `file://`. El smoke registró cero errores
de consola, transiciones inválidas y solicitudes de red. Las capturas y el
detalle de la corrida están en `test-results/`.

Una segunda prueba de Chrome con Playwright, con el contexto sin conexión,
volvió a recorrer el cooperativo con ambos teclados, el reinicio y la práctica
a 390 px. Completó la progresión de los tres jefes, la elección de mejoras y
la pantalla de victoria con los atajos de desarrollo para inducir las derrotas
de los jefes. Terminó con código 0 y sin errores ni solicitudes web.
