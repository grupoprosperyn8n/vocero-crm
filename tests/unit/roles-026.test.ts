import { describe, expect, it } from "vitest";
import { canSeeAllInbox, roleLabel } from "@/lib/roles";

/**
 * 026 — Roles de la bandeja (pedido Diego: «los gerentes pueden ver TODAS las
 * conversaciones y filtrar por las suyas o de cualquier empleado, y
 * administrador lo mismo, y propietario igual»).
 */
describe("026 — alcance de la bandeja por rol", () => {
  it("gerente, administrador y propietario ven toda la bandeja", () => {
    expect(canSeeAllInbox("owner")).toBe(true);
    expect(canSeeAllInbox("admin")).toBe(true);
    expect(canSeeAllInbox("manager")).toBe(true);
  });

  it("un miembro (empleado) no ve toda la bandeja", () => {
    expect(canSeeAllInbox("member")).toBe(false);
    expect(canSeeAllInbox("")).toBe(false);
    expect(canSeeAllInbox("desconocido")).toBe(false);
  });

  it("etiquetas en castellano", () => {
    expect(roleLabel("owner")).toBe("Propietario");
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("manager")).toBe("Gerente");
    expect(roleLabel("member")).toBe("Miembro");
  });
});
