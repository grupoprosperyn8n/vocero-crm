import type { PipelineBoard, PipelineSourceKind } from "@/lib/types";

/**
 * 029 — piezas puras del pipeline de dos tableros. Viven fuera de los
 * componentes para poder probarlas sin montar React, y porque las mismas
 * reglas las usan el tablero, el cajón y las tarjetas de origen.
 */

export const PIPELINE_BOARDS: { value: PipelineBoard; label: string }[] = [
  { value: "ventas", label: "Ventas" },
  { value: "gestiones", label: "Gestiones" },
  { value: "tareas", label: "Tareas" },
];

export const SOURCE_KIND_LABEL: Record<PipelineSourceKind, string> = {
  contact: "Contacto del CRM",
  sgsa_client: "Cliente del sistema",
  alert: "Alerta",
  sgsa_gestion: "Gestión del sistema",
  task: "Tarea",
};

/**
 * ¿Ve las tarjetas de TODO el equipo? Misma regla que la bandeja (026):
 * solo el rol «member» queda encerrado en lo suyo; propietario, administrador
 * y gerente ven todo y filtran por empleado.
 */
export function seesWholeTeam(role: string): boolean {
  return role !== "member";
}

/** La tarjeta es editable solo por su dueño; los demás pueden verla, no tocarla. */
export function isOwnCard(
  card: { ownerUserId: string | null },
  userId: string
): boolean {
  return card.ownerUserId === userId;
}

/** Título visible: el nombre del contacto manda; si no hay, el rótulo. */
export function cardTitle(card: {
  contact?: { name: string } | null;
  label?: string | null;
}): string {
  return card.contact?.name ?? card.label ?? "Tarjeta";
}

/** ¿Esta tarjeta admite montos? Solo el embudo comercial los usa. */
export function cardAcceptsAmount(board: PipelineBoard): boolean {
  return board === "ventas";
}

/** 037 — ¿la tarjeta es una TAREA? (las tareas viven en su propio tablero). */
export function isTaskCard(card: { board: PipelineBoard }): boolean {
  return card.board === "tareas";
}

/**
 * 037 — estado del vencimiento de una tarea. Puro y testeable: la tarjeta, el
 * tablero y el checklist pintan lo mismo con la misma cuenta.
 *  · none: sin fecha · done: ya terminada · overdue: venció sin terminar
 *  · today: vence hoy · soon: dentro de los próximos 2 días · normal: más lejos
 */
export function taskDueState(
  dueAt: string | null,
  completedAt: string | null,
  now: Date
): "none" | "done" | "overdue" | "today" | "soon" | "normal" {
  if (!dueAt) return "none";
  if (completedAt) return "done";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  if (due.getTime() < now.getTime()) return "overdue";
  const finDeHoy = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < finDeHoy) return "today";
  const enDosDias = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  if (due < enDosDias) return "soon";
  return "normal";
}

/**
 * 037 — «18/09 11:30» para la etiqueta de vencimiento; vacío si no hay.
 * La zona va FIJADA a Buenos Aires: el server hidrata en UTC y el navegador
 * en la hora local — sin esto, la primera pintada cambiaría de texto.
 */
export function taskDueLabel(dueAt: string | null): string {
  if (!dueAt) return "";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "";
  // Se arma por PARTES (en-CA + h23): cada componente queda con su cero
  // delante pase lo que pase con el ICU del runtime.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}
