/**
 * 028b — «Abrir cliente»: enlace a la interface + resolución del CLIENTE de
 * una alerta (campo link CLIENTE de ALERTAS, con caché y sin romper si falta
 * el PAT o falla Airtable).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { sgsaClientInterfaceUrl } from "@/lib/sgsa-links";
import {
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

describe("sgsaClientInterfaceUrl", () => {
  it("construye el enlace canónico /{base}/{interface}/{recordId}", () => {
    expect(sgsaClientInterfaceUrl("reck7vLyA9266hhVL")).toBe(
      "https://airtable.com/appuhslj3GFf60Tea/pagloDiKehe3EMnT4/reck7vLyA9266hhVL"
    );
  });
});

describe("resolveAlertClientRecords", () => {
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
          { id: "recA", fields: { CLIENTE: ["recCLI1"] } },
          { id: "recB", fields: {} },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await resolveAlertClientRecords(["recA", "recB"]);
    expect(first.get("recA")).toBe("recCLI1");
    expect(first.has("recB")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("ALERTAS");
    expect(calledUrl).toContain("CLIENTE");

    const second = await resolveAlertClientRecords(["recA"]);
    expect(second.get("recA")).toBe("recCLI1");
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
          records: [{ id: "recZ", fields: { CLIENTE: ["recCLIZ"] } }],
        }),
      }))
    );
    const [withCli, without] = await withClientRecordIds([
      alert({ airtableRecordId: "recZ" }),
      alert({ id: "2" }),
    ]);
    expect(withCli?.clienteRecordId).toBe("recCLIZ");
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
