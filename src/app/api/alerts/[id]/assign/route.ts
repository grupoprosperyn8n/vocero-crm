import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  assignAlerts,
  canManageAlertAssignments,
  parseAssignmentTargets,
} from "@/server/alerts/assignments";
import {
  AlertsBackendError,
  alertsConfigured,
  listAlerts,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  scope: z.enum(["one", "type"]).default("one"),
  alertType: z.string().trim().max(80).optional(),
  empleados: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
  note: z.string().trim().max(500).optional(),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canManageAlertAssignments(session.role)) {
    return apiError(403, "forbidden", "No tenés permiso para derivar alertas");
  }
  if (!alertsConfigured()) {
    return apiError(404, "not_found", "Alertas no configuradas");
  }
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de alerta inválido");
  }
  const body = await parseBody(req, assignSchema);
  if (!body.ok) return body.response;
  const targets = parseAssignmentTargets(body.data);
  if (!targets.empleados.length && !targets.grupos.length) {
    return apiError(400, "invalid_targets", "Elegí al menos un empleado o grupo");
  }

  try {
    const { alerts } = await listAlerts(false);
    const baseAlert = alerts.find((a) => a.id === id || a.airtableRecordId === id);
    if (!baseAlert) return apiError(404, "not_found", "No se encontró la alerta");
    const selected =
      body.data.scope === "type"
        ? alerts
            .filter((a) => a.tipo === (body.data.alertType || baseAlert.tipo))
            .slice(0, 100)
        : [baseAlert];
    const result = await assignAlerts({
      session,
      alerts: selected,
      targets,
      source: "manual",
      note: body.data.note ?? null,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/alerts assign] error:", err);
    const status = err instanceof AlertsBackendError ? (err.status ?? 502) : 502;
    return apiError(
      status >= 400 && status < 600 ? status : 502,
      "backend_error",
      "No se pudo derivar la alerta"
    );
  }
});
