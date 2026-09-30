import { describe, expect, it } from "vitest";

import { buildAlgoModuleInsight } from "@/lib/dashboard-management/algo-insight";

/**
 * 044b-B15 — Motor algorítmico: el informe por reglas de cada módulo.
 * Sin IA, sin red: pura lectura del contexto con umbrales.
 */
describe("044b-B15 — buildAlgoModuleInsight", () => {
  it("migración: usa los números reales y arma focos y acciones", () => {
    const out = buildAlgoModuleInsight("migracion", {
      "Clientes en el sistema": 14921,
      "Gestiones históricas": 35432,
      "Clientes vinculados": 14689,
      "Gestiones vinculadas": 34223,
      "Tasa de vínculo de clientes %": 98,
      "Tasa de vínculo de gestiones %": 97,
      "Gestiones sin vincular": 1209,
      "Pólizas cargadas": 1431,
      "Pólizas sin cliente": 9,
      "Pólizas sin producto": 23,
      "Pólizas sin compañía": 12,
      "Pólizas sin vencimiento": 437,
    });

    expect(out.resumen).toContain("Vinculados 14.689 de 14.921 clientes");
    expect(out.resumen).toContain("34.223 de 35.432 gestiones");
    expect(out.resumen).toContain("1.209 gestiones");
    expect(out.focos.length).toBeGreaterThan(0);
    expect(out.acciones.some((a) => a.texto.includes("1.209"))).toBe(true);
    expect(out.acciones.some((a) => a.texto.includes("437"))).toBe(true);
  });

  it("migración completa: sin pendientes, propone el control semanal", () => {
    const out = buildAlgoModuleInsight("migracion", {
      "Clientes en el sistema": 100,
      "Gestiones históricas": 200,
      "Clientes vinculados": 100,
      "Gestiones vinculadas": 200,
      "Tasa de vínculo de clientes %": 100,
      "Tasa de vínculo de gestiones %": 100,
      "Gestiones sin vincular": 0,
      "Pólizas cargadas": 0,
      "Pólizas sin cliente": 0,
      "Pólizas sin producto": 0,
      "Pólizas sin compañía": 0,
      "Pólizas sin vencimiento": 0,
    });

    expect(out.focos[0]).toContain("Sin pendientes");
    expect(out.acciones.some((a) => a.texto.includes("control semanal"))).toBe(true);
  });

  it("reactivación: la campaña apunta al Constructor de publicaciones", () => {
    const out = buildAlgoModuleInsight("reactivacion", {
      "Candidatos (histórico sin póliza activa)": 231,
      "Universo potencial (histórico sin póliza cargada)": 400,
      "Altas históricas": 900,
      "Anulaciones históricas": 120,
      "Siniestros históricos": 30,
    });

    expect(out.resumen).toContain("231 candidatos");
    expect(out.acciones.some((a) => a.pieza === "publicacion")).toBe(true);
    expect(out.acciones.some((a) => a.pieza === "cupon")).toBe(true);
  });

  it("pulso en rojo: marca el crecimiento negativo como foco", () => {
    const out = buildAlgoModuleInsight("pulso", {
      "Pólizas activas": 800,
      "Prima activa ARS": 4500000,
      "Clientes con póliza activa": 700,
      "Vencen ≤7 días": 12,
      "Vencen ≤30 días": 40,
      "Altas históricas": 1000,
      "Anulaciones históricas": 1100,
      "Crecimiento neto": -100,
      "Siniestros históricos": 55,
      "Cotizaciones": 0,
    });

    expect(out.resumen).toContain("rojo");
    expect(out.focos.some((f) => f.includes("negativo"))).toBe(true);
    expect(out.acciones.some((a) => a.pieza === "publicacion")).toBe(true);
  });

  it("crm: porcentajes en fracción o en % se muestran igual", () => {
    const out = buildAlgoModuleInsight("crm", {
      "Contactos": 500,
      "Conversaciones": 120,
      "Conversaciones abiertas": 7,
      "Mensajes": 2400,
      "Mensajes de la IA": 1000,
      "Leads": 100,
      "Convertidos": 98,
      "Tasa de conversión %": 0.98,
      "Monto de pipeline ARS": 0,
      "Contactos vinculados a cartera": 0,
      "Tasa de vínculo %": 0,
    });

    expect(out.resumen).toContain("98%");
    expect(out.focos.some((f) => f.includes("abiertas"))).toBe(true);
  });

  it("sin datos: no inventa nada", () => {
    const out = buildAlgoModuleInsight("cartera", {});
    expect(out.resumen).toContain("Todavía no hay datos");
    expect(out.acciones).toHaveLength(0);
  });

  it("todos los módulos responden sin explotar con contexto vacío", () => {
    const ids = [
      "pulso",
      "cartera",
      "retencion",
      "reactivacion",
      "cross",
      "migracion",
      "crm",
    ] as const;

    for (const id of ids) {
      const out = buildAlgoModuleInsight(id, null);
      expect(out.resumen.length).toBeGreaterThan(0);
      expect(Array.isArray(out.acciones)).toBe(true);
    }
  });
});
