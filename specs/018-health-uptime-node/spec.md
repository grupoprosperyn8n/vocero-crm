# Feature Specification: /api/health — uptime del proceso y versión de Node

**Feature Branch**: `main` (cambio directo, carril ligero)

**Created**: 2026-09-08

**Status**: Implemented

## Resumen

`GET /api/health` hoy responde `{ ok, version, commit? }` con el estado de la
DB y la identidad del build. Se le agregan dos campos de diagnóstico del
proceso que lo sirve, sin tocar el formato existente:

1. `uptime`: segundos (entero) que lleva corriendo el proceso Node que
   responde. Distingue en un vistazo un contenedor recién reiniciado de uno
   con semanas de vida — útil cuando el deploy de Coolify "no toma" y la
   sospecha es que el container viejo sigue sirviendo.
2. `node`: versión de Node del runtime (`process.version`, p. ej. `v22.23.2`).

## Comportamiento observable

- `GET /api/health` con DB disponible responde 200 con JSON:
  `{ ok: true, version: <semver>, commit: <7 chars si se resolvió>, uptime: <int ≥ 0>, node: "<vX.Y.Z>" }`
  — los campos previos conservan nombre, tipo y semántica; los nuevos solo se
  agregan.
- Sin `commit` resoluble (build sin SOURCE_COMMIT), la respuesta sigue
  omitiendo la clave `commit` (condicional existente intacto).
- DB caída: respuesta 503 `{ ok: false, error: {...} }` sin cambios.

## Fuera de alcance

- No toca contrato publicado (`/api/bot/*`, webhooks, SSE, DTOs externos) ni
  modelo de datos: no hay migración.
- No se agrega la versión de Node al caso de error (503): su forma la
  consumen monitores existentes y no cambia.
