/**
 * Cuestionario "Datos del negocio" del Laboratorio.
 *
 * Son los datos que el agente necesita saber y que el negocio todavía no cargó:
 * por eso hoy el Laboratorio muestra conversaciones donde todo lo específico
 * termina derivado ("lo ve un asesor"). Cada ítem que el dueño completa acá se
 * guarda como una entrada `qa` del Conocimiento usando `kbQuestion` como
 * pregunta canónica — sin traducciones intermedias: lo que se completa en el
 * formulario lo usa el agente real (Laboratorio y chat) al instante.
 *
 * Los `kbQuestion` de los ítems ya existentes coinciden EXACTO (modulo
 * mayúsculas/espacios) con entradas cargadas a mano: el formulario las muestra
 * como "Cargado" y editarlas ACTUALIZA esa entrada en vez de duplicarla.
 */
export type BusinessItem = {
  id: string;
  /** Etiqueta visible en el formulario (lo que responde el dueño). */
  question: string;
  /** Ayuda corta de qué conviene escribir. */
  hint: string;
  /** Pregunta canónica en el Conocimiento (clave del upsert). */
  kbQuestion: string;
};

export type BusinessGroup = {
  key: string;
  title: string;
  description: string;
  items: BusinessItem[];
};

export const BUSINESS_FORM: BusinessGroup[] = [
  {
    key: "vida",
    title: "Seguro de vida",
    description: "Hoy el chat no tiene estos datos: por eso deriva todo lo de vida.",
    items: [
      {
        id: "vida_coberturas",
        question: "¿Qué cubre el seguro de vida?",
        hint: "Fallecimiento, invalidez, anticipo por enfermedad… lo que aplique.",
        kbQuestion: "¿Qué cubre el seguro de vida?",
      },
      {
        id: "vida_requisitos",
        question: "¿Qué requisitos pide para contratar (edades, salud)?",
        hint: "Edad mínima y máxima de ingreso; si piden declaración de salud.",
        kbQuestion: "¿Qué requisitos tiene el seguro de vida?",
      },
    ],
  },
  {
    key: "descuentos",
    title: "Descuentos y promos",
    description:
      "Hoy cualquier consulta de descuento termina derivada por falta de dato.",
    items: [
      {
        id: "desc_auto_hogar",
        question: "¿Hay descuento por asegurar auto y hogar juntos? ¿De cuánto?",
        hint: "Porcentaje y condiciones. Si no existe, escribe «No hay» y el chat lo dirá así.",
        kbQuestion: "¿Hay descuento por asegurar el auto y el hogar juntos?",
      },
      {
        id: "desc_promos",
        question: "¿Qué otras promociones o descuentos están vigentes?",
        hint: "Combinaciones con descuento, promos del mes, referidos, beneficios para clientes…",
        kbQuestion: "¿Qué promociones y descuentos vigentes hay?",
      },
    ],
  },
  {
    key: "contratacion",
    title: "Contratación y garantía",
    description: "Qué pasa desde «quiero contratar» hasta tener la póliza.",
    items: [
      {
        id: "contrata_pasos",
        question: "¿Cómo se contrata una póliza, paso a paso?",
        hint: "Qué hace el cliente y qué hace el estudio. ¿La firma es digital?",
        kbQuestion: "¿Cómo se contrata una póliza?",
      },
      {
        id: "contrata_arrepentimiento",
        question: "Después de contratar, ¿se puede cancelar o pedir devolución? ¿En qué plazo?",
        hint: "Derecho de revocación, devolución de prima y plazos.",
        kbQuestion: "Contraté una póliza, ¿puedo cancelarla o pedir devolución?",
      },
      {
        id: "baja_modificacion",
        question: "¿Cómo se dan de baja o se modifican las pólizas?",
        hint: "Ya hay una respuesta cargada — edítala si quieres dar más detalle.",
        kbQuestion:
          "¿Cómo doy de baja o modifico mi póliza (cambio de vehículo, domicilio, cobertura)?",
      },
    ],
  },
  {
    key: "pagos",
    title: "Pagos",
    description: "Formas de pago y conveniencia del pago anual.",
    items: [
      {
        id: "pago_anual",
        question: "¿Hay descuento por pagar el año completo? ¿Conviene?",
        hint: "Porcentaje o condiciones. Si no hay descuento, escríbelo igual.",
        kbQuestion: "¿Hay descuento por pagar el año completo?",
      },
      {
        id: "pago_cuotas",
        question: "¿Se puede pagar en cuotas? ¿Cuántas y con qué recargo?",
        hint: "Cuántas cuotas y con qué interés/recargo.",
        kbQuestion: "¿Se puede pagar en cuotas?",
      },
      {
        id: "medio_pago",
        question: "¿Cuáles son los medios de pago y cómo se adhiere el débito automático?",
        hint: "Ya hay una respuesta cargada — agrégale los pasos de débito automático si quieres.",
        kbQuestion: "¿Cuáles son los medios de pago?",
      },
    ],
  },
  {
    key: "precios",
    title: "Política de precios",
    description: "Cómo debe responder el chat ante consultas de precio.",
    items: [
      {
        id: "politica_precios",
        question: "¿Cómo debe responder el chat cuando piden precios?",
        hint: "Hoy: «los valores los arma un asesor». Si quieres que pueda dar rangos orientativos, escríbelos acá (ej: «Auto: desde $…»).",
        kbQuestion: "¿Cómo debe responder el chat las consultas de precio?",
      },
    ],
  },
  {
    key: "operacion",
    title: "Operación y contacto",
    description: "Datos de contacto y tiempos de respuesta del equipo.",
    items: [
      {
        id: "tiempo_respuesta",
        question: "¿En cuánto tiempo responde el equipo una consulta derivada?",
        hint: "Hoy el chat promete «a la brevedad». Fíjalo (ej: «en el día»).",
        kbQuestion: "¿En cuánto tiempo responde el equipo las consultas?",
      },
      {
        id: "contacto",
        question: "Teléfono / WhatsApp y email de atención",
        hint: "Los datos que puede dar el chat cuando preguntan cómo contactar al estudio.",
        kbQuestion: "¿Cuál es el teléfono y el email de contacto del estudio?",
      },
      {
        id: "siniestro_pasos",
        question: "¿Cómo se denuncia un siniestro y qué datos se piden?",
        hint: "Ya hay una respuesta cargada — súmale el paso a paso o teléfonos si quieres.",
        kbQuestion:
          "Tuve un accidente / quiero denunciar un siniestro (choque, robo, incendio): ¿qué hago?",
      },
    ],
  },
];

export const BUSINESS_ITEMS: BusinessItem[] = BUSINESS_FORM.flatMap((g) => g.items);

/** Clave de matching / upsert: sin mayúsculas y con espacios colapsados. */
export function normalizeQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}
