import { apiError, withAuth } from "@/lib/api";
import { seesWholeTeam } from "@/lib/pipeline";
import { taskBoardStats } from "@/server/pipeline/task-stats";

export const dynamic = "force-dynamic";

/**
 * 037c — Métricas del tablero de Tareas.
 *
 * Mismo alcance que el estado general de alertas: gerente, administrador y
 * propietario. `?dias=7|30|90|todo` (default 30; `todo` = sin ventana).
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!seesWholeTeam(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Las métricas de tareas son para gerente, administrador o propietario"
    );
  }
  const raw = (new URL(req.url).searchParams.get("dias") ?? "30").trim().toLowerCase();
  const dias =
    raw === "todo" || raw === "all"
      ? 0
      : Math.min(365, Math.max(1, Number.parseInt(raw, 10) || 30));
  try {
    const stats = await taskBoardStats(session.organizationId, dias);
    return Response.json({ ok: true, ...stats });
  } catch (err) {
    console.error("[api/pipeline/tareas/stats] error:", err);
    return apiError(500, "stats_error", "No se pudieron calcular las métricas de tareas");
  }
});
