# Guía visual de conexión manual de WhatsApp

Estado: artefactos terminados y enlace integrado en código; NO publicado en producción.
Pedido: «haceme la guia visual paso a paso y agregala el flujo de concecion sin tech provider que esta ahora rafael si usas campura de mi cuenta pone borroso mis datos».

## Entrega

- `public/guias/whatsapp-sin-tech-provider.html`: guía web sin JavaScript, índice y enlaces a los siete pasos.
- `public/guias/whatsapp-sin-tech-provider.pdf`: 11 páginas, enlaces absolutos a Meta y al CRM; índice interno.
- `public/guias/whatsapp-manual/`: sólo cuatro recortes sanitizados. Ningún original ni dato de cuenta en el repositorio.
- `src/components/settings/whatsapp-assistant.tsx`: dos enlaces en el encabezado del asistente existente: «Guía visual paso a paso» y «Descargar guía PDF», más advertencia de alcance del alta manual. Sin cambios de API, permisos, DB, credenciales ni lógica de conexión.
- Copias autónomas para Diego: `/home/diegol/Documentos/Guias/WhatsApp-Rafael/Guia-WhatsApp-sin-Tech-Provider.{pdf,html}`. El HTML local tiene imágenes incrustadas.

## Alcance del contenido

Integración directa con app y activos propios del cliente, cuenta/pago del cliente, invitación opcional de un colaborador, diferencia WABA/Phone Number ID/portfolio, número estándar vs coexistencia, usuario del sistema, permisos oficiales, token, prueba y guardado, webhook con el secreto de la app correcta, prueba real de ida y vuelta y resolución de problemas. No declara al cliente conectado ni al proveedor aprobado. No invita personas ni registra/migra números para conseguir capturas.

Fuentes: UI real `/settings/whatsapp`, `whatsapp-steps.ts`, `whatsapp-assistant.tsx`, `whatsapp-connect.tsx`, y documentación oficial Meta Cloud API Get Started y onboarding Business app users (consultadas 23/11/2026).

## Privacidad y fidelidad

- El borrador de imágenes anterior NO se ejecutó: ocultaba un solo rectángulo y dejaba información personal.
- Se recortaron áreas ajenas al paso y se destruyeron los píxeles sensibles antes de aplicar el aspecto difuminado (reducción a un único color, sin original embebido).
- La captura llamada `04-acceso` duplicaba email y `06-whatsapp-cuentas` mostraba Personas: ambas excluidas. La descripción automática de visión de la hoja de contacto no coincidía con el OCR; se verificó el contenido real antes de usarlo.
- El gestor de contraseñas autocompletó campos después del chequeo de DOM vacío: se ocultaron los dos controles completos y se agregó advertencia al cliente. No se imprimió ni se usó la contraseña autocompletada.
- OCR local sobre los cuatro recortes, inspección visual de éstos y del PDF. Sin nombres/correos/IDs/tokens de las cuentas del ejemplo.
- PDF sin archivos adjuntos, sin enlaces `file://`, bloques dentro de márgenes, 11 páginas. Páginas 3 y 9 inspeccionadas visualmente; los cuatro recursos gráficos inspeccionados juntos.

## Verificación ejecutada

- ODD T0 (documentación y enlaces, sin lógica): filtro declarado antes de escribir; privacidad y distinción manual/coexistencia.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, un warning preexistente en `src/components/app-nav.tsx:180` (directiva eslint-disable no usada).
- `npm test`: primera corrida 676 passed / 3 failed / 74 skipped; dos timeouts de 5 s en agenda/dashboard y una aserción posterior de mocks.
- Reintento `npx vitest run --maxWorkers=2`: error de configuración min/max, sin tests ejecutados.
- Corrida final `npx vitest run --minWorkers=1 --maxWorkers=2`: 679 passed / 74 skipped, 86 archivos pasados / 14 skipped, exit 0. No se alteraron tests ni su timeout.
- `npm run build`: primer intento llegó a compilación y páginas estáticas pero timeout del comando a 180 s. Repetido con presupuesto 600 s: exit 0, incluida ruta `/settings/whatsapp`.
- Render WeasyPrint: 11 páginas. Ignora media query responsive (advertencia del motor PDF); CSS print aplicado y comprobado. La versión HTML sigue teniendo CSS responsive para navegador.
- `git diff --check`: exit 0.

## Pendiente de publicación

La pregunta de autorización para publicar la guía y los dos enlaces en el Vocero de Rafael terminó sin respuesta (`clarify: timed_out`). No se hizo push ni deploy. No tomar el silencio como consentimiento.

La previsualización HTML local por browser_exec fue bloqueada por la política de direcciones privadas. No se buscó otra vía para eludirla. Falta comprobar en navegador servido la navegación, descarga y anchos 1280/390/320 cuando haya una URL permitida o el deploy autorizado. El servidor temporal de preview se detuvo.

Para publicar con autorización: push del commit en la rama de despliegue, un único deploy de Coolify para la app de Rafael, read-back del deployment y descarga exacta de PDF/HTML/imágenes; abrir sesión real de Rafael/Vocero, comprobar los dos enlaces y que el flujo no perdió campos. No modificar la app proveedora, los tokens ni Airtable para publicar documentación.
