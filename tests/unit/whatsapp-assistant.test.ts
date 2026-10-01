import { describe, expect, it } from "vitest";
import {
  ASSISTANT_STEPS,
  META_PEOPLE_URL,
  PREREQUISITES,
  TOTAL_ASSISTANT_STEPS,
  buildHandoffSummary,
} from "@/components/settings/whatsapp-steps";

/**
 * 043/045 — Asistente de conexión: catálogo de pasos, requisitos previos,
 * datos del negocio para el alta y resumen de handoff. El resumen JAMÁS
 * incluye el token (es lo que se copia y se manda por chat).
 */

describe("043/045 — asistente de conexión", () => {
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

  it("los requisitos previos cubren número, pago, cuenta y documentos", () => {
    expect(PREREQUISITES.length).toBeGreaterThanOrEqual(4);
    for (const p of PREREQUISITES) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.text.length).toBeGreaterThan(20);
    }
    const titulos = PREREQUISITES.map((p) => p.title).join(" ");
    expect(titulos).toMatch(/número/i);
    expect(titulos).toMatch(/pago/i);
    expect(titulos).toMatch(/documentos/i);
  });

  it("el paso 5 avisa por el token temporal de 24 h", () => {
    const paso5 = ASSISTANT_STEPS.find((s) => s.n === 5)!;
    expect(paso5.tip).toContain("24 horas");
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

  it("el resumen explica las dos vías de ayuda (Meta Personas + CRM)", () => {
    const txt = buildHandoffSummary({
      step: 2,
      done: [1],
      businessId: "",
      wabaId: "",
      phoneNumberId: "",
      connected: false,
    });
    expect(txt).toContain("¿Cómo me puedes dar una mano?");
    expect(txt).toContain(META_PEOPLE_URL);
    expect(txt).toContain("Ajustes → Equipo");
  });

  it("los datos del negocio se suman al resumen solo cuando hay datos", () => {
    const base = {
      step: 3,
      done: [1, 2],
      businessId: "",
      wabaId: "",
      phoneNumberId: "",
      connected: false,
    };
    expect(buildHandoffSummary(base)).not.toContain(
      "Datos del negocio (para el alta)"
    );
    const con = buildHandoffSummary({
      ...base,
      profile: {
        name: "Panadería del Sol",
        category: "Gastronomía",
        description: "",
        website: "https://sol.example",
        email: "",
        address: "Av. Siempreviva 742",
      },
    });
    expect(con).toContain("Datos del negocio (para el alta):");
    expect(con).toContain("- Nombre visible: Panadería del Sol");
    expect(con).toContain("- Rubro: Gastronomía");
    expect(con).toContain("- Sitio web: https://sol.example");
    expect(con).toContain("- Dirección: Av. Siempreviva 742");
    expect(con).not.toContain("- Descripción:");
    expect(con).not.toContain("- Correo de contacto:");
  });
});
