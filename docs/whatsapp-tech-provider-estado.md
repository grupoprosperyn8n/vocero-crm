# Estado del Tech Provider (app GYP CRM) — verificado el 24-11-2026

## Resultado

**No aprobado.** La conexión por QR con coexistencia (Embedded Signup) no se
puede ofrecer todavía. La pantalla de Ajustes → WhatsApp lo dice con el motivo
real y deja el camino manual como el único accionable.

## Evidencia leída en el panel de Meta

App: GYP CRM — `2488612005001120` (portfolio `506573899896574`).

1. **Revisión de la app** (`/apps/2488612005001120/app-review/`): la solicitud
   figura como **«No enviada»**. El botón «Enviar para revisión» está
   deshabilitado y la pantalla aclara «Debes completar todos los pasos antes de
   enviarla a revisión». Faltan, entre otros, «Instrucciones para revisores».
2. **Permisos y funciones** (`/use_cases/customize/permissions/`):
   `whatsapp_business_management`, `whatsapp_business_messaging` y
   `whatsapp_business_manage_events` están en **«Listo para la prueba»**
   (acceso estándar) y cada uno ofrece el botón «Agregar a revisión de la app».
   Ninguno tiene acceso avanzado.
3. **Caso de uso WhatsApp**: «Conviértete en proveedor de tecnología» sigue
   listado bajo «Próximos pasos» / «Conviértete en socio», sin completar.

## Consecuencia

- Sin Tech Provider aprobado + acceso avanzado, el diálogo de Meta no ofrece la
  coexistencia: cualquier intento de alta por QR fallaría.
- El camino válido hoy es el manual (spec 043): app, WABA y usuario del sistema
  del propio negocio, con el token pegado en el CRM. Es el recorrido que la
  pantalla muestra con la ayuda paso a paso (spec 051).

## Cómo se habilita el QR cuando Meta apruebe

1. Completar la solicitud de App Review (permisos + instrucciones para
   revisores + video) y enviarla.
2. Con la aprobación confirmada, cargar en el entorno de la app:
   `META_TECH_PROVIDER_APPROVED=on` (además de `META_APP_ID`, `META_APP_SECRET`
   y `META_ES_CONFIG_ID`, que ya están).
3. Redeployar. La tarjeta de coexistencia pasa a estar accionable sola; no hace
   falta tocar código (`getTechProviderStatus()` en
   `src/server/whatsapp/embedded-signup.ts`).

La bandera es deliberadamente manual: el estado no se puede consultar por API y
no se debe prometer la coexistencia sin la aprobación real.
