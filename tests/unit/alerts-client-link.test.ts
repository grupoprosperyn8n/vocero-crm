/**
 * 028b — «Abrir cliente»: enlace a la interface + resolución del CLIENTE de
 * una alerta (campo link CLIENTE de ALERTAS, con caché y sin romper si falta
 * el PAT o falla Airtable).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  alertRecordInterfaceUrl,
  sgsaClientInterfaceUrl,
  withClientParam,
} from "@/lib/sgsa-links";
import {
  pickClientId,
  resolveAlertClientRecords,
  withClientRecordIds,
} from "@/server/alerts/client-record";
import type { SgsaAlertDto } from "@/lib/types";

function alert(over: Partial<SgsaAlertDto>): SgsaAlertDto {
  return {
    id: "1",
    airtableRecordId: null,
    tipo: "POLIZA_SIN_VIGENCIA",
    prioridad: "🔴 Alta",
    urgencia: 3,
    urgenciaLabel: "Urgente",
    titulo: "t",
    cuerpo: "c",
    detalle: "d",
    linkRegistro: null,
    estado: "PENDIENTE",
    leida: false,
    fecha: null,
    fechaVisto: null,
    clienteNombre: null,
    empleadoLeido: null,
    compartidaCon: [],
    compartidaGrupos: null,
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("enlaces a la interface (028c — registro y cliente en uno)", () => {
  // Link real de un registro (mismo que usa el sistema), copiado tal cual.
  const DETAIL =
    "eyJwYWdlSWQiOiJwYWd1TkNVSFpSblBibEd0aSIsInJvd0lkIjoicmVjNUlXSFNmV3RRRllDTWciLCJzaG93Q29tbWVudHMiOmZhbHNlLCJxdWVyeU9yaWdpbkhpbnQiOnsidHlwZSI6InBhZ2VFbGVtZW50IiwiZWxlbWVudElkIjoicGVsSk51bGh6eUVMTW5PMFciLCJxdWVyeUNvbnRhaW5lcklkIjoicGVsUUxSWDN4ZW8wVTJOUXYifX0";
  const LINK = `https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4?detail=${DETAIL}`;

  it("cliente: usa el formato oficial ?DSjXA=", () => {
    expect(sgsaClientInterfaceUrl("reck7vLyA9266hhVL")).toBe(
      "https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4?DSjXA=reck7vLyA9266hhVL"
    );
  });

  it("withClientParam: agrega el cliente al link de registro sin tocar el detail", () => {
    const merged = withClientParam(LINK, "reck7vLyA9266hhVL");
    const u = new URL(merged);
    expect(u.searchParams.get("detail")).toBe(DETAIL);
    expect(u.searchParams.get("DSjXA")).toBe("reck7vLyA9266hhVL");
  });

  it("withClientParam: sin cliente o link inválido devuelve el original", () => {
    expect(withClientParam(LINK, null)).toBe(LINK);
    expect(withClientParam("no-es-url", "recX")).toBe("no-es-url");
  });

  it("alertRecordInterfaceUrl: registro + cliente en uno; fallbacks", () => {
    const merged = alertRecordInterfaceUrl(LINK, "recCLI");
    expect(merged).toContain("detail=");
    expect(merged).toContain("DSjXA=recCLI");
    // sin link pero con cliente → ficha del cliente
    expect(alertRecordInterfaceUrl(null, "recCLI")).toBe(
      "https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4?DSjXA=recCLI"
    );
    // sin link ni cliente → null
    expect(alertRecordInterfaceUrl(null, null)).toBeNull();
    // link sin cliente → tal cual
    expect(alertRecordInterfaceUrl(LINK, null)).toBe(LINK);
  });
});

describe("pickClientId — todas las alertas, no solo póliza", () => {
  it("link CLIENTE (array) tiene prioridad", () => {
    expect(
      pickClientId({ CLIENTE: ["recCLI00000000001"], CLIENTES: "recCLI00000000002" })
    ).toBe("recCLI00000000001");
  });

  it("cae a CLIENTES (string rec… de GESTIÓN GENERAL)", () => {
    expect(pickClientId({ CLIENTES: "rec3zNjrl8iumrarY" })).toBe(
      "rec3zNjrl8iumrarY"
    );
  });

  it("CLIENTES con texto (p.ej. «TEST IA») o vacío → null", () => {
    expect(pickClientId({ CLIENTES: "TEST IA" })).toBeNull();
    expect(pickClientId({})).toBeNull();
    expect(pickClientId({ CLIENTE: [] })).toBeNull();
  });
});

describe("resolveAlertClientRecords", () => {
  it("resuelve también por CLIENTES cuando CLIENTE está vacío", async () => {
    vi.stubEnv("SGSA_AIRTABLE_PAT", "test-pat");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          records: [{ id: "recG1", fields: { CLIENTES: "recCLI00000000003" } }],
        }),
      }))
    );
    const out = await resolveAlertClientRecords(["recG1"]);
    expect(out.get("recG1")).toBe("recCLI00000000003");
  });

  it("sin PAT devuelve vacío (no llama a Airtable)", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    vi.stubEnv("SGSA_AIRTABLE_PAT", "");
    const out = await resolveAlertClientRecords(["recA"]);
    expect(out.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("resuelve CLIENTE por lote y cachea (un solo fetch para el mismo id)", async () => {
    vi.stubEnv("SGSA_AIRTABLE_PAT", "test-pat");
    const fetchMock = vi.fn(async (_url: unknown) => ({
      ok: true,
      json: async () => ({
        records: [
          { id: "recA", fields: { CLIENTE: ["recCLI00000000001"] } },
          { id: "recB", fields: {} },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveAlertClientRecords(["recA", "recB"]);
    expect(first.get("recA")).toBe("recCLI00000000001");
    expect(first.has("recB")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("ALERTAS");
    expect(calledUrl).toContain("CLIENTE");

    const second = await resolveAlertClientRecords(["recA"]);
    expect(second.get("recA")).toBe("recCLI00000000001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("withClientRecordIds", () => {
  it("adjunta clienteRecordId solo a las alertas con cliente", async () => {
    vi.stubEnv("SGSA_AIRTABLE_PAT", "test-pat");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          records: [{ id: "recZ", fields: { CLIENTE: ["recCLI00000000009"] } }],
        }),
      }))
    );
    const [withCli, without] = await withClientRecordIds([
      alert({ airtableRecordId: "recZ" }),
      alert({ id: "2" }),
    ]);
    expect(withCli?.clienteRecordId).toBe("recCLI00000000009");
    expect(without?.clienteRecordId).toBeUndefined();
  });

  it("si Airtable falla, devuelve las alertas sin tocar", async () => {
    vi.stubEnv("SGSA_AIRTABLE_PAT", "test-pat");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );
    const input = [alert({ airtableRecordId: "recFail" })];
    const out = await withClientRecordIds(input);
    expect(out).toEqual(input);
  });
});
