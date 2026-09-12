import { describe, expect, it } from "vitest";
import {
  CHAT_BODY_MAX,
  canCreateGroup,
  dmPairOk,
  normalizeGroupMembers,
  resolveRoomDisplayName,
  sanitizeChatBody,
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
