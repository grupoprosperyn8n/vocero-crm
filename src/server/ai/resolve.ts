/*
 * 046 — Resolución de la conexión de IA del CRM.
 *
 * Orden: conexión propia ACTIVA (Ajustes → IA) → IA del sistema (env
 * OPENROUTER_*, la puede desactivar cada organización) → apagada.
 * Nunca expone la key.
 */

import type { AiCallConfig } from "@/lib/ai";
import { getEnv, isAiConfigured } from "@/lib/env";
import { getOrgAiConfig } from "@/server/ai/config";
import { isSystemAiEnabled } from "@/server/ai/connections";

export type ResolvedAi = {
  configured: boolean;
  source: "org" | "env" | null;
  /** 046 — org = conexión propia · system = IA del sistema (env). */
  via: "org" | "system" | null;
  provider: string | null;
  model: string | null;
  /** 046 — modelo auxiliar (juez/curas) de la conexión activa, si tiene. */
  judgeModel: string | null;
  /** 046 — id de la conexión activa (para el registro de consumo). */
  connectionId: string | null;
  callConfig: AiCallConfig | null;
};

export async function resolveAi(organizationId: string): Promise<ResolvedAi> {
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
      via: "org",
      provider: org.provider,
      model: org.model,
      judgeModel: org.judgeModel,
      connectionId: org.connectionId,
      callConfig: {
        dialect: org.dialect,
        baseUrl: org.baseUrl,
        apiKey: org.apiKey,
      },
    };
  }

  // 046 — Fallback por env: solo si la organización no lo desconectó.
  if ((await isSystemAiEnabled(organizationId)) && isAiConfigured()) {
    const env = getEnv();
    const model = env.OPENROUTER_MODEL?.trim() || null;

    if (model) {
      return {
        configured: true,
        source: "env",
        via: "system",
        provider: "openrouter",
        model,
        judgeModel: env.OPENROUTER_JUDGE_MODEL?.trim() || null,
        connectionId: null,
        callConfig: null,
      };
    }
  }

  return {
    configured: false,
    source: null,
    via: null,
    provider: null,
    model: null,
    judgeModel: null,
    connectionId: null,
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
