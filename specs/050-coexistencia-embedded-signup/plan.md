# 050 — Plan técnico

## Lo que ya existe (inventario verificado, no supuesto)

| Pieza | Archivo | Estado |
|---|---|---|
| Credenciales del canal (1 por org, cifradas) | `src/server/whatsapp/credentials.ts` | Listo: `saveCredentials`, `clearCredentials`, `markReconnectRequired` |
| Validación token↔número | `src/server/whatsapp/connect.ts` | `testConnection` |
| Suscripción de la app a la WABA | `src/server/whatsapp/connect.ts` | `subscribeAppToWaba` (best-effort, **no verifica campos**) |
| API de conexión manual | `src/app/api/settings/whatsapp/route.ts` | GET/PUT/DELETE |
| Webhook + ruteo por `phone_number_id` | `src/app/api/webhooks/wa/[webhookToken]/route.ts` | Maneja `messages`, `smb_message_echoes`, plantillas |
| **Echo de coexistencia** | `src/server/inbox/ingest.ts` (`processEchoesValue`, `ingestManualEcho`) | **Ya implementado (008)**: saliente `origin='manual'`, dedupe por `wa_message_id`, no abre ventana, pausa IA |
| Contactos BSUID / teléfono opcional | `src/lib/db/schema.ts` (`waIdentity`, `phone`, `waUserId`) | **Ya soportado** |
| Cifrado de secretos | `src/lib/crypto` | AES-256-GCM |

Consecuencia: **el echo no se reimplementa**; lo que falta es el alta por Embedded Signup, la
verificación de suscripción, el disparo del sync inicial y los estados honestos.

## Huecos reales a cubrir

1. No existe flujo de alta automática (ni SDK ni endpoint de canje).
2. `subscribeAppToWaba` no verifica qué campos quedaron suscriptos (el sync depende de eso).
3. No hay `smb_app_data` (sync inicial de 24 h, una sola vez por alta).
4. `meta_credentials` no tiene modo de alta ni índice único de `waba_id`
   (`getCredentialsByWabaId` usa `limit(1)` → eventos de plantillas pueden ir a la org equivocada).
5. El webhook acepta peticiones sin firma cuando `META_APP_SECRET` falta (`isValidSignature` → true).
6. No hay estado «operativo» (hoy `connected` se muestra como éxito aunque no llegue nada).
7. Un conflicto de `phone_number_id` ajeno termina en 500 (23505 no mapeado).
8. No hay log de eventos del alta (Meta lo exige: session logging).

## Archivos

### Nuevos

| Archivo | Responsabilidad |
|---|---|
| `src/server/whatsapp/embedded-signup.ts` | canje del code, resolución WABA↔número, lectura de modo, verificación de suscripción, disparo del sync |
| `src/app/api/settings/whatsapp/embedded-signup/route.ts` | `POST` autenticado (owner) → alta completa o error accionable |
| `src/app/api/settings/whatsapp/embedded-signup/session-log/route.ts` | `POST` de eventos del SDK (allowlist de campos) |
| `src/server/whatsapp/onboarding-log.ts` | persistencia append-only del log del alta |
| `src/components/settings/whatsapp-embedded-signup.tsx` | pre-consentimiento + carga del SDK + botón + estados |
| `drizzle/00XX_*.sql` | migración (columnas + tabla + índice único) |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/lib/db/schema.ts` | `metaCredentials`: `mode`, `operationalAt`; índice único `waba_id`; tabla `whatsapp_onboarding_log` |
| `src/lib/env.ts` | `META_APP_ID`, `META_ES_CONFIG_ID` (opcionales, gate del alta automática) |
| `src/app/api/settings/whatsapp/route.ts` | GET devuelve `mode` y `operationalAt` |
| `src/app/api/webhooks/wa/[webhookToken]/route.ts` | fail-closed cuando la org está en coexistencia y no hay App Secret |
| `src/server/inbox/ingest.ts` | marcar `operationalAt` con el primer evento real (una línea) |
| `src/components/settings/whatsapp-wizard.tsx` | tercera puerta: alta automática (si está configurada) |

## Orden de implementación

1. **Modelo**: schema + migración (columnas, tabla de log, índice único con chequeo de duplicados).
2. **Env + gates**: `META_APP_ID`, `META_ES_CONFIG_ID`; helper `isEmbeddedSignupConfigured()`.
3. **Servidor**: `embedded-signup.ts` (canje → verificación → modo → suscripción → sync).
4. **Endpoint**: `POST /api/settings/whatsapp/embedded-signup` con todos los errores mapeados
   (400 token en body, 401 sin sesión, 409 número/WABA de otra org, 422 ids que no coinciden,
   424 Meta sin permiso, 503 Meta caída).
5. **Log del alta** (tabla + allowlist) y `session-log` endpoint.
6. **Webhook fail-closed**.
7. **Estado operativo** (`operationalAt` en el primer evento real).
8. **UI**: pre-consentimiento, checklist, carga del SDK v4, listener blindado, estados.
9. **Tests unitarios**: canje, resolución de modo, mapeo de errores, allowlist del log, listener
   (lógica pura), índice único.
10. **Gates**: `pnpm typecheck && pnpm lint && pnpm test`; después build.

## Decisiones de implementación

- **Una transacción por alta**: pre-chequeo de pertenencia (sin scope, solo para detectar conflicto)
  → canje → verificación → escritura. El `pg_advisory_xact_lock(hashtext(org))` serializa dos altas
  simultáneas de la misma organización.
- **No se revoca el token perdedor** (requiere permiso de app sobre el token ajeno): se registra en
  el log del alta para diagnóstico. Se documenta como limitación conocida.
- **`smb_app_data` se dispara después de verificar la suscripción**, en dos llamadas separadas
  (`smb_app_state_sync`, `history`), cada una con su resultado en el log.
- **Idempotencia del alta**: si ya hay credenciales del mismo `phone_number_id`, se actualiza la fila
  y no se repite el sync (que es de una sola vez) — se marca `sync_already_done` en el log.
- **UI sin dependencias nuevas**: el SDK de Meta se inyecta con un `<script src="https://connect.facebook.net/en_US/sdk.js">`
  cargado al abrir el bloque de alta (lazy), no en el layout global.
- **El listener** compara `event.origin` contra allowlist, `event.source === popupRef.current` y
  `event.data.type === 'WA_EMBEDDED_SIGNUP'`; sin los tres, ignora.

## Riesgos técnicos

- El payload del evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` trae solo `waba_id`: el
  `phone_number_id` se resuelve con `GET /{waba}/phone_numbers` (se toma el único número, o se pide
  elegir si hay más de uno — v1: si hay más de uno, se usa el que el negocio verificó en el diálogo
  cuando viene en el evento; si no viene, error accionable).
- `code` es de un solo uso: si falla después del canje, se informa y se pide reabrir el diálogo.
