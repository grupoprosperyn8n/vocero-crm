# 039 — Dashboard Management: pulido visual + etiquetas Airtable + IA del CRM

**Carril: ligero** (spec antes de código; comportamiento observable nuevo sin
migración de datos ni contrato publicado nuevo).

## Problema

El Dashboard Management quedó funcional (038) pero cargado de texto: los
toolbars de «Cliente 360°» y «Cartera» mezclan explicaciones largas con los
controles, todo pesa igual y lo importante no resalta. Además las listas
muestran estados y datos como texto gris, cuando en el backoffice de Airtable
esos mismos datos son etiquetas con color (estado de póliza, forma de pago),
y el usuario reconoce el dato por su color.

Por último, la capa de IA del tablero corre hoy en el cockpit con su propio
token (`AI_API_TOKEN` de rafael-intelligence): es una conexión de IA aparte.
El CRM ya tiene su propia conexión de IA (Ajustes → IA, por organización) y
el pedido es que el dashboard use ESA conexión.

## Qué se construye

1. **Etiquetas con los colores de Airtable**: las listas del tablero muestran
   los valores de los campos de selección (estado de póliza, forma de pago)
   como chips con el MISMO nombre y color de la opción en el backend de
   Airtable. La paleta se toma de la metadata real de las bases (consultada
   el 18Sep2026) — sin inventar colores.
2. **Toolbars sin ruido y con iconos**: se acortan los textos de las barras
   (lo explicativo pasa a tooltip o a un plegable) y se agregan iconos/acentos
   para jerarquizar: presets de fecha, limpiar, aviso de cartera plegable,
   barra de proporción en Compañías, punto de color por etapa del pipeline
   CRM, iconos en los badges de vínculo del macheo.
3. **IA del dashboard sobre la conexión del CRM**: los análisis de IA
   (Cliente 360° y módulos) se generan server-side en el CRM usando la
   configuración de IA de la organización (Ajustes → IA), con respaldo de la
   conexión legacy por env (`OPENROUTER_*`). El cockpit deja de prestar su
   motor para esto. Cada fila de motor muestra el estado de la conexión
   (modelo activo o «IA no conectada») con acceso directo a Ajustes → IA.

## Comportamiento observable (criterios de aceptación)

1. **Etiquetas = Airtable**: en Cartera (Pólizas cargadas / Pólizas activas)
   y Retención (vencimientos / a observar) cada póliza muestra chips con el
   valor crudo de «ESTADO DE LA POLIZA» (ej. `VIGENTE` teal `#20D9D2`,
   `VENCE EN 30 DIAS` `#F99DE2`, `RENOVADA` verde `#20C933`, `ANULACION`
   `#F82B60`) y de «FORMA DE PAGOS» (ej. `CREDITO` azul `#2D7FF9`), con el
   mismo texto de la opción en Airtable. Un valor desconocido se muestra como
   chip neutro; nunca se rompe la lista.
2. **Toolbars limpios**: «Cliente 360°» y «Cartera» ya no muestran frases
   largas a la vista (van a tooltip/plegable); los controles llevan iconos;
   se mantiene TODO lo funcional (buscador, motor, presets, filtros, aviso).
3. **Conexión de IA visible**: cada fila «Motor» (Cliente 360° y módulos)
   muestra chip de estado: «IA conectada · <modelo>» con acceso a
   Ajustes → IA, o «IA no conectada» con botón «Conectar IA →». El estado
   sale de `GET /api/dashboard-management/ai-status` (sin secretos).
4. **Análisis IA por el CRM**: «Generar análisis» (cliente o módulo) responde
   con la conexión de IA del CRM; sin cockpit de por medio. Si la IA no está
   configurada → mensaje claro + acceso a conectarla; si el proveedor falla →
   error accionable y se puede reintentar. El panel IA existente no cambia de
   forma (`resumen/focos/acciones/mensaje`, `accion/porQue/pasos/mensajeWhatsapp`).
5. **member sigue sin acceso** a página y endpoints del tablero (403/redirect)
   — sin cambios. Instancia `DASHBOARD_MANAGEMENT_URL=off` sigue en 404/503.
6. **Sin regresiones**: móvil 390 px sin desborde; 0 errores de consola; los
   gates del repo (typecheck, lint, test, build) en verde.

## Dependencia upstream (rafael-intelligence)

El enriquecimiento de las listas con `tags` (valores crudos de estado/forma de
pago por registro) se agrega como campo OPTATIVO `tags?: string[]` en
`DrillItem` del cockpit — cambio aditivo, no rompe su contrato ni su UI.
El mapeo valor → color vive en el CRM (`airtable-colors.ts`), así que si una
lista llega sin `tags` no se muestra ningún chip.

## Fuera de alcance

- Cambios de navegación, cálculos o datos del tablero.
- Colores para campos que hoy no se muestran (motivos, oficinas, coberturas):
  quedan mapeados solo estado de póliza y forma de pago; se amplía si hace falta.
