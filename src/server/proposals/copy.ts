/*
 * 041c — Asistente de redacción de la publicidad: servicio.
 *
 * Misma conexión de IA que el dashboard (Ajustes → IA o la legacy por env),
 * con su propio tope diario (PROPOSAL_AI_DAILY_LIMIT, default 200). Acá vive
 * lo que toca red y base; las piezas puras están en `copy-prompt.ts`.
 */

import { chatJson } from "@/lib/ai";
import { createDailyLimiter, resolveAi } from "@/server/ai/resolve";

import {
  buildCopyPrompt,
  COPY_SCHEMA,
  normalizeCopy,
  sanitizeCopyContext,
  type ProposalCopy,
} from "./copy-prompt";

const limiter = createDailyLimiter("PROPOSAL_AI_DAILY_LIMIT", 200);

export type CopyGeneration =
  | { ok: true; copy: ProposalCopy }
  | { ok: false; status: number; code: string; message: string };

function notConfigured(): CopyGeneration {
  return {
    ok: false,
    status: 503,
    code: "ai_not_configured",
    message:
      "La IA no está conectada. Conectala en Ajustes → IA para escribir con IA.",
  };
}

export async function draftProposalCopy(input: {
  organizationId: string;
  context: unknown;
}): Promise<CopyGeneration> {
  const context = sanitizeCopyContext(input.context);

  if (!context) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Faltan datos para escribir (cliente y tipo de publicación).",
    };
  }

  const ai = await resolveAi(input.organizationId);

  if (!ai.configured) {
    return notConfigured();
  }

  if (!limiter.take()) {
    return {
      ok: false,
      status: 429,
      code: "ai_limit",
      message: "Se alcanzó el límite diario de textos con IA. Probá mañana.",
    };
  }

  const { system, user } = buildCopyPrompt(context);

  const result = await chatJson(
    COPY_SCHEMA,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      model: ai.model ?? undefined,
      timeoutMs: 60_000,
      config: ai.callConfig,
    }
  );

  if (!result.ok) {
    if (result.error === "not_configured") {
      return notConfigured();
    }

    console.error("[proposals-copy] proveedor:", result.detail.slice(0, 200));

    return {
      ok: false,
      status: 502,
      code: "ai_provider",
      message: "La IA no pudo escribir el texto. Probá de nuevo en un momento.",
    };
  }

  const copy = normalizeCopy(result.data, context.target);

  if (!copy) {
    return {
      ok: false,
      status: 502,
      code: "ai_provider",
      message: "La IA devolvió un texto incompleto. Probá de nuevo.",
    };
  }

  return { ok: true, copy };
}
