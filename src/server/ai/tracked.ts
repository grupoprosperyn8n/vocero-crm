import type { z } from "zod";
import { chatJson, type ChatJsonOpts, type ChatJsonResult, type ChatMessage } from "@/lib/ai";
import { getEnv } from "@/lib/env";
import { recordAiUsage } from "@/server/ai/usage";

/**
 * 046 — chatJson + registro de consumo (fire-and-forget).
 *
 * Los módulos que llaman a la IA pasan por acá para que el gestor de
 * consumos vea TODO: quién usó IA (módulo), con qué conexión y cuántos
 * tokens. El resultado es idéntico al de `chatJson`; el registro es
 * best-effort (nunca rompe la funcionalidad).
 */

export type AiUsageMeta = {
  organizationId: string;
  /** Módulo que la usa: laboratorio · agente · paneles-clientes · … */
  source: string;
  provider: string;
  connectionId: string | null;
  via: "org" | "system";
  /** Modelo de respaldo si la llamada no pasa un modelo explícito. */
  model: string;
};

export async function chatJsonTracked<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts: ChatJsonOpts | undefined,
  meta: AiUsageMeta | undefined
): Promise<ChatJsonResult<T>> {
  const result = await chatJson(schema, messages, opts);
  if (result.ok && result.tokens && meta) {
    // Sin modelo explícito y por vía sistema, el modelo REAL sale del env.
    const env = getEnv();
    const model =
      opts?.model ??
      (meta.via === "system"
        ? env.OPENROUTER_JUDGE_MODEL?.trim() ||
          env.OPENROUTER_MODEL?.trim() ||
          meta.model
        : meta.model);
    void recordAiUsage({
      organizationId: meta.organizationId,
      connectionId: meta.connectionId,
      provider: meta.provider,
      model,
      source: meta.source,
      via: meta.via,
      tokensIn: result.tokens.in,
      tokensOut: result.tokens.out,
    });
  }
  return result;
}
