import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  markAlertAssignmentsStatus,
  traceAssignmentStatus,
} from "@/server/alerts/assignments";
import { ALERT_STATUSES } from "@/lib/alerts";
import {
  AlertsBackendError,
  alertsConfigured,
  resolveEmpleadoForUser,
  getAlertSharePayload,
  resolveSucursalForUser,
  setAlertStatus,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ estado: z.enum(ALERT_STATUSES) });

/**
 * 027 — Cambia el estado operativo de una alerta (En progreso, Turno
 * confirmado, Concluido, Anulado). Mismos estados que acepta la PWA.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de alerta inválido");
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  if (!alertsConfigured()) {
    return apiError(404, "not_found", "Alertas no configuradas");
  }
  try {
    const [empleadoId, sucursalId] = await Promise.all([
      resolveEmpleadoForUser(session.userId),
      resolveSucursalForUser(session.organizationId, session.userId),
    ]);
    await setAlertStatus(id, body.data.estado, { empleadoId, sucursalId });
    const payload = await getAlertSharePayload(id).catch(() => null);
    await markAlertAssignmentsStatus({
      organizationId: session.organizationId,
      alertStoreId: id,
      airtableRecordId: payload?.airtableRecordId ?? null,
      status: body.data.estado,
    }).catch(() => null);
    await traceAssignmentStatus({
      organizationId: session.organizationId,
      alertStoreId: id,
      status: body.data.estado,
    }).catch(() => null);
    return Response.json({ ok: true, estado: body.data.estado });
  } catch (err) {
    console.error("[api/alerts status] error:", err);
    const status = err instanceof AlertsBackendError ? (err.status ?? 502) : 502;
    return apiError(status >= 400 && status < 600 ? status : 502, "backend_error", "No se pudo actualizar la alerta");
  }
});
