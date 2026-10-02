# 049 — Desplegables propios (sin popup nativo) en TODO el CRM

**Fecha:** 2026-10-01 · **Carril:** normal · **Estado:** implementado (verificando)

## Problema (reporte del usuario, verbatim)

> «SIGUE PASANDO EN TODOS EL TEMA ES CUANDO LO ABRIS Y EN ALGUNO SI TOCAS DENTRO PERO NO EXACTO EN LA FLECHITA COLAPSABLE SE ABRE COMPLETO SI NO HACE COMO UN FLASHEO Y SE PONE CORTADO LA INFO QUE DESPLEGA O UNA PUNTA NADA MAS FALLA»

## Causa raíz

El CRM usaba `<select>` nativos. **El popup del `<select>` nativo de Chrome en Linux/Wayland se abre cortado, fuera de lugar o parpadeando** (bug de Chromium `issues.chromium.org/358041219` y variantes: render del popup en top-left / tamaño incorrecto con escalado fraccional). No es CSS del CRM: es la capa nativa del navegador, fuera de nuestro control. La única solución completa es dibujar el desplegable dentro de la página.

## Solución

Componente propio `src/components/ui/select.tsx` (`<Select>`):

- Botón disparador (`role="combobox"`, `aria-expanded`, `aria-haspopup`, `aria-activedescendant`).
- Menú en **portal a `document.body`** con `position: fixed` → **no lo recorta ningún `overflow-hidden`** ni contenedor.
- **Posición calculada + flip**: si no entra abajo, se abre arriba; alineado a la izquierda del trigger y clamp a 8px del borde; `max-height` con scroll.
- **Se re-acompaña al hacer scroll/resize** (no queda flotando).
- **Nunca "cortado"**: al ser DOM propio, se puede medir y garantizar que el rect del menú queda dentro del viewport (verificado por e2e).
- Teclado completo: ↑/↓/Inicio/Fin/Enter/Espacio/Escape/Tab + typeahead (escribir salta a la opción).
- Clic afuera cierra; `onMouseDown` de opciones con `preventDefault` (foco se queda en el trigger).
- Grupos (ex `<optgroup>`) vía `option.group` con subtítulo.
- Opciones deshabilitadas (ej. agentes sin headless) soportadas.
- `buttonProps` para conservar atributos `data-*` de pruebas (`data-new-alert`).

## Alcance (53 `<select>` reemplazados · 30 archivos)

Bandeja (3 pills + clasificador + plantillas), Contactos (filtro etapa, nueva conversación, nuevo contacto), Pipeline (tareas ×2, prioridad, etapas, lista, flujo), Ajustes (plantillas ×4, asistente-wsp, equipo, propuestas, IA, marca, agentes ×1, ads), Alertas ×3, Reviews, Dashboard Management (exec ×6 incl. equipo/sucursal, constructor ×6, propuestas ×3, propuesta-post ×3, followup ×2, constructor-hub ×2, insight-vault, widgets).

Detalles conservados: valores huérfanos visibles («(no está en la lista)», «Sin topic»), condicionales de rol (option admin solo owner), `disabled` + «Cargando…» del constructor, títulos nativos (`title=`), etiquetas y `id` (asociación con `<label htmlFor>`), ancho de pills de la Bandeja (`max-w-[11rem] shrink-0`).

## Verificación

- Compuertas: `pnpm typecheck` ✓ · `pnpm lint` ✓ (1 warning pre-existente) · `pnpm test` **659 pasan**.
- E2E dev `.tmp-probe-selects5.mjs` (`scripts/e2e-049-dev.mjs`): por sección abre TODOS los desplegables y valida rect del menú dentro del viewport; teclado (ArrowDown abre, Escape cierra), clic afuera cierra; Inbox: elegir opción no desarma la barra; móvil 390.
- PROD: `scripts/verify-049-prod.mjs` — mismo barrido en producción.
