import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Contrato de GET /api/health (specs/018-health-uptime-node):
 * 200 con DB disponible → { ok, version, commit?, uptime, node }.
 * 503 con DB caída → { ok:false, error:{code:"db_unavailable"} }.
 * El endpoint es la única forma de confirmar desde un pipeline qué build
 * corre; los campos nuevos (uptime, node) describen el proceso que responde.
 *
 * Ojo: version.ts congela APP_VERSION/BUILD_COMMIT al importar, así que cada
 * caso que depende de env re-importa el route fresco (vi.resetModules) tras
 * fijar las variables — patrón obligatorio para constantes de módulo.
 */

const state = vi.hoisted(() => ({
  dbOk: true as boolean,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    execute: async () => {
      if (!state.dbOk) throw new Error("connection refused");
      return [{ "?column?": 1 }];
    },
  }),
}));

/** Re-importa el route para que version.ts lea el env recién fijado. */
async function freshGet() {
  vi.resetModules();
  const { GET } = await import("@/app/api/health/route");
  return GET;
}

async function readJson(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.dbOk = true;
  });

  it("200: ok, version, uptime (entero ≥ 0) y node (vX.Y.Z)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "9.9.9");
    const GET = await freshGet();
    const { status, body } = await readJson(await GET());

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version).toBe("9.9.9");
    expect(Number.isInteger(body.uptime)).toBe(true);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.node).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("200: incluye commit (7 chars) cuando el build lo resolvió", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "0123456789abcdef");
    const GET = await freshGet();
    const { status, body } = await readJson(await GET());

    expect(status).toBe(200);
    expect(body.commit).toBe("0123456");
  });

  it("200: omite la clave commit cuando no hay commit resoluble", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_COMMIT", "");
    vi.stubEnv("SOURCE_COMMIT", "");
    const GET = await freshGet();
    const { status, body } = await readJson(await GET());

    expect(status).toBe(200);
    expect(body).not.toHaveProperty("commit");
    expect(body.ok).toBe(true);
  });

  it("503 con DB caída: formato de error intacto (sin campos de proceso)", async () => {
    state.dbOk = false;
    const GET = await freshGet();
    const { status, body } = await readJson(await GET());

    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("db_unavailable");
    expect(body).not.toHaveProperty("uptime");
    expect(body).not.toHaveProperty("node");
    expect(body).not.toHaveProperty("version");
  });
});
