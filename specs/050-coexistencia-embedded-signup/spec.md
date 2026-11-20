# 050 — Coexistencia: alta del número por Embedded Signup (app de WhatsApp Business + Cloud API)

**Carril: completo** (modelo de datos: columnas nuevas en `meta_credentials` + tabla de log de
alta; contrato nuevo publicado: `POST /api/settings/whatsapp/embedded-signup`).

**Origen:** pedido del dueño (20-11-2026). Caso real: el Vocero de Rafael (Allende) — un negocio
que ya atiende por la app de WhatsApp Business con su número y no quiere migrarlo ni perder el
celular. El Tech Provider existe para esto: que el cliente instale el CRM solo, por coexistencia,
con su propio número y por QR/código.

**Revisión 2** — incorpora el filtro goldfish T2 (3 revisores ciegos: fidelidad a Meta, seguridad
multi-tenant, uso real por alguien no técnico). Lo corregido está marcado con ⟵.

## Problema

Hoy la única forma de conectar el canal es el asistente manual (spec 043): el negocio (o la
agencia) crea app, WABA, número, usuario del sistema y token, y los pega en un formulario. Ese
camino **obliga a migrar el número**: deja de andar en el teléfono y se atiende solo por el CRM.

Para un negocio que ya vive en la app de WhatsApp Business —el caso de Rafael— eso es un veto: ahí
contesta, ahí tiene su historial y sus contactos. La alternativa oficial de Meta es la
**coexistencia** (*Onboard WhatsApp Business app users*): el mismo número queda en la app del
celular y en la Cloud API a la vez, con mensajes espejados en ambos lados.

La coexistencia **no se activa a mano**: Meta solo la habilita dentro de Embedded Signup y solo
para una app aprobada como Tech Provider. Por eso la app está en revisión y por eso este spec.

## Prerequisitos de plataforma (⟵ goldfish: sin esto el alta falla y no se entiende por qué)

| Requisito | Consecuencia si falta |
|---|---|
| App aprobada como Tech Provider/Solution Partner + **Advanced Access** de `whatsapp_business_messaging` y `whatsapp_business_management` | El diálogo no ofrece coexistencia; no se puede onboardear ningún cliente |
| WhatsApp Business app del cliente **≥ 2.24.17** | Esa opción no aparece en su pantalla |
| Límite de altas: **10 clientes nuevos por ventana móvil de 7 días** (200 con Business Verification + App Review + Access Verification) | El alta número 11 falla |
| `META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID` (configuración de Facebook Login for Business, variante Embedded Signup) | La UI muestra «alta automática no habilitada» |
| Webhook con `META_APP_SECRET` configurado | El ingest rechaza los eventos (ver Seguridad) |

## Qué se construye

1. **Botón «Conectar con WhatsApp»** (camino recomendado), precedido por una **pantalla de
   pre-consentimiento** (⟵ la advertencia no puede llegar después del commit) con dos columnas
   —«esto sigue funcionando» / «esto deja de funcionar»— y un checklist previo: celular con la app
   abierta, la cuenta de Meta que administra el negocio y el número. Aclara que el código de
   verificación llega **dentro de la app**, no por SMS.
2. **Diálogo oficial de Meta** (Embedded Signup **v4**, `featureType:
   whatsapp_business_app_onboarding`, vía `config_id`). El negocio elige «conectar mi cuenta
   existente de WhatsApp Business», verifica el número con el código de la app (o el QR que Meta
   ofrece) y decide si comparte historial.
3. **Canje y verificación del lado servidor** (⟵ el navegador no decide de quién son los datos).
   El endpoint recibe el `code`; canjea el código con el App Secret; con **el token canjeado**
   resuelve la WABA del código y comprueba que el `phone_number_id` pertenece a esa WABA
   (`GET /{waba}/phone_numbers`). Si los ids del navegador no coinciden con lo que dice Meta, 422.
   Nunca acepta un token en el body.
4. **Bifurcación por modo** (⟵): `GET /{phone_number_id}?fields=is_on_biz_app,platform_type` — los
   dos campos viven en el número, no en la WABA. Par `(is_on_biz_app=true, platform_type=CLOUD_API)`
   ⇒ **coexistencia**: se **omite** `/register` (el número ya está registrado). Cualquier otro caso
   ⇒ alta estándar: `/register` con PIN antes de guardar. Se registra `registered: true|false`.
5. **Suscripción y sincronización inicial** (⟵ bloqueante): suscribir la app a la WABA y
   **verificar** los campos `messages`, `account_update`, `history`, `smb_app_state_sync`,
   `smb_message_echoes` **antes** de pedir la sincronización; después disparar
   `POST /{phone_number_id}/smb_app_data` con `sync_type: smb_app_state_sync` y `sync_type: history`.
   Meta da **24 h** desde el alta y **solo se puede una vez en la vida del alta**: diferirlo pierde
   contactos e historial para siempre y obliga a offboardear. Se guarda el `request_id`. La
   declinación del negocio (error 2593109) es resultado válido. El **mapeo** de esos payloads a la
   bandeja queda para después.
6. **Session logging** (exigido por Meta): eventos del alta persistidos con allowlist de campos.
7. **Echo en la bandeja** (⟵ contrato exacto): los mensajes que el negocio manda desde el celular
   llegan como `field: smb_message_echoes`, array `value.message_echoes[]`, con `from` = número del
   **negocio** y `to` = cliente. Se ingesta como **saliente**, contraparte `to`, deduplicado por
   `wa_message_id`, sin crear contacto con el número propio, sin disparar al agente y **sin abrir ni
   extender la ventana de 24 h** (Meta: los mensajes de la app no afectan esa ventana). Texto y
   media soportados; no-texto (reacción, ubicación, sistema) con placeholder legible. Origen
   visible en el hilo: «desde el celular» vs «desde el CRM».
8. **Takeover explícito** (⟵): un echo pausa la IA de esa conversación solo si su `timestamp` es
   **igual o posterior** al último evento relevante (un echo viejo o reintentado es no-op), marca la
   conversación «atendida desde el celular» y lo muestra en el hilo. Se reabre manualmente o por la
   ventana configurada.
9. **Estados honestos** (⟵): `sin_conexion` → `vinculado` (alta completa) → `operativo`
   (suscripción verificada **y** al menos un evento real recibido). «Operativo» muestra «último
   mensaje recibido: hace X» y avisa si pasan N horas sin tráfico. El método de pago del cliente
   (obligatorio como Tech Provider) se muestra como paso pendiente con enlace a WhatsApp Manager:
   sin él el canal está vinculado pero no puede enviar.
10. **Reanudación** (⟵): la alta se persiste como borrador por organización (`iniciada` /
    `verificada` / `syncing` / `completada` / `abortada`) y Ajustes ofrece «retomar donde quedaste».
    Un reintento nunca duplica ni deja activos huérfanos sin aviso.
11. **«No puedo conectar mi número»** (⟵): tres caminos con acción concreta — número en otra
    organización (pedir la baja a quien lo tenga), número en otro proveedor (migrar o portar; la
    coexistencia no aplica), número en un celular ajeno.

## Comportamiento observable (criterios de aceptación)

1. **Sin conexión**, Ajustes → WhatsApp ofrece las dos puertas y, si falta configuración de la
   instancia, lo dice en una línea (el asistente manual 043 sigue intacto).
2. **Pre-consentimiento obligatorio**: el botón que abre el diálogo de Meta no existe hasta que el
   negocio confirmó qué se apaga en el celular. Cancelar el popup vuelve al estado anterior sin
   guardar; popup bloqueado ⇒ instrucción concreta.
3. **Alta completa**: en menos de 5 s se ve `vinculado` con número, nombre verificado y etiqueta
   «Coexistencia: seguís usando el celular», o «conectado, pero el número quedó solo en el CRM»
   cuando Meta indica que no es coexistencia (derivado de `is_on_biz_app`).
4. **Suscripción verificada**: el alta no responde `vinculado` si la app no quedó suscripta a los
   cinco campos; si la verificación falla, aborta **antes** de pedir el sync y explica el motivo.
5. **Sync disparado y registrado**: el session log guarda `sync_state` y `sync_history` con su
   `request_id` (o el motivo de la declinación) y la UI avisa que corre en segundo plano.
6. **`operativo`** solo se alcanza con un evento real recibido; el estado persiste y se muestra la
   antigüedad del último mensaje.
7. **Idempotencia y aislamiento**: repetir el alta del mismo número actualiza la fila sin duplicar;
   un `phone_number_id` de otra organización devuelve 409 (nunca 500 ni fila duplicada); el
   `waba_id` queda único por instancia; dos altas simultáneas de la misma organización se serializan
   y la perdedora deja constancia.
8. **Echo**: mensaje del celular aparece como saliente «desde el celular», no duplica en reintentos,
   no despierta al agente, no abre ventana de 24 h, no crea contacto con el número propio; media y
   no-texto con placeholder legible.
9. **Camino infeliz**: código vencido/ya usado, App Secret ausente, número sin permiso, número en
   otra organización, Meta caída y sync rechazado devuelven mensajes accionables distintos, y nada
   queda guardado a medias.
10. **Agent-first (I)**: el endpoint nuevo queda documentado y `GET /api/settings/whatsapp` sigue
    devolviendo `mode` y `status` para que un agente sepa cómo se conectó y en qué estado está.
11. **Sin regresiones**: `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde y 043 intacto.

## Seguridad (⟵ goldfish: los tres huecos altos)

- **El servidor no confía en el navegador**: WABA y número se derivan del code canjeado; el token
  canjeado debe tener acceso al número (no basta que el número exista); un `wabaId` distinto al del
  code ⇒ 422; cualquier `token`/`access_token` en el body ⇒ 400.
- **Listener del SDK blindado**: solo mensajes con `event.origin` en la allowlist de Meta
  (`https://www.facebook.com`, `https://web.facebook.com`, `https://business.facebook.com`),
  `event.source` igual al popup abierto por el botón y `event.data.type === 'WA_EMBEDDED_SIGNUP'`.
  Lo demás se ignora sin loguear el payload.
- **Webhook fail-closed**: con coexistencia habilitada `META_APP_SECRET` es **requisito**; sin él
  los POST de `messages` y `smb_message_echoes` se rechazan con 401 en vez de aceptarse sin
  verificar. El `webhookToken` no se loguea.
- **Session log con allowlist**: `event`, `result`, `error_code` numérico, `organization_id`, ids
  enmascarados (últimos 4), `registered`, `sync_*` y timestamp. Nunca: code, token, teléfono
  completo, `verified_name`, `err.message`/`err.details` crudos. Tabla con `organization_id` NOT
  NULL, lectura por `scoped()`, append-only.
- **Índice único de `waba_id`** (⟵ hoy no existe y `getCredentialsByWabaId` usa `limit(1)`): dos
  filas con la misma WABA enrutaban eventos de plantillas a la organización equivocada. Migración
  con chequeo previo de duplicados.
- **Conflictos**: 23505 se mapea a 409; el mensaje no nombra la organización ajena.
- **Cifrado**: token con `encryptSecret` (AES-256-GCM), jamás al navegador ni a logs; solo `…last4`.

## Decisiones

- **v4, no v2/v3**: Meta retira v2 y v3 el 15-10-2026.
- **Coexistencia como opción detectada, no forzada**: el mismo diálogo sirve para número nuevo.
- **El sync se pide sí o sí; el mapeo queda después**: pedirlo es irreversible y tiene 24 h;
  mapearlo se puede hacer con calma con los payloads ya recibidos.
- **Echo y takeover dentro de v1**: sin espejo la coexistencia miente; sin regla de turno, el bot y
  el dueño contestan lo mismo.
- **Sin QR propio**: el QR es una opción de la pantalla de Meta, no un flujo nuestro.
- **El alta no crea activos ni pide credenciales por chat**: el código lo tipea el titular en Meta.

## Fuera de alcance (revisado)

- **Mapeo/importación a la bandeja** del historial y los contactos sincronizados (pedir el sync sí
  es parte de v1). Se implementa con los payloads ya guardados.
- Reconexión automática tras cambio de celular (Meta la corre sola; acá solo se refleja el estado).
- Panel central multi-cliente de agencia.
- Facturación: la carga el cliente (se muestra como paso pendiente, no se gestiona).
- Llamadas de voz/video y grupos: Meta no las soporta en coexistencia.

## Riesgos

- **Throughput fijo 20 mps** en números de coexistencia: sirve para atender, no para envíos
  masivos. Se dice en la pantalla de estado.
- **La aprobación del Tech Provider** es la compuerta real: el código se escribe y se prueba en seco
  ahora; el alta de Rafael espera esa aprobación.
- **`smb_app_data` es de una sola vez**: un error de orden (sync antes de suscribir) pierde el dato
  para siempre. Por eso subscribe → verificar → sync es un criterio, no una nota.
