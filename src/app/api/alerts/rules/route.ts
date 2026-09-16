import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { REVIEW_ENVIO_ALERT_TYPE } from "@/lib/reviews";
import {
  canManageAlertAssignments,
  listAlertRules,
  parseAssignmentTargets,
  replaceAlertRules,
} from "@/server/alerts/assignments";
import { syncReviewGroupFromRules } from "@/server/reviews/service";

export const dynamic = "force-dynamic";

const ruleSchema = z.object({
  alertType: z.string().trim().min(1).max(80),
  empleados: z.array(z.string()).optional().default([]),
  grupos: z.array(z.string()).optional().default([]),
});

export const GET = withAuth(async (session) => {
  if (!canManageAlertAssignments(session.role)) {
    return apiError(403, "forbidden", "No tenés permiso para configurar reglas");
  }
  const rules = await listAlertRules(session.organizationId);
  return Response.json({ ok: true, rules });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canManageAlertAssignments(session.role)) {
    return apiError(403, "forbidden", "No tenés permiso para configurar reglas");
  }
  const body = await parseBody(req, ruleSchema);
  if (!body.ok) return body.response;
  const targets = parseAssignmentTargets(body.data);
  const alertType = body.data.alertType.trim().toUpperCase();
  const count = targets.empleados.length + targets.grupos.length;
  // 030 — una regla, un destino: toda alerta que caiga acá tiene UN ejecutor.
  // 033b — la REVISIÓN DE ENVÍO es la excepción (la pidió el dueño): puede
  // llevar VARIOS destinos (empleados y/o grupos) y cada uno recibe su copia.
  if (alertType !== REVIEW_ENVIO_ALERT_TYPE && count > 1) {
    return apiError(400, "single_target", "Un solo destino por regla — un ejecutor por vez");
  }
  if (alertType === REVIEW_ENVIO_ALERT_TYPE && count > 20) {
    return apiError(
      422,
      "too_many_targets",
      "Máximo 20 destinos para la revisión de envío"
    );
  }
  const rules = await replaceAlertRules({
    session,
    alertType: body.data.alertType,
    targets,
  });
  // 033c — elegir empleados para la revisión de envío los suma en el acto al
  // grupo «Alerta de Siniestro» del chat interno (la decisión es grupal).
  if (alertType === REVIEW_ENVIO_ALERT_TYPE) {
    try {
      await syncReviewGroupFromRules(session.organizationId);
    } catch (err) {
      console.error("[api/alerts/rules] no se pudo sincronizar el grupo de revisión:", err);
    }
  }
  return Response.json({ ok: true, rules });
});
