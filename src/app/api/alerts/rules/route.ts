import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  canManageAlertAssignments,
  listAlertRules,
  parseAssignmentTargets,
  replaceAlertRules,
} from "@/server/alerts/assignments";

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
  const rules = await replaceAlertRules({
    session,
    alertType: body.data.alertType,
    targets,
  });
  return Response.json({ ok: true, rules });
});
