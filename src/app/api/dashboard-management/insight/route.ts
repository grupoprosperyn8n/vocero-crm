import { z } from "zod";

import { apiError, parseBody, withAuth } from "@/lib/api";
import { generateClientInsight } from "@/server/dashboard-management/ai";

export const dynamic = "force-dynamic";

/**
 * 039 — «Próxima mejor acción» con IA (Cliente 360°).
 *
 * La generación corre ACÁ, server-side, con la conexión de IA del CRM
 * (Ajustes → IA; respaldo legacy por env OPENROUTER_*). El token nunca
 * viaja al navegador.
 *
 * Mismo contrato de respuesta que 038:
 *   200 { ok: true, insight: { accion, porQue, pasos, mensajeWhatsapp, … } }
 *   403 member · 422 body inválido
 *   429 tope diario · 502 proveedor · 503 IA no conectada
 */

const bodySchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  mode: z.enum(["dual", "ia"]),
  context: z.unknown(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role === "member") {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await generateClientInsight(session.organizationId, {
    clientId: parsed.data.clientId,
    mode: parsed.data.mode,
    context: parsed.data.context,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.message },
      { status: result.status }
    );
  }

  return Response.json({ ok: true, insight: result.insight });
});
