import { describe, expect, it } from "vitest";
import {
  CHAT_BODY_MAX,
  canCreateGroup,
  dmPairOk,
  normalizeGroupMembers,
  resolveRoomDisplayName,
  sanitizeChatBody,
  sanitizeContactShare,
  sanitizeAlertShare,
  sanitizeRoomName,
} from "@/server/internal/chat";

describe("chat interno — quién crea grupos (regla: solo dueño/administrador)", () => {
  it("dueño y administrador pueden", () => {
    expect(canCreateGroup("owner")).toBe(true);
    expect(canCreateGroup("admin")).toBe(true);
  });

  it("un miembro (o un rol desconocido) no puede", () => {
    expect(canCreateGroup("member")).toBe(false);
    expect(canCreateGroup("")).toBe(false);
    expect(canCreateGroup("superadmin")).toBe(false);
  });
});

describe("chat interno — validación del cuerpo del mensaje", () => {
  it("recorta espacios y rechaza vacíos", () => {
    expect(sanitizeChatBody("  hola  ")).toBe("hola");
    expect(sanitizeChatBody("   ")).toBeNull();
    expect(sanitizeChatBody("")).toBeNull();
    expect(sanitizeChatBody(null)).toBeNull();
    expect(sanitizeChatBody(undefined)).toBeNull();
  });

  it("topa el largo en CHAT_BODY_MAX", () => {
    const long = "x".repeat(CHAT_BODY_MAX + 500);
    expect(sanitizeChatBody(long)?.length).toBe(CHAT_BODY_MAX);
  });

  it("conserva los saltos de línea internos", () => {
    expect(sanitizeChatBody("linea1\nlinea2")).toBe("linea1\nlinea2");
  });
});

describe("chat interno — nombre de grupo", () => {
  it("colapsa espacios repetidos", () => {
    expect(sanitizeRoomName("  Equipo   de   ventas ")).toBe("Equipo de ventas");
  });

  it("vacío → null y topa en 80 caracteres", () => {
    expect(sanitizeRoomName("   ")).toBeNull();
    expect(sanitizeRoomName("a".repeat(100))?.length).toBe(80);
  });
});

describe("chat interno — par de mensaje directo", () => {
  it("dos personas distintas: OK", () => {
    expect(dmPairOk("u1", "u2")).toBe(true);
  });

  it("uno mismo o vacío: no", () => {
    expect(dmPairOk("u1", "u1")).toBe(false);
    expect(dmPairOk("", "u2")).toBe(false);
    expect(dmPairOk("u1", "")).toBe(false);
  });
});

describe("chat interno — integrantes del grupo", () => {
  it("deduplica, ignora blancos e incluye al creador al final", () => {
    expect(normalizeGroupMembers("u1", ["u2", "u2", "", "  ", "u3"])).toEqual([
      "u2",
      "u3",
      "u1",
    ]);
  });

  it("el creador ya elegido no se duplica", () => {
    expect(normalizeGroupMembers("u1", ["u1", "u2"]).length).toBe(2);
  });
});

describe("chat interno — nombre visible de la sala", () => {
  const members = [
    { userId: "me", name: "Diego" },
    { userId: "otro", name: "Julián" },
  ];

  it("grupo: su nombre; sin nombre → 'Grupo'", () => {
    expect(resolveRoomDisplayName({ kind: "group", name: "Ventas" }, members, "me")).toBe(
      "Ventas"
    );
    expect(resolveRoomDisplayName({ kind: "group", name: null }, members, "me")).toBe(
      "Grupo"
    );
  });

  it("dm: el nombre del otro participante; sin otro → 'Empleado'", () => {
    expect(resolveRoomDisplayName({ kind: "dm", name: null }, members, "me")).toBe(
      "Julián"
    );
    expect(
      resolveRoomDisplayName({ kind: "dm", name: null }, [{ userId: "me", name: "Diego" }], "me")
    ).toBe("Empleado");
  });
});

describe("chat interno — contacto compartido (025)", () => {
  it("CRM: normaliza el nombre y exige id ct_*", () => {
    expect(
      sanitizeContactShare({
        source: "crm",
        contactId: "ct_abc123def4",
        name: "  Ana   Gómez ",
        phone: " 341 555 0000 ",
        channel: "whatsapp",
      })
    ).toEqual({
      source: "crm",
      contactId: "ct_abc123def4",
      name: "Ana Gómez",
      phone: "341 555 0000",
      channel: "whatsapp",
    });
    expect(
      sanitizeContactShare({ source: "crm", contactId: "mal", name: "Ana" })
    ).toBeNull();
    expect(sanitizeContactShare({ source: "crm", name: "Ana" })).toBeNull();
  });

  it("sistema: exige recordId rec* y sanea las pólizas", () => {
    expect(
      sanitizeContactShare({
        source: "system",
        recordId: "rechYRnw7FzaGj",
        name: "IA TEST",
        phone: "3417035515",
        policies: 3.9,
      })
    ).toEqual({
      source: "system",
      recordId: "rechYRnw7FzaGj",
      name: "IA TEST",
      phone: "3417035515",
      policies: 3,
    });
    expect(
      sanitizeContactShare({ source: "system", recordId: "nope", name: "X" })
    ).toBeNull();
    expect(
      sanitizeContactShare({
        source: "system",
        recordId: "rechYRnw7FzaGj",
        name: "X",
        policies: -2,
      })?.policies
    ).toBeNull();
  });

  it("rechaza formatos inválidos y topa el nombre en 120", () => {
    expect(sanitizeContactShare(null)).toBeNull();
    expect(sanitizeContactShare("hola")).toBeNull();
    expect(sanitizeContactShare({ source: "web", name: "X" })).toBeNull();
    expect(
      sanitizeContactShare({ source: "crm", contactId: "ct_x", name: "" })
    ).toBeNull();
    const long = sanitizeContactShare({
      source: "crm",
      contactId: "ct_abcd1234",
      name: "x".repeat(300),
    });
    expect(long?.name.length).toBe(120);
  });
});


describe("chat interno — alerta compartida (027c)", () => {
  it("normaliza aliases, topa campos y conserva URL segura", () => {
    expect(
      sanitizeAlertShare({
        id: "alert_123",
        airtableRecordId: "recAlert123",
        titulo: "  Pago   vencido ",
        cuerpo: " Cliente con cuota vencida ",
        tipo: "COBRANZA",
        urgenciaLabel: "Alta",
        linkRegistro: "https://airtable.com/app/table/rec",
        estado: "PENDIENTE",
        fecha: "2026-09-14",
      })
    ).toEqual({
      id: "alert_123",
      airtableRecordId: "recAlert123",
      title: "Pago vencido",
      titulo: "Pago vencido",
      body: "Cliente con cuota vencida",
      cuerpo: "Cliente con cuota vencida",
      type: "COBRANZA",
      tipo: "COBRANZA",
      urgencyLabel: "Alta",
      urgenciaLabel: "Alta",
      recordUrl: "https://airtable.com/app/table/rec",
      linkRegistro: "https://airtable.com/app/table/rec",
      estado: "PENDIENTE",
      fecha: "2026-09-14",
    });
  });

  it("rechaza payloads incompletos, ids raros y URLs no http(s)", () => {
    expect(sanitizeAlertShare(null)).toBeNull();
    expect(sanitizeAlertShare({ id: "alert_1", titulo: "X" })).toBeNull();
    expect(
      sanitizeAlertShare({
        id: "../bad",
        titulo: "X",
        cuerpo: "Y",
        tipo: "T",
        urgenciaLabel: "Alta",
      })
    ).toBeNull();
    expect(
      sanitizeAlertShare({
        id: "alert_1",
        titulo: "X",
        cuerpo: "Y",
        tipo: "T",
        urgenciaLabel: "Alta",
        linkRegistro: "javascript:alert(1)",
      })?.recordUrl
    ).toBeNull();
  });
});
