import { withAuth } from "@/lib/api";
import {
  AlertsBackendError,
  alertsConfigured,
  listAlerts,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

/**
 * 027 — Alertas del sistema de seguros (el mismo sistema de la PWA).
 * `?hist=1` = historial (leídas/gestionadas); sin él, solo pendientes.
 * El contador de pendientes viaja siempre para el badge del nav.
 */
export const GET = withAuth(async (_session, req: Request) => {
  if (!alertsConfigured()) {
    return Response.json({ configured: false, alerts: [], pendientes: 0 });
  }
  const hist = new URL(req.url).searchParams.get("hist") === "1";
  try {
    const { alerts, pendientes } = await listAlerts(hist);
    return Response.json({ configured: true, alerts, pendientes });
  } catch (err) {
    console.error("[api/alerts] backend SGSA inaccesible:", err);
    return Response.json(
      {
        configured: true,
        alerts: [],
        pendientes: 0,
        error: "backend_unreachable",
        upstreamStatus: err instanceof AlertsBackendError ? (err.status ?? null) : null,
      },
      { status: 502 }
    );
  }
});
