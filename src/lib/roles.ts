/**
 * 026 — Roles del CRM (pedido Diego 2026-09-13): «los gerentes pueden ver
 * TODAS las conversaciones y filtrar por las suyas o de cualquier empleado, y
 * administrador lo mismo, y propietario igual».
 *
 * Jerarquía: propietario / administrador / gerente ven toda la bandeja;
 * un miembro (empleado) ve lo suyo (asignado a él) más la cola sin dueño.
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
