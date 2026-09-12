import { describe, expect, it } from "vitest";
import {
  buildSearchFormula,
  normalizeNameQuery,
  searchDigits,
} from "@/server/clients/sgsa";
import { phoneDigits, phoneKey } from "@/server/clients/phone";

describe("búsqueda en el sistema de seguros (SGSA)", () => {
  it("normaliza el nombre: mayúsculas y sin acentos, como NOMBRE NORMALIZADO", () => {
    expect(normalizeNameQuery("josé  pérez")).toBe("JOSE PEREZ");
    expect(normalizeNameQuery("  María LóPez ")).toBe("MARIA LOPEZ");
  });

  it("arma la fórmula con nombre + teléfono según el texto", () => {
    const f = buildSearchFormula("PEREZ 341 561 7096");
    expect(f.startsWith("OR(")).toBe(true);
    expect(f).toContain('FIND("PEREZ 341 561 7096", {NOMBRE NORMALIZADO})');
    expect(f).toContain('FIND("3415617096", {TELEFONO NORMALIZADO})');
    expect(f).not.toContain("{DNI}=");
  });

  it("con DNI numérico agrega la comparación exacta", () => {
    const f = buildSearchFormula("30123456");
    expect(f).toContain("{DNI}=30123456");
    expect(f).toContain('FIND("30123456", {TELEFONO NORMALIZADO})');
  });

  it("descarta comillas del input (romperían la fórmula)", () => {
    const f = buildSearchFormula('PERE"Z');
    expect(f).not.toContain('PERE"Z');
    expect(f).toContain('FIND("PEREZ", {NOMBRE NORMALIZADO})');
  });

  it("entrada sin contenido útil no matchea nada (no rompe)", () => {
    const f = buildSearchFormula('""');
    expect(f).toContain("@@no-match@@");
  });

  it("searchDigits extrae solo dígitos", () => {
    expect(searchDigits("+54 9 341-561-7096")).toBe("5493415617096");
  });
});

describe("llaves de teléfono para el matching backend↔CRM", () => {
  it("phoneKey equipara los formatos argentinos del mismo número", () => {
    const esperado = "3415617096";
    expect(phoneKey("+54 9 341 561 7096")).toBe(esperado);
    expect(phoneKey("5493415617096")).toBe(esperado);
    expect(phoneKey("341-561-7096")).toBe(esperado);
    expect(phoneKey("0341 561 7096")).toBe(esperado);
  });

  it("phoneDigits deja solo dígitos", () => {
    expect(phoneDigits("+54 (341) 561-7096")).toBe("543415617096");
    expect(phoneDigits(null)).toBe("");
  });
});
