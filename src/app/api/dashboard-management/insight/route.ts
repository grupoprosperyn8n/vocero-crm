import { z } from "zod";

import { apiError, parseBody, withAuth } from "@/lib/api";
import { canUseDashboard } from "@/lib/roles";
import { generateClientInsight } from "@/server/dashboard-management/ai";
import { sanitizeClientContext } from "@/server/dashboard-management/ai-prompt";
import { saveInsight } from "@/server/dashboard-management/insights-store";

export const dynamic = "force-dynamic";

/**
 * 039 — «Próxima mejor acción» con IA (Cliente 360°).
 *
 * La generación corre ACÁ, server-side, con la conexión de IA del CRM
 * (Ajustes → IA; respaldo legacy por env OPENROUTER_*). El token nunca
 * viaja al navegador.
 *
 * 044b-B15 — con `save` el informe queda en el baúl (fecha, modo, modelo y
 * contexto de entrada para poder reformularlo); con `force` se reformula.
 *
 * Mismo contrato de respuesta que 038:
 *   200 { ok: true, insight: { accion, porQue, pasos, mensajeWhatsapp, pieza, … }, saved }
 *   403 member · 422 body inválido
 *   429 tope diario · 502 proveedor · 503 IA no conectada
 */

const bodySchema = z.object({
  clientId: z.string().trim().min(1).max(120),
  mode: z.enum(["dual", "ia"]),
  context: z.unknown(),
  force: z.boolean().optional(),
  /** 044b-B15 — guardar el informe en el baúl al generarlo. */
  save: z.boolean().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canUseDashboard(session.role)) {
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
    force: parsed.data.force ?? false,
  });

  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.message },
      { status: result.status }
    );
  }

  // 044b-B15 — baúl: guardar el informe recién generado junto a su contexto
  // de entrada (el reformular lo vuelve a mandar tal cual).
  let saved = false;

  if (parsed.data.save && !result.insight.cached) {
    try {
      const context = sanitizeClientContext(parsed.data.context);

      await saveInsight(session.organizationId, session.userId, {
        scope: "client",
        refId: parsed.data.clientId,
        title: context?.name || "Cliente",
        mode: parsed.data.mode,
        model: result.insight.model,
        payload: result.insight as unknown as Record<string, unknown>,
        input: (context ?? {}) as Record<string, unknown>,
        generatedAt: result.insight.generatedAt,
      });
      saved = true;
    } catch (error) {
      console.error("[dashboard-ai] no se pudo guardar en el baúl:", error);
    }
  }

  return Response.json({ ok: true, insight: result.insight, saved });
});
