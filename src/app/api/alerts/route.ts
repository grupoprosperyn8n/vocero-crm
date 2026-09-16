import { withAuth } from "@/lib/api";
import { canManageAlertAssignments, decorateAlertsForSession } from "@/server/alerts/assignments";
import {
  AlertsBackendError,
  alertsConfigured,
  listAlerts,
} from "@/server/alerts/service";
import { listPendingReviewAlerts, type ReviewInboxAlert } from "@/server/reviews/inbox";

export const dynamic = "force-dynamic";

/**
 * 027 — Alertas del sistema de seguros (el mismo sistema de la PWA).
 * `?hist=1` = historial (leídas/gestionadas); sin él, solo pendientes.
 * El contador de pendientes viaja siempre para el badge del nav.
 * 033c — las revisiones de envío pendientes viajan PRIMERO: viven en el chat
 * interno (grupo «Alerta de Siniestro») pero la cola las muestra como alerta
 * con «Abrir conversación» para decidir.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const hist = url.searchParams.get("hist") === "1";
  const mineOnly = url.searchParams.get("mine") === "1";
  let reviewAlerts: ReviewInboxAlert[] = [];
  try {
    reviewAlerts = await listPendingReviewAlerts({
      organizationId: session.organizationId,
      userId: session.userId,
      role: session.role,
    });
  } catch (err) {
    console.error("[api/alerts] no se pudieron leer las revisiones de envío:", err);
  }
  if (!alertsConfigured()) {
    return Response.json({
      configured: false,
      alerts: reviewAlerts,
      pendientes: reviewAlerts.length,
      viewerRole: session.role,
      canManageAssignments: canManageAlertAssignments(session.role),
      mineOnly,
    });
  }
  try {
    const { alerts, pendientes } = await listAlerts(hist);
    const scopedAlerts = await decorateAlertsForSession(session, alerts, mineOnly, {
      withClients: true,
    });
    const canManage = canManageAlertAssignments(session.role);
    // Para un miembro (o el filtro «para mí») el contador muestra lo que ve.
    const pendientesScoped = !hist && (!canManage || mineOnly) ? scopedAlerts.length : pendientes;
    return Response.json({
      configured: true,
      alerts: hist ? scopedAlerts : [...reviewAlerts, ...scopedAlerts],
      pendientes: hist ? pendientesScoped : pendientesScoped + reviewAlerts.length,
      viewerRole: session.role,
      canManageAssignments: canManage,
      mineOnly,
    });
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
