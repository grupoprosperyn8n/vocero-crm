/**
 * 046 — Precios de referencia de IA (USD por 1M de tokens).
 *
 * Son valores de REFERENCIA: los precios cambian, varían por caché/promos y
 * cada proveedor factura distinto. Cada conexión (Ajustes → IA) puede pisarlos
 * con su propio costo unitario. Orden de resolución al estimar:
 *   1) costo propio de la conexión (`costInPer1M` / `costOutPer1M`)
 *   2) este catálogo — match por id de modelo; los slugs de OpenRouter
 *      ("openai/gpt-4o-mini") matchean por el último segmento
 *   3) sin precio → el consumo se muestra en tokens, sin costo.
 */

export type UnitCost = { in: number; out: number };

/** id de modelo (minúsculas) → USD por 1M de tokens. */
export const AI_PRICING: Record<string, UnitCost> = {
  // OpenAI
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "o3-mini": { in: 1.1, out: 4.4 },
  "o4-mini": { in: 1.1, out: 4.4 },
  // DeepSeek
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, out: 2.19 },
  // Google Gemini
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  // Anthropic Claude
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-opus-4-1": { in: 15, out: 75 },
};

/** Busca el costo unitario de un modelo (tolera slugs tipo "openai/gpt-4o-mini"). */
export function lookupUnitCost(model: string): UnitCost | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  if (AI_PRICING[id]) return AI_PRICING[id];
  const last = id.split("/").pop() ?? "";
  if (last && AI_PRICING[last]) return AI_PRICING[last];
  return null;
}

/** Costo estimado en USD de un consumo (null = sin precio conocido). */
export function computeCostUsd(
  tokensIn: number,
  tokensOut: number,
  unit: UnitCost | null
): number | null {
  if (!unit) return null;
  return (tokensIn / 1_000_000) * unit.in + (tokensOut / 1_000_000) * unit.out;
}
