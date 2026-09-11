import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { customizationGate } from "@/server/settings/access";
import { probeProvider, type AiCallConfig } from "@/lib/ai";
import {
  AI_PROVIDERS,
  type AiProviderId,
  isAiProviderId,
  resolveBaseUrl,
} from "@/lib/ai/providers";
import { getOrgAiConfig } from "@/server/ai/config";

export const dynamic = "force-dynamic";

const testSchema = z.object({
  // Sin payload → prueba la config guardada de la org.
  provider: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().optional(),
  model: z.string().trim().optional(),
});

/** 019 — Prueba de conexión del instalador de IA (sin guardar nada). */
export const POST = withAuth(async (session, req: Request) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  const body = await parseBody(req, testSchema);
  if (!body.ok) return body.response;

  let cfg: AiCallConfig;
  let model: string;

  const { provider, apiKey, baseUrl, model: modelInput } = body.data;

  if (provider || modelInput) {
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
    // Modo "probar lo guardado".
    const saved = await getOrgAiConfig(session.organizationId);
    if (!saved) {
      return apiError(422, "not_configured", "Todavía no hay configuración guardada");
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
