import { describe, expect, it } from "vitest";
import {
  ASSISTANT_STEPS,
  TOTAL_ASSISTANT_STEPS,
  buildHandoffSummary,
} from "@/components/settings/whatsapp-steps";

/**
 * 043 — Asistente de conexión: catálogo de pasos y resumen de handoff.
 * El resumen JAMÁS incluye el token (es lo que se copia y se manda por chat).
 */

describe("043 — asistente de conexión", () => {
  it("el catálogo tiene los 7 pasos, numerados y con título", () => {
    expect(TOTAL_ASSISTANT_STEPS).toBe(7);
    expect(ASSISTANT_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const s of ASSISTANT_STEPS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.lead.length).toBeGreaterThan(10);
    }
  });

  it("todos los enlaces de los pasos son https (nunca http)", () => {
    for (const s of ASSISTANT_STEPS) {
      if (s.link) {
        expect(s.link.href.startsWith("https://")).toBe(true);
        expect(s.link.label.length).toBeGreaterThan(3);
      }
    }
  });

  it("el resumen marca ✅ los pasos hechos y ⬜ los pendientes, con los datos cargados", () => {
    const txt = buildHandoffSummary({
      step: 4,
      done: [1, 2, 3],
      businessId: "123",
      wabaId: "456",
      phoneNumberId: "",
      connected: false,
    });
    expect(txt).toContain("✅ 1.");
    expect(txt).toContain("✅ 3.");
    expect(txt).toContain("⬜ 4.");
    expect(txt).toContain("Falta: paso 4");
    expect(txt).toContain("ID del negocio: 123");
    expect(txt).toContain("WhatsApp Business Account ID: 456");
    // El Phone Number ID vacío no aparece como dato cargado.
    expect(txt).not.toContain("Phone Number ID: ");
  });

  it("el resumen nunca incluye un token y aclara que no se comparte por chat", () => {
    const txt = buildHandoffSummary({
      step: 5,
      done: [1, 2, 3, 4],
      businessId: "",
      wabaId: "",
      phoneNumberId: "",
      connected: false,
    });
    expect(txt).toContain("no se comparte");
    expect(txt).not.toMatch(/EAA/);
    // Sin datos cargados, no aparece la sección de datos.
    expect(txt).not.toContain("Datos que ya conseguí");
  });

  it("con la conexión guardada, no queda ningún paso pendiente", () => {
    const txt = buildHandoffSummary({
      step: 7,
      done: [1, 2, 3, 4, 5, 6, 7],
      businessId: "",
      wabaId: "789",
      phoneNumberId: "111",
      connected: true,
    });
    expect(txt).toContain("Falta: nada");
    expect(txt).not.toContain("⬜");
    expect(txt).toContain("la conexión ya quedó guardada");
  });
});
