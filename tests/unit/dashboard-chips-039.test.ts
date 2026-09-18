import { describe, expect, it } from "vitest";

import {
  airtableTagStyle,
  isKnownAirtableTag,
  normalizeAirtableValue,
} from "@/lib/dashboard-management/airtable-colors";

/**
 * 039 — Etiquetas del tablero con los colores reales del backend de Airtable
 * (base agéntica, tabla POLIZAS: ESTADO DE LA POLIZA / FORMA DE PAGOS).
 */

describe("normalizeAirtableValue", () => {
  it("normaliza acentos, guiones bajos y espacios de más", () => {
    expect(normalizeAirtableValue("Vida en trámite ")).toBe("VIDA EN TRAMITE");
    expect(normalizeAirtableValue("NO_RENOVADA")).toBe("NO RENOVADA");
    expect(normalizeAirtableValue("vence  en   30 días")).toBe("VENCE EN 30 DIAS");
  });
});

describe("airtableTagStyle — estados de póliza", () => {
  it("pinta con el color exacto de la opción en Airtable", () => {
    expect(airtableTagStyle("VIGENTE")).toEqual({
      backgroundColor: "#20D9D2",
      color: "#FFFFFF",
      borderColor: "rgba(255,255,255,0.28)",
    });
    expect(airtableTagStyle("POLIZA VIGENTE")?.backgroundColor).toBe("#20D9D2");
    expect(airtableTagStyle("RENOVADA")?.backgroundColor).toBe("#20C933");
    expect(airtableTagStyle("ANULACION")?.backgroundColor).toBe("#F82B60");
    expect(airtableTagStyle("EN TRAMITE")?.backgroundColor).toBe("#FCB400");
    expect(airtableTagStyle("VENCE EN 30 DIAS")?.backgroundColor).toBe("#F99DE2");
    expect(airtableTagStyle("VENCE HOY")?.backgroundColor).toBe("#FF08C2");
    expect(airtableTagStyle("COMPLETAR DATOS")?.backgroundColor).toBe("#FF6F2C");
    expect(airtableTagStyle("SIN VIGENCIA")?.backgroundColor).toBe("#B2158B");
  });

  it("acepta las variantes crudas que llegan de Airtable", () => {
    expect(airtableTagStyle("Vida en trámite")?.backgroundColor).toBe("#8B46FF");
    expect(airtableTagStyle("NO_RENOVADA")?.backgroundColor).toBe("#BA1E45");
    expect(airtableTagStyle(" vence en 7 dias ")?.backgroundColor).toBe("#FF08C2");
  });

  it("los tokens claros usan texto negro", () => {
    expect(airtableTagStyle("SIN POLIZA")).toMatchObject({
      backgroundColor: "#EDE2FE",
      color: "#000000",
    });
  });
});

describe("airtableTagStyle — forma de pago y desconocidos", () => {
  it("pinta las formas de pago de la base agéntica", () => {
    expect(airtableTagStyle("CREDITO")?.backgroundColor).toBe("#2D7FF9");
    expect(airtableTagStyle("DEBITO")?.backgroundColor).toBe("#18BFFF");
    expect(airtableTagStyle("EFECTIVO")?.backgroundColor).toBe("#20C933");
    expect(airtableTagStyle("MERCADO P")?.backgroundColor).toBe("#FCB400");
  });

  it("un valor sin mapeo devuelve null (el chip cae a neutro)", () => {
    expect(airtableTagStyle("NO EXISTE")).toBeNull();
    expect(airtableTagStyle("  ")).toBeNull();
    expect(isKnownAirtableTag("SIN POLIZA")).toBe(true);
    expect(isKnownAirtableTag("CUALQUIER COSA")).toBe(false);
  });
});
