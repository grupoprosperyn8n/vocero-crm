import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireSnapshotKey } from "@/server/snapshot/auth";

/**
 * 040 — Auth del snapshot vivo del CRM (/api/snapshot): solo lectura,
 * consumido por el cockpit (rafael-intelligence). Clave propia
 * (SNAPSHOT_API_KEY) con respaldo en BOT_API_KEY para no romper si la
 * nueva todavía no está configurada.
 */

const saved: Record<string, string | undefined> = {
  SNAPSHOT_API_KEY: undefined,
  BOT_API_KEY: undefined,
};

beforeEach(() => {
  saved.SNAPSHOT_API_KEY = process.env.SNAPSHOT_API_KEY;
  saved.BOT_API_KEY = process.env.BOT_API_KEY;
  delete process.env.SNAPSHOT_API_KEY;
  delete process.env.BOT_API_KEY;
});

afterEach(() => {
  for (const key of Object.keys(saved)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const request = (key?: string) =>
  new Request("http://local/api/snapshot", {
    headers: key ? { "x-api-key": key } : {},
  });

describe("requireSnapshotKey", () => {
  it("sin claves configuradas → deniega", () => {
    expect(requireSnapshotKey(request("cualquiera"))).not.toBeNull();
  });

  it("sin header → 401", () => {
    process.env.SNAPSHOT_API_KEY = "k".repeat(32);
    const res = requireSnapshotKey(request());
    expect(res?.status).toBe(401);
  });

  it("clave incorrecta → 401", () => {
    process.env.SNAPSHOT_API_KEY = "k".repeat(32);
    const res = requireSnapshotKey(request("o".repeat(32)));
    expect(res?.status).toBe(401);
  });

  it("clave propia correcta → pasa", () => {
    process.env.SNAPSHOT_API_KEY = "k".repeat(32);
    expect(requireSnapshotKey(request("k".repeat(32)))).toBeNull();
  });

  it("BOT_API_KEY como respaldo → pasa", () => {
    process.env.BOT_API_KEY = "b".repeat(32);
    expect(requireSnapshotKey(request("b".repeat(32)))).toBeNull();
  });

  it("claves demasiado cortas no autorizan", () => {
    process.env.SNAPSHOT_API_KEY = "corta";
    expect(requireSnapshotKey(request("corta"))).not.toBeNull();
  });
});
