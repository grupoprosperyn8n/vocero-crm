import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { probeProvider, type AiCallConfig } from "@/lib/ai";
import {
  AI_PROVIDERS,
  type AiProviderId,
  isAiProviderId,
  resolveBaseUrl,
} from "@/lib/ai/providers";
import { getOrgAiConfig } from "@/server/ai/config";
import { getAiConnectionCallConfig } from "@/server/ai/connections";
import { connectionsGate } from "@/server/settings/access";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  // 046 — Probar una conexión guardada puntual (sin key nueva).
  connectionId: z.string().trim().optional(),
  // Sin payload → prueba la conexión ACTIVA de la organización.
  provider: z.string().trim().optional(),
  apiKey: z.string().trim().optional().nullable(),
  baseUrl: z.string().trim().optional().nullable(),
  model: z.string().trim().optional(),
});

/** 019/046 — Prueba de conexión del instalador de IA (sin guardar nada). */
export const POST = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const body = await parseBody(req, testSchema);
  if (!body.ok) return body.response;

  const { connectionId, provider, apiKey, baseUrl, model: modelInput } = body.data;
  let cfg: AiCallConfig;
  let model: string;

  if (connectionId) {
    // Modo "probar una conexión guardada" (046).
    const saved = await getAiConnectionCallConfig(session.organizationId, connectionId);
    if (!saved) {
      return apiError(404, "not_found", "Esa conexión no existe");
    }
    cfg = { dialect: saved.dialect, baseUrl: saved.baseUrl, apiKey: saved.apiKey };
    model = modelInput?.trim() || saved.model;
  } else if (provider || modelInput) {
    // Modo "probar sin guardar": exige provider + key + modelo.
    if (!provider || !isAiProviderId(provider)) {
      return apiError(422, "validation", "Se necesita un proveedor válido");
    }
    if (!modelInput) {
      return apiError(422, "validation", "Se necesita un modelo");
    }
    const resolved = resolveBaseUrl(provider as AiProviderId, baseUrl);
    if (!resolved) {
      return apiError(422, "validation", "Se necesita una URL base");
    }
    if (!apiKey) {
      return apiError(422, "validation", "Se necesita la API key para probar");
    }
    cfg = {
      dialect: AI_PROVIDERS[provider as AiProviderId].dialect,
      baseUrl: resolved,
      apiKey,
    };
    model = modelInput;
  } else {
    // Modo "probar la conexión activa".
    const saved = await getOrgAiConfig(session.organizationId);
    if (!saved) {
      return apiError(422, "not_configured", "Todavía no hay una conexión activa");
    }
    cfg = {
      dialect: saved.dialect,
      baseUrl: saved.baseUrl,
      apiKey: saved.apiKey,
    };
    model = saved.model;
  }

  const result = await probeProvider(cfg, model);
  if (!result.ok) {
    return apiError(422, "provider_error", result.detail);
  }
  return Response.json({ ok: true, model });
});
