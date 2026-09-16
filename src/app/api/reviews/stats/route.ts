import { apiError, withAuth } from "@/lib/api";
import { canManageAlertAssignments } from "@/server/alerts/assignments";
import { reviewFlowStats } from "@/server/reviews/stats";

export const dynamic = "force-dynamic";

/**
 * 033 — Estadísticas del flujo de siniestros (revisión de envío SGSA).
 *
 * Mismo alcance que el estado general de alertas: administrador, propietario
 * y gerente. `?dias=7|30|90|todo` (default 30; `todo` = 0).
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!canManageAlertAssignments(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Las estadísticas del flujo de siniestros son para administrador, propietario o gerente"
    );
  }
  const raw = (new URL(req.url).searchParams.get("dias") ?? "30").trim().toLowerCase();
  const dias =
    raw === "todo" || raw === "all"
      ? 0
      : Math.min(365, Math.max(1, Number.parseInt(raw, 10) || 30));
  try {
    const stats = await reviewFlowStats(session.organizationId, dias);
    return Response.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[api/reviews/stats] error:", err);
    return apiError(500, "stats_error", "No se pudieron calcular las estadísticas");
  }
});
