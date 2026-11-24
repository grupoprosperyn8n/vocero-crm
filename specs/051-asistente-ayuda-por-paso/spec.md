# 051 — El paso a paso, dentro de la conexión de Vocero (manual vs coexistencia)

**Carril: ligero** (comportamiento observable nuevo; sin migración). El DTO de
`GET /api/settings/whatsapp` suma `techProvider`, que es contrato interno de la
propia pantalla (no `/api/bot/*` ni webhook), y la pantalla ya lo ignoraba.

**Origen:** pedido del dueño (24-11-2026). El asistente de 7 pasos y la guía
visual existían por separado: la guía era un enlace que se abría en otra
pestaña. Para Rafael —dueño, no técnico— eso obliga a saltar entre dos
documentos y volver a ubicarse en cada paso.

## Problema

1. La ayuda detallada vive en una página aparte (`/guias/…`): al cliente se le
   pierde el hilo y nos vuelve a preguntar lo mismo por chat.
2. La pantalla ofrece la conexión por QR (coexistencia) sin decir si está
   habilitada. El 24-11-2026 se verificó en el panel de Meta que **la app no
   está aprobada**: Revisión de la app «No enviada», «Enviar para revisión»
   deshabilitado y los dos permisos de WhatsApp en «Listo para la prueba».
   Ofrecer el QR así es prometer algo que falla.
3. Nadie explica en la pantalla la diferencia entre conectar **sin
   coexistencia** (manual, portfolio propio del negocio) y **con coexistencia**
   (QR, el celular sigue atendiendo).

## Comportamiento observable

- En Ajustes → WhatsApp, sin número conectado, se ven **dos métodos** con lo
  que se conserva y lo que se pierde en cada uno, y se puede elegir.
- El método **coexistencia (QR)** solo se puede accionar si `META_TECH_PROVIDER_APPROVED=on`
  y están las credenciales de Meta. Si no, el botón está deshabilitado y se
  muestra el motivo real más la lista de lo que falta para habilitarlo.
- El método **manual** lleva al asistente de 7 pasos, y **cada paso muestra,
  sin salir de la página**: la pantalla exacta de Meta, los pasos finos, qué se
  copia y la confusión típica.
- El paso 5 muestra «Asignar activos» como tarjetas de texto (Apps / Cuentas de
  WhatsApp) con el permiso de cada activo y la comprobación en «Activos
  asignados»: nunca una captura tachada.
- Los enlaces a la guía completa y al PDF siguen disponibles para descargar.

## Criterios de aceptación

1. `getTechProviderStatus()` devuelve `approved:false` sin la bandera, y
   `embeddedSignupAvailable:true` solo con bandera + credenciales.
2. Los 7 pasos tienen `help.where`, ≥2 indicaciones y una advertencia o dato a
   copiar (test unitario).
3. `ASSET_CARDS` nombra los dos activos con «acceso total» y la nota aclara que
   el acceso no es a todo el negocio (test unitario).
4. Con el estado actual de Meta, la pantalla **no** ofrece el QR accionable.
5. Typecheck, lint y test en verde; verificado en producción.

## Fuera de alcance

- Enviar la solicitud de App Review o cambiar permisos en Meta: es una decisión
  del dueño y una acción hacia afuera.
- Alta automática por QR mientras el Tech Provider no esté aprobado.
