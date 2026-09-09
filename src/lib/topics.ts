/**
 * 1B — Catálogo de topics de negocio de las conversaciones.
 *
 * El topic lo setea el cerebro externo al derivar (POST /api/bot/handoff,
 * ver 1A) y el operador puede corregirlo/catalogarlo desde la bandeja.
 * Es la etiqueta que alimenta:
 *   - el filtro de la bandeja,
 *   - el router de asignación (topic + oficina + en línea),
 *   - el curado final (mapeo a MOTIVO/GESTIÓN GENERAL de Airtable).
 *
 * El mapeo EXACTO a los valores de MOTIVO de Airtable vive en el workflow
 * de curado de n8n (B2): el CRM mantiene el catálogo estable de acá; si
 * Airtable cambia sus motivos, se toca el mapa de n8n, no el CRM.
 *
 * Ids en minúscula sin acentos: viajan por API y se guardan en la DB.
 * El catálogo es extensible: un topic desconocido se muestra igual (raw),
 * nunca se pierde ni rompe la conversación.
 */
export const TOPIC_LIST = [
  { id: "cotizacion", label: "Cotización" },
  { id: "renovacion", label: "Renovación / vencimiento" },
  { id: "siniestro", label: "Siniestro / reclamo" },
  { id: "documentacion", label: "Documentación" },
  { id: "pedido", label: "Pedido / emisión" },
  { id: "cuenta", label: "Cuenta / cobranza" },
  { id: "baja", label: "Baja / cambios" },
  { id: "consulta", label: "Consulta general" },
  { id: "otro", label: "Otro" },
] as const;

export type TopicId = (typeof TOPIC_LIST)[number]["id"];

export const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
  TOPIC_LIST.map((t) => [t.id, t.label])
);

export function topicLabel(topic: string | null): string | null {
  if (!topic) return null;
  return TOPIC_LABEL[topic] ?? topic;
}

/**
 * Semáforo para el chip del topic en la bandeja: el color comunica la
 * urgencia/prioridad de un vistazo, igual que el resto de la UI.
 * siniestro = rojo (urgencia), documentacion/cuenta = ámbar (gestión en
 * curso), comercial (cotización/renovación/pedido) = azul de la marca,
 * consulta/otro = neutro.
 */
export const TOPIC_DOT: Record<string, string> = {
  siniestro: "#d94a4a",
  documentacion: "#f2a71b",
  cuenta: "#f2a71b",
  cotizacion: "#0d5bff",
  renovacion: "#0d5bff",
  pedido: "#0d5bff",
  consulta: "#8391aa",
  otro: "#8391aa",
};
const TOPIC_DOT_FALLBACK = "#8391aa";

export function topicDot(topic: string | null): string {
  if (!topic) return TOPIC_DOT_FALLBACK;
  return TOPIC_DOT[topic] ?? TOPIC_DOT_FALLBACK;
}
