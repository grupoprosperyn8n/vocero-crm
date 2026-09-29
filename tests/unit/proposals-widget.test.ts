import { describe, expect, it } from "vitest";

import { couponCode, sanitizeWidget, WIDGET_MAX_FIELDS } from "@/lib/proposals/widget";

describe("piezas del Constructor — widget (044b-B11)", () => {
  it("un formulario necesita al menos un campo con etiqueta", () => {
    expect(sanitizeWidget({ type: "form", fields: [] })).toBeNull();
    expect(sanitizeWidget({ type: "form", fields: [{ label: "  " }] })).toBeNull();
    const w = sanitizeWidget({
      type: "form",
      fields: [
        { id: "f-1", label: "Nombre y apellido", tipo: "texto", requerido: true, opciones: [] },
        { id: "f-2", label: "Teléfono", tipo: "telefono", requerido: true, opciones: [] },
        { id: "f-3", label: "", tipo: "email" },
      ],
    });
    expect(w).not.toBeNull();
    if (w?.type !== "form") throw new Error("esperaba form");
    expect(w.fields).toHaveLength(2);
    expect(w.fields[0]?.requerido).toBe(true);
  });

  it("una selección sin opciones cae a texto (no queda un select vacío)", () => {
    const sin = sanitizeWidget({
      type: "form",
      fields: [{ label: "Provincia", tipo: "seleccion", opciones: [] }],
    });
    if (sin?.type !== "form") throw new Error("esperaba form");
    expect(sin.fields[0]?.tipo).toBe("texto");

    const con = sanitizeWidget({
      type: "form",
      fields: [{ label: "Provincia", tipo: "seleccion", opciones: ["Santa Fe", "Córdoba"] }],
    });
    if (con?.type !== "form") throw new Error("esperaba form");
    expect(con.fields[0]?.tipo).toBe("seleccion");
    expect(con.fields[0]?.opciones).toEqual(["Santa Fe", "Córdoba"]);
  });

  it("la encuesta usa questions y también exige al menos una", () => {
    expect(sanitizeWidget({ type: "survey", questions: [] })).toBeNull();
    const w = sanitizeWidget({
      type: "survey",
      questions: [{ label: "¿Nos recomendás?", tipo: "si_no" }],
    });
    if (w?.type !== "survey") throw new Error("esperaba survey");
    expect(w.questions).toHaveLength(1);
    expect(w.questions[0]?.tipo).toBe("si_no");
  });

  it("el límite de campos se respeta", () => {
    const fields = Array.from({ length: 30 }, (_, i) => ({ label: `Campo ${i}`, tipo: "texto" }));
    const w = sanitizeWidget({ type: "form", fields });
    if (w?.type !== "form") throw new Error("esperaba form");
    expect(w.fields.length).toBe(WIDGET_MAX_FIELDS);
  });

  it("un cupón sin beneficio no existe; con beneficio normaliza prefijo y fechas", () => {
    expect(sanitizeWidget({ type: "coupon", beneficio: " " })).toBeNull();
    const w = sanitizeWidget({
      type: "coupon",
      beneficio: "20% off",
      prefijo: "v-ch!",
      desde: "2026-10-01",
      hasta: "no es fecha",
    });
    if (w?.type !== "coupon") throw new Error("esperaba coupon");
    expect(w.prefijo).toBe("VCH");
    expect(w.desde).toBe("2026-10-01");
    expect(w.hasta).toBeNull();
    expect(w.condiciones).toBe("");
  });

  it("tipo desconocido o basura → null (publicación clásica)", () => {
    expect(sanitizeWidget(null)).toBeNull();
    expect(sanitizeWidget({ type: "otro" })).toBeNull();
    expect(sanitizeWidget("hola")).toBeNull();
    expect(sanitizeWidget(42)).toBeNull();
  });

  it("los códigos de voucher salen con prefijo y dos grupos de 4, sin caracteres confundibles", () => {
    const c = couponCode("vch");
    expect(c).toMatch(/^VCH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(c.slice(4)).not.toMatch(/[O0I1]/);
    expect(couponCode("")).toMatch(/^VCH-/);
  });
});
