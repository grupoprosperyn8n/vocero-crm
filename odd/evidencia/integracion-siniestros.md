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

## Qué queda

- 1 registro TEST en Airtable (`recnJxnBdwmZ0MIS1`, DETENIDO PARA REVISION). No se borra: queda como evidencia y no altera las estadísticas de OFICINA TEST.
- 1 tarjeta en el chat interno, en la sala «Alerta de Siniestro», y 1 fila en `review_request` (aparece como detenido TEST IA en las estadísticas del CRM de los últimos 30 días).
- El contenedor anterior sigue arriba: rollback inmediato disponible desde Coolify si hiciera falta.
