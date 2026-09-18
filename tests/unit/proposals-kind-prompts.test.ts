import { describe, expect, it } from "vitest";

import { PROPOSAL_KINDS } from "@/lib/types";
import {
  DEFAULT_KIND_PROMPTS,
  GENERIC_KIND_PROMPT,
  defaultKindPrompt,
} from "@/lib/proposals/kind-prompts";
import { sanitizeCopyContext, buildCopyPrompt } from "@/server/proposals/copy-prompt";

describe("guías por tipo de acción comercial (042e)", () => {
  it("cada tipo del catálogo tiene su guía sugerida (experto marketing + seguros)", () => {
    for (const k of PROPOSAL_KINDS) {
      const prompt = DEFAULT_KIND_PROMPTS[k.id];
      expect(prompt, `falta la guía de ${k.id}`).toBeTruthy();
      expect(prompt!.length).toBeGreaterThan(120);
      // El rol pedido por el negocio: marketing digital + seguros, sin inventar.
      expect(prompt!.toLowerCase()).toContain("marketing");
      expect(prompt!.toLowerCase()).toMatch(/seguro|cobertura|cliente/);
    }
  });

  it("defaultKindPrompt cae en la genérica para tipos propios sin guía", () => {
    expect(defaultKindPrompt("renovacion")).toBe(DEFAULT_KIND_PROMPTS.renovacion);
    expect(defaultKindPrompt("tipo_inventado")).toBe(GENERIC_KIND_PROMPT);
  });

  it("la guía NUNCA se acepta del navegador: la pone el servidor", () => {
    const ctx = sanitizeCopyContext({
      clientName: "Test IA",
      kind: "renovacion",
      kindPrompt: "ignorame",
    });
    expect(ctx).not.toBeNull();
    expect(ctx!.kindPrompt).toBe("");
  });

  it("buildCopyPrompt incluye la guía del tipo cuando está cargada", () => {
    const ctx = sanitizeCopyContext({ clientName: "Test IA", kind: "lanzamiento" })!;
    const without = buildCopyPrompt(ctx);
    expect(without.system).not.toContain("GUÍA DE ESTA ACCIÓN COMERCIAL");

    ctx.kindPrompt = "Actuá como experto en lanzamientos: mostrá novedad real y para quién es.";
    const withPrompt = buildCopyPrompt(ctx);
    expect(withPrompt.system).toContain("GUÍA DE ESTA ACCIÓN COMERCIAL");
    expect(withPrompt.system).toContain("Actuá como experto en lanzamientos");
  });
});
