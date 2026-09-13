import { withAuth } from "@/lib/api";
import { alertsConfigured, alertsPendingCount } from "@/server/alerts/service";

export const dynamic = "force-dynamic";

/** 027 — Solo el contador de alertas pendientes (badge del nav). */
export const GET = withAuth(async () => {
  if (!alertsConfigured()) {
    return Response.json({ ok: false, configured: false, pendientes: 0 });
  }
  try {
    const pendientes = await alertsPendingCount();
    return Response.json({ ok: true, configured: true, pendientes });
  } catch (err) {
    console.error("[api/alerts/count] backend SGSA inaccesible:", err);
    return Response.json({ ok: false, configured: true, pendientes: 0 });
  }
});
