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

export const dynamic = "force-dynamic";

/**
 * 027 — Solo el contador de alertas pendientes (badge del nav).
 * 028 — Los roles de gestión ven el total del sistema; un miembro ve SOLO
 * las alertas derivadas a él (directas o por grupo).
 */
export const GET = withAuth(async (session) => {
  if (!alertsConfigured()) {
    return Response.json({ ok: false, configured: false, pendientes: 0 });
  }
  try {
    if (canManageAlertAssignments(session.role)) {
      const pendientes = await alertsPendingCount();
      return Response.json({ ok: true, configured: true, pendientes });
    }
    const { alerts } = await listAlerts(false);
    const scoped = await decorateAlertsForSession(session, alerts, false);
    return Response.json({ ok: true, configured: true, pendientes: scoped.length });
  } catch (err) {
    console.error("[api/alerts/count] backend SGSA inaccesible:", err);
    return Response.json({ ok: false, configured: true, pendientes: 0 });
  }
});
