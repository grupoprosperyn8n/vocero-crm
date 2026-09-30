import { apiError, withAuth } from "@/lib/api";
import { canUseDashboard } from "@/lib/roles";
import { dashboardAiStatus } from "@/server/dashboard-management/ai";

export const dynamic = "force-dynamic";

/**
 * 039 — Estado de la conexión de IA del tablero (sin secretos).
 *
 * La UI del Dashboard Management lo usa para mostrar «IA conectada ·
 * <modelo>» con acceso a Ajustes → IA, o «IA no conectada» con el CTA
 * para conectar. Devuelve origen (config de la org o env), proveedor,
 * modelo y el uso del tope diario.
 */
export const GET = withAuth(async (session) => {
  if (!canUseDashboard(session.role)) {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  return Response.json(await dashboardAiStatus(session.organizationId));
});
