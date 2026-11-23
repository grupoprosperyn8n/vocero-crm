# Integración del flujo de siniestros con el chat interno de Vocero — plan v2

Estado: implementación cerrada en el CRM al 23/11 23:15 (build, tipos, lint y suite verdes). Falta el deploy, el ensayo con TEST IA y la evidencia.
Cambio de enfoque respecto de v1: **no se toca n8n**. La integración se endurece del lado del CRM; el nodo espejo sigue como está hasta que Rafael conecte WhatsApp y cambie la topología de despacho.

## 1. Estado actual verificado

La integración 033 existe y está encendida. No se construye de cero.

| Pieza | Dónde | Estado |
|---|---|---|
| Tarjeta de revisión | `src/server/reviews/service.ts:404` (`ingestReviewRequest`) | Publica y refresca; dedupe sólo si hay fila `status='pendiente'`. |
| Salas destino | `src/server/reviews/service.ts:366` | Grupo `REVIEW_GROUP_NAME` + grupos activos de Alertas → Reglas (puede haber más de una copia). |
| Grupo | `src/lib/reviews.ts:29` | `"Alerta de Siniestro"` — ya es el de siniestros. No se renombra. |
| Decisión | `src/app/api/reviews/[recordId]/decide/route.ts` | `POST` autenticado; sólo `approve`/`hold`. |
| Lock | `src/server/reviews/service.ts:583-599` | UPDATE condicional a `decidiendo`; segundo click → 409. |
| Webhook | `src/server/reviews/service.ts:601-607` | Query con `k`, `decision`, `record_id`, `via=chat`; **sólo mira `res.ok`**, timeout 15 s. |
| Marca final | `src/server/reviews/service.ts:619-650` | Escribe `aprobado`/`detenido` sin confirmar qué hizo el flujo. |
| Audio/análisis | `src/server/reviews/assets.ts:84-111` | Frescos de Airtable; el DTO dice explícitamente que no viajan (`src/lib/types.ts:480-481`). |
| Sanitizer | `src/server/internal/chat.ts:190-215` | Lista blanca de campos: lo que no enumere se descarta en silencio. |
| Discriminador de tarjeta | `src/components/internal-chat.tsx:329` | `"mensaje" in payload && "canales" in payload`: si falta `canales`, cae a texto plano sin botones. |
| Índice único | `drizzle/0030_review_requests.sql:28` | Parcial, sólo `status='pendiente'`: un reintento inserta otra fila. |
| Entrada | `src/app/api/reviews/incoming/route.ts:27-37` | `review` exige `recordId` + `mensaje`; el resto opcional. |
| Nodo espejo | n8n `FpqeoQN1JFg7F2tk`, `[CRM] Aviso Revisión` | Encendido; sale en paralelo con `[AT API] Marcar En Revisión Telegram`. |
| Workflow vivo | `versionId ba4060c5-…`, `updatedAt 2026-09-16` | Coincide con el export del 15/09 usado en la revisión. |

Datos reales: `review_request` con 0 filas; 250 denuncias en `EN ESPERA` y 1 ya enviada (`recorJzdwgznjaqcF`, ADR-003:37) que no se toca.

## 2. Resolución de la ronda 1 de goldfish

Tres revisores ciegos dictaminaron **no listo**. Hallazgos verificados contra el código y decisión:

| Hallazgo | Verificación | Decisión |
|---|---|---|
| Los campos nuevos mueren en `sanitizeReviewShare` | `src/server/internal/chat.ts:197-214`, lista blanca | **Aceptado.** No se agregan campos nuevos; sí se garantiza que `canales` nunca falte (default `"Correo al cliente"`). |
| `direccion` no tiene fuente local | No hay tabla de talleres; sólo `EXTRACTOR_CODIGO_TALLER` (ADR-003:25) | **Descartado.** El demo ya incluye la dirección cuando corresponde; agregar un lookup sólo duplica el dato. Se anota como limitación visible, no como bug. |
| `codigoAudio` sobra | `src/lib/types.ts:480-481`; `internal-chat.tsx:699` ya lo pide fresco | **Descartado.** Segundo camino con URL que expira en 2 h. |
| El guard no tiene señal | `decideReview` sólo mira `res.ok` (`service.ts:603-607`) | **Aceptado.** El guard no usa el payload: lee `ESTADO_ENVIO_CLIENTE` en Airtable con `SGSA_AIRTABLE_PAT` (ya configurado en `assets.ts:20`). |
| Reordenar n8n rompe el item de entrada | `Preparar Aprobación` sale a dos ramas; los nodos leen sus campos | **Descartado.** No se reordena: riesgo alto y el guard resuelve la carrera del lado del CRM. |
| Un 200 no prueba ejecución | El webhook no declara `responseMode` | **Aceptado.** Tras el webhook se relee Airtable y se marca `trabado` si el caso no avanzó. |
| Timeout resetea a `pendiente` y puede duplicar el envío | `service.ts:611` | **Aceptado.** Ante timeout no se resetea: queda `decidiendo` con detalle y un barrido lo resuelve releyendo Airtable. |
| Fila clavada en `decidiendo` | Único reset en el catch | **Aceptado.** Barrido por `updatedAt` > 2 min con verificación de estado. |
| `review_request` sin índice único total | `0030:28` | **Aceptado.** Criterio corregido: «una fila viva por registro»; capturar `23505` y devolver la pendiente existente. |
| Cualquiera de una sala copia puede aprobar | `assertRoomMember` sólo membresía (`chat.ts:361-380`) | **Aceptado.** Exigir membresía de la sala **principal** (`row.roomId`), no de una copia. |
| POST sin chequeo de origen | `withAuth` sólo sesión (`api.ts:17-37`) | **Aceptado.** Validar `Origin`/`Sec-Fetch-Site` contra el host de la app. |
| Criterio 4 sin estado portador | Enum `aprobado/detenido/enviado/trabado` (`status/route.ts:25`) | **Aceptado.** «No enviada» se reporta como `trabado` + `detalle` (máx. 300). |
| El ensayo con TEST sin contacto no publica tarjeta | `Filtrar y Normalizar`: `hasRequired = resolution && audioCode && phone && email` | **Aceptado.** Nuevo ensayo: duplicado TEST con datos completos, estado forzado a `EN REVISION TELEGRAM` y **POST manual** al receptor; no pasa por el cron. |
| Nada sale: la única salida viva es el mail | `Payload Final (Aprobado)` → `Restaurar Payload (Para Email)` | **Aceptado.** El ensayo usa un duplicado cuyo `EMAIL`/teléfono se vacían **después** de forzar el estado, para que `can_send` sea falso. |
| Rollback no ejecutable | `ba4060c5` truncado; prod corre `docker compose up -d --build` | **Aceptado.** Snapshot en archivo + `PUT /workflows` + activate + rebuild documentado. |
| Automatizaciones de Airtable no verificadas | ADR-003 las deja como «verificar» | **Aceptado.** Paso previo obligatorio del ensayo: listar automatizaciones de la tabla y confirmar por escrito que ninguna envía. |

## 3. Cambios a implementar (sólo CRM)

### B1 — Tarjeta robusta
- `sanitizeReviewShare`: `canales` siempre string (default `"Correo al cliente"`), para que el discriminador de la tarjeta nunca caiga a texto plano.
- No se agregan campos al DTO ni al zod. No se toca `ChatReviewShareDto`.

### B2 — Guard de estado real (elimina la carrera)
- Nueva función en `src/server/reviews/assets.ts`: `getReviewEnvioEstado(recordId)` → string del campo `ESTADO_ENVIO_CLIENTE` o `null`.
- En `decideReview`, antes del lock: si el estado no es `EN REVISION TELEGRAM` → `409` con mensaje «Todavía no figura en revisión en el sistema; esperá unos segundos», sin tocar la fila. Si Airtable no responde, se permite seguir (degradación: no se bloquea la operación por un tercero caído) y se registra el detalle.

### B3 — Resultado honesto de la decisión
- Tras el webhook OK: releer Airtable hasta 3 veces (1 s). `EN PROCESO DE ENVIO`/`ENVIADO CON EXITO` → `aprobado`. Sigue en `EN REVISION TELEGRAM` o `ERROR DE ENVIO` → `trabado` con `detalle` («el flujo no confirmó el envío»).
- `hold` siempre termina `detenido` (no hay despacho).
- Timeout/abort: **no** resetear a `pendiente` (podría haberse ejecutado); queda `decidiendo` + detalle.
- Barrido `sweepStaleReviewDecisions(organizationId)`: filas `decidiendo` con `updatedAt` > 2 min → relee Airtable y pasa a `aprobado`/`trabado`/`pendiente`. Se invoca en el GET de stats o en el de la lista.

### B4 — Seguridad de la decisión
- `assertRoomMember` sobre `row.roomId` (sala principal), no sobre las copias.
- Validación de origen en el POST de decisión: `Origin`/`Sec-Fetch-Site` del mismo host; si falta el header, se acepta sólo `same-origin` (fetch del cliente).

### B5 — Dedupe concurrente
- `ingestReviewRequest`: capturar violación `23505` del índice parcial y devolver la fila pendiente existente en vez de 500.

## 4. Ensayo (sin despacho, sin tocar n8n)

1. **Previo:** listar automatizaciones de `tbl4570W1T0qGdj8w` y dejar constancia de que ninguna envía correo/WhatsApp por cambio de estado.
2. Duplicar una denuncia como registro TEST (perfil TEST IA), con audio y análisis reales.
3. Forzar en el duplicado `ESTADO_ENVIO_CLIENTE = EN REVISION TELEGRAM` y **vaciar teléfono y email** → `can_send` falso si alguien aprueba.
4. `POST /api/reviews/incoming` con el bearer ya configurado → publica la tarjeta en «Alerta de Siniestro» (no pasa por el cron, no toca el workflow).
5. Verificar tarjeta: mensaje propuesto, análisis, audio, botones.
6. **Detener** desde el chat → Airtable pasa a `DETENIDO PARA REVISION`, `review_request` con `decidedVia=chat`, segundo click → 409.
7. Revertir el estado del duplicado y borrar/archivar la fila de prueba; ninguna denuncia real se aprueba.
8. Evidencia en `odd/evidencia/integracion-siniestros.md`: capturas de la tarjeta, fila de `review_request`, estado en Airtable y `runData` del flujo si se disparó.

El camino de aprobación con despacho real queda para cuando Rafael conecte WhatsApp, como se acordó.

## 5. Orden de despliegue y rollback

- Deploy del CRM **primero** (`docker compose up -d --build`), sin tocar n8n.
- Rollback: `git revert` del commit + rebuild; los cambios son aditivos y compatibles con el receptor viejo.
- Snapshot del workflow vigente a `odd/evidencia/workflow-FpqeoQN1JFg7F2tk-<fecha>.json` antes de cualquier cambio futuro en n8n (no se modifica en esta tanda).

## 6. Criterios de aceptación

1. Una denuncia TEST publica **una tarjeta por sala destino** (grupo + reglas activas) y conserva **una fila viva** en `review_request`.
2. La tarjeta muestra mensaje, análisis y audio reales; `canales` siempre presente.
3. Decidir desde el chat registra `decidedVia=chat` y quién decidió; segundo click → 409.
4. Con el caso fuera de `EN REVISION TELEGRAM`, aprobar devuelve 409 y **no** envía ni cambia el estado.
5. Con el caso en revisión pero sin datos de contacto, aprobar deja `trabado` con detalle y **no** despacha.
6. Telegram sigue publicando su previa y botones igual que hoy.
7. Ningún mensaje sale a un cliente real.

## 7. Fuera de alcance

- Tocar n8n, YCloud o el webhook de aprobación.
- Promover las 250 denuncias en `EN ESPERA`; la única ya enviada no se toca.
- Renombrar el grupo o cambiar `REVIEW_GROUP_NAME`.
- Cambiar el select de Airtable, incluida `EN COLA POR CONTACTO`.
- Enviar correo o WhatsApp a cualquier cliente.

## 8. Estado de implementación y log

- 22/11 20:04 — goldfish ronda 2 (3 revisores ciegos): 1 «se sostiene con correcciones», 2 «no listo». Bloqueantes señalados: el guard se aplicaba también a detener, el timeout se confundía con un fallo definido del webhook, el barrido podía devolver una fila a `pendiente`, faltaba lock antes de postear (tarjetas duplicadas), el permiso debía exigirse sobre la sala principal y faltaba el chequeo de «ya enviado».
- 22/11 20:44 — correcciones aplicadas en 5 archivos (+350/−90): `assets.ts` (`getReviewEnvioEstado`), `service.ts` (guard sólo en aprobar, 503 propagado, timeout sin reabrir, relectura 5×1,5 s, barrido con throttle, advisory lock en la ingesta, hold confirmado contra Airtable), `decide/route.ts` (`sameOrigin`), `messages/route.ts` (barrido al abrir la sala), `AGENTS.md` (recordatorio ODD). B1 descartado: la premisa era falsa, `canales` ya viaja siempre.
- 22/11 22:47 — verificación local: lint 0 errores, build verde, suite completa 677 tests OK / 74 skipped.
- 22/11 22:50 — decisión de Diego: NO tocar ni borrar registros reales de Airtable. Todo ensayo va con el cliente **TEST IA** (`rechYRnw7FzaGjfpA`), **EMPLEADO TEST** (`recTJWHmObfOQZrKT`) y **OFICINA TEST** (`recdCiDqj4KqgIa4d`), que existen para verificar flujos sin alterar las estadísticas. Verificado en lectura: hoy no hay denuncias ligadas a ese cliente ni a esa oficina.
- Corrección al ensayo de §4: `TELEFONO (de CLIENTES)` y `EMAIL (de CLIENTES)` son lookups del cliente (nodo n8n `Normalizar Denuncia Aprobada`), así que no se pueden vaciar en un duplicado sin tocar al cliente real. El ensayo usa el cliente TEST IA, cuyos datos de contacto son propios.
- Pendiente: crear una denuncia TEST con esos tres vínculos y un estado que el cron no procese, publicar la tarjeta a mano, probar el rechazo de aprobar fuera de revisión, detener, verificar el estado en el registro TEST, escribir la evidencia, commitear, desplegar por Coolify y verificar el commit vivo.
- Limitación conocida (histórica, ya resuelta): se probó exigir la decisión sólo en la sala principal, pero la suite 033c define decisión compartida multi-destino. Se revirtió: hoy cualquier sala que recibió la tarjeta puede decidir y la decisión actualiza todas las copias.

### Cierre técnico (23/11)

- Goldfish T1 sobre el diff final: 2 bloqueantes reales. (a) La recuperación del 23505 corría con la transacción ya abortada (Postgres responde 25P02 y no se puede leer ni borrar nada). (b) Las tarjetas se publicaban con `postChatMessage` por otra conexión, fuera de la transacción: un rollback dejaba tarjetas huérfanas y el reintento las duplicaba.
- Corregido: cada ingesta publica y guarda dentro de un savepoint (`tx.transaction`), y `postChatMessage` acepta el ejecutor de la transacción (`db`). Si otra llamada ganó el índice parcial, el savepoint deshace las tarjetas y se devuelve la revisión existente. Menores corregidos: la tarjeta refleja el timeout (antes quedaba «pendiente» con botones que respondían 409), el barrido no afirma «enviado» cuando el estado real es EN PROCESO DE ENVIO, y `x-forwarded-host` tolera lista de proxies.
- B2 del goldfish ronda 2 revertido: la suite 033c exige que decida cualquiera que participe de ALGUNA sala que recibió la tarjeta (decisión compartida multi-destino). Se mantiene ese contrato: las copias de Reglas también habilitan la decisión y actualizan todas las tarjetas. El 403 queda sólo para quien no está en ninguna.
- Sin lectura de Airtable (PAT caído/red): la decisión se registra como aprobada con detalle «no se pudo verificar el estado»; no se afirma «trabado» sin dato. Con lectura disponible, si el flujo no avanzó, la tarjeta muestra «trabado».
- Verificación real contra Postgres de desarrollo (`INTEGRATION_DATABASE_URL`): 10/10 tests de revisión y 7/7 de bandeja/estadísticas, con cero residuo (0 filas `e2e033`). Suite completa 677 OK / 74 skipped, `tsc` limpio, build verde.
