import { apiError, withAuth } from "@/lib/api";
import {
  markAlertAssignmentsStatus,
  traceAssignmentStatus,
} from "@/server/alerts/assignments";
import {
  ackAlert,
  AlertsBackendError,
  alertsConfigured,
  getAlertSharePayload,
  resolveEmpleadoForUser,
  resolveSucursalForUser,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 027 — «Leído»: marca la alerta como vista/gestionada en el sistema
 * (pasa a EN_PROGRESO). Viaja el empleado (por email → EMPLEADOS) y la
 * sucursal del día del usuario, como hace la PWA.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de alerta inválido");
  }
  if (!alertsConfigured()) {
    return apiError(404, "not_found", "Alertas no configuradas");
  }
  try {
    const [empleadoId, sucursalId] = await Promise.all([
      resolveEmpleadoForUser(session.userId),
      resolveSucursalForUser(session.organizationId, session.userId),
    ]);
    await ackAlert(id, { empleadoId, sucursalId });
    const payload = await getAlertSharePayload(id).catch(() => null);
    await markAlertAssignmentsStatus({
      organizationId: session.organizationId,
      alertStoreId: id,
      airtableRecordId: payload?.airtableRecordId ?? null,
      status: "EN_PROGRESO",
    }).catch(() => null);
    await traceAssignmentStatus({
      organizationId: session.organizationId,
      alertStoreId: id,
      status: "EN_PROGRESO",
    }).catch(() => null);
    return Response.json({ ok: true, empleadoId, sucursalId });
  } catch (err) {
    console.error("[api/alerts ack] error:", err);
    const status = err instanceof AlertsBackendError ? (err.status ?? 502) : 502;
    return apiError(status >= 400 && status < 600 ? status : 502, "backend_error", "No se pudo actualizar la alerta");
  }
});
