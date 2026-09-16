import { withAuth } from "@/lib/api";
import {
  canManageAlertAssignments,
  decorateAlertsForSession,
} from "@/server/alerts/assignments";
import {
  alertsConfigured,
  alertsPendingCount,
  listAlerts,
} from "@/server/alerts/service";
import { listPendingReviewAlerts } from "@/server/reviews/inbox";

export const dynamic = "force-dynamic";

/**
 * 027 — Solo el contador de alertas pendientes (badge del nav).
 * 028 — Los roles de gestión ven el total del sistema; un miembro ve SOLO
 * las alertas derivadas a él (directas o por grupo).
 * 033c — la cuenta incluye las revisiones de envío pendientes que el usuario
 * puede ver (viven en Alertas aunque se decidan en el chat interno).
 */
export const GET = withAuth(async (session) => {
  let reviews = 0;
  try {
    reviews = (
      await listPendingReviewAlerts({
        organizationId: session.organizationId,
        userId: session.userId,
        role: session.role,
      })
    ).length;
  } catch (err) {
    console.error("[api/alerts/count] revisiones de envío ilegibles:", err);
  }
  if (!alertsConfigured()) {
    return Response.json({ ok: false, configured: false, pendientes: reviews });
  }
  try {
    if (canManageAlertAssignments(session.role)) {
      const pendientes = await alertsPendingCount();
      return Response.json({
        ok: true,
        configured: true,
        pendientes: pendientes + reviews,
      });
    }
    const { alerts } = await listAlerts(false);
    const scoped = await decorateAlertsForSession(session, alerts, false);
    return Response.json({
      ok: true,
      configured: true,
      pendientes: scoped.length + reviews,
    });
  } catch (err) {
    console.error("[api/alerts/count] backend SGSA inaccesible:", err);
    return Response.json({ ok: false, configured: true, pendientes: reviews });
  }
});
