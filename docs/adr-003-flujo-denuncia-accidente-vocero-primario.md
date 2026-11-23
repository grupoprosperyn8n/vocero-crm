# ADR-003 — Flujo de Denuncia de Accidente con Vocero como canal primario

Estado: propuesta del 21-11-2026. Para el retome del 23/11, la decisión de Diego del 22/11 acota el alcance a revisión y aprobación interna: conservar Telegram, mostrar la misma denuncia en el grupo existente «Alerta de Siniestro» de Vocero y registrar una sola decisión. Validar con TEST IA, sin envíos externos ni encolado histórico. Postergar la prueba real hasta que Rafael conecte WhatsApp. La propuesta de tandas y renombrado más abajo no está autorizada por este hito. Ver `~/Documentos/Notas/HITO-VOCERO-SINIESTROS-Y-META.md` y Engram #6990.
Contexto: sistema de seguros agénticos de Rafael Allende (base Airtable `appuhslj3GFf60Tea`), flujo automatizado de notificación al cliente tras un siniestro.

## 1. Objetivo

Que cada denuncia de accidente llegue al cliente (WhatsApp + email) con el informe del perito IA y el audio
que asigna el gestor de protocolo, pasando por una instancia de revisión interna que hoy vive en Telegram y
que debe pasar a vivir en el Vocero del negocio de Rafael (`vocero.sistemasagenticos.cloud`), sin apagar lo
que ya funciona.

## 2. Inventario verificado (21-11-2026)

### Base Airtable

Tabla `DENUNCIA DE ACCIDENTE` · `tbl4570W1T0qGdj8w` · 251 registros (oct-2026: 143 · nov-2026: 108).
Último registro: 20-11-2026.

| Campo | Tipo | Rol |
|---|---|---|
| `CULPABILIDAD IA` | aiText | Dictamen completo del perito (agente 1) |
| `CULPABILIDAD` | singleSelect | Clasificación: CULPABLE · NO CULPABLE · VER TENGO DUDAS · CONCURRENCIA |
| `AGENTE 2: GESTOR DE PROTOCOLO` | aiText | Decisión del gestor (audio, taller, notas) |
| `EXTRACTOR_RESOLUCION` / `_CODIGO_AUDIO` / `_CODIGO_TALLER` / `_NOTAS_INTERNAS` | formula | Parseo del texto del gestor |
| `ESTADO_ENVIO_CLIENTE` | singleSelect | 10 estados del envío |

Estados reales del select: EN ESPERA · PENDIENTE APROBACION · EN REVISION TELEGRAM · EN PROCESO DE ENVIO ·
ENVIADO CON EXITO · DETENIDO PARA REVISION · ERROR DE ENVIO · DERIVADO A HUMANO · YA ENVIADO / NO REENCOLAR ·
REINTENTO AUTORIZADO.

No existe un campo `CULPABILIDAD A`. El par real es `CULPABILIDAD IA` (dictamen) + `CULPABILIDAD` (clasificación).

### Distribución de datos

- `CULPABILIDAD`: NO CULPABLE 113 · CULPABLE 85 · VER TENGO DUDAS 29 · CONCURRENCIA 5 · vacío 19.
- `ESTADO_ENVIO_CLIENTE`: **EN ESPERA 250 · ENVIADO CON EXITO 1**.
- Los 250 en EN ESPERA tienen dictamen IA **y** gestor 2 completos (250/250).
- Único envío concretado: `recorJzdwgznjaqcF`, 06-11-2026, VER TENGO DUDAS.

### Workflow n8n

`SGSA - Notificación Omnicanal por ENVIAR ANALISIS IA` · `FpqeoQN1JFg7F2tk` · 109 nodos · activo ·
actualizado 16-09-2026. Se ejecuta cada minuto; últimas ejecuciones en `success`
(ej. 390377, 17:22 del 21-11).

Filtro del nodo `[AT API] Buscar Denuncias Listas`:

```
AND(OR({ESTADO_ENVIO_CLIENTE}='PENDIENTE APROBACION',
       {ESTADO_ENVIO_CLIENTE}='REINTENTO AUTORIZADO',
       {ESTADO_ENVIO_CLIENTE}='EN COLA POR CONTACTO'),
    {EXTRACTOR_RESOLUCION}!='', {EXTRACTOR_CODIGO_AUDIO}!='')
```

Diagnóstico: la ejecución 390377 deja `Expandir Registros` con **0 items**. Nada entra en
PENDIENTE APROBACION, así que el cron corre en vacío. `EN COLA POR CONTACTO` no existe entre las opciones
del select. Corrección 22/11: no es código muerto. `Expandir Registros` identifica los casos del mismo contacto y `[AT API] Marcar En Cola por Contacto` intenta escribir esa opción con `typecast:true`. Cuando el contacto queda libre, el cron vuelve a considerar el caso. Se verificaron la lógica y el cableado publicados, no una escritura de prueba. Esto es independiente de `REINTENTO AUTORIZADO`, que vuelve a pedir una previa tras corregir el mismo caso.

### Espejo a Vocero (033) — construido, sin uso

10 nodos `[CRM]` habilitados. `[CRM] Aviso Revisión` hace `POST https://vocero.sistemasagenticos.cloud/api/reviews/incoming`
con `Authorization: Bearer <REVIEWS_INBOUND_KEY>`, `kind: 'review'`, y `canales: 'Email (WhatsApp omitido temporalmente)'`.
La tabla `review_request` del Vocero tiene **0 filas**: nunca entró un aviso.

### Vocero del negocio de Rafael

- Organización `org_smz47ti3j8s1o9s10g4m`, nombre **Rafael Allende Seguros**, slug `principal` (renombrada 21-11).
- Grupos internos: Alerta de Siniestro (5) · ventas poliza vida (5) · FFF (4) · VENTA (4).
- `REVIEW_GROUP_NAME = "Alerta de Siniestro"` está **hardcodeado** en `src/lib/reviews.ts:29`; el grupo lo crea
  `ensureReviewGroup()` con audiencia sistema + owner/admin/manager.
- `meta_credentials`: **0 filas** → Vocero no tiene WhatsApp conectado; el disparo al cliente por Vocero
  no es posible hasta que Meta apruebe y Rafael conecte su número.

## 3. Decisiones de diseño propuestas

1. **Vocero primario, Telegram espejo.** El canal de revisión oficial pasa a Vocero; Telegram sigue recibiendo
   la misma tarjeta como respaldo, sin bloquear (patrón ya usado por los nodos `[CRM]`: try/catch silencioso).
2. **Nombre del grupo configurable.** `REVIEW_GROUP_NAME` pasa a leerse de env (`REVIEW_GROUP_NAME`,
   default `Alerta de Siniestro`) y se setea a `DENUNCIA DE ACCIDENTE` en Vocero. Sin esto, renombrar la sala
   hace que `ensureReviewGroup()` cree una segunda sala con el nombre viejo.
3. **Transición EN ESPERA → PENDIENTE APROBACION explícita.** Hoy no existe. Debe ser automática cuando
   dictamen + gestor están completos y la clasificación está definida (las "dudas"/"concurrencia" pueden
   quedar en revisión humana según decisión de Diego).
4. **Nada de 250 mensajes de golpe.** Los registros parados se encolan en tandas con revisión previa.
5. **El disparo al cliente no se mueve todavía.** YCloud sigue siendo el emisor real de WhatsApp hasta que
   Vocero tenga canal conectado; el día que lo tenga se cambia el remitente sin tocar el resto del flujo.

## 4. Bloques de implementación

**Bloque 1 — destrabar (n8n, sin deploy de código).**
- Preservar `EN COLA POR CONTACTO` en el filtro y el nodo que la escribe. Verificar la discrepancia con el select en un ensayo aislado de dos denuncias TEST del mismo contacto, sin disparar salidas externas ni tocar el historial.
- Agregar la promoción EN ESPERA → PENDIENTE APROBACION según la decisión de Diego (automática o por regla).
- Verificar con una ejecución real que `Expandir Registros` devuelve items.

**Bloque 2 — Vocero como canal primario de revisión (código + deploy).**
- `REVIEW_GROUP_NAME` por env; renombrar la sala a `DENUNCIA DE ACCIDENTE` y sincronizar audiencia.
- Tarjeta con botones aprobar / detener / reintentar (módulo 033 ya existente) + mensaje demo del cliente
  (WhatsApp y email) + adjunto del perito + el audio elegido por el gestor.
- Verificar en el chat interno: llega la tarjeta, se decide, y el estado en Airtable cambia.

**Bloque 3 — disparo y monitoreo.**
- Email: automatización Airtable (verificar si ya existe).
- WhatsApp: YCloud hoy; Vocero cuando tenga canal.
- Estados del envío en Airtable: ENCOLAR → EN REVISION → APROBADO → ENVIADO / ERROR, con reintento autorizado.

## 5. Criterios de aceptación

- Un siniestro nuevo recorre el flujo completo sin intervención manual y deja `ESTADO_ENVIO_CLIENTE` en
  ENVIADO CON EXITO.
- La tarjeta de revisión aparece en el grupo `DENUNCIA DE ACCIDENTE` del Vocero, con el mensaje demo y el adjunto.
- Aprobar desde Vocero dispara exactamente lo mismo que aprobar desde Telegram.
- Telegram sigue funcionando como respaldo.
- `review_request` deja de estar en 0 y registra quién decidió y por qué canal.

## 6. Riesgos

- Promover los 250 de golpe generaría 250 envíos sin revisión: mitigado con tandas.
- Sin WhatsApp conectado en Vocero, "disparar por Vocero" es una expectativa que no se puede cumplir hoy:
  el mensaje al cliente sigue saliendo por YCloud.
- Renombrar la sala sin el cambio de código crea salas duplicadas.
