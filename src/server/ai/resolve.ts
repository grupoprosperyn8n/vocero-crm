/*
 * Resolución de la conexión de IA del CRM (extraído de 039 para reutilizar):
 * la config de la organización (Ajustes → IA) y, si no hay, la legacy por
 * env (OPENROUTER_*). Nunca expone la key.
 */

import type { AiCallConfig } from "@/lib/ai";
import { getEnv, isAiConfigured } from "@/lib/env";
import { getOrgAiConfig } from "@/server/ai/config";

export type ResolvedAi = {
  configured: boolean;
  source: "org" | "env" | null;
  provider: string | null;
  model: string | null;
  callConfig: AiCallConfig | null;
};

export async function resolveAi(
  organizationId: string
): Promise<ResolvedAi> {
  let org: Awaited<ReturnType<typeof getOrgAiConfig>> = null;

  try {
    org = await getOrgAiConfig(organizationId);
  } catch (err) {
    console.error("[ai] getOrgAiConfig falló:", err);
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

/**
 * Contador diario en memoria (se reinicia solo). Compartido por los módulos
 * que llaman a la IA para que cada uno tenga su propio tope.
 */
export function createDailyLimiter(envName: string, defaultLimit: number) {
  let stamp = "";
  let count = 0;

  const limit = () => {
    const raw = Number(process.env[envName]);

    return Number.isFinite(raw) && raw > 0 ? raw : defaultLimit;
  };

  return {
    limit,
    used: () => count,
    take(): boolean {
      const today = new Date().toISOString().slice(0, 10);

      if (stamp !== today) {
        stamp = today;
        count = 0;
      }

      if (count >= limit()) {
        return false;
      }

      count += 1;

      return true;
    },
  };
}
