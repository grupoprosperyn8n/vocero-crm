export type TabId =
  | "pulso"
  | "cola"
  | "cartera"
  | "retencion"
  | "reactivacion"
  | "cross"
  | "clientes"
  | "crm"
  | "propuestas"
  | "seguimiento"
  | "campanas"
  | "migracion";

export type HelpAction =
  | { kind: "goto"; tab: TabId }
  | {
      kind: "dates";
      preset: "month" | "lastMonth" | "year" | "all";
    };

export type HelpSuggestion = {
  text: string;
  action?: HelpAction;
};

export type ModuleHelp = {
  title: string;
  tagline: string;
  what: string[];
  measures: string[];
  usage: string[];
  suggestions: HelpSuggestion[];
};

/*
 * Guía interactiva por módulo: qué es, qué mide, para qué sirve
 * y sugerencias accionables (abren el módulo o aplican un período).
 * Lenguaje simple, pensado para el dueño del negocio.
 */
export const MODULE_HELP: Record<
  TabId,
  ModuleHelp
> = {
  pulso: {
    title: "Pulso del negocio",
    tagline:
      "¿Estamos creciendo o perdiendo? La foto general, mes a mes.",
    what: [
      "Es la radiografía del negocio: cuánto entra (altas), cuánto sale (anulaciones), más siniestros y cotizaciones.",
      "Combina la historia de Rafael con lo ya cargado en el sistema nuevo; cada número aclara de dónde viene.",
    ],
    measures: [
      "Altas, anulaciones y el crecimiento neto (altas menos anulaciones).",
      "Siniestros y cotizaciones del período.",
      "Evolución mes a mes y reparto por canal, producto y oficina.",
    ],
    usage: [
      "Mirá primero el crecimiento neto: positivo = el negocio crece.",
      "Usá los atajos de período (Este mes / Este año) para enfocar la vista.",
      "Si algo cae, filtrá por oficina o canal para encontrar dónde está el problema.",
    ],
    suggestions: [
      {
        text: "Ver solo este mes",
        action: { kind: "dates", preset: "month" },
      },
      {
        text: "Ver este año",
        action: { kind: "dates", preset: "year" },
      },
      {
        text: "Proteger lo que vence → Retención",
        action: { kind: "goto", tab: "retencion" },
      },
    ],
  },

  cola: {
    title: "Cola de hoy",
    tagline:
      "El análisis del negocio convertido en acción: qué hacer hoy y con quién.",
    what: [
      "Cada jugada la calcula el motor de datos sobre la cartera real: renovaciones al borde del vencimiento, reactivación, venta cruzada y retención en riesgo.",
      "Cada fila es un cliente concreto, con su motivo y el camino listo para actuar: mensaje con IA, chat, llamada y ficha en el backoffice.",
    ],
    measures: [
      "Renovaciones ≤7 días (hablar hoy) y de 8 a 30 días (agendar).",
      "Reactivación: históricos valiosos sin póliza activa.",
      "Venta cruzada: clientes con una sola póliza activa.",
      "Retención a observar: activos con anulaciones en su historia.",
    ],
    usage: [
      "Arrancá la mañana por la primera jugada: son las más urgentes.",
      "Usá «Mandar mensaje»: la IA redacta, se busca al cliente y se abre el chat con el borrador ya cargado.",
      "Filtrá por oficina o empleado para repartir la cola del equipo.",
    ],
    suggestions: [
      {
        text: "Proteger lo que vence → Retención",
        action: { kind: "goto", tab: "retencion" },
      },
      {
        text: "Ver oportunidades de venta cruzada",
        action: { kind: "goto", tab: "cross" },
      },
    ],
  },

  cartera: {
    title: "Cartera",
    tagline:
      "Todo lo vigente que ya está cargado en el sistema nuevo.",
    what: [
      "Las pólizas cargadas en la plataforma nueva: cuántas hay, cuántas están activas y cuánta prima representan.",
      "Incluye el reparto por compañía y producto, y los vencimientos próximos.",
    ],
    measures: [
      "Pólizas cargadas vs. activas, y prima activa.",
      "Clientes activos y distribución por compañía y producto.",
      "Pólizas que vencen en los próximos 7 y 30 días.",
    ],
    usage: [
      "Usala para saber exactamente qué cartera administrás hoy.",
      "Filtrá por compañía para ver concentración de riesgo.",
      "Recordá: es parcial hasta que cierre la migración (mirá Calidad de datos).",
    ],
    suggestions: [
      {
        text: "Ver qué vence pronto → Retención",
        action: { kind: "goto", tab: "retencion" },
      },
      {
        text: "Seguir el avance de la migración",
        action: { kind: "goto", tab: "migracion" },
      },
    ],
  },

  retencion: {
    title: "Retención",
    tagline:
      "Tu prioridad del día: lo que se vence y quién está en riesgo.",
    what: [
      "Las pólizas que se vencen y los clientes que conviene contactar antes de perderlos.",
      "Combina la situación de hoy (pólizas activas) con las señales de la historia (anulaciones y siniestros).",
    ],
    measures: [
      "Vencen ≤7 días: las llamadas de hoy.",
      "Vencen ≤30 días: la ronda del mes.",
      "Clientes activos con anulaciones históricas y siniestros del período.",
    ],
    usage: [
      "Empezá siempre por el bloque de ≤7 días.",
      "Después armá la ronda de ≤30 días: llamar antes es retener.",
      "Varias anulaciones en la historia = cliente en riesgo: contactalo ya.",
    ],
    suggestions: [
      {
        text: "Enfocar el mes en curso",
        action: { kind: "dates", preset: "month" },
      },
      {
        text: "Preparar un llamado → Cliente 360°",
        action: { kind: "goto", tab: "clientes" },
      },
    ],
  },

  reactivacion: {
    title: "Reactivación",
    tagline:
      "Clientes que ya te conocen y hoy no tienen póliza activa.",
    what: [
      "La lista de clientes con historia de compra (altas) que hoy no tienen ninguna póliza activa cargada.",
      "Es la venta más fácil: ya te conocen y ya confiaron en vos.",
    ],
    measures: [
      "Candidatos a reactivar y universo potencial.",
      "Cuántos tenían una sola póliza o varias (los más fieles).",
    ],
    usage: [
      "Filtrá por oficina para repartir los llamados entre el equipo.",
      "Antes de llamar, abrí la ficha del cliente en Cliente 360° para ver su historia.",
      "Los de score más alto son los que más conviene recuperar.",
    ],
    suggestions: [
      {
        text: "Ver la ficha completa de un cliente",
        action: { kind: "goto", tab: "clientes" },
      },
      {
        text: "Ver el año completo",
        action: { kind: "dates", preset: "year" },
      },
    ],
  },

  cross: {
    title: "Venta cruzada",
    tagline: "Venderle más al que ya confía.",
    what: [
      "Detecta qué producto le falta a cada cliente según lo que ya tiene (ej.: Auto sin Auxilio, sin Hogar, sin Vida).",
      "No hay que salir a buscar clientes nuevos: se crece sobre la cartera propia.",
    ],
    measures: [
      "Pares producto → producto faltante, con la cantidad de casos de cada uno.",
      "Clientes con una sola póliza (la oportunidad directa).",
      "Clientes con 2 o más pólizas (los más vinculados al negocio).",
    ],
    usage: [
      "Agarrá el par con más casos y armá la campaña de la semana.",
      "Filtrá por producto (ej. AUTO) para enfocar la oferta.",
      "Cruzá con Cliente 360° para preparar cada llamada.",
    ],
    suggestions: [
      {
        text: "Ver clientes para ofrecer",
        action: { kind: "goto", tab: "clientes" },
      },
    ],
  },

  clientes: {
    title: "Cliente 360°",
    tagline:
      "La ficha completa del cliente, antes de cada llamado.",
    what: [
      "Un buscador que junta TODO lo que sabés de un cliente: historia, pólizas activas, prima y una recomendación de acción.",
      "El score de 0 a 100 indica prioridad de atención: más alto = atender primero.",
    ],
    measures: [
      "Pólizas activas, prima activa y gestiones históricas (altas, anulaciones, siniestros).",
      "Score 0-100: prioridad comercial (no es riesgo crediticio).",
      "Próxima mejor acción: reactivar, vender cruzado, retener o hacer seguimiento.",
    ],
    usage: [
      "Buscá por nombre, DNI o teléfono (coincidencia parcial).",
      "Antes de llamar, leé la «próxima mejor acción» y el score.",
      "Sin búsqueda, ves las últimas 100 altas del maestro de clientes.",
    ],
    suggestions: [
      {
        text: "Buscar clientes para reactivar",
        action: { kind: "goto", tab: "reactivacion" },
      },
    ],
  },

  crm: {
    title: "CRM · Venta y gestión",
    tagline:
      "Tu WhatsApp y el embudo de ventas, en tablero.",
    what: [
      "El movimiento del CRM: conversaciones, mensajes, respuestas del asistente automático y el embudo de ventas.",
      "Cruza cada contacto con la cartera: ¿ya es cliente? ¿qué pólizas tiene? ¿tiene algo por vencer?",
    ],
    measures: [
      "Conversaciones (abiertas/cerradas), mensajes recibidos y enviados, respuestas con IA.",
      "Embudo: Nuevo → En conversación → Interesado → Cliente → Perdido.",
      "Vínculo con la cartera: contactos que ya son clientes y prima activa vinculada.",
    ],
    usage: [
      "Revisá primero las oportunidades abiertas del embudo.",
      "Un contacto que ya es cliente = oportunidad de venta cruzada.",
      "Mirá el día a día de mensajes para entender el ritmo de atención.",
    ],
    suggestions: [
      {
        text: "Ver quién está listo para ofrecerle algo → Venta cruzada",
        action: { kind: "goto", tab: "cross" },
      },
    ],
  },

  propuestas: {
    title: "Propuestas comerciales",
    tagline:
      "La publicidad de cada sugerencia, derivada al empleado y medida en el embudo.",
    what: [
      "Cada propuesta es una pieza publicitaria (imagen, oferta, beneficio y botón de acción) que el cliente abre desde cualquier computadora con un link.",
      "Se arma desde el panel del cliente en Cliente 360°, se deriva a un empleado con prioridad —igual que las alertas, con el aviso en el chat interno— y se envía por WhatsApp.",
    ],
    measures: [
      "Embudo: creadas → derivadas → enviadas → vistas → respondidas.",
      "A quién está asignada cada propuesta, con qué prioridad y cómo le fue.",
    ],
    usage: [
      "Creá la propuesta desde el panel de un cliente (tipo sugerido por el motor de datos).",
      "Derivala al empleado que la va a trabajar: le llega el aviso con el link a su chat interno.",
      "Seguí acá las vistas y respuestas para saber qué mensaje convierte.",
    ],
    suggestions: [
      {
        text: "Ir al panel de un cliente y crear una propuesta",
        action: { kind: "goto", tab: "clientes" },
      },
    ],
  },

  seguimiento: {
    title: "Seguimiento comercial · Cliente 360°",
    tagline:
      "Todo lo que el sistema hizo, para revisarlo siempre: acciones ejecutadas y propuestas, por acción o por cliente.",
    what: [
      "Es el archivo comercial del Cliente 360°: cada propuesta con sus hitos (creada → derivada → enviada → vista → respondió) y cada acción ya ejecutada desde la Cola de hoy o desde la ficha.",
      "Un cliente puede tener varias acciones y propuestas a lo largo del tiempo: la vista «Por cliente» las agrupa para ver a quién ya se tocó y con qué resultado.",
    ],
    measures: [
      "Por acción: la línea de tiempo completa, lo más nuevo arriba.",
      "Por cliente: cuántas propuestas y acciones tiene cada uno y cuándo fue la última.",
    ],
    usage: [
      "Cambiá entre «Por acción» y «Por cliente» según la estrategia que estés armando.",
      "Filtrá por quién gestiona, por origen (cola, ficha o propuesta) y buscá un cliente puntual.",
      "El nombre del cliente abre su panel de control; «Abrir pieza» muestra la página pública de la propuesta.",
    ],
    suggestions: [
      {
        text: "Ver las propuestas y su embudo",
        action: { kind: "goto", tab: "propuestas" },
      },
    ],
  },

  campanas: {
    title: "Campañas 360",
    tagline:
      "El macro de todas las publicidades comerciales: quién las trabaja y cómo responden.",
    what: [
      "Junta TODAS las campañas creadas en la ficha 360° de cada cliente: creadas, derivadas, enviadas, vistas y respondidas.",
      "Cada campaña nace en el panel de un cliente y vive acá como parte del embudo comercial del equipo.",
    ],
    measures: [
      "El embudo completo: creadas → derivadas → enviadas → con vistas → respondieron.",
      "Cómo va cada integrante: cuántas gestiona y cuántas le respondieron.",
      "Qué tipo de campaña funciona mejor (renovación, retención, venta cruzada…).",
      "La actividad de los últimos 14 días.",
    ],
    usage: [
      "Mirá primero «Respondieron»: es la única métrica que significa plata.",
      "Filtrá por estado o buscá un cliente para seguirlo puntualmente.",
      "«Panel 360» abre el cliente completo: sus métricas y todas sus campañas.",
    ],
    suggestions: [
      { text: "Ver la cola de hoy", action: { kind: "goto", tab: "cola" } },
      { text: "Ir a Propuestas", action: { kind: "goto", tab: "propuestas" } },
    ],
  },

  migracion: {
    title: "Calidad y avance de migración",
    tagline:
      "¿Cuánto de la base vieja ya quedó vinculado a la nueva?",
    what: [
      "El termómetro de la migración: qué porcentaje de clientes y gestiones cruzan entre la base histórica y el sistema nuevo.",
      "También muestra lo que falta completar para confiar plenamente en la cartera cargada.",
    ],
    measures: [
      "Clientes y gestiones vinculadas (%).",
      "Pólizas sin cliente, sin producto, sin compañía o sin vencimiento.",
    ],
    usage: [
      "Seguí acá el avance real de la carga, sin sorpresas.",
      "Cuando llegue a ~100%, la cartera cargada es la definitiva y el histórico pasa a ser archivo.",
    ],
    suggestions: [
      {
        text: "Ver la cartera actual",
        action: { kind: "goto", tab: "cartera" },
      },
    ],
  },
};
