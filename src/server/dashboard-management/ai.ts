/*
 * 039 — IA del dashboard sobre la conexión de IA del CRM.
 *
 * Antes (038) el análisis lo generaba el cockpit con su propio token
 * (AI_API_TOKEN de rafael-intelligence). Ahora se genera ACÁ, server-side,
 * con la misma conexión que usa el CRM: la config de IA de la organización
 * (Ajustes → IA) y, si no hay, la conexión legacy por env (OPENROUTER_*).
 * Mismos prompts, mismo cache (24 h cliente / 6 h módulo) y mismo tope
 * diario (DASHBOARD_AI_DAILY_LIMIT, default 300).
 */

import { chatJson, type AiCallConfig } from "@/lib/ai";
import { getEnv, isAiConfigured } from "@/lib/env";
import { getOrgAiConfig } from "@/server/ai/config";

import type {
  ClientInsight,
  ClientInsightContext,
  ModuleAiId,
  ModuleInsight,
} from "@/lib/dashboard-management/types";

import {
  buildClientPrompt,
  buildModulePrompt,
  CLIENT_INSIGHT_SCHEMA,
  MODULE_INSIGHT_SCHEMA,
  sanitizeClientContext,
  sanitizeModuleContext,
  toClientInsight,
  toModuleInsight,
} from "./ai-prompt";

const CLIENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MODULE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const clientCache = new Map<
  string,
  { insight: ClientInsight; ts: number }
>();

const moduleCache = new Map<
  string,
  { insight: ModuleInsight; ts: number }
>();

let dailyStamp = "";
let dailyCount = 0;

function dailyLimit(): number {
  const raw = Number(process.env.DASHBOARD_AI_DAILY_LIMIT);

  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

function takeDailySlot(): boolean {
  const today = new Date().toISOString().slice(0, 10);

  if (dailyStamp !== today) {
    dailyStamp = today;
    dailyCount = 0;
  }

  if (dailyCount >= dailyLimit()) {
    return false;
  }

  dailyCount += 1;

  return true;
}

/* --------------------------------------------------------------------- *
 * Resolución de la conexión de IA (la del CRM)
 * --------------------------------------------------------------------- */

type ResolvedAi = {
  configured: boolean;
  source: "org" | "env" | null;
  provider: string | null;
  model: string | null;
  callConfig: AiCallConfig | null;
};

async function resolveAi(organizationId: string): Promise<ResolvedAi> {
  let org: Awaited<ReturnType<typeof getOrgAiConfig>> = null;

  try {
    org = await getOrgAiConfig(organizationId);
  } catch (err) {
    console.error("[dashboard-ai] getOrgAiConfig falló:", err);
  }

  if (org) {
    return {
      configured: true,
      source: "org",
      provider: org.provider,
      model: org.model,
      callConfig: {
        dialect: org.dialect,
        baseUrl: org.baseUrl,
        apiKey: org.apiKey,
      },
    };
  }

  if (isAiConfigured()) {
    const env = getEnv();
    const model = env.OPENROUTER_MODEL?.trim() || null;

    if (model) {
      return {
        configured: true,
        source: "env",
        provider: "openrouter",
        model,
        callConfig: null,
      };
    }
  }

  return {
    configured: false,
    source: null,
    provider: null,
    model: null,
    callConfig: null,
  };
}

/** Estado de la conexión de IA para la UI (nunca expone la key). */
export type DashboardAiStatus = {
  configured: boolean;
  source: "org" | "env" | null;
  provider: string | null;
  model: string | null;
  dailyLimit: number;
  dailyUsed: number;
};

export async function dashboardAiStatus(
  organizationId: string
): Promise<DashboardAiStatus> {
  const resolved = await resolveAi(organizationId);

  return {
    configured: resolved.configured,
    source: resolved.source,
    provider: resolved.provider,
    model: resolved.model,
    dailyLimit: dailyLimit(),
    dailyUsed: dailyCount,
  };
}

/* --------------------------------------------------------------------- *
 * Generación
 * --------------------------------------------------------------------- */

export type AiGeneration<T> =
  | { ok: true; insight: T }
  | { ok: false; status: number; code: string; message: string };

function notConfigured(): { ok: false; status: number; code: string; message: string } {
  return {
    ok: false,
    status: 503,
    code: "ai_not_configured",
    message:
      "La IA no está conectada. Conectala en Ajustes → IA para activar los análisis del tablero.",
  };
}

function limitReached(): { ok: false; status: number; code: string; message: string } {
  return {
    ok: false,
    status: 429,
    code: "ai_limit",
    message:
      "Se alcanzó el límite diario de análisis con IA. Probá de nuevo mañana.",
  };
}

function providerFailed(detail: string): {
  ok: false;
  status: number;
  code: string;
  message: string;
} {
  console.error("[dashboard-ai] proveedor:", detail.slice(0, 200));

  return {
    ok: false,
    status: 502,
    code: "ai_provider",
    message: "La IA no pudo generar el análisis. Probá de nuevo en un momento.",
  };
}

export async function generateClientInsight(
  organizationId: string,
  input: { clientId: string; mode: "dual" | "ia"; context: unknown }
): Promise<AiGeneration<ClientInsight>> {
  const context: ClientInsightContext | null = sanitizeClientContext(
    input.context
  );

  if (!context) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Faltan datos del cliente.",
    };
  }

  const key = `${input.mode}:${input.clientId}`;
  const hit = clientCache.get(key);

  if (hit && Date.now() - hit.ts < CLIENT_CACHE_TTL_MS) {
    return { ok: true, insight: { ...hit.insight, cached: true } };
  }

  const ai = await resolveAi(organizationId);

  if (!ai.configured) {
    return notConfigured();
  }

  if (!takeDailySlot()) {
    return limitReached();
  }

  const { system, user } = buildClientPrompt(context, input.mode);

  const result = await chatJson(
    CLIENT_INSIGHT_SCHEMA,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: ai.model ?? undefined,
      timeoutMs: 90_000,
      config: ai.callConfig,
    }
  );

  if (!result.ok) {
    if (result.error === "not_configured") {
      return notConfigured();
    }

    return providerFailed(result.detail);
  }

  const insight = toClientInsight(result.data, ai.model ?? "ia");

  clientCache.set(key, { insight, ts: Date.now() });

  return { ok: true, insight };
}

export async function generateModuleInsight(
  organizationId: string,
  input: {
    module: ModuleAiId;
    mode: "dual" | "ia";
    context: unknown;
    force?: boolean;
  }
): Promise<AiGeneration<ModuleInsight>> {
  const context = sanitizeModuleContext(input.context);

  if (!context) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Faltan los datos del módulo para analizar.",
    };
  }

  const key = `module:${input.module}:${input.mode}`;
  const hit = moduleCache.get(key);

  if (
    !input.force &&
    hit &&
    Date.now() - hit.ts < MODULE_CACHE_TTL_MS
  ) {
    return { ok: true, insight: { ...hit.insight, cached: true } };
  }

  const ai = await resolveAi(organizationId);

  if (!ai.configured) {
    return notConfigured();
  }

  if (!takeDailySlot()) {
    return limitReached();
  }

  const { system, user } = buildModulePrompt(input.module, context);

  const result = await chatJson(
    MODULE_INSIGHT_SCHEMA,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: ai.model ?? undefined,
      timeoutMs: 90_000,
      config: ai.callConfig,
    }
  );

  if (!result.ok) {
    if (result.error === "not_configured") {
      return notConfigured();
    }

    return providerFailed(result.detail);
  }

  const insight = toModuleInsight(result.data, ai.model ?? "ia");

  moduleCache.set(key, { insight, ts: Date.now() });

  return { ok: true, insight };
}
