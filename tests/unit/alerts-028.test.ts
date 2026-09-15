import { describe, expect, it } from "vitest";
import {
  canManageAlertAssignments,
  parseAssignmentTargets,
} from "@/server/alerts/assignments";

/**
 * 028 — Derivación de alertas (pedido Diego 2026-09-15): reglas por tipo que
 * definen quién VE y GESTIONA cada tipo, visibilidad por rol y asignación
 * individual. Acá se cubren las piezas puras; la visibilidad y la trazabilidad
 * contra la DB se prueban en tests/integration/alert-assignments.
 */

describe("canManageAlertAssignments (misma jerarquía que la bandeja 026)", () => {
  it("propietario, administrador y gerente derivan", () => {
    expect(canManageAlertAssignments("owner")).toBe(true);
    expect(canManageAlertAssignments("admin")).toBe(true);
    expect(canManageAlertAssignments("manager")).toBe(true);
  });

  it("un miembro (empleado) no deriva", () => {
    expect(canManageAlertAssignments("member")).toBe(false);
    expect(canManageAlertAssignments("")).toBe(false);
    expect(canManageAlertAssignments("lo-que-sea")).toBe(false);
  });
});

describe("parseAssignmentTargets", () => {
  it("normaliza: recorta, deduplica y descarta ids inválidos", () => {
    expect(
      parseAssignmentTargets({
        empleados: [" usr_a ", "usr_a", "usr-b", "", "con espacio", 7, null],
        grupos: ["chtr_1", "chtr_1", "rec#raro"],
      })
    ).toEqual({ empleados: ["usr_a", "usr-b"], grupos: ["chtr_1"] });
  });

  it("no-array o cuerpo sin campos → vacío", () => {
    expect(parseAssignmentTargets({ empleados: "usr_a", grupos: 3 })).toEqual({
      empleados: [],
      grupos: [],
    });
    expect(parseAssignmentTargets({})).toEqual({ empleados: [], grupos: [] });
  });

  it("topa la cantidad: 100 empleados y 50 grupos", () => {
    const manyEmps = Array.from({ length: 130 }, (_, i) => `usr_${i}`);
    const manyGroups = Array.from({ length: 60 }, (_, i) => `chtr_${i}`);
    const out = parseAssignmentTargets({ empleados: manyEmps, grupos: manyGroups });
    expect(out.empleados).toHaveLength(100);
    expect(out.grupos).toHaveLength(50);
  });
});
