# 038 — Dashboard Management (cockpit embebido)

**Carril: ligero** (spec antes de código; comportamiento observable nuevo sin
migración ni contrato publicado).

## Problema

El cockpit ejecutivo (rafael-intelligence, `dashbord-raseguros.sistemasagenticos.cloud`)
—Pulso, Cartera, Retención, Reactivación, Venta cruzada, Cliente 360°, CRM ·
Venta y gestión, Calidad de datos, con sus listas y sugerencias— es una
herramienta central del negocio, pero hoy vive como un tercer sistema aparte:
el equipo mantiene abiertos el backoffice (Airtable), el CRM y el cockpit.

## Qué se construye

Una sección **«Dashboard Management»** dentro del CRM que muestra el cockpit
**tal cual es** —sin fork, sin reimplementación, sin perder ninguna
funcionalidad— embebido en un iframe a pantalla completa.

## Comportamiento observable (criterios de aceptación)

1. **Dueño y propietarios** (roles `owner` y `admin` del CRM) ven la entrada
   «Dashboard Management» en el menú lateral, después de «Laboratorio».
2. Al abrirla, el cockpit carga embebido ocupando todo el área de contenido,
   con **todas sus secciones y funciones operativas tal como en su dominio**
   (navegación interna por módulos, filtros, listas, sugerencias, IA,
   «Abrir ficha en el backoffice», copiar mensaje de WhatsApp, etc.).
3. Un botón flotante discreto **«Abrir en una pestaña nueva»** permite sacarlo
   a ventana completa cuando haga falta.
4. Mientras el iframe carga, se muestra un velo sobrio; al terminar
   (`onLoad`) desaparece. Si el cockpit no responde, el velo ofrece
   reintentar.
5. **`member` (empleado) no ve la entrada ni puede abrir la ruta**: la página
   redirige a la Bandeja (server-side), misma regla que «Agente» (021).
6. **Por instancia**: la URL del cockpit sale de `DASHBOARD_MANAGEMENT_URL`.
   - Sin variable → apunta al cockpit de este ecosistema (default).
   - `DASHBOARD_MANAGEMENT_URL=off` → la sección no existe (ni menú ni ruta:
     `notFound()`), para instancias clonadas que no tengan cockpit.
   - Cualquier otra URL → esa (permite apuntar a otro cockpit sin recompilar).

## Decisiones

- **Iframe, no integración de código**: el cockpit es un producto vivo con su
  propio ciclo de deploy (Coolify `g4k8i3s4i2t3diogh6rrdm6g`); embeberlo
  conserva TODO su comportamiento sin duplicar mantenimiento. El dominio
  permite iframes (sin X-Frame-Options ni CSP `frame-ancestors`).
- **Sin `sandbox`**: es un dominio propio; el sandbox restrictivo rompería
  almacenamiento y pop-ups del cockpit. Se permite `clipboard-write` (el
  cockpit copia mensajes de WhatsApp).
- **Gating server-side + nav client-side**: la ruta valida el rol en el
  servidor (no confiar en ocultar el ítem); el menú oculta el ítem para no
  ofrecer algo que redirige.
- **`force-dynamic`**: consistente con el resto de páginas del shell.

## Fuera de alcance

- Modificar el cockpit (queda byte a byte como está, con su deploy propio).
- Deep-links del CRM a un módulo específico del cockpit (su navegación es
  estado interno de la SPA; si se quisiera, es una ronda aparte del cockpit).
- Autenticación propia del cockpit (hoy es de acceso abierto, como ya lo es
  en su dominio; si se quiere restringir, es decisión y obra del cockpit).
