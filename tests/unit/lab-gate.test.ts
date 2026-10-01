import { describe, expect, it } from "vitest";
import { canUseLab } from "@/lib/roles";

/** 30Sep — Laboratorio: solo propietario y administrador (pedido Diego). */
describe("lab: acceso por rol", () => {
  it("owner y admin pasan; manager, member y visitante no", () => {
    expect(canUseLab("owner")).toBe(true);
    expect(canUseLab("admin")).toBe(true);
    expect(canUseLab("manager")).toBe(false);
    expect(canUseLab("member")).toBe(false);
    expect(canUseLab("visitante")).toBe(false);
  });
});
