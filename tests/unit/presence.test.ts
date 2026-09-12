import { describe, expect, it } from "vitest";
import { subscribe, type SseEvent } from "@/server/events/bus";
import {
  dropPresence,
  onlineUserIds,
  touchPresence,
} from "@/server/events/presence";

/**
 * 022 — Presencia: una conexión SSE viva = empleado en línea. El módulo
 * publica `presence.updated` en el bus SOLO en los cambios de estado
 * (0→1 en línea; 1→0 desconectado), y el refcount aguanta multi-pestaña.
 */

function collect(org: string, fn: () => void): SseEvent[] {
  const events: SseEvent[] = [];
  const unsubscribe = subscribe(org, (e) => events.push(e));
  fn();
  unsubscribe();
  return events;
}

let n = 0;
const newOrg = () => `org_presence_test_${++n}`;

describe("presence", () => {
  it("la primera conexión marca en línea y emite un solo evento", () => {
    const org = newOrg();
    const events = collect(org, () => touchPresence(org, "u1"));
    expect(events).toEqual([
      { type: "presence.updated", data: { userId: "u1", online: true } },
    ]);
    expect(onlineUserIds(org)).toEqual(["u1"]);
  });

  it("segunda pestaña: sin evento ni cambio de estado", () => {
    const org = newOrg();
    touchPresence(org, "u1");
    const events = collect(org, () => touchPresence(org, "u1"));
    expect(events).toEqual([]);
    expect(onlineUserIds(org)).toContain("u1");
  });

  it("cae recién al cerrar la última conexión y avisa una sola vez", () => {
    const org = newOrg();
    touchPresence(org, "u1");
    touchPresence(org, "u1");
    const firstDrop = collect(org, () => dropPresence(org, "u1"));
    expect(firstDrop).toEqual([]); // queda una pestaña viva
    expect(onlineUserIds(org)).toContain("u1");
    const secondDrop = collect(org, () => dropPresence(org, "u1"));
    expect(secondDrop).toEqual([
      { type: "presence.updated", data: { userId: "u1", online: false } },
    ]);
    expect(onlineUserIds(org)).toEqual([]);
  });

  it("drop de alguien que nunca estuvo: sin eventos ni errores", () => {
    const org = newOrg();
    const events = collect(org, () => dropPresence(org, "ghost"));
    expect(events).toEqual([]);
    expect(onlineUserIds(org)).toEqual([]);
  });

  it("las organizaciones quedan aisladas entre sí", () => {
    const a = newOrg();
    const b = newOrg();
    touchPresence(a, "u1");
    expect(onlineUserIds(a)).toEqual(["u1"]);
    expect(onlineUserIds(b)).toEqual([]);
  });
});
