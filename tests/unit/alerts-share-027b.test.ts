import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlertsBackendError,
  listShareTargets,
  shareAlert,
} from "@/server/alerts/service";

/**
 * 027b — Compartir alertas (espejo de la PWA): el CRM arma los destinatarios
 * (empleados del sistema + grupos propios del chat interno) y delega el share
 * al backend SGSA, que expande grupos a miembros y postea el aviso en el chat.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubEnv("SGSA_BACKEND_KEY", "test-key");
  vi.stubEnv("SGSA_BACKEND_URL", "https://backend.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shareAlert", () => {
  it("envía empleados, grupos y quién comparte; mapea la respuesta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        compartida_con: ["recA", "recB"],
        grupos: ["GRUPO X"],
        chat_grupos: [18],
        errores: [],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await shareAlert("123", {
      empleados: ["recA"],
      grupos: [18],
      empleadoRef: "recYo",
    });

    expect(res.compartidaCon).toEqual(["recA", "recB"]);
    expect(res.grupos).toEqual(["GRUPO X"]);
    expect(res.chatGrupos).toEqual([18]);
    expect(res.errores).toEqual([]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://backend.test/api/alerts/123/share");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      empleados: ["recA"],
      grupos: [18],
      empleado_que_comparte: "recYo",
    });
    const headers = init?.headers as Record<string, string>;
    expect(String(headers.Authorization)).toContain("test-key");
  });

  it("backend que rechaza (ok:false) → AlertsBackendError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ok: false, error: "Sin destinatarios válidos" })
      )
    );
    await expect(
      shareAlert("1", { empleados: [], grupos: [], empleadoRef: null })
    ).rejects.toBeInstanceOf(AlertsBackendError);
  });
});

describe("listShareTargets", () => {
  it("empleados: filtra sin airtable_id y a uno mismo, online primero; grupos: sin DMs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          employees: [
            { id: "a", airtable_id: "recA", nombre: "Zulema", online: false },
            { id: "b", airtable_id: "recB", nombre: "Ana", online: true },
            { id: "c", airtable_id: null, nombre: "Sin aire", online: true },
            { id: "d", airtable_id: "recYo", nombre: "Yo Mismo", online: true },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          groups: [
            { id: 5, nombre: "VENTAS" },
            { id: 9, nombre: "__dm__:a:b" },
            { id: 7, nombre: "ADMIN" },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await listShareTargets("recYo");
    expect(res.employees.map((e) => e.nombre)).toEqual(["Ana", "Zulema"]);
    expect(res.employees.map((e) => e.airtableId)).toEqual(["recB", "recA"]);
    expect(res.groups.map((g) => g.nombre)).toEqual(["ADMIN", "VENTAS"]);
    const groupsUrl = String(fetchMock.mock.calls[1]![0]);
    expect(groupsUrl).toBe(
      "https://backend.test/api/chat/groups?airtable_id=recYo"
    );
  });

  it("sin grupos del backend → lista vacía (no rompe)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: true, employees: [] }))
    );
    const res = await listShareTargets("recNadie");
    expect(res.employees).toEqual([]);
    expect(res.groups).toEqual([]);
  });
});
