import { describe, expect, it } from "vitest";

import {
  CLIENT_INSIGHT_SCHEMA,
  MODULE_INSIGHT_SCHEMA,
  toClientInsight,
  toModuleInsight,
} from "@/server/dashboard-management/ai-prompt";
import { buildCopyPrompt, sanitizeCopyContext } from "@/server/proposals/copy-prompt";

/**
 * 044b-B15 — piezas sugeridas por el análisis + análisis adjunto al copy.
 */
describe("044b-B15 — acciones con pieza (esquemas tolerantes)", () => {
  it("module: acepta acciones viejas (texto suelto) y nuevas (objeto con pieza)", () => {
    const parsed = MODULE_INSIGHT_SCHEMA.parse({
      resumen: "ok",
      focos: ["f1"],
      acciones: [
        "texto viejo",
        { texto: "armar campaña", pieza: "publicacion" },
        { texto: "revisar datos", pieza: "cualquiera" },
      ],
      mensaje: "",
    });

    const insight = toModuleInsight(parsed, "test-model");
    expect(insight.acciones).toHaveLength(3);
    expect(insight.acciones[0]).toEqual({ texto: "texto viejo", pieza: null });
    expect(insight.acciones[1]).toEqual({ texto: "armar campaña", pieza: "publicacion" });
    // pieza inválida → null (nunca rompe la UI del Constructor)
    expect(insight.acciones[2]).toEqual({ texto: "revisar datos", pieza: null });
  });

  it("client: la pieza sugerida se normaliza", () => {
    const parsed = CLIENT_INSIGHT_SCHEMA.parse({
      accion: "Recontactar",
      por_que: "hace 8 meses sin póliza",
      pasos: ["a", "b", "c"],
      mensaje_whatsapp: "Hola!",
      pieza: "cupon",
    });

    const insight = toClientInsight(parsed, "test-model");
    expect(insight.pieza).toBe("cupon");

    const parsed2 = CLIENT_INSIGHT_SCHEMA.parse({
      accion: "Llamar",
      por_que: "cliente mirando cartera",
      pasos: ["a"],
      mensaje_whatsapp: "Hola!",
      pieza: "no-existe",
    });
    expect(toClientInsight(parsed2, "test-model").pieza).toBeNull();
  });

  it("client: sin pieza queda null", () => {
    const parsed = CLIENT_INSIGHT_SCHEMA.parse({
      accion: "Llamar",
      por_que: "cliente mirando cartera",
      pasos: ["a"],
      mensaje_whatsapp: "Hola!",
    });
    expect(toClientInsight(parsed, "test-model").pieza).toBeNull();
  });
});

describe("044b-B15 — análisis adjunto en el copy del Constructor", () => {
  const base = {
    target: "pieza" as const,
    tone: "cercana",
    angle: "beneficio" as const,
    instructions: "",
    clientName: "Ana",
    kind: "promo",
  };

  it("sanitizeCopyContext lee el análisis y lo recorta", () => {
    const ctx = sanitizeCopyContext({
      ...base,
      analysis: { title: "Migración · 30/09", body: "Vinculados 14.689 de 14.921." },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.analysisTitle).toBe("Migración · 30/09");
    expect(ctx?.analysisBody).toContain("14.689");
  });

  it("el prompt suma el bloque de CONTEXTO DE ANÁLISIS cuando hay análisis", () => {
    const ctx = sanitizeCopyContext({
      ...base,
      analysis: { title: "Retención · 29/09", body: "12 renovaciones vencen esta semana." },
    });
    const prompt = buildCopyPrompt(ctx as NonNullable<typeof ctx>);
    const asText = JSON.stringify(prompt);

    expect(asText).toContain("CONTEXTO DE ANÁLISIS DEL SISTEMA");
    expect(asText).toContain("12 renovaciones vencen esta semana");
  });

  it("sin análisis no agrega el bloque", () => {
    const ctx = sanitizeCopyContext(base);
    const prompt = buildCopyPrompt(ctx as NonNullable<typeof ctx>);
    expect(JSON.stringify(prompt)).not.toContain("CONTEXTO DE ANÁLISIS DEL SISTEMA");
  });
});
