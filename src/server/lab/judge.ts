import { z } from "zod";
import { chatJsonTracked } from "@/server/ai/tracked";
import { buildJudgePrompt } from "@/server/ai/prompts";
import type { OrgAiConfig } from "@/server/ai/config";

/** Veredicto estructurado del juez (FR-032, contrato ai.md). */
export const Verdict = z.object({
  veredicto: z.enum(["verde", "amarillo", "rojo"]),
  hallazgos: z.array(
    z.object({
      tipo: z.enum(["alucinacion", "fuera_de_kb", "debio_escalar", "tono"]),
      evidencia: z.string(),
      sugerencia: z
        .object({ pregunta: z.string(), respuesta: z.string() })
        .optional(),
    })
  ),
});

export type VerdictType = z.infer<typeof Verdict>;

export type JudgeOutcome =
  | { status: "done"; verdict: VerdictType }
  | { status: "judge_failed"; detail: string };

/**
 * UNA llamada del juez por conversación. Los reintentos viven dentro de
 * chatJson; si aun así la salida es inválida, el caso queda judge_failed —
 * visible en el reporte y excluido del score. La corrida continúa.
 */
export async function judgeCase(input: {
  personaKey: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
  /**
   * 019 — Config de IA de la org que corre el Laboratorio. Sin ella, el juez
   * usa las env vars OPENROUTER_* (legacy). La resuelve el runner (que sí
   * conoce la organización) y la pasa para no duplicar queries por caso.
   */
  aiConfig?: OrgAiConfig | null;
  /** 046 — Organización que corre la corrida (meta del consumo). */
  organizationId: string;
  /** 046 — Si `aiConfig` es null: ¿puede usarse la IA del sistema (env)? */
  systemAllowed: boolean;
}): Promise<JudgeOutcome> {
  const { system, user } = buildJudgePrompt({
    persona: input.personaKey,
    transcript: input.transcript,
    kbText: input.kbText,
    behaviorText: input.behaviorText,
  });
  // 046 — Sin conexión propia y con la IA del sistema desconectada, el caso
  // no tiene proveedor: queda judge_failed con detalle claro.
  if (!input.aiConfig && !input.systemAllowed) {
    return {
      status: "judge_failed",
      detail: "Sin IA conectada (la IA del sistema está desconectada).",
    };
  }
  const result = await chatJsonTracked(
    Verdict,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      judge: true,
      config: input.aiConfig ?? null,
      model: input.aiConfig
        ? (input.aiConfig.judgeModel ?? input.aiConfig.model)
        : undefined,
    },
    {
      organizationId: input.organizationId,
      source: "laboratorio",
      provider: input.aiConfig?.provider ?? "openrouter",
      connectionId: input.aiConfig?.connectionId ?? null,
      via: input.aiConfig ? "org" : "system",
      model: input.aiConfig
        ? (input.aiConfig.judgeModel ?? input.aiConfig.model)
        : "sistema",
    }
  );
  if (!result.ok) {
    // Diagnóstico operativo: el caso queda visible como judge_failed y aquí
    // queda el porqué (incluye el raw= truncado del proveedor).
    console.error(
      `[lab] juez falló para ${input.personaKey}: ${result.error} — ${result.detail}`
    );
    return { status: "judge_failed", detail: result.detail };
  }
  return { status: "done", verdict: result.data };
}

/**
 * Score 0-100: % ponderado de conversaciones verdes (FR-033).
 * verde = 1 · amarillo = 0.5 · rojo = 0. judge_failed fuera del denominador.
 */
export function computeScore(
  cases: { status: string; veredicto: string | null }[]
): number | null {
  const judged = cases.filter(
    (c) => c.status === "done" && c.veredicto !== null
  );
  if (judged.length === 0) return null;
  const points = judged.reduce((acc, c) => {
    if (c.veredicto === "verde") return acc + 1;
    if (c.veredicto === "amarillo") return acc + 0.5;
    return acc;
  }, 0);
  return Math.round((100 * points) / judged.length);
}
