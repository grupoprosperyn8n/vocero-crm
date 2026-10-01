import { describe, expect, it } from "vitest";
import { canManageConnections } from "@/lib/roles";
import { connectionsGate } from "@/server/settings/access";

/**
 * 046 — Conexiones (WhatsApp, Telegram, IA): propietario y dueño (admin).
 * Pedido Diego 30Sep: «activemos el rol dueño para que pueda entrar
 * solamente a whatsapp, telegram y también para conectar una IA».
 */
describe("046: acceso a conexiones por rol", () => {
  it("owner y admin pasan; manager, member y visitante no", () => {
    expect(canManageConnections("owner")).toBe(true);
    expect(canManageConnections("admin")).toBe(true);
    expect(canManageConnections("manager")).toBe(false);
    expect(canManageConnections("member")).toBe(false);
    expect(canManageConnections("visitante")).toBe(false);
  });

  it("connectionsGate: null para owner/admin, 403 para el resto", () => {
    expect(connectionsGate({ role: "owner" })).toBeNull();
    expect(connectionsGate({ role: "admin" })).toBeNull();
    const denied = connectionsGate({ role: "manager" });
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
    expect(connectionsGate({ role: "member" })?.status).toBe(403);
  });
});
