import { z } from "zod";

import { apiError, parseBody, withAuth } from "@/lib/api";
import { MODULE_AI_IDS } from "@/lib/dashboard-management/types";
import { generateModuleInsight } from "@/server/dashboard-management/ai";

export const dynamic = "force-dynamic";

/**
 * 039 — Análisis con IA de un módulo del tablero.
 *
 * La generación corre ACÁ, server-side, con la conexión de IA del CRM
 * (Ajustes → IA; respaldo legacy por env OPENROUTER_*). Antes (038) se
 * delegaba al cockpit con su propio token — eso ya no hace falta.
 *
 * Mismo contrato de respuesta que 038:
 *   200 { ok: true, insight: { resumen, focos, acciones, mensaje, … } }
 *   403 member · 422 body inválido
 *   429 tope diario · 502 proveedor · 503 IA no conectada
 */

const bodySchema = z.object({
  module: z.enum(MODULE_AI_IDS),
  mode: z.enum(["dual", "ia"]),
  context: z.record(z.unknown()),
  force: z.boolean().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role === "member") {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await generateModuleInsight(session.organizationId, {
    module: parsed.data.module,
    mode: parsed.data.mode,
    context: parsed.data.context,
    force: parsed.data.force ?? false,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.message },
      { status: result.status }
    );
  }

  return Response.json({ ok: true, insight: result.insight });
});
