/**
 * 033 — Revisión de envío SGSA (dual: Telegram + chat interno).
 *
 * Helpers PUROS que comparten server y cliente: el tipo de alerta con el que
 * se configuran los destinatarios (Alertas → Reglas), la identidad del usuario
 * de sistema que firma las tarjetas y las etiquetas de estado. Sin imports de
 * servidor: este archivo puede entrar al bundle del cliente.
 *
 * El flujo real: el caso llega a revisión (n8n) y además de avisar al grupo de
 * Telegram publica una tarjeta en el chat interno con el demo EXACTO del
 * mensaje al cliente, el audio y el análisis IA; desde cualquiera de los dos
 * canales se aprueba o se detiene, y la tarjeta muestra en qué condición quedó
 * el envío (despachado o trabado).
 */

/** Tipo bajo el que se configuran los destinatarios en Alertas → Reglas. */
export const REVIEW_ENVIO_ALERT_TYPE = "REVISION_ENVIO_SINIESTRO";

/** Nombre humano del tipo (selectores y fichas). */
export const REVIEW_ENVIO_ALERT_LABEL = "Revisión de envío SGSA";

/** Usuario de sistema que firma las tarjetas (no es una persona del equipo). */
export const SISTEMA_SGSA_EMAIL = "sistema-sgsa@vocero.local";
export const SISTEMA_SGSA_NAME = "SGSA · Avisos";

/** Estados de la revisión: pendiente → aprobado/detenido → enviado/trabado. */
export type ReviewEstado =
  | "pendiente"
  | "aprobado"
  | "detenido"
  | "enviado"
  | "trabado";

export const REVIEW_ESTADOS: ReviewEstado[] = [
  "pendiente",
  "aprobado",
  "detenido",
  "enviado",
  "trabado",
];

export function isReviewEstado(value: unknown): value is ReviewEstado {
  return (
    typeof value === "string" &&
    (REVIEW_ESTADOS as string[]).includes(value)
  );
}

/** Etiqueta del estado para chips y líneas de la tarjeta. */
export function reviewEstadoLabel(estado: string | null | undefined): string {
  switch (estado) {
    case "aprobado":
      return "Aprobado — en curso";
    case "detenido":
      return "Detenido para revisión";
    case "enviado":
      return "Envío despachado";
    case "trabado":
      return "Envío trabado";
    case "pendiente":
    default:
      return "Pendiente de aprobación";
  }
}

/** Color (token del tema) asociado al estado, para la UI. */
export function reviewEstadoTone(
  estado: string | null | undefined
): "warning" | "info" | "success" | "danger" {
  switch (estado) {
    case "aprobado":
      return "info";
    case "enviado":
      return "success";
    case "detenido":
      return "danger";
    case "trabado":
      return "danger";
    case "pendiente":
    default:
      return "warning";
  }
}
