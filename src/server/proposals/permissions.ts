/*
 * 041d/041e — Quién puede qué con las gestiones y los archivos.
 *
 * Pedido de Diego (2026-09-18):
 *  · eliminar una gestión: SOLO propietario y dueño;
 *  · archivar: gerente (y hacia arriba);
 *  · editar: el empleado (todos), pero queda REGISTRADO quién editó;
 *  · poner online/offline la publicidad enviada: quien gestiona;
 *  · los archivos que sube dueño/propietario/gerente al contenedor universal
 *    NO se pueden quitar (solo dueño/propietario pueden); los del resto los
 *    quita su autor o alguien de arriba.
 */

export type CrmRole = string;

/** Owner (dueño) y admin (propietario): la cabeza. */
export function isOwnerOrAdmin(role: CrmRole): boolean {
  return role === "owner" || role === "admin";
}

/** Gerente y hacia arriba: quienes gestionan, derivan y archivan. */
export function isManagerOrAbove(role: CrmRole): boolean {
  return isOwnerOrAdmin(role) || role === "manager";
}

export function canDeleteProposal(role: CrmRole): boolean {
  return isOwnerOrAdmin(role);
}

export function canArchiveProposal(role: CrmRole): boolean {
  return isManagerOrAbove(role);
}

/** Editar: todos (el historial registra quién). */
export function canEditProposal(): boolean {
  return true;
}

export function canToggleProposalOnline(role: CrmRole): boolean {
  return isManagerOrAbove(role);
}

/** ¿El rol del que subió vuelve al archivo intocable para el resto? */
export function isProtectedUploaderRole(role: CrmRole): boolean {
  return isManagerOrAbove(role);
}

export function canDeleteLibraryItem(input: {
  viewerRole: CrmRole;
  viewerId: string | null;
  uploadedBy: string | null;
  protected: boolean;
}): boolean {
  if (!input.protected) {
    // Sin protección: su autor o cualquiera que gestione.
    return (
      (input.viewerId !== null && input.viewerId === input.uploadedBy) ||
      isManagerOrAbove(input.viewerRole)
    );
  }

  // Protegido (dueño/propietario/gerente): solo dueño y propietario lo quitan.
  return isOwnerOrAdmin(input.viewerRole);
}
