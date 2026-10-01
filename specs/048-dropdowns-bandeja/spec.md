# 048 — Dropdowns: filtros de la Bandeja (estabilidad y legibilidad)

**Fecha:** 2026-10-01 · **Carril:** ligero · **Estado:** implementado

## Problema (reporte del usuario, verbatim)

> «SIGUE EL PROBLEMA CON LOS DRO DOW DE TODO LOS SELECTORES EJEMPLO EN
> BAMNDEJA DE ENTRADA EN LOS FILTROS Y ASI EN TODAS LAS SECIUONES Y SUB
> SECCIONES MEJORA ESO»

Síntomas previos (FOCO original): «hacen una animación rara al cargar el
dato y aparte a veces como que no lo carga».

## Diagnóstico (medido en dev con CDP/Playwright)

1. **Pills aplastados**: los 3 selects de filtros usaban `min-w-0 flex-1
   truncate` dentro de un contenedor `ml-auto flex` con ancho de contenido
   → nacían en **61 px** (texto cortado; parece "no cargó") y **saltaban a
   127 px** al elegir un valor (la "animación rara al cargar el dato": al
   terminar de cargar los datos, los pills se redistribuían y encogían).
2. **Filtros que se desarman**: las opciones de «Etapa» y «Tema» se
   derivaban del **listado ya filtrado** (`conversations`). Al filtrar por
   empleado, si ese subconjunto no traía etapas/temas, los pills
   DESAPARECÍAN de la barra ("no lo carga").
3. **Opción fantasma**: «Sin topic (N)» se ocultaba si el contador llegaba
   a 0 con la opción seleccionada → select en blanco.

Barrido de los 53 `<select>` del CRM: solo los 3 de la Bandeja tenían el
patrón destructivo; el resto son `w-full` o de ancho contenido (verificado
sin saltos/blank/no-stick en Contacts, Pipeline, Plantillas, Alertas,
Reviews, Ads, Agentes).

## Fix

- `conversation-list.tsx`: pills con `shrink-0 max-w-[11rem]` (ancho estable
  = ancho de la opción más larga; no cambia al elegir ni al cargar), fila
  propia a ancho completo (`basis-full` + `flex-wrap` en el contenedor de la
  barra) para que quepan legibles en la columna de 300–360 px.
- Fuente ESTABLE de opciones: etapas desde `/api/pipeline/stages` (embudo del
  negocio, fetch único en `inbox-client`) + catálogo `TOPIC_LIST` para temas;
  se conservan etapas/temas viejos que sigan apareciendo en la lista y el
  valor activo nunca queda sin opción (guardas).
- «Sin topic (N)» visible mientras esté seleccionada aunque el contador sea 0.

## Verificación

- Dev (Playwright): 3 pills legibles (127/138/176 px), elegir empleado deja
  la barra completa, elegir etapa/tema no cambia anchos, sin saltos.
- Compuertas: `pnpm typecheck && pnpm lint && pnpm test` (659 tests).
- Prod: verificación post-deploy con `verify-048-prod.mjs`.
