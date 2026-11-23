# Evidencia — integración siniestros ↔ chat interno (ensayo en producción)

Fecha: 23/11/2026, 23:30 (America/Argentina/Buenos_Aires)
Commit desplegado: `3371589` — verificado por `GET https://vocero.sistemasagenticos.cloud/api/health`
Respuesta del health: `{"ok":true,"version":"1.3.0","commit":"3371589","uptime":70,"node":"v22.23.5"}`
Deploy: Coolify, app `h5tyzu5np5i8g4efn06n0yxo`, deployment `twd6lmuw7tryefh6cdyyjjxi`, estado `finished`.
Contenedor nuevo: `h5tyzu5np5i8g4efn06n0yxo-20261123T021800` (healthy). El contenedor anterior quedó arriba para rollback.

## Registro de prueba (Airtable)

Se creó **un** registro nuevo, marcado TEST, sin tocar ni borrar ninguna denuncia existente:

- ID: `recnJxnBdwmZ0MIS1` (tabla `tbl4570W1T0qGdj8w`)
- CLIENTE: TEST IA (`rechYRnw7FzaGjfpA`)
- OFICINAS: OFICINA TEST (`recdCiDqj4KqgIa4d`)
- ATENDIDO X y Responsable del seguimiento: EMPLEADO TEST (`recTJWHmObfOQZrKT`)
- ESTADO_ENVIO_CLIENTE inicial: `PENDIENTE APROBACION` (el cron no lo procesa)
- FECHA DEL SINIESTRO: 2026-11-23
- Nota: el cliente TEST IA sigue apuntando a su empleado original; no se modificó su ficha.

## 1) Publicación de la tarjeta

`POST /api/reviews/incoming` con `kind=review`, `recordId=recnJxnBdwmZ0MIS1`, cliente «TEST IA (prueba)», canales «Email + WhatsApp», mensaje demo marcado NO ENVIAR.

Respuesta: `200 {"ok":true,"roomId":"chtr_tx1fwkcpr0ovurdp7c0o","messageId":"chms_vabvfvickq0lkvl6ai6b","duplicate":false}`

Verificación en la base de producción:

```
room|chtr_tx1fwkcpr0ovurdp7c0o|Alerta de Siniestro|group
msg|chms_vabvfvickq0lkvl6ai6b|chtr_tx1fwkcpr0ovurdp7c0o|review|SGSA | Pendiente de aprobación — Registro recnJxnBdwmZ0MIS1|pendiente|TEST IA (prueba)
rr|recnJxnBdwmZ0MIS1|pendiente|chtr_tx1fwkcpr0ovurdp7c0o|chms_vabvfvickq0lkvl6ai6b|1
members|9
```

Una sola tarjeta, una sola entrega, en la sala «Alerta de Siniestro» con sus 9 miembros.

## 2) Guard de estado (aprobar fuera de revisión)

`POST /api/reviews/recnJxnBdwmZ0MIS1/decide {"decision":"approve"}` con sesión de dueño:

```
decide_http=409
{"error":{"code":"not_in_review","message":"Todavía no figura en revisión en el sistema; esperá unos segundos"}}
```

El webhook no se disparó y el registro TEST siguió en `PENDIENTE APROBACION`.

## 3) Detener desde el chat (camino completo)

Se cambió **solo el registro TEST** a `EN REVISION TELEGRAM` (simula el paso del flujo) y se envió:

`POST /api/reviews/recnJxnBdwmZ0MIS1/decide {"decision":"hold"}`

Respuesta: `200 {"ok":true,"status":"detenido","via":"chat"}`

Estado real en Airtable después del webhook (lo escribió n8n):

```
estado= DETENIDO PARA REVISION
```

Fila y tarjeta en el CRM:

```
rr|detenido|chat|3AJRCrOn52gaFZEUItpxJhCNe2LqEseG|detenido|No se enviaron WhatsApp ni email. Para relanzar: ESTADO_ENVIO_CLIENTE -> REINTENTO AUTORIZADO.|Diego Lopez
msg|detenido|🛑 SGSA | Detenido — Registro recnJxnBdwmZ0MIS1
```

El flujo de n8n también envió su aviso normal al grupo de monitoreo de Telegram («Envío detenido para revisión», registro `recnJxnBdwmZ0MIS1`).

## 4) Segundo click

`POST .../decide {"decision":"hold"}` de nuevo:

```
second_http=409
{"error":{"code":"already_decided","message":"Esta revisión ya no está pendiente"}}
```

No hubo segundo webhook ni segundo envío.

## 5) Adjuntos (audio y análisis)

Sobre el registro TEST, las rutas responden correctamente al permiso y a la existencia de revisión, y avisan que el registro sintético no tiene adjuntos:

```
audio    http=404 {"error":{"code":"not_found","message":"El registro no tiene audio asociado"}}
analisis http=404 {"error":{"code":"not_found","message":"El registro no tiene análisis IA asociado"}}
```

El registro TEST se creó sin AGENTE 2 ni audio del flujo, así que la tarjeta muestra el mensaje demo pero no reproductor ni análisis. Es la única parte del criterio 2 que no se pudo ejercitar con datos sintéticos sin copiar adjuntos de un caso real.

## 6) Aviso de detención en Telegram: bug corregido

El aviso que llegó al grupo decía «Registro: undefined». La causa: el nodo `[TG] Avisar Detenido` leía `$json.record_id` después del PATCH a Airtable, y la respuesta del PATCH no trae ese campo. Se cambió a `$('Validar Aprobación Telegram').first().json.record_id`, se guardó y se reactivó el workflow `FpqeoQN1JFg7F2tk` (activo, actualizado 23/11 02:37Z).

Verificación con una ejecución real (393374, `success`):

```
🛑 SGSA | Envío detenido para revisión
Registro: recnJxnBdwmZ0MIS1
No se enviaron WhatsApp ni email.
Cuando el caso esté corregido, cambiá ESTADO_ENVIO_CLIENTE a REINTENTO AUTORIZADO para relanzarlo.
```

## 7) Origen de los datos de la tarjeta (paridad con Telegram)

La tarjeta no inventa contenido: pide a Airtable lo mismo que usa el flujo para el mensaje de Telegram.

- Texto principal: campo que el flujo manda como `client_summary_text`.
- Documento (.txt): campo `CULPABILIDAD IA` (el mismo `analysis_full_text` que viaja a Telegram).
- Audio: `EXTRACTOR_CODIGO_AUDIO` → `BIBLIOTECA_AUDIOS` (`CODIGO_ID` → `ARCHIVO_AUDIO`), exactamente el mismo `audio_code` que usa el nodo `[AT API] Buscar Audio` del flujo.

Por eso la tarjeta TEST no muestra audio ni documento: el registro sintético no tiene `CULPABILIDAD IA` (es un campo aiText que depende de los datos del caso) ni código de audio. Un caso real que llega a revisión sí los tiene, y la tarjeta los sirve frescos.

## 8) Estado de la tarjeta TEST

La tarjeta quedó en `detenido` porque el ensayo probó la detención. Los botones «Aprobar envío» y «Detener / revisar» solo se muestran mientras la revisión está `pendiente`; al decidir, la tarjeta pasa a mostrar el resultado y el decisor. No es un faltante de la UI.


## 9) Clasificación IA verificada en los dos sentidos

Se completó el registro TEST con todos los campos que leen los dos agentes de Airtable y se corrieron dos casos:

- **Caso A — alcance trasero recibido** (`recnJxnBdwmZ0MIS1`): asegurado detenido en verde, embestido desde atrás. Resultado en ~10 s: `CLASIFICACIÓN: SIN LESIONES`, `CULPABILIDAD: NO CULPABLE A(ASEGURADO)`, 0% / 100% (Rama A, Ley 24.449 art. 43). `AGENTE 2`: `CODIGO_FINAL: AUDIO 1A`, `CODIGO_TALLER: AUDIO T8`, taller Centro ROSARIO.
- **Caso B — impacto frontal propio** (registro TEST temporal, ya borrado): asegurado que no frena y embiste al vehículo detenido en rojo. Resultado: `CULPABILIDAD: CULPABLE A(ASEGURADO)`, 75% / 25% (Rama C). `AGENTE 2`: `CODIGO_FINAL: AUDIO 1`, `CODIGO_TALLER: AUDIO T8`.

Los dos dictámenes siguen la lógica determinística del prompt v4.7: Rama A (parte trasera) da 0/100; Rama C (parte delantera) da 75/25 por defecto, y sólo da 7/93 si el campo de semáforos trae verde para A y rojo para B.

Observación de entrada: `HABIA SEMAFOROS` es un multi-select sin atribución por conductor. Si se carga sólo "ROJO", Rama C no puede aplicar el caso verde/rojo y cae en el default 75/25. Para que el dictamen fino funcione, el semáforo tiene que cargarse con el color que tenía cada parte (o explicitarse en el relato).

## 10) Campos que necesitan los agentes

Clasificador (`CULPABILIDAD IA`), 20 campos: CLASIFICACIÓN, RELATOS DEL HECHO, LESION MORTAL, DESCRIPCIÓN DE LESIONES, TRASLADO POR MEDIOS PROPIOS, MEDIO DE TRASLADO, ESTA INTERNADO, ESTADO DEL TIEMPO, ESTADO DE CALZADA, TIPO DE CALLE, HUBO IMPACTO, PARTES AFECTADAS, SENTIDO DE CIRCULACION, SENTIDO CIRCULACIÓN DEL OTRO VEHICULO, SEÑALES DE TRANSITO, HABIA SEMAFOROS, LOCALIDAD / PROV. / PAIS, CLASIFICACIÓN DEL TERCERO (TER 1), CLASIFICACIÓN DEL TERCERO (TER 2), ALCOHOLEMIA DEL CONDUCTOR.

Gestor (`AGENTE 2: GESTOR DE PROTOCOLO`): CULPABILIDAD (se carga con el dictamen), CULPABILIDAD IA, COBERTURA (sale de la póliza linkeada), COMPAÑIA DE SEGURO (TER 1/2), CLASIFICACIÓN DEL TERCERO (TER 1/2) y LOCALIDAD. Sin póliza linkeada, COBERTURA queda vacía y el gestor no corre (`emptyDependency`).

## 11) La tarjeta completa, en producción

Con el registro TEST completo, el flujo real (cron) lo tomó de `PENDIENTE APROBACION`, lo pasó a `EN REVISION TELEGRAM` y publicó la tarjeta `chms_dy42secirbaqlich6m0k` en «Alerta de Siniestro»:

- estado `pendiente` (botones Aprobar / Detener activos),
- mensaje real compuesto por el flujo (1927 caracteres, misma estructura que el Telegram de referencia: saludo, parecer, 0/100, resumen, evidencia, próximos pasos),
- `GET /api/reviews/recnJxnBdwmZ0MIS1/analisis` → 200, 1705 bytes de texto,
- `GET /api/reviews/recnJxnBdwmZ0MIS1/audio` → 200, 559298 bytes, audio/mpeg (`Audio1Acoberturastodoriesgo.mp3`).

## Qué queda

- 1 registro TEST en Airtable (`recnJxnBdwmZ0MIS1`, EN REVISION TELEGRAM, con clasificación IA real y audio `AUDIO 1A`). No se borra: queda como evidencia y no altera las estadísticas de OFICINA TEST.
- 1 tarjeta pendiente en el chat interno (`chms_dy42secirbaqlich6m0k`, sala «Alerta de Siniestro») y 1 fila en `review_request` (aparece como TEST IA en las estadísticas del CRM de los últimos 30 días). Se puede aprobar o detener desde ahí; aprobar dispara el mismo webhook que Telegram.
- El contenedor anterior sigue arriba: rollback inmediato disponible desde Coolify si hiciera falta.
