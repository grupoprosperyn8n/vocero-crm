# 050 — Tareas

Estado durable: si se corta el contexto, se reanuda desde acá.
Marcado el 2026-11-20 tras implementar el camino completo; lo que quedó abierto
está dicho explícitamente, no dado por hecho.

## T1 — Modelo de datos
- [x] `metaCredentials`: columna `mode` (`manual` | `coexistence`, default `manual`) y
      `operationalAt` (timestamp null).
- [x] Índice único `meta_credentials_waba_uq` sobre `waba_id`, con chequeo previo de duplicados
      (bloque `DO $$` en la migración: si hay filas repetidas falla con mensaje claro).
- [x] Tabla `whatsapp_onboarding_log` (append-only) con índice `(organization_id, created_at)`.
- [x] `pnpm db:generate` → `drizzle/0048_left_salo.sql`, revisada a mano.
- [ ] Migración aplicada en la base de desarrollo: **pendiente** — esta máquina no tiene
      Postgres arriba ni `DATABASE_URL` en `.env`; corre en el deploy (`pnpm db:migrate`).
- Verificación: `pnpm typecheck` en verde ✓.

## T2 — Configuración
- [x] `src/lib/env.ts`: `META_APP_ID`, `META_ES_CONFIG_ID`, `META_APP_SECRET`,
      `META_REGISTER_PIN` (6 dígitos, opcional), `META_GRAPH_API_VERSION` (default v25.0).
- [x] Helper `isEmbeddedSignupConfigured()` (app id + app secret + config id).
- Verificación: `GET /api/settings/whatsapp` devuelve `embeddedSignup.enabled` ✓.

## T3 — Servidor: canje y verificación
- [x] `exchangeCodeForToken(code)` → `GET /oauth/access_token` sin token previo
      (`graphRequestPublic`, misma base URL y mismo `MetaApiError`).
- [x] `resolveAssets({ token, wabaIdHint, phoneNumberIdHint })` con `ids_mismatch`,
      `no_number` y `ambiguous_number`.
- [x] `readPhoneInfo(phoneNumberId, token)` → `(is_on_biz_app=true && platform_type=CLOUD_API)`
      ⇒ coexistencia; cualquier otra combinación ⇒ alta estándar.
- [x] Alta estándar: `registerNumber` con PIN; coexistencia: `/register` NUNCA se llama.
- Verificación: `tests/unit/embedded-signup-050.test.ts` (modos y errores) ✓.

## T4 — Suscripción y sync inicial
- [x] `ensureSubscribed(wabaId, token)` → POST `subscribed_apps` + GET de confirmación
      (falla con `subscription_failed` si la app no aparece).
- [x] Orden garantizado: si la suscripción no se confirma, el sync NO se pide (404/424 al cliente).
- [x] `requestInitialSync(phoneNumberId, token, syncType)` para `smb_app_state_sync` y `history`,
      guardando `request_id` y tolerando `2593109` como "declinado" (no como fallo).
- [ ] Verificación de los CAMPOS del webhook (`messages`, `account_update`, `history`,
      `smb_app_state_sync`, `smb_message_echoes`) por API: **no es posible por API**, se configura
      en el panel de la app. Queda como paso manual del deploy (ver plan.md).
- Verificación: tests de confirmación y de orden ✓.

## T5 — Endpoint de alta
- [x] `POST /api/settings/whatsapp/embedded-signup` con `withAuth` + `connectionsGate`.
- [x] Zod `.strict()`: rechaza `token`/`access_token` en el body.
- [x] Conflicto multi-tenant por número Y por WABA → 409 sin nombrar la organización ajena.
- [x] Errores mapeados: 422 (ids/código), 424 (suscripción/registro), 503 (no configurado o Meta
      caída), 502 (resto).
- [x] Éxito: `{ ok, mode, displayPhoneNumber, status, operational }`.
- [ ] `pg_advisory_xact_lock` para serializar altas simultáneas: **no implementado**. El índice
      único por organización y por número evita duplicados; la carrera deja un token huérfano que
      Meta expira solo. Se puede agregar si aparecen altas concurrentes reales.
- [ ] Tests de ruta con Meta mockeada: **pendiente** (hoy hay tests del módulo, no del handler).

## T6 — Log del alta y session logging
- [x] `onboarding-log.ts` con allowlist campo por campo (nunca code, token, teléfono completo,
      `verified_name` ni `err.message`).
- [x] `POST /api/settings/whatsapp/embedded-signup/session-log` con `.strict()` (solo `event`,
      `result`, `errorCode`).
- [ ] Test que falla si el objeto logueado contiene `token|code|secret`: **pendiente**.

## T7 — Webhook fail-closed
- [x] Sin `META_APP_SECRET`, los eventos `messages` y `smb_message_echoes` se rechazan con 401
      en vez de procesarse sin verificar; el resto del payload sigue igual.
- [ ] Test de ruta con y sin secreto: **pendiente**.

## T8 — Estado operativo
- [x] `markOperational(organizationId)` en el primer evento real (mensaje o echo), idempotente
      (`UPDATE ... WHERE operational_at IS NULL`).
- [x] `GET /api/settings/whatsapp` devuelve `mode` y `operationalAt`.
- [ ] `lastMessageAt` no se expone: `operationalAt` ya distingue "vinculado" de "recibiendo" y
      no hizo falta una segunda fuente.
- [ ] Test unitario del marcado idempotente: **pendiente** (necesita base).

## T9 — UI
- [x] `whatsapp-embedded-signup.tsx`: pre-consentimiento en dos columnas (qué sigue / qué se apaga),
      checklist, checkbox obligatorio, botón deshabilitado hasta aceptar.
- [x] `FB.login` con `config_id`, `response_type: 'code'`, `override_default_response_type: true`,
      `extras: { feature: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3', version: 'v4' }`.
- [x] Listener con allowlist de origen + `event.source === popup` + `type === 'WA_EMBEDDED_SIGNUP'`;
      FINISH, CANCEL y ERROR manejados.
- [x] Estados: intro, esperando Meta, guardando, conectado (con etiqueta de coexistencia),
      error accionable, y aviso cuando la instancia no tiene el alta automática.
- [x] Banner de conexión: "Operativo" con fecha del primer mensaje, o "Vinculado" con instrucción
      de prueba.
- [x] El asistente manual 043 queda accesible debajo, sin cambios.
- [ ] Recorrido real en navegador con Meta: **imposible hasta que la app esté aprobada como Tech
      Provider** (ventana de 48 h). Hoy solo se puede probar el camino de error.

## T10 — Gates y cierre
- [x] `pnpm typecheck` en verde.
- [x] `pnpm lint`: 0 errores (1 warning preexistente en `app-nav.tsx`).
- [x] `pnpm test`: 86 archivos, 677 tests en verde (18 nuevos).
- [x] `pnpm build` sin errores (compiló las rutas nuevas: `embedded-signup/route.js` y `session-log/route.js`).
- [x] Actualizar Engram (obs 6969) y la skill `whatsapp-qr-connection` con lo aprendido.
