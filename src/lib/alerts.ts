/**
 * 027 — Alertas SGSA: helpers PUROS (server y cliente los comparten).
 *
 * El sistema de alertas vive en el backend de seguros (Railway) y su tabla
 * espejo en Airtable. Acá solo se interpreta lo que viaja: prioridad en
 * emojis (🔴🟠🟡), estados operativos y el detalle multilínea "clave: valor"
 * que la PWA viene mostrando desde siempre. Sin secretos: este archivo puede
 * importarse desde componentes de cliente.
 */

import type { PriorityValue } from "@/lib/types";

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

/** Estados operativos de una alerta (los que el CRM fija desde el pipeline/alertas). */
export const ALERT_STATUSES = [
  "PENDIENTE",
  "EN_PROGRESO",
  "TURNO_CONFIRMADO",
  "CONCLUIDA",
  "ANULADA",
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * 030 — ¿la derivación «sigue viva»? Mientras lo esté, la alerta pertenece a
 * su ejecutor (un solo ejecutor por vez): cerrada con CONCLUIDA/ANULADA, la
 * alerta terminó y ya no hay nada que re-derivar. Mismo criterio en el CRM y
 * en el servidor.
 */
export function isLiveAssignmentStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s !== "CONCLUIDA" && s !== "ANULADA";
}

/**
 * 030 → 031 — la tarjeta de alerta va «macheada» con la tabla ALERTA: cada
 * etapa del tablero de gestiones tiene SU estado del sistema (con su `estado`
 * guardado en la etapa y el nombre igual al del sistema). Mover la tarjeta
 * escribe ese estado. Etapas viejas sin `estado` caen al mapeo por ancla:
 * `won` = CONCLUIDA · `lost` = ANULADA · abierta = EN_PROGRESO.
 */
export function estadoForStage(stage: {
  estado?: string | null;
  kind: "open" | "won" | "lost";
}): AlertStatus {
  if (stage.estado) return stage.estado as AlertStatus;
  if (stage.kind === "won") return "CONCLUIDA";
  if (stage.kind === "lost") return "ANULADA";
  return "EN_PROGRESO";
}

/**
 * 031 — al revés: el estado REAL de la alerta (tabla ALERTA) decide en qué
 * etapa descansa la tarjeta. Coincidencia exacta primero; si el sistema tiene
 * un estado terminal sin columna propia (DESACTIVADA / REVISADA), null: la
 * tarjeta no se mueve y el chip del estado real igual se refresca.
 */
export function stageForEstado<
  T extends { estado?: string | null; kind: "open" | "won" | "lost" },
>(stages: T[], estado: string): T | null {
  const e = (estado ?? "").trim().toUpperCase();
  const exact = stages.find((s) => (s.estado ?? "").toUpperCase() === e);
  if (exact) return exact;
  if (e === "CONCLUIDA") return stages.find((s) => s.kind === "won") ?? null;
  if (e === "ANULADA") return stages.find((s) => s.kind === "lost") ?? null;
  return null;
}

/**
 * 031c — Prioridad de la ALERTA ↔ prioridad del CRM.
 *
 * La tabla usa texto con emoji («🔴 Alta», «🟠 Media», «🟣 Baja», «🟡 Baja»);
 * el pipeline del CRM usa alta/media/baja/null. Estos dos mapeos son la única
 * traducción permitida entre los dos vocabularios: un valor desconocido se
 * ignora (null) en vez de inventar un escalón — la prioridad jamás se adivina.
 */
export function priorityValueForPrioridad(
  prioridad: string | null | undefined
): PriorityValue | null {
  const p = (prioridad ?? "").toLowerCase();
  if (p.includes("alta")) return "alta";
  if (p.includes("media")) return "media";
  if (p.includes("baja")) return "baja";
  return null;
}

/** Valor del CRM → cadena EXACTA de la tabla (no se inventan opciones nuevas). */
export function prioridadForPriorityValue(value: PriorityValue | null): string | null {
  if (value === "alta") return "🔴 Alta";
  if (value === "media") return "🟠 Media";
  if (value === "baja") return "🟣 Baja";
  return null;
}

/** Etiquetas del estado de la alerta para los chips del pipeline. */
export const ALERT_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  TURNO_CONFIRMADO: "Turno confirmado",
  CONCLUIDA: "Concluida",
  ANULADA: "Anulada",
};

/** Fecha ISO (o "YYYY-MM-DD…") → "YYYY-MM-DD" para mostrar. */
export function alertDate(fecha: string | null | undefined): string {
  return (fecha ?? "").slice(0, 10);
}
