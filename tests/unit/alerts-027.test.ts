import { describe, expect, it } from "vitest";
import {
  ALERT_STATUSES,
  alertDate,
  alertEstadoLabel,
  alertUrgency,
  alertUrgencyLabel,
  parseAlertDetalle,
} from "@/lib/alerts";
import { normalizeAlert } from "@/server/alerts/service";

/**
 * 027 — Alertas del sistema de seguros: reglas de interpretación compartidas
 * con la PWA (prioridad por emoji, estados y detalle multilínea).
 */

describe("alertUrgency (paridad con la PWA)", () => {
  it("mapea los emojis de prioridad del sistema", () => {
    expect(alertUrgency("🔴 Alta")).toBe(3);
    expect(alertUrgency("🟠 Media")).toBe(2);
    expect(alertUrgency("🟡 Baja")).toBe(1);
  });

  it("sin emoji (o vacío) cae a Info", () => {
    expect(alertUrgency("ALTA")).toBe(0);
    expect(alertUrgency("")).toBe(0);
    expect(alertUrgency(null)).toBe(0);
    expect(alertUrgency(undefined)).toBe(0);
  });

  it("etiquetas", () => {
    expect(alertUrgencyLabel(3)).toBe("Urgente");
    expect(alertUrgencyLabel(2)).toBe("Alta");
    expect(alertUrgencyLabel(1)).toBe("Media");
    expect(alertUrgencyLabel(0)).toBe("Info");
  });
});

describe("alertEstadoLabel", () => {
  it("traduce los estados operativos", () => {
    expect(alertEstadoLabel("EN_PROGRESO")).toBe("En progreso");
    expect(alertEstadoLabel("TURNO_CONFIRMADO")).toBe("Turno conf.");
    expect(alertEstadoLabel("CONCLUIDA")).toBe("Concluido");
    expect(alertEstadoLabel("ANULADA")).toBe("Anulado");
    expect(alertEstadoLabel("DESACTIVADA")).toBe("Desactivada");
    expect(alertEstadoLabel("PENDIENTE")).toBe("Pendiente");
  });

  it("no inventa: estados desconocidos pasan tal cual", () => {
    expect(alertEstadoLabel("LO_QUE_SEA")).toBe("LO_QUE_SEA");
    expect(alertEstadoLabel(null)).toBe("");
  });
});

describe("parseAlertDetalle (formato clave: valor de la PWA)", () => {
  it("separa filas clave/valor y líneas sueltas", () => {
    const rows = parseAlertDetalle(
      "Cliente: Juan Pérez\nPóliza: 12345\nSin separador\n\nRamo: Automotor"
    );
    expect(rows).toEqual([
      { k: "Cliente", v: "Juan Pérez" },
      { k: "Póliza", v: "12345" },
      { text: "Sin separador" },
      { k: "Ramo", v: "Automotor" },
    ]);
  });

  it("descarta filas con un lado vacío (misma regla que la PWA)", () => {
    expect(parseAlertDetalle("Cliente:\n: valor\nBien: ok")).toEqual([
      { text: ": valor" },
      { k: "Bien", v: "ok" },
    ]);
  });

  it("vacío o null → sin filas", () => {
    expect(parseAlertDetalle("")).toEqual([]);
    expect(parseAlertDetalle(null)).toEqual([]);
  });
});

describe("normalizeAlert (DTO del backend → forma del CRM)", () => {
  it("normaliza una alerta real del backend", () => {
    const dto = normalizeAlert({
      id: 715,
      airtable_record_id: "recABC123",
      tipo_alerta: "POLIZA_VENCE_HOY",
      prioridad: "🔴 Alta",
      titulo: "Vence hoy: Póliza 88001",
      cuerpo: "La póliza de Juan Pérez vence hoy.",
      detalle: "Cliente: Juan Pérez\nPóliza: 88001",
      link_registro: "https://airtable.com/app123/pag456/recABC123",
      estado: "PENDIENTE",
      leida: false,
      fecha: "2026-09-13",
      fecha_visto: null,
      cliente_nombre: "Juan Pérez",
      empleado_que_marco_leido: null,
    });
    expect(dto).toEqual({
      id: "715",
      airtableRecordId: "recABC123",
      tipo: "POLIZA_VENCE_HOY",
      prioridad: "🔴 Alta",
      urgencia: 3,
      urgenciaLabel: "Urgente",
      titulo: "Vence hoy: Póliza 88001",
      cuerpo: "La póliza de Juan Pérez vence hoy.",
      detalle: "Cliente: Juan Pérez\nPóliza: 88001",
      linkRegistro: "https://airtable.com/app123/pag456/recABC123",
      estado: "PENDIENTE",
      leida: false,
      fecha: "2026-09-13",
      fechaVisto: null,
      clienteNombre: "Juan Pérez",
      empleadoLeido: null,
      compartidaCon: [],
      compartidaGrupos: null,
    });
  });

  it("campos faltantes caen a defaults razonables", () => {
    const dto = normalizeAlert({});
    expect(dto.tipo).toBe("GENERICA");
    expect(dto.titulo).toBe("Alerta");
    expect(dto.estado).toBe("PENDIENTE");
    expect(dto.urgencia).toBe(0);
    expect(dto.linkRegistro).toBeNull();
  });
});

describe("fechas y estados permitidos", () => {
  it("alertDate recorta a YYYY-MM-DD", () => {
    expect(alertDate("2026-09-13 08:30:00")).toBe("2026-09-13");
    expect(alertDate("2026-09-13")).toBe("2026-09-13");
    expect(alertDate(null)).toBe("");
  });

  it("031 — los estados fijables son los del sistema: los 4 de la PWA + Pendiente (reabrir)", () => {
    expect([...ALERT_STATUSES]).toEqual([
      "PENDIENTE",
      "EN_PROGRESO",
      "TURNO_CONFIRMADO",
      "CONCLUIDA",
      "ANULADA",
    ]);
  });
});
