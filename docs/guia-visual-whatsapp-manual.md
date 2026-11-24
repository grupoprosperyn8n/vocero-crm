# Guía visual de conexión manual de WhatsApp

Publicación original: `5b18d6a`, verificada por HTTP y navegador. La corrección de «Asignar activos» se describe al final.
Pedido: «haceme la guia visual paso a paso y agregala el flujo de concecion sin tech provider que esta ahora rafael si usas campura de mi cuenta pone borroso mis datos».

## Entrega

- `public/guias/whatsapp-sin-tech-provider.html`: guía web sin JavaScript, índice y enlaces a los siete pasos.
- `public/guias/whatsapp-sin-tech-provider.pdf`: 11 páginas, enlaces absolutos a Meta y al CRM; índice interno.
- `public/guias/whatsapp-manual/`: tres recortes sanitizados. La antigua captura de activos asignados se reemplazó por un esquema con texto legible; ningún original ni dato de cuenta en el repositorio.
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

## Publicación verificada

La confirmación inicial terminó sin respuesta y no se publicó entonces. Después el titular autorizó explícitamente: «hacxelo publica asi lo veo».

- Push no forzado `HEAD:main`, leído nuevamente desde GitHub: `5b18d6a650dfa76b9bc6663a8592fac9ecfbaefd`.
- Un solo deploy por API para `h5tyzu5np5i8g4efn06n0yxo`: UUID `8ai6pg9vutdodvncvacrycpk`, estado `finished`, finalizado `2026-11-23 21:07:07` UTC. Contenedor nuevo `healthy` con imagen del SHA exacto.
- Health público: HTTP 200, `ok:true`, `commit:5b18d6a`. Durante el recambio hubo un 502 transitorio; se releyó hasta confirmar recuperación.
- HTML, PDF y cuatro imágenes: HTTP 200, tipo de contenido correcto y SHA-256 idéntico al artefacto local en los seis archivos.
- En la sesión real de Rafael, `/settings/whatsapp` muestra visibles «Guía visual paso a paso» y «Descargar guía PDF». Se confirmaron destinos, atributo `download` y aviso de alcance manual sin enviar ni guardar formularios.
- Navegador público: 11 secciones, cuatro imágenes del documento cargadas, cero anclas inexistentes. Anchos CSS reales 1280/390/320 sin desborde horizontal ni elementos fuera del viewport. El zoom del navegador exigió corregir la emulación antes de medir.
- Índice probado con pestaña activa: clic en `#paso2`, hash correcto, `scrollY:3670`, sección a 19.87 px del borde superior. El primer intento en pestaña de fondo no desplazó la ventana; se repitió con `Page.bringToFront`.
- El bloqueo del preview local quedó resuelto comprobando la URL pública permitida; no se eludió la restricción de direcciones privadas.
- No se modificaron Meta, Airtable, credenciales ni canales. Esta publicación agrega ayuda, no conecta por sí misma el número.

Guía: https://vocero.sistemasagenticos.cloud/guias/whatsapp-sin-tech-provider.html

PDF: https://vocero.sistemasagenticos.cloud/guias/whatsapp-sin-tech-provider.pdf

Acceso dentro del CRM: https://vocero.sistemasagenticos.cloud/settings/whatsapp

## Corrección del paso 5: Asignar activos

El anterior recorte sanitizado dejaba los rótulos rodeados de tachones. Se reemplazó por dos tarjetas de texto (app y cuenta de WhatsApp), el permiso de cada activo y la comprobación en «Activos asignados». El esquema no contiene píxeles de una captura ni simula que se hayan dado permisos. En el PDF, el cambio queda en la página 7 de 11.

Commit `64962d2`; deploy `t0jhk3danyvf2kc3mbx9uyxo` → `finished` con ese commit a las 2026-11-24 13:14:46 UTC.

Evidencia ejecutada:

- PDF regenerado con WeasyPrint: 11 páginas A4, `pdftotext` confirma que la única página distinta a la anterior es la 7, con «Asignar activos: qué seleccionar», «Acceso total a esa app» y «Acceso total a esa cuenta»; esa página ya no lleva imágenes (`pdfimages -list` vacío). Inspección visual de la página 7: dos tarjetas legibles, sin solapamientos ni recortes.
- HTML: 11 secciones, 2 elementos en el esquema, 3 imágenes restantes y todas las anclas del índice resuelven. `git diff --check` sin errores.
- `pnpm typecheck`: exit 0. `pnpm lint`: exit 0 con un warning preexistente en `src/components/app-nav.tsx:180`. `pnpm test`: 679 passed / 74 skipped, 86 archivos pasados.
- Producción: `/api/health` HTTP 200 con `commit:64962d2`; HTML servido con el esquema (1 ocurrencia) y 0 referencias a la captura retirada; PDF servido byte a byte igual al local (SHA-256); `meta-usuario-sistema.png` responde 404; las tres imágenes restantes responden 200.
- Navegador sobre la URL pública: a 1280 px el esquema usa 2 columnas de 391 px; a 390 y 320 px pasa a 1 columna, sin desborde horizontal, sin elementos fuera del viewport, sin texto recortado y con las 4 imágenes cargadas. El zoom del perfil altera `innerWidth`, así que cada ancho se calibró antes de medir y se assertó el valor real.
- Copias de Diego regeneradas: el HTML local lleva las 3 imágenes incrustadas, sin referencias externas, y apunta al PDF homónimo; el PDF local es idéntico al publicado.
