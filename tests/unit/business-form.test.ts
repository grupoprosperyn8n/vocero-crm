import { describe, expect, it } from "vitest";
import {
  BUSINESS_FORM,
  BUSINESS_ITEMS,
  normalizeQuestion,
} from "@/server/lab/business-form";

/**
 * Invariantes del cuestionario "Datos del negocio": el upsert es por pregunta
 * canónica, así que dos ítems con la misma `kbQuestion` (o ids repetidos)
 * romperían el guardado de forma silenciosa — se duplicarían entradas en el
 * Conocimiento. Este test lo ataja antes que el form.
 */
describe("cuestionario Datos del negocio", () => {
  it("los ids de los ítems son únicos", () => {
    const ids = BUSINESS_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("las preguntas canónicas (kbQuestion) no se repiten", () => {
    const qs = BUSINESS_ITEMS.map((i) => normalizeQuestion(i.kbQuestion));
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("cada grupo tiene al menos un ítem y todo ítem tiene pregunta y pista", () => {
    expect(BUSINESS_FORM.length).toBeGreaterThan(0);
    for (const g of BUSINESS_FORM) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const it of g.items) {
        expect(it.question.trim().length).toBeGreaterThan(0);
        expect(it.hint.trim().length).toBeGreaterThan(0);
        expect(it.kbQuestion.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("normalizeQuestion ignora mayúsculas y espacios de más", () => {
    expect(
      normalizeQuestion("  ¿Cuáles son los MEDIOS   de pago? ")
    ).toBe(normalizeQuestion("¿cuáles son los medios de pago?"));
  });
});
