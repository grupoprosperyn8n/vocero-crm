import { dashboardManagementUrl } from "./flag";

/**
 * 038b — Acceso al cockpit (rafael-intelligence) desde el servidor del CRM.
 *
 * El dashboard es parte nativa del CRM: sus páginas no hablan con el cockpit
 * desde el navegador (CORS), sino que el servidor del CRM hace de puente.
 * Así el cockpit no necesita exponer CORS y la sección queda protegida por
 * la sesión del CRM (misma regla que el resto de la app).
 */

export class CockpitUnavailableError extends Error {
  constructor(message = "El cockpit no respondió. Reintentá en unos segundos.") {
    super(message);
    this.name = "CockpitUnavailableError";
  }
}

/**
 * GET/POST server-side contra el cockpit. Timeout amplio: la primera carga
 * del tablero puede tardar hasta 2 minutos (cruza histórico + pólizas) y el
 * análisis de IA responde en decenas de segundos.
 */
export async function cockpitFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const base = dashboardManagementUrl();
  if (!base) throw new CockpitUnavailableError("La sección está apagada en esta instancia.");

  const { timeoutMs = 150_000, ...rest } = init ?? {};

  try {
    return await fetch(`${base}${path}`, {
      ...rest,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new CockpitUnavailableError();
  }
}
