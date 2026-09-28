# Guion E2E — US5: Conexión del número (asistente + wizard)

> Conducido con Playwright (MCP) contra `pnpm dev` con wa-mock
> (`META_GRAPH_BASE_URL` → wa-mock/graph). Ejecutado en la ronda 043: el
> camino guiado del asistente corre de punta a punta con el mock.

## Asistente (043) — camino guiado completo

1. Abrir `/settings/whatsapp` sin conexión guardada.
   ✅ Abre el ASISTENTE (no el formulario suelto): «Paso 1 de 7», barra con 7
   pasos, requisitos previos y advertencia de la cuenta de Facebook.
2. Recorrer los pasos 1–5 con «Listo, ya lo hice» (y captura del WABA ID en el
   paso 3 y del Phone Number ID en el paso 4).
   ✅ Cada paso muestra instrucciones numeradas + enlace directo a Meta
   (https) + advertencia/tip donde corresponde.
   ✅ El paso 4 advierte con fuerza que el número sale de la app de WhatsApp.
   ✅ El paso 6 llega con los campos PRELLENADOS desde el asistente.
3. Token con sufijo `-invalid` → «Probar conexión».
   ✅ Error claro («El token no es válido o expiró…», 422 traducido); Guardar
   sigue deshabilitado.
4. Token válido → «Probar conexión» → «Guardar conexión».
   ✅ «Token válido para +52 …» → guarda → el asistente salta al PASO 7 con la
   tarjeta de webhook (URL completa + verify token) y la prueba en vivo.
5. «Resumen para pasarle a quien te ayuda».
   ✅ Texto con ✅/⬜ por paso + datos cargados (negocio/WABA/Phone Number ID),
   SIN el token, y la línea de cómo dar acceso (Equipo → Administrador).
6. «Volver al estado» (y «Ver la guía» de nuevo).
   ✅ Estado conectado (número, token …last4, badge) + reconectar + webhook;
   en modo conectado el stepper navega libremente y el paso 7 muestra la
   tarjeta del webhook.
7. Móvil 390 px.
   ✅ Sin desborde horizontal (scrollWidth = 390).

## Camino corto y modo reconectar

8. «Ya tengo los datos» desde el paso 1 → directo al 6 (formulario).
9. Con conexión: «Reconectar / actualizar el número» → formulario con WABA y
   Phone prellenados de la conexión existente; guardar cierra y refresca.
10. Webhook: URL COMPLETA con el verify token como segmento + botón copiar;
    aviso informativo (no error) si META_APP_SECRET no está configurado; nota
    de seguridad del token en la URL.

## Caminos infelices

11. Token con sufijo `-invalid` → error claro; NO se guarda (la conexión
    previa queda intacta).
12. Webhook GET handshake con verify token correcto → challenge; segmento
    incorrecto → 404 (cubierto también en guion US1).
