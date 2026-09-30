import { z } from "zod";

import { apiError, parseBody, withAuth } from "@/lib/api";
import { MODULE_AI_IDS } from "@/lib/dashboard-management/types";
import { canUseDashboard } from "@/lib/roles";
import { generateModuleInsight } from "@/server/dashboard-management/ai";
import {
  MODULE_BRIEFS,
  sanitizeModuleContext,
} from "@/server/dashboard-management/ai-prompt";
import { saveInsight } from "@/server/dashboard-management/insights-store";

export const dynamic = "force-dynamic";

/**
 * 039 — Análisis con IA de un módulo del tablero.
 *
 * La generación corre ACÁ, server-side, con la conexión de IA del CRM
 * (Ajustes → IA; respaldo legacy por env OPENROUTER_*). Antes (038) se
 * delegaba al cockpit con su propio token — eso ya no hace falta.
 *
 * 044b-B15 — con `save` el informe queda en el baúl (fecha, modo, modelo y
 * contexto de entrada para poder reformularlo).
 *
 * Mismo contrato de respuesta que 038:
 *   200 { ok: true, insight: { resumen, focos, acciones, mensaje, … }, saved }
 *   403 member · 422 body inválido
 *   429 tope diario · 502 proveedor · 503 IA no conectada
 */

const bodySchema = z.object({
  module: z.enum(MODULE_AI_IDS),
  mode: z.enum(["dual", "ia"]),
  context: z.record(z.unknown()),
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

  // 044b-B15 — baúl: guardar el informe recién generado junto a su contexto
  // de entrada (el reformular lo vuelve a mandar tal cual).
  let saved = false;

  if (parsed.data.save && !result.insight.cached) {
    try {
      const context = sanitizeModuleContext(parsed.data.context);

      await saveInsight(session.organizationId, session.userId, {
        scope: "module",
        refId: parsed.data.module,
        title: MODULE_BRIEFS[parsed.data.module].title,
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
