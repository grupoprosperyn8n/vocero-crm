import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { AI_PRICING } from "@/lib/ai/pricing";
import { AI_PROVIDER_LIST } from "@/lib/ai/providers";
import { getEnv, isAiConfigured } from "@/lib/env";
import { providerLabelOf } from "@/server/ai/config";
import {
  isSystemAiEnabled,
  listAiConnections,
  upsertAiConnection,
} from "@/server/ai/connections";
import { resolveAi } from "@/server/ai/resolve";
import { connectionsGate } from "@/server/settings/access";

export const dynamic = "force-dynamic";

/**
 * 046 — Ajustes → IA: conexiones de la organización (N por org, una activa).
 *
 * GET: conexiones sin secretos + quién está en uso AHORA (propia o del
 * sistema) + catálogo de referencia. PUT: crea/edita la conexión del
 * proveedor — la key viaja solo en el PUT y se guarda cifrada (AES-256-GCM).
 */

async function currentOf(organizationId: string) {
  const ai = await resolveAi(organizationId);
  if (!ai.configured) return null;
  return {
    via: ai.via,
    source: ai.source,
    provider: ai.provider,
    providerLabel:
      ai.via === "system" ? "IA del sistema" : providerLabelOf(ai.provider ?? ""),
    model: ai.model,
    connectionId: ai.connectionId,
  };
}

export const GET = withAuth(async (session) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const [connections, current, systemEnabled] = await Promise.all([
    listAiConnections(session.organizationId),
    currentOf(session.organizationId),
    isSystemAiEnabled(session.organizationId),
  ]);
  const env = getEnv();
  return Response.json({
    current,
    connections,
    system: {
      enabled: systemEnabled,
      available: isAiConfigured(),
      model: env.OPENROUTER_MODEL?.trim() || null,
    },
    providers: AI_PROVIDER_LIST.map((p) => ({
      id: p.id,
      label: p.label,
      dialect: p.dialect,
      defaultBaseUrl: p.defaultBaseUrl,
      suggestedModels: p.suggestedModels,
      suggestedJudgeModel: p.suggestedJudgeModel,
    })),
    catalog: AI_PRICING,
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
  // Vacío/ausente = conservar la key guardada (al editar).
  apiKey: z.string().trim().optional().nullable(),
  // Solo obligatoria para custom; para el resto hay default.
  baseUrl: z.string().trim().optional().nullable(),
  model: z.string().trim().min(1),
  judgeModel: z.string().trim().optional().nullable(),
  // 046 — Costo unitario propio (USD por 1M tokens); null = usar catálogo.
  costInPer1M: z.number().finite().nonnegative().optional().nullable(),
  costOutPer1M: z.number().finite().nonnegative().optional().nullable(),
  // 046 — Activar ya (desactiva las demás); las nuevas quedan activas si son
  // la primera conexión de la organización.
  activate: z.boolean().optional(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  if (body.data.provider === "custom" && !body.data.baseUrl?.trim()) {
    return apiError(422, "validation", "El proveedor custom requiere una URL base");
  }

  try {
    await upsertAiConnection({
      organizationId: session.organizationId,
      provider: body.data.provider,
      apiKey: body.data.apiKey,
      baseUrl: body.data.baseUrl,
      model: body.data.model,
      judgeModel: body.data.judgeModel,
      costInPer1M: body.data.costInPer1M,
      costOutPer1M: body.data.costOutPer1M,
      activate: body.data.activate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo guardar";
    return apiError(422, "save_failed", msg);
  }

  return Response.json({
    ok: true,
    connections: await listAiConnections(session.organizationId),
    current: await currentOf(session.organizationId),
  });
});
