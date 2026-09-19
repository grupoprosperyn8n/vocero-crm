import { describe, expect, it } from "vitest";
import { mergeProductOptions } from "@/server/proposals/products";

/**
 * 042f — el menú de «Tipo de producto» fusiona dos fuentes sin pisarse:
 * primero los del SISTEMA (Airtable, solo lectura), después los del CRM.
 */
describe("042f — productos (fusión sistema + CRM)", () => {
  const system = [
    { ref: "recAAA", name: "Accidentes personales", icon: "🛡️" },
    { ref: "recBBB", name: "Combinado familiar", icon: null },
  ];
  const local = [
    { id: "prd_1", name: "Cobertura de viaje", icon: "✈️", note: "nueva", updatedAt: "2026-09-18T00:00:00.000Z" },
  ];

  it("lista primero los del sistema y después los del CRM", () => {
    const out = mergeProductOptions(system, local);
    expect(out.map((p) => p.name)).toEqual([
      "Accidentes personales",
      "Combinado familiar",
      "Cobertura de viaje",
    ]);
    expect(out.map((p) => p.source)).toEqual(["sistema", "sistema", "crm"]);
  });

  it("conserva ref, icono y nota según la fuente", () => {
    const out = mergeProductOptions(system, local);
    const first = out[0]!;
    expect(first.ref).toBe("recAAA");
    expect(first.icon).toBe("🛡️");
    expect(first.note).toBeNull();
    const crm = out[2]!;
    expect(crm.ref).toBe("prd_1");
    expect(crm.icon).toBe("✈️");
    expect(crm.note).toBe("nueva");
  });

  it("sin sistema devuelve solo los del CRM", () => {
    const out = mergeProductOptions([], local);
    expect(out).toHaveLength(1);
    expect(out[0]!.source).toBe("crm");
  });

  it("sin CRM devuelve solo los del sistema", () => {
    const out = mergeProductOptions(system, []);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.source === "sistema")).toBe(true);
  });
});
