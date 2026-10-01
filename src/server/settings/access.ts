import { apiError } from "@/lib/api";
import { canUseLab } from "@/lib/roles";

/**
 * 021 — Reparto de la configuración del CRM (definido por Diego, 2026-09-11):
 * la CUSTOMIZACIÓN (IA, Agente de mejoras, Agente/KB, Marca) es del
 * PROPIETARIO; la OPERACIÓN (plantillas, etapas del pipeline, agenda) y el
 * área de Equipo las comparten propietario y administrador; los miembros
 * quedan afuera de todo Ajustes.
 *
 * Los gates devuelven `null` cuando el rol pasa, o la Response 403 cuando no.
 * Patrón en las rutas:  const gate = customizationGate(session); if (gate) return gate;
 */

/** Customización (IA, Automejora, Agente/KB, Marca): solo owner. */
export function customizationGate(session: { role: string }): Response | null {
  if (session.role === "owner") return null;
  return apiError(
    403,
    "FORBIDDEN",
    "Solo el propietario puede ver o cambiar la configuración del CRM."
  );
}

/** Equipo y operación (plantillas, etapas, agenda): owner + admin. */
export function teamGate(session: { role: string }): Response | null {
  if (session.role === "owner" || session.role === "admin") return null;
  return apiError(
    403,
    "FORBIDDEN",
    "Solo el propietario o un administrador pueden ver o cambiar esto."
  );
}

/**
 * 30Sep — Laboratorio (evaluación del agente, sugerencias, datos del
 * negocio): propietario y administrador (pedido Diego). Reemplaza al gate de
 * customización en las rutas del lab: quien abre el Laboratorio lo usa entero.
 */
export function labGate(session: { role: string }): Response | null {
  if (canUseLab(session.role)) return null;
  return apiError(
    403,
    "FORBIDDEN",
    "Solo el propietario o un administrador pueden usar el Laboratorio."
  );
}
