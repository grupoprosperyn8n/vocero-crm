import { describe, expect, it } from "vitest";
import { priorityValueForPrioridad, prioridadForPriorityValue } from "@/lib/alerts";

/**
 * 031c — la prioridad de la alerta machea con la del pipeline.
 *
 * Los dos vocabularios: la tabla usa texto con emoji («🔴 Alta», «🟠 Media»,
 * «🟣 Baja», «🟡 Baja»), el CRM usa alta/media/baja/null. Estos tests fijan
 * las dos direcciones del mapeo y la regla de oro: sin valor NO se adivina.
 */
describe("031c — prioridad macheada (alerta ↔ CRM)", () => {
  it("mapea los valores REALES de la tabla (con emoji)", () => {
    expect(priorityValueForPrioridad("🔴 Alta")).toBe("alta");
    expect(priorityValueForPrioridad("🟠 Media")).toBe("media");
    expect(priorityValueForPrioridad("🟣 Baja")).toBe("baja");
    expect(priorityValueForPrioridad("🟡 Baja")).toBe("baja");
  });

  it("tolera texto suelto y mayúsculas (la tabla es texto libre)", () => {
    expect(priorityValueForPrioridad("ALTA")).toBe("alta");
    expect(priorityValueForPrioridad(" media ")).toBe("media");
  });

  it("sin valor no se adivina: null queda null (no es media)", () => {
    expect(priorityValueForPrioridad(null)).toBeNull();
    expect(priorityValueForPrioridad("")).toBeNull();
    expect(priorityValueForPrioridad("⚫ Otra")).toBeNull();
  });

  it("la vuelta usa las cadenas EXACTAS de la tabla (no se inventan opciones)", () => {
    expect(prioridadForPriorityValue("alta")).toBe("🔴 Alta");
    expect(prioridadForPriorityValue("media")).toBe("🟠 Media");
    expect(prioridadForPriorityValue("baja")).toBe("🟣 Baja");
    expect(prioridadForPriorityValue(null)).toBeNull();
  });

  it("ida y vuelta no pierde el escalón", () => {
    for (const v of ["alta", "media", "baja"] as const) {
      expect(priorityValueForPrioridad(prioridadForPriorityValue(v))).toBe(v);
    }
  });
});
