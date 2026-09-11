import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { customizationGate } from "@/server/settings/access";
import {
  getOrgAiSettingsView,
  saveOrgAiConfig,
} from "@/server/ai/config";
import { AI_PROVIDER_LIST } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

/**
 * 019 — Instalador de IA: GET devuelve la config sin secretos (vista) y PUT
 * la guarda cifrada. Agent-first: si no hay fila, la instancia sigue usando
 * las env vars OPENROUTER_* — la UI es una puerta más, no un reemplazo.
 */

export const GET = withAuth(async (session) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  const settings = await getOrgAiSettingsView(session.organizationId);
  return Response.json({
    settings,
    providers: AI_PROVIDER_LIST.map((p) => ({
      id: p.id,
      label: p.label,
      dialect: p.dialect,
      defaultBaseUrl: p.defaultBaseUrl,
      suggestedModels: p.suggestedModels,
      suggestedJudgeModel: p.suggestedJudgeModel,
    })),
  });
});

const putSchema = z.object({
  provider: z.enum([
    "openai",
    "openrouter",
    "gemini",
    "deepseek",
    "anthropic",
    "custom",
  ]),
  // Vacío/ausente = conservar la key guardada.
  apiKey: z.string().trim().optional().nullable(),
  // Solo obligatoria para custom; para el resto hay default.
  baseUrl: z.string().trim().optional().nullable(),
  model: z.string().trim().min(1),
  judgeModel: z.string().trim().optional().nullable(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  if (body.data.provider === "custom" && !body.data.baseUrl?.trim()) {
    return apiError(422, "validation", "El proveedor custom requiere una URL base");
  }

  try {
    await saveOrgAiConfig({
      organizationId: session.organizationId,
      provider: body.data.provider,
      apiKey: body.data.apiKey,
      baseUrl: body.data.baseUrl,
      model: body.data.model,
      judgeModel: body.data.judgeModel,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo guardar";
    return apiError(422, "save_failed", msg);
  }

  const settings = await getOrgAiSettingsView(session.organizationId);
  return Response.json({ ok: true, settings });
});
