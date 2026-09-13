/**
 * 027 — Alertas SGSA: helpers PUROS (server y cliente los comparten).
 *
 * El sistema de alertas vive en el backend de seguros (Railway) y su tabla
 * espejo en Airtable. Acá solo se interpreta lo que viaja: prioridad en
 * emojis (🔴🟠🟡), estados operativos y el detalle multilínea "clave: valor"
 * que la PWA viene mostrando desde siempre. Sin secretos: este archivo puede
 * importarse desde componentes de cliente.
 */

/** 3 = urgente, 2 = alta, 1 = media, 0 = info (mismas reglas que la PWA). */
export type AlertUrgency = 0 | 1 | 2 | 3;

const URGENCY_LABEL: Record<AlertUrgency, string> = {
  3: "Urgente",
  2: "Alta",
  1: "Media",
  0: "Info",
};

/** Prioridad (texto con emoji) → nivel de urgencia. */
export function alertUrgency(prioridad: string | null | undefined): AlertUrgency {
  const p = prioridad ?? "";
  if (p.includes("🔴")) return 3;
  if (p.includes("🟠")) return 2;
  if (p.includes("🟡")) return 1;
  return 0;
}

export function alertUrgencyLabel(u: AlertUrgency): string {
  return URGENCY_LABEL[u];
}

/** Estado operativo → etiqueta para mostrar (mismo mapa que la PWA). */
export function alertEstadoLabel(estado: string | null | undefined): string {
  switch ((estado ?? "").toUpperCase()) {
    case "EN_PROGRESO":
      return "En progreso";
    case "TURNO_CONFIRMADO":
      return "Turno conf.";
    case "CONCLUIDA":
      return "Concluido";
    case "ANULADA":
      return "Anulado";
    case "DESACTIVADA":
      return "Desactivada";
    case "REVISADA":
      return "Revisada";
    case "PENDIENTE":
      return "Pendiente";
    default:
      return estado ?? "";
  }
}

export type DetalleRow = { k: string; v: string } | { text: string };

/**
 * DETALLE viene como texto multilínea "Clave: valor". Mismas reglas que la
 * PWA: con ":" y ambos lados no vacíos → fila clave/valor; sin ":" → línea
 * suelta; con ":" pero algún lado vacío → se descarta.
 */
export function parseAlertDetalle(detalle: string | null | undefined): DetalleRow[] {
  const rows: DetalleRow[] = [];
  for (const line of (detalle ?? "").split("\n")) {
    if (!line.trim()) continue;
    const ci = line.indexOf(":");
    if (ci > 0) {
      const k = line.slice(0, ci).trim();
      const v = line.slice(ci + 1).trim();
      if (k && v) rows.push({ k, v });
    } else {
      rows.push({ text: line.trim() });
    }
  }
  return rows;
}

/** Estados que la PWA permite fijar a mano desde una alerta. */
export const ALERT_STATUSES = [
  "EN_PROGRESO",
  "TURNO_CONFIRMADO",
  "CONCLUIDA",
  "ANULADA",
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/** Fecha ISO (o "YYYY-MM-DD…") → "YYYY-MM-DD" para mostrar. */
export function alertDate(fecha: string | null | undefined): string {
  return (fecha ?? "").slice(0, 10);
}
