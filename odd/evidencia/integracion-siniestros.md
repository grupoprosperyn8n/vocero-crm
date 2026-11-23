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

## 12) Corrección jurídica de los prompts de Airtable (v4.9 / v7.2)

Fecha: 2026-11-23. Los dos prompts se publicaron por la UI de Airtable (la API REST no permite editar `options.prompt` de un campo AI Text) conservando todos los tokens de campo existentes. La tarjeta de la sección 11 se generó con los prompts v4.7: no refleja el comportamiento nuevo.

### 12.1 Clasificador `CULPABILIDAD IA` (`fldZ9duQSIRrQ5tM3`) — v4.9

- El relato se trata como **versión unilateral de A**, no como hecho probado. El dictamen pasa a `RESPONSABILIDAD PROBABLE (SEGÚN RELATO DE A)` con escenario principal y alternativo.
- `CERTEZA: ALTA` sólo con versión de B transcripta como declaración de B + acta/croquis/fotos/testigos/cámaras/pericia + datos del tercero. `MEDIA` con evidencia externa pero sin versión de B. `BAJA` sólo con relato y campos del formulario (los campos estructurados no son prueba).
- La frase "el tercero reconoció" dentro del relato de A no es versión de B.
- Alcance trasero: art. 48 inc. g (distancia prudente) y art. 50 (velocidad precautoria) de la Ley 24.449; presunción del embistente. No se cita art. 48 inc. d para la distracción del tercero (es frenada brusca).
- Cierre legal: reserva de verosimilitud, denuncia al asegurador (Ley 17.418, arts. 46 y 47), SSN 0800-666-8400 / WhatsApp 54-11-3910-1010 / TAD, y aclaración de que el informe es para el asegurado y puede ser leído por terceros.
- Normativa indicada: Ley 24.449 (texto actualizado), Ley 27.714 (alcohol cero), CCyC 1757/1758, Ley 17.418 y normativa SSN.

### 12.2 Gestor `AGENTE 2: GESTOR DE PROTOCOLO` (`fldv2ubYj9b8NA7Gx`) — v7.2

- **Sin versión de B no se envía audio automático**: `ESTADO: COMPLEJO`, `CODIGO_FINAL: DERIVAR A HUMANO`, `ADVERTENCIAS: "Sin versión de B; revisión humana antes de enviar"`, `NOTA_ACCION: "Solicitar la versión de B antes de enviar."`. Aplica aunque la certeza sea MEDIA.
- Con versión de B y evidencia: puede proponer `AUDIO 1`/`AUDIO 1A`; la tarjeta de revisión sigue siendo el gate humano.
- `CERTEZA: BAJA` siempre deriva a humano.
- Taller: localidad sólo "Rosario", sin OESTE/SUR/CENTRO/NORTE/FISHERTON/MAGNASCO → `CODIGO_TALLER: N/A`, `INFO_TALLER: "Consultar zona; no asignar taller"`. No se asigna T4/T5/T8/T9 por la palabra Rosario.
- Catálogos sin `AUDIO A2` (no existe en la biblioteca) y sin `AUDIO T8` (sin archivo); `AUDIO 3` marcado como duplicado de `AUDIO A3`; `AUDIO 6` se creó como preliminar y se borró: no existe en la biblioteca y el catálogo no lo usa.
- Compañías separadas en LISTA A (serias) y LISTA B (conflictivas); coberturas `TR, C, C1, C2, C2FULL, TODO RIESGO, TERCEROS COMPLETO PREMIUM, D, D1, TR CON FRANQUICIA`.

### 12.3 Prueba de aceptación

Registros TEST IA / OFICINA TEST / EMPLEADO TEST, todos borrados después de leer el resultado. No se tocaron registros reales.

- **Caso G — con versión de B, no culpable, TR**: `CERTEZA: ALTA`; `NO CULPABLE A(ASEGURADO)`; 0/100; `AUDIO 1A`; `CODIGO_TALLER: N/A`; `INFO_TALLER: "Consultar zona; no asignar taller"`; `ADVERTENCIAS: Ninguna`. Cita art. 48 inc. g y art. 50.
- **Caso H — sin versión de B, culpable, TR**: `CERTEZA: MEDIA`; `CULPABLE A(ASEGURADO)`; 100/0; `DERIVAR A HUMANO`; `CODIGO_TALLER: N/A`; `ADVERTENCIAS: "Sin versión de B; revisión humana antes de enviar"`; `NOTA_ACCION: "Solicitar la versión de B antes de enviar."`. Cita art. 48 inc. g y art. 50.
- **Caso I — sólo relato, sin prueba externa**: `CERTEZA: BAJA`; `NO CULPABLE A(ASEGURADO)` provisional 0/100; `DERIVAR A HUMANO`; `CODIGO_TALLER: N/A`; `INFO_TALLER: "Consultar zona; no asignar taller"`; advertencia de revisión humana. Cita art. 48 inc. g y art. 50.

Corrección de la sección 9: el art. 43 (giros y rotondas) no aplica al alcance trasero; el fundamento es art. 48 inc. g y art. 50, con presunción del embistente. El 75/25 era un default del prompt v4.7, no la regla legal.

### 12.4 Pendientes

- `AUDIO 6` no existe: el placeholder preliminar se borró. Si se quiere un audio 6, crearlo con el archivo. `AUDIO 3` y `AUDIO T8` quedaron con descripción de advertencia; si se prefiere, se revierten.
- La versión de B se busca en el relato/acta; no es un campo separado. Si se quiere determinismo total, crear un campo largo `VERSIÓN DE B` y referenciarlo en ambos prompts.
- Regenerar la tarjeta de demostración si se quiere mostrar el comportamiento v4.9/v7.2; la tarjeta actual `chms_dy42secirbaqlich6m0k` conserva el análisis v4.7.

## 13) Corrección: la versión A es el único relato (v5.0 / v7.3) y demo de audio + taller

Fecha: 2026-11-23. El usuario aclaró: «SOLO VERSION A SIEMPRE ES SOLO EL RELATO DEL CLIENTE». Se reemplazó el criterio de §12: ya no se exige ni se busca una versión de B independiente. El clasificador y el gestor se republicaron por la UI de Airtable conservando todos los tokens.

### 13.1 Clasificador `CULPABILIDAD IA` — v5.0

- El único insumo es el relato de A (el cliente) más la evidencia externa que A aporta. No hay versión de B ni se requiere.
- `CERTEZA: ALTA` = relato de A + acta policial, croquis, fotos, testigos, cámaras o pericia + datos del tercero. `MEDIA` = denuncia o fotos sin acta/croquis/testigos/cámaras/pericia, o datos incompletos. `BAJA` = sólo relato y campos, sin evidencia externa.
- El dictamen sigue siendo `RESPONSABILIDAD PROBABLE (SEGÚN RELATO DE A)`, con escenario principal y alternativo; el cierre legal mantiene la reserva de verosimilitud, la denuncia Ley 17.418 arts. 46 y 47 y el canal SSN.
- Alcance trasero: art. 48 inc. g (distancia de seguridad) y art. 50 (velocidad precautoria) de la Ley 24.449; no se cita art. 48 inc. d para la distracción del tercero.
- Texto publicado: 27.713 caracteres, 26 ops, 24 tokens de campo. Verificado por `/meta`: `DEFINITIVO v5.0`, `El único relato disponible es el de A`, `CERTEZA ALTA: relato de A`; ya no aparece `ALTA sólo si hay versión de B`.

### 13.2 Gestor `AGENTE 2: GESTOR DE PROTOCOLO` — v7.3

- No deriva por falta de versión de B. `CERTEZA: BAJA` (sólo relato, sin evidencia) deriva a humano; `MEDIA` y `ALTA` siguen el camino normal de audio y taller.
- `ADVERTENCIAS: "Análisis basado en el relato de A; a reserva de verosimilitud"` para los casos que se envían.
- Taller: `ROSARIO OESTE / FISHERTON / MAGNASCO -> AUDIO T4; INFO_TALLER = "Taller SAN PABLO OESTE (Fisherton)"`. Rosario sin zona explícita sigue en `N/A` + «Consultar zona; no asignar taller».
- Texto publicado: 10.936 caracteres, 12 ops, 10 tokens. Verificado por `/meta`: `DEFINITIVO v7.3`, `El único relato es el de A`, `Taller SAN PABLO OESTE (Fisherton)`.

### 13.3 Demo real (TEST IA / OFICINA TEST / EMPLEADO TEST)

Registro `reccTkhM7pzVrWNun` (tabla `tbl4570W1T0qGdj8w`), política `TEST-POL-001` (FIAT CRONOS 2020, TR), localidad «Rosario Oeste, Santa Fe, Argentina», parte trasera, semáforo A verde / B rojo, tercero AUTO SANCOR. Relato exclusivamente de A, con acta policial, croquis y fotos; sin versión independiente de la contraparte.

Salida real del clasificador:

```
CERTEZA: ALTA
CULPABILIDAD: NO CULPABLE A(ASEGURADO)
RESPONSABILIDAD PROBABLE (SEGÚN RELATO DE A): A fue embestido por detrás mientras estaba detenido en semáforo en verde
ESCENARIO PRINCIPAL (SI SE CONFIRMA EL RELATO DE A): A 0% / B 100%
ESCENARIO ALTERNATIVO (SI B ACREDITA OTRA COSA): A 50% / B 50%
Art. 48 inc. g y art. 50 Ley 24.449
```

Salida real del gestor:

```
ESTADO: VIABLE
CERTEZA: ALTA
CODIGO_FINAL: AUDIO 1A
CODIGO_TALLER: AUDIO T4
INFO_TALLER: Taller SAN PABLO OESTE (Fisherton)
NOTA_ACCION: Ninguna
ADVERTENCIAS: Análisis basado en el relato de A; a reserva de verosimilitud
```

Campos extractores: `EXTRACTOR_CODIGO_AUDIO = AUDIO 1A`, `EXTRACTOR_CODIGO_TALLER = AUDIO T4`, `EXTRACTOR_RESOLUCION = Asegurado no culpable, tercero en otra compañía de seguros`.

### 13.4 Tarjeta en el chat interno

- Registro en `EN REVISION TELEGRAM`; tarjeta `chms_ca0b6f0kpjnmjcxg9kqz` en la sala «Alerta de Siniestro»; `review_request` en estado `pendiente`; no se aprobó ni se envió al cliente.
- El mensaje de la tarjeta (1.617 caracteres) incluye el taller completo: `Taller SAN PABLO OESTE`, Av. Eva Perón 6790, Rosario, teléfono 341 6289393, `https://maps.app.goo.gl/qZooQyfkaVX6hvTWA`, y el aviso de evaluación preliminar.
- Audio del cliente: `AUDIO 1A` (`recdHZm7Ij5x8EDpk`, `Audio1Acoberturastodoriesgo.mp3`, «No Culpable con Cobertura TR»). Audio del taller: `AUDIO T4` (`receXNJECbr0kyhwT`, `Audio T4- Taller San pablo.fisherton .magna.m4a`, «Taller SAN PABLO OESTE (Fisherton)»). Ambos están en `BIBLIOTECA_AUDIOS`.
- La tarjeta reproduce el audio real con `GET /api/reviews/reccTkhM7pzVrWNun/audio`; el análisis completo con `/analisis`.

### 13.5 Estado de los registros TEST

- `recnJxnBdwmZ0MIS1` (demo anterior, prompts v4.7) quedó en `DETENIDO PARA REVISION` para liberar la cola de contacto; su tarjeta `chms_dy42secirbaqlich6m0k` sigue en el chat.
- `reccTkhM7pzVrWNun` es la demo nueva y queda para que el usuario la vea; no se borra todavía. Los casos C/D/E/G/H/I se borraron. No se tocaron denuncias, clientes ni pólizas reales.

### 13.6 Alcance técnico

- Solo configuración de campos AI Text en Airtable y la demo en la tabla de denuncias. No hubo cambio de código, deploy ni migración.
- Fuentes: `prompt_culpabilidad_v5.0.txt` y `prompt_gestor_v7.3.txt` en `/home/diegol/hermes-ssd/data/cache/scratch/`.
- Queda pendiente decidir si el registro demo y su tarjeta se conservan como evidencia o se borran después de la revisión.

## 14) Aviso de aprobación: nombre real y enlaces a Airtable — 23/11/2026 02:08

### 14.1 Telegram (mensaje real)

Ejecución n8n `393592` del workflow `FpqeoQN1JFg7F2tk` (cron 05:02:15Z), nodo `[TG] Enviar Revisión`: mensaje `264` en el chat `-4995954667` («SGSA Monitoreo»).

El encabezado real quedó:

```
SGSA | Pendiente de aprobación

Cliente: TEST IA (🆔 678TES)
Registro: reccTkhM7pzVrWNun
```

Botones del mensaje (`telegram_reply_markup`):

- `✅ Aprobar envío` y `🛑 Detener / revisar` (flujo de aprobación existente).
- `🏢 Abrir ficha del cliente` → `https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4/rechYRnw7FzaGjfpA` (link nativo del botón `IR A CLIENTE`).
- `📄 Abrir denuncia` → `https://airtable.com/appuhslj3GFf60Tea/tbl4570W1T0qGdj8w/reccTkhM7pzVrWNun`.

### 14.2 Tarjeta en el chat interno de Vocero

Deploy de Coolify, app `h5tyzu5np5i8g4efn06n0yxo`, deployment `drpizqb5rpt87gw26pl80drh`, estado `finished`, commit `c74e72250ad7cb9ffcc7d90c44196c0fa9806f34`.

`GET https://vocero.sistemasagenticos.cloud/api/health`:

```json
{"ok":true,"version":"1.3.0","commit":"c74e722","uptime":91,"node":"v22.23.5"}
```

La tarjeta `chms_ca0b6f0kpjnmjcxg9kqz` de la sala «Alerta de Siniestro» (`chtr_tx1fwkcpr0ovurdp7c0o`) renderiza en la UI:

```
Cliente: TEST IA — Código: 🆔 678TES

Registro: reccTkhM7pzVrWNun
```

Y dos links verificados en el DOM:

- `Abrir ficha del cliente en Airtable` → `https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4?DSjXA=rechYRnw7FzaGjfpA`
- `Abrir denuncia en Airtable` → `https://airtable.com/appuhslj3GFf60Tea/tbl4570W1T0qGdj8w/reccTkhM7pzVrWNun`

La tarjeta sigue en estado `pendiente`; no se aprobó ni se envió nada al cliente.

### 14.3 Cambios de código

n8n (workflow `FpqeoQN1JFg7F2tk`, activo):

- `Filtrar y Normalizar`: lee el nombre del cliente desde `CLIENTE` (`cellFormat=string`), extrae el record del botón `IR A CLIENTE` (regex `rec[a-zA-Z0-9]{14,}`), consulta `CLIENTES` y agrega `client_name`, `client_code`, `client_record_id`, `client_url` e `incident_url` al ítem y a `notify`.
- `Preparar Aprobación Telegram`: agrega `Cliente: <nombre> (<código>)` y los botones de ficha/denuncia.
- `[CRM] Aviso Revisión`: envía `cliente`, `clienteNombre` y `clienteRecordId` al CRM.

Verificación del código de `Filtrar y Normalizar` con el ítem real de la ejecución `393592` y `httpRequest` mockeado a `CLIENTES/rechYRnw7FzaGjfpA`:

```json
{
  "fetchUrl": "https://api.airtable.com/v0/appuhslj3GFf60Tea/CLIENTES/rechYRnw7FzaGjfpA",
  "client_name": "TEST IA",
  "client_code": "🆔 678TES",
  "client_record_id": "rechYRnw7FzaGjfpA",
  "client_url": "https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4/rechYRnw7FzaGjfpA",
  "incident_url": "https://airtable.com/appuhslj3GFf60Tea/tbl4570W1T0qGdj8w/reccTkhM7pzVrWNun"
}
```

CRM (commit `c74e722`, `main`, pusheado):

- `src/lib/types.ts`: `ChatReviewShareDto` con `clienteNombre` y `clienteRecordId`.
- `src/server/internal/chat.ts`: sanitización de ambos campos (record validado).
- `src/app/api/reviews/incoming/route.ts`: zod acepta los campos.
- `src/lib/sgsa-links.ts`: `SGSA_DENUNCIA_TABLE_ID` y `sgsaAccidentRecordUrl()`.
- `src/components/internal-chat.tsx`: línea de cliente/código y links a ficha y denuncia.
- `tests/unit/reviews-033.test.ts`: 2 tests nuevos (nombre/record y rechazo de record inválido).

Verificación: `npm run typecheck` OK; `npm run build` OK (Next.js compilado y páginas generadas); `npx vitest run tests/unit/reviews-033.test.ts` 11/11; suite completa **679 passed / 74 skipped** (100 archivos).

### 14.4 Airtable

- No se tocaron denuncias, clientes, pólizas ni registros reales. La prueba usó `reccTkhM7pzVrWNun` / TEST IA / OFICINA TEST / EMPLEADO TEST.
- El registro TEST se restauró a `ESTADO_ENVIO_CLIENTE = EN REVISION TELEGRAM` al terminar la prueba; la tarjeta queda pendiente y el cliente no recibió nada.
- `cellFormat=string` devuelve el **nombre** del cliente en el campo `CLIENTE` (no el record id). El record id se obtiene del botón `IR A CLIENTE`; el workflow quedó corregido y activo para las próximas ejecuciones.
