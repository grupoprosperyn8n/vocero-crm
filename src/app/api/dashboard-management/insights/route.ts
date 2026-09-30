import { apiError, withAuth } from "@/lib/api";
import type { InsightScope } from "@/lib/dashboard-management/types";
import { canUseDashboard } from "@/lib/roles";
import {
  deleteInsight,
  deleteInsightsOlderThan,
  listInsights,
} from "@/server/dashboard-management/insights-store";

export const dynamic = "force-dynamic";

/**
 * 044b-B15 — Baúl de análisis de IA del Dashboard Management.
 *
 *  GET    ?scope=&refId=&limit=   → lista los informes guardados (nuevos primero)
 *  DELETE ?id=ain_xxx             → borra un informe
 *  DELETE ?olderThanDays=30       → borra los anteriores a N días
 *
 * Solo dueño y propietarios (mismo criterio que la generación con IA).
 */

export const GET = withAuth(async (session, req: Request) => {
  if (!canUseDashboard(session.role)) {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  const url = new URL(req.url);
  const scopeRaw = url.searchParams.get("scope");
  const scope: InsightScope | undefined =
    scopeRaw === "module" || scopeRaw === "client" ? scopeRaw : undefined;
  const refId = url.searchParams.get("refId")?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));

  const insights = await listInsights(session.organizationId, {
    scope,
    refId,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  });

  return Response.json({ ok: true, insights });
});

export const DELETE = withAuth(async (session, req: Request) => {
  if (!canUseDashboard(session.role)) {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim();

  if (id) {
    const deleted = await deleteInsight(session.organizationId, id);

    if (!deleted) {
      return apiError(404, "not_found", "Ese análisis ya no está en el baúl.");
    }

    return Response.json({ ok: true, deleted: 1 });
  }

  const daysRaw = Number(url.searchParams.get("olderThanDays"));

  if (Number.isFinite(daysRaw) && daysRaw > 0) {
    const days = Math.min(Math.floor(daysRaw), 3650);
    const deleted = await deleteInsightsOlderThan(
      session.organizationId,
      days
    );

    return Response.json({ ok: true, deleted });
  }

  return apiError(422, "invalid_query", "Indicá un id o una cantidad de días.");
});
