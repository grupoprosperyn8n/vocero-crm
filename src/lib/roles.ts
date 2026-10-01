/**
 * 026 — Roles del CRM (pedido Diego 2026-09-13): «los gerentes pueden ver
 * TODAS las conversaciones y filtrar por las suyas o de cualquier empleado, y
 * administrador lo mismo, y propietario igual».
 *
 * Jerarquía: propietario / administrador / gerente ven toda la bandeja;
 * un miembro (empleado) ve SOLO lo suyo (lo asignado a él).
 */
export function canSeeAllInbox(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/** Etiqueta humana del rol (la usan Equipo y los selectores). */
export function roleLabel(role: string): string {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  if (role === "manager") return "Gerente";
  return "Miembro";
}

/**
 * 044b — Dashboard Management: sección del propietario y el dueño (owner y
 * admin). El gerente y el miembro no entran: misma regla en la página, el nav
 * y las APIs (`/api/dashboard-management/*`).
 */
export function canUseDashboard(role: string): boolean {
  return role === "owner" || role === "admin";
}

/**
 * 30Sep — Alertas: crear alertas nuevas desde el CRM y elegir/definir sus
 * tipos queda reservado a dueño, propietario o gerente (pedido Diego: «los
 * tipos de alerta se deben poder poner online solamente dueño propietario o
 * gerente»). Mismo set que la asignación de alertas.
 */
export function canManageAlerts(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * 30Sep — Laboratorio: sección del propietario y el administrador (pedido de
 * Diego: «laboratorio es solo para propietario y administrador nada más»).
 * Misma regla en la página, el nav y las APIs (`/api/lab/*`).
 */
export function canUseLab(role: string): boolean {
  return role === "owner" || role === "admin";
}
