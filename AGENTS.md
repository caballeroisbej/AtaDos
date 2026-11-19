# AGENTS.md — reglas para agentes (Codex, Claude, etc.)

## Proyecto
AtaDos: juego coop local en el navegador. Dos jugadores unidos por una cadena que es su única arma contra jefes.
Stack: HTML + JavaScript plano (scripts globales, sin build ni módulos) + three.js r128 en `vendor/`.
Se juega con doble click en `index.html` (file://), por eso NO usar ES modules ni fetch de archivos locales.

## Estructura
- `src/core/` config (todos los números), util, input, audio
- `src/render/` vfx, telegrafías, modelos, arena
- `src/gameplay/` cadena, jugador, proyectiles, ataques (generadores), jefe
- `src/ui/` HUD y panel de ajuste (`?dev`, F1)
- `src/game.js` loop, estados y flujo
- El orden de `<script>` en `index.html` importa: core -> render -> gameplay -> ui -> game.

## Reglas
1. Todo número de balance va en `src/core/config.js`. Nada de constantes mágicas en gameplay.
2. Un jefe nuevo = entrada nueva en config combinando bloques de `attacks.js`. No código por jefe.
3. Todo ataque es un generador con limpieza en `finally` (puede cancelarse en cualquier momento).
4. Rojo = peligro, azul = refugio, amarillo = eléctrico, dorado = ancla. No cambiar ese código de colores.
5. Pools pre-asignados en VFX y proyectiles: no crear objetos three.js por frame.
6. Antes de terminar una tarea: `npm run check` (sintaxis) y abrir el juego para jugarlo.
7. Commits chicos con mensaje claro; anotar cada ronda de playtest en `docs/ITERACIONES.md`.
8. Assets de terceros solo con licencia compatible y registrados en `CREDITS.md`.
