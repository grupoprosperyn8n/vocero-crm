import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ALERT_STATUSES } from "@/lib/alerts";
import { AlertsBackendError, alertsConfigured } from "@/server/alerts/service";
import { changeAlertStatusFromCrm } from "@/server/alerts/status-flow";
import { invalidateAlertEstadoCache } from "@/server/pipeline/alert-sync";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ estado: z.enum(ALERT_STATUSES) });

/**
 * 027 — Cambia el estado operativo de una alerta (En progreso, Turno
 * confirmado, Concluida, Anulada). Mismos estados que acepta la PWA.
 * 030 — pasa por `changeAlertStatusFromCrm`: el MISMO camino que usa el
 * pipeline al mover una tarjeta-alerta, así el estado no miente en ninguna
 * punta.
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
    await changeAlertStatusFromCrm({
      session,
      alertStoreId: id,
      estado: body.data.estado,
    });
    invalidateAlertEstadoCache();
    return Response.json({ ok: true, estado: body.data.estado });
  } catch (err) {
    console.error("[api/alerts status] error:", err);
    const status = err instanceof AlertsBackendError ? (err.status ?? 502) : 502;
    return apiError(
      status >= 400 && status < 600 ? status : 502,
      "backend_error",
      "No se pudo actualizar la alerta"
    );
  }
});
