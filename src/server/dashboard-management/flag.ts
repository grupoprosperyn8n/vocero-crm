/**
 * 038 — Dashboard Management: el cockpit ejecutivo (rafael-intelligence)
 * embebido en el CRM como una sección más.
 *
 * Misma decisión que la agenda (015) y las alertas (027): lo que decide si
 * una sección EXISTE para el usuario es una variable de despliegue, resuelta
 * en el servidor y bajada por prop (el nav es un componente de cliente y no
 * puede —ni debe— leer variables de entorno).
 *
 * - Sin `DASHBOARD_MANAGEMENT_URL` → el cockpit de este ecosistema (default).
 * - `DASHBOARD_MANAGEMENT_URL=off` → la sección no existe en esta instancia
 *   (una instancia clonada que no tenga cockpit no la muestra en ningún lado).
 * - Cualquier otra URL → esa (permite apuntar a otro cockpit sin recompilar).
 *
 * Se lee de `process.env` directo, como `agendaEnabled()` y
 * `alertsConfigured()`: preguntar si una feature existe no puede depender de
 * que TODO el entorno valide.
 */

/** Valores que apagan la sección. Cualquier otra cosa, la enciende. */
const OFF_VALUES = new Set(["off", "0", "false", "no"]);

/** Cockpit de este ecosistema (rafael-intelligence en Coolify). */
export const DEFAULT_DASHBOARD_MANAGEMENT_URL =
  "https://dashbord-raseguros.sistemasagenticos.cloud";

/**
 * URL del cockpit embebido, o `null` si esta instancia lo tiene apagado.
 * Normalizada sin barra final (se usa tal cual en el `src` del iframe).
 */
export function dashboardManagementUrl(): string | null {
  const raw = (process.env.DASHBOARD_MANAGEMENT_URL ?? "").trim();
  if (OFF_VALUES.has(raw.toLowerCase())) return null;
  const url = raw || DEFAULT_DASHBOARD_MANAGEMENT_URL;
  return url.replace(/\/+$/, "");
}

/** ¿Esta instancia tiene la sección Dashboard Management? */
export function dashboardManagementEnabled(): boolean {
  return dashboardManagementUrl() !== null;
}
