import { apiError } from "@/lib/api";

/**
 * 021 — Reparto de la configuración del CRM (definido por Diego, 2026-09-11):
 * la customización es del PROPIETARIO; el administrador maneja el equipo y la
 * operación, pero no configura; los miembros quedan afuera de todo Ajustes.
 *
 * Los gates devuelven `null` cuando el rol pasa, o la Response 403 cuando no.
 * Patrón en las rutas:  const gate = customizationGate(session); if (gate) return gate;
 */

/** Customización (Ajustes completo, Agente/KB, etapas del pipeline): solo owner. */
export function customizationGate(session: { role: string }): Response | null {
  if (session.role === "owner") return null;
  return apiError(
    403,
    "FORBIDDEN",
    "Solo el propietario puede ver o cambiar la configuración del CRM."
  );
}

/** El área de Equipo la comparten propietario y administrador. */
export function teamGate(session: { role: string }): Response | null {
  if (session.role === "owner" || session.role === "admin") return null;
  return apiError(
    403,
    "FORBIDDEN",
    "Solo el propietario o un administrador pueden ver el equipo."
  );
}
