import type { PipelineBoard, PipelineSourceKind } from "@/lib/types";

/**
 * 029 — piezas puras del pipeline de dos tableros. Viven fuera de los
 * componentes para poder probarlas sin montar React, y porque las mismas
 * reglas las usan el tablero, el cajón y las tarjetas de origen.
 */

export const PIPELINE_BOARDS: { value: PipelineBoard; label: string }[] = [
  { value: "ventas", label: "Ventas" },
  { value: "gestiones", label: "Gestiones" },
];

export const SOURCE_KIND_LABEL: Record<PipelineSourceKind, string> = {
  contact: "Contacto del CRM",
  sgsa_client: "Cliente del sistema",
  alert: "Alerta",
  sgsa_gestion: "Gestión del sistema",
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
