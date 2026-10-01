import { describe, expect, it } from "vitest";
import { AI_PRICING, computeCostUsd, lookupUnitCost } from "@/lib/ai/pricing";

/** 046 — Precios de referencia (USD por 1M de tokens). */
describe("046 — catálogo de precios de IA", () => {
  it("encuentra modelos por id directo, por slug de OpenRouter y case-insensitive", () => {
    expect(lookupUnitCost("deepseek-chat")).toEqual({ in: 0.27, out: 1.1 });
    expect(lookupUnitCost("openai/gpt-4o-mini")).toEqual({ in: 0.15, out: 0.6 });
    expect(lookupUnitCost("GPT-4O-MINI")).toEqual({ in: 0.15, out: 0.6 });
    expect(lookupUnitCost("modelo-desconocido")).toBeNull();
    expect(lookupUnitCost("")).toBeNull();
  });

  it("calcula el costo por 1M tokens (entrada/salida) y devuelve null sin precio", () => {
    expect(computeCostUsd(1_000_000, 0, { in: 1, out: 10 })).toBeCloseTo(1, 8);
    expect(computeCostUsd(0, 500_000, { in: 1, out: 10 })).toBeCloseTo(5, 8);
    expect(computeCostUsd(1500, 700, { in: 0.27, out: 1.1 })).toBeCloseTo(
      (1500 / 1_000_000) * 0.27 + (700 / 1_000_000) * 1.1,
      10
    );
    expect(computeCostUsd(123, 456, null)).toBeNull();
  });

  it("el catálogo cubre los proveedores pedidos por Diego (DeepSeek/OpenAI/Gemini/Claude)", () => {
    const keys = Object.keys(AI_PRICING);
    expect(keys).toContain("deepseek-chat");
    expect(keys).toContain("gpt-4o-mini");
    expect(keys).toContain("gemini-2.5-flash");
    expect(keys).toContain("claude-sonnet-4-5");
  });
});
