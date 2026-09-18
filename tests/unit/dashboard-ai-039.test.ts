import { describe, expect, it } from "vitest";

import {
  CLIENT_INSIGHT_SCHEMA,
  MODULE_INSIGHT_SCHEMA,
  buildClientPrompt,
  buildModulePrompt,
  sanitizeClientContext,
  sanitizeModuleContext,
  toClientInsight,
  toModuleInsight,
} from "@/server/dashboard-management/ai-prompt";

/**
 * 039 — IA del dashboard sobre la conexión de IA del CRM: sanitizado de
 * contexto, prompts y validación de respuesta (piezas puras; la llamada
 * al proveedor vive en ai.ts).
 */

describe("sanitizeClientContext", () => {
  it("exige nombre (el resto se acota)", () => {
    expect(sanitizeClientContext(null)).toBeNull();
    expect(sanitizeClientContext({})).toBeNull();
    expect(sanitizeClientContext({ name: "   " })).toBeNull();
  });

  it("acota strings, pasos y campos desconocidos", () => {
    const ctx = sanitizeClientContext({
      name: "  Ana Pérez ",
      activePolicies: 3,
      historicalOperations: "7",
      activePremium: 123456.789,
      score: "82",
      recommendation: "Retener",
      recommendationWhy: "x".repeat(900),
      recommendationSteps: Array.from({ length: 20 }, (_, i) => `paso ${i}`),
      extra: "se ignora",
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.name).toBe("Ana Pérez");
    expect(ctx!.activePolicies).toBe(3);
    expect(ctx!.historicalOperations).toBe(7);
    expect(ctx!.activePremium).toBe(123456.789);
    expect(ctx!.recommendationWhy.length).toBe(800);
    expect(ctx!.recommendationSteps).toHaveLength(8);
    expect("extra" in (ctx as object)).toBe(false);
  });
});

describe("sanitizeModuleContext", () => {
  it("redondea números, recorta strings y descarta vacíos", () => {
    const out = sanitizeModuleContext({
      total: 3.14159,
      nota: "  hola  ",
      ok: true,
      vacio: "   ",
    });

    expect(out).not.toBeNull();
    expect(out!.total).toBe(3.14);
    expect(out!.nota).toBe("hola");
    expect(out!.ok).toBe(true);
    expect("vacio" in out!).toBe(false);
  });

  it("descarta lo que no sea un objeto o exceda la profundidad", () => {
    expect(sanitizeModuleContext("hola")).toBeNull();
    expect(sanitizeModuleContext(null)).toBeNull();
    expect(sanitizeModuleContext({ a: { b: { c: 1 } } })).toBeNull();
  });
});

describe("prompts", () => {
  it("el prompt de cliente incluye los datos reales y la tarea del modo", () => {
    const context = {
      name: "Ana",
      activePolicies: 2,
      historicalOperations: 5,
      historicalAltas: 3,
      historicalAnulaciones: 1,
      historicalSiniestros: 1,
      activePremium: 1000,
      score: 80,
      recommendation: "Retener",
      recommendationWhy: "Vence pronto",
      recommendationSteps: ["Llamarla"],
    };

    const dual = buildClientPrompt(context, "dual");
    expect(dual.user).toContain("Nombre: Ana");
    expect(dual.user).toContain("modo DUAL");

    const ia = buildClientPrompt(context, "ia");
    expect(ia.user).toContain("modo SOLO IA");
  });

  it("el prompt de módulo lleva el brief del módulo", () => {
    const prompt = buildModulePrompt("retencion", { total: 10 });

    expect(prompt.system).toContain("Retención");
    expect(prompt.system).toContain("mensaje breve de WhatsApp");
    expect(prompt.user).toContain("DATOS REALES DEL MÓDULO:");
    expect(prompt.user).toContain("- total: 10");
  });
});

describe("esquemas de respuesta", () => {
  it("cliente: acepta variantes snake/camel y exige por_que + mensaje", () => {
    const ok = CLIENT_INSIGHT_SCHEMA.safeParse({
      accion: "Llamar",
      porQue: "Vence pronto",
      pasos: ["a", 2],
      mensajeWhatsapp: "Hola",
    });
    expect(ok.success).toBe(true);

    const faltante = CLIENT_INSIGHT_SCHEMA.safeParse({
      accion: "Llamar",
      por_que: "Vence pronto",
      pasos: ["a"],
    });
    expect(faltante.success).toBe(false);
  });

  it("módulo: exige resumen y al menos una acción", () => {
    expect(
      MODULE_INSIGHT_SCHEMA.safeParse({ resumen: "ok", acciones: ["a"] }).success
    ).toBe(true);
    expect(
      MODULE_INSIGHT_SCHEMA.safeParse({ resumen: "ok", acciones: [] }).success
    ).toBe(false);
  });
});

describe("toClientInsight / toModuleInsight", () => {
  it("cliente: recorta a los topes del contrato", () => {
    const parsed = CLIENT_INSIGHT_SCHEMA.parse({
      accion: "a".repeat(200),
      por_que: "b".repeat(900),
      pasos: Array.from({ length: 10 }, (_, i) => `p${i}`),
      mensaje_whatsapp: "c".repeat(1000),
    });

    const insight = toClientInsight(parsed, "modelo-x");

    expect(insight.accion.length).toBe(90);
    expect(insight.porQue.length).toBe(800);
    expect(insight.pasos).toHaveLength(6);
    expect(insight.mensajeWhatsapp.length).toBe(900);
    expect(insight.model).toBe("modelo-x");
    expect(insight.cached).toBe(false);
  });

  it("módulo: recorta a los topes del contrato", () => {
    const parsed = MODULE_INSIGHT_SCHEMA.parse({
      resumen: "r".repeat(1000),
      focos: Array.from({ length: 10 }, (_, i) => `f${i}`),
      acciones: Array.from({ length: 10 }, (_, i) => `a${i}`),
    });

    const insight = toModuleInsight(parsed, "modelo-y");

    expect(insight.resumen.length).toBe(900);
    expect(insight.focos).toHaveLength(6);
    expect(insight.acciones).toHaveLength(6);
    expect(insight.mensaje).toBe("");
    expect(insight.model).toBe("modelo-y");
  });
});
