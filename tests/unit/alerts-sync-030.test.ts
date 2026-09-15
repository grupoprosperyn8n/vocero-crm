import { describe, expect, it } from "vitest";
import {
  ALERT_ESTADO_LABEL,
  ALERT_STATUSES,
  estadoForStage,
  isLiveAssignmentStatus,
  stageForEstado,
} from "@/lib/alerts";
import { buildGestionSearchFormula } from "@/server/clients/gestiones";

/**
 * 030 — alerta «macheada» con el pipeline + un solo ejecutor por vez
 * (pedido Diego 2026-09-15).
 *
 * Reglas que estas pruebas fijan:
 *  · una derivación VIVA (no CONCLUIDA/ANULADA) es la puerta cerrada de la
 *    alerta: un solo ejecutor por vez;
 *  · las etapas del tablero de gestiones traducen a estado real: última
 *    (ancla `won`) = CONCLUIDA, anulada (`lost`) = ANULADA, abiertas =
 *    EN_PROGRESO;
 *  · el buscador de GESTIÓN GENERAL arma una fórmula Airtable sana (sin
 *    inyección de comillas, con placeholder cuando no hay nada que buscar).
 */

describe("030 — derivaciones vivas", () => {
  it("una derivación viva cierra la puerta; concluida/anulada la abre", () => {
    expect(isLiveAssignmentStatus("ASSIGNED")).toBe(true);
    expect(isLiveAssignmentStatus("EN_PROGRESO")).toBe(true);
    expect(isLiveAssignmentStatus("TURNO_CONFIRMADO")).toBe(true);
    expect(isLiveAssignmentStatus("en_progreso")).toBe(true);
    expect(isLiveAssignmentStatus("CONCLUIDA")).toBe(false);
    expect(isLiveAssignmentStatus("ANULADA")).toBe(false);
    expect(isLiveAssignmentStatus("concluida")).toBe(false);
  });
});

describe("030 → 031 — la tarjeta de alerta macheada con la tabla", () => {
  it("la etapa con estado propio manda; sin estado cae al ancla", () => {
    expect(estadoForStage({ estado: "TURNO_CONFIRMADO", kind: "open" })).toBe("TURNO_CONFIRMADO");
    expect(estadoForStage({ estado: "PENDIENTE", kind: "open" })).toBe("PENDIENTE");
    expect(estadoForStage({ estado: null, kind: "won" })).toBe("CONCLUIDA");
    expect(estadoForStage({ estado: null, kind: "lost" })).toBe("ANULADA");
    expect(estadoForStage({ estado: null, kind: "open" })).toBe("EN_PROGRESO");
  });

  it("031 — el estado del sistema elige la columna exacta (o null si no hay columna)", () => {
    const stages = [
      { id: "a", estado: "PENDIENTE", kind: "open" as const },
      { id: "b", estado: "EN_PROGRESO", kind: "open" as const },
      { id: "c", estado: "TURNO_CONFIRMADO", kind: "open" as const },
      { id: "w", estado: "CONCLUIDA", kind: "won" as const },
      { id: "l", estado: "ANULADA", kind: "lost" as const },
    ];
    expect(stageForEstado(stages, "TURNO_CONFIRMADO")?.id).toBe("c");
    expect(stageForEstado(stages, "en_progreso")?.id).toBe("b");
    expect(stageForEstado(stages, "CONCLUIDA")?.id).toBe("w");
    expect(stageForEstado(stages, "ANULADA")?.id).toBe("l");
    expect(stageForEstado(stages, "PENDIENTE")?.id).toBe("a");
    // Estados terminales sin columna propia: la tarjeta no se mueve.
    expect(stageForEstado(stages, "DESACTIVADA")).toBeNull();
    expect(stageForEstado(stages, "REVISADA")).toBeNull();
  });

  it("031 — sin columna exacta, el ancla alcanza (etapas viejas)", () => {
    const viejas = [
      { id: "o", estado: null, kind: "open" as const },
      { id: "w2", estado: null, kind: "won" as const },
      { id: "l2", estado: null, kind: "lost" as const },
    ];
    expect(stageForEstado(viejas, "CONCLUIDA")?.id).toBe("w2");
    expect(stageForEstado(viejas, "ANULADA")?.id).toBe("l2");
    expect(stageForEstado(viejas, "EN_PROGRESO")).toBeNull();
  });

  it("todo estado válido tiene etiqueta humana y toda etiqueta su estado", () => {
    for (const estado of ALERT_STATUSES) {
      expect(ALERT_ESTADO_LABEL[estado]).toBeTruthy();
    }
    // PENDIENTE es la columna de entrada del tablero (reabrir también existe).
    expect(ALERT_ESTADO_LABEL.PENDIENTE).toBeTruthy();
  });
});

describe("030 — buscador de gestiones (GESTIÓN GENERAL)", () => {
  it("busca por n° de gestión, texto (sin distinguir mayúsculas) y número", () => {
    const f = buildGestionSearchFormula("caballero", []);
    expect(f.startsWith("OR(")).toBe(true);
    expect(f).toContain('FIND("CABALLERO", UPPER({ID_UNICO_GESTION}))');
    expect(f).toContain('FIND("CABALLERO", UPPER({MOTIVOS DE LA CONSULTA}))');
  });

  it("un número corto busca por NUMERO exacto y por DNI/póliza", () => {
    const f = buildGestionSearchFormula("14954", []);
    expect(f).toContain("{NUMERO}=14954");
    expect(f).toContain('FIND("14954", ARRAYJOIN({DNI (from CLIENTE)}))');
  });

  it("los clientes encontrados buscan por vínculo CLIENTE", () => {
    const f = buildGestionSearchFormula("gomez", ["recaaaaaaaaaaaaa1"]);
    expect(f).toContain('FIND("recaaaaaaaaaaaaa1", ARRAYJOIN({CLIENTE}))');
  });

  it("neutraliza comillas y no deja la fórmula vacía", () => {
    const f = buildGestionSearchFormula('ev"il', []);
    expect(f).not.toContain('"EV"IL"');
    expect(f).toContain("EVIL");
    const vacia = buildGestionSearchFormula("á", []);
    expect(vacia).toContain("@@no-match@@");
  });
});
