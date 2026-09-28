# 043 — Asistente de conexión de WhatsApp (guía paso a paso para el negocio)

**Carril: ligero** (spec antes de código; comportamiento observable nuevo sin
migración de datos ni contrato publicado nuevo — reutiliza la API interna de
settings y el webhook existentes).

## Problema

Hoy la conexión del número se hace con el wizard de «Ajustes → WhatsApp»: explica
los dos orígenes del token (modo directo / agencia) y pide WABA ID + Phone Number
ID + token en un formulario. Para alguien técnico alcanza; para el dueño de un
negocio (o su empleado) —el caso real: Rafael, cliente de la agencia— esos tres
datos no se sabe de dónde salen: qué es un portfolio de Meta, cómo se crea la
app, dónde se agrega y verifica el número, cómo se genera un usuario del sistema
con sus permisos. El paso que habilita TODO el producto (sin número conectado no
hay canal) queda dependiente de que alguien técnico lo haga a mano.

Hace falta un asistente que lleve de la mano por el alta completa en Meta,
valide en vivo lo que se pueda validar, y permita que «lo que falte lo termine
quien ayuda al negocio» (su proveedor/agencia).

## Qué se construye

Dentro de «Ajustes → WhatsApp», un **asistente de conexión por pasos** para
personas no técnicas, con tres recorridos sobre la misma superficie:

1. **Guiado completo** (7 pasos, cada uno con enlace directo a la página exacta
   de Meta e instrucciones numeradas):
   1. **Tu negocio en Meta** — portfolio (crear o usar el existente).
   2. **La app de Meta** — crear app con el caso de uso «Conectar con clientes a
      través de WhatsApp».
   3. **Tu cuenta de WhatsApp Business (WABA)** — conectar/crear desde el panel
      de la app. Nota: si Meta te la crea sola al crear el portfolio, no hagas nada.
   4. **El número** — agregar y verificar (SMS o llamada). Advertencia
      prominente: el número conectado sale de la app de WhatsApp y se atiende
      por el CRM (el chip sigue para llamadas y SMS comunes).
   5. **El usuario del sistema y el token** — permisos exactos
      (`business_management`, `whatsapp_business_messaging`,
      `whatsapp_business_management`) y asset assignment app+WABA.
   6. **Probar conexión y guardar** — el paso actual del wizard, embebido tal
      cual (misma validación contra Meta, mismo guardado cifrado).
   7. **El webhook + prueba en vivo** — URL y verify token que ya muestra el
      CRM con instrucciones para pegarlos en el panel de Meta, aviso de firma
      (App Secret), y la prueba real: «escribile a tu número desde otro
      teléfono; lo vas a ver en la Bandeja».
2. **Camino corto «Ya tengo los datos»** — salta directo al paso 6. El flujo
   actual queda intacto para quien ya hizo el alta en Meta.
3. **«Lo hace quien me ayuda»** — en cualquier paso, botón que genera un
   **resumen copiable del estado** (pasos hechos y pendientes + valores ya
   capturados, SIN el token) para pasarle al proveedor/agencia, junto con el
   recordatorio de cómo darle acceso (Equipo → invitar).

## Comportamiento observable (criterios de aceptación)

1. **Sin conexión**: «Ajustes → WhatsApp» abre el asistente en el paso 1, con
   barra de progreso (1/7), requisitos previos a la vista, la advertencia del
   número, y el enlace directo a la página de Meta del paso. Responsive 390 px
   sin desborde (mobile-first).
2. **Navegación por pasos**: cada paso muestra instrucciones numeradas + enlace
   («Abrir Meta») + casilla «Listo, ya lo hice» para avanzar; se puede volver
   atrás sin perder lo cargado (estado en memoria de la pestaña).
3. **Captura de datos** (pasos 3, 4 y 6): WABA ID y Phone Number ID en campos
   normales; token en campo password — jamás se muestra, se cifra al guardar
   (misma API/tratamiento que hoy).
4. **«Probar conexión»** (paso 6): idéntico al comportamiento actual — válido →
   «Token válido para +XX…» y recién ahí se habilita Guardar; inválido → error
   accionable sin guardar nada. Guardar → estado «Conectado» (display number,
   token …last4) + webhook visible.
5. **Paso 7**: URL del webhook + verify token con botones copiar (los
   actuales), instrucciones para el panel de Meta, aviso informativo si
   `META_APP_SECRET` no está configurado, y la prueba en vivo descrita.
6. **Resumen para el proveedor**: botón que copia un texto plano con el estado
   (pasos hechos/pendientes + datos capturados SIN token) y cómo dar acceso;
   disponible en cualquier paso.
7. **Con conexión existente**: se mantiene el estado de hoy (Conectado +
   reconectar/actualizar + webhook), con acceso a «volver a ver la guía» para
   consultar los pasos sin perder nada.
8. **Agent-first (I)**: la superficie de agente no cambia —
   `GET/PUT /api/settings/whatsapp`, `/api/settings/whatsapp/test` y
   `/api/settings/webhook` siguen siendo el equivalente completo de la UI.
9. **Sin regresiones**: la ruta sigue owner-only (`guardSettingsTab("owner")`),
   los gates del repo (typecheck, lint, test, build) en verde, y el guion E2E
   de conexión se extiende con la conducción real del asistente.

## Puerta constitucional (carril ligero)

- **II (Seguridad)**: el token mantiene el tratamiento actual — input password,
  validación contra Meta ANTES de guardar, cifrado en reposo, único …last4 en
  respuestas; el resumen para el proveedor lo excluye explícitamente.
- **III (Soberanía)**: cero dependencias nuevas; solo enlaces que el usuario
  abre en su navegador.
- **IX (Foco)**: conecta el canal del negocio — dentro del alcance.
- **I (Agent-First)**: la API existente sigue siendo la puerta neutral.
- **X (Verificación en vivo)**: conducción real del asistente (Playwright)
  en el ciclo de implementación, además de los gates.

## Decisiones

- **Guía con enlaces directos, sin capturas de pantalla**: las pantallas de
  Meta cambian seguido; un texto numerado + enlace a la página exacta envejece
  mejor que imágenes que se desactualizan. Las capturas quedan fuera de v1.
- **Sin persistencia del progreso en servidor** (carril ligero): el dato real
  es la conexión guardada; el progreso vive en la pestaña y el resumen cubre el
  handoff. Nada nuevo en la base.
- **El asistente no ejecuta nada en Meta**: guía y valida con lo que ya existe
  (probar conexión + prueba en vivo). La ejecución embebida es el Embedded
  Signup (v2, requiere ser Tech Provider).
- **Cero endpoints nuevos**: reutiliza la API interna de settings; el
  comportamiento observable nuevo es de UI.
- **Paso 6 embebido, no duplicado**: el formulario de conexión es el mismo
  componente que hoy; el asistente lo envuelve, no lo reimplementa.

## Fuera de alcance

- **Embedded Signup / Tech Provider** (v2): cuando el trámite exista, el popup
  reemplaza los pasos 1–5 y el asistente queda como contenedor. Hoy la
  coexistencia (app + API a la vez) tampoco entra por acá.
- **Panel central multi-cliente de agencia** (contra Principio IX): el remate
  ocurre dentro de la instancia con los roles existentes.
- **Capturas/animaciones** de las pantallas de Meta.
- **Cambios de gating**: la sección sigue owner-only como hoy.
