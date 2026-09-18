import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 039 — Servicio de IA del dashboard: la generación corre en el CRM con la
 * conexión de IA de la organización (o la legacy por env), con caché y tope
 * diario. El proveedor va mockeado: acá se prueban las decisiones del
 * servicio, no el adaptador (ese ya tiene sus propios tests).
 */

const mocks = vi.hoisted(() => ({
  chatJson: vi.fn(),
  getOrgAiConfig: vi.fn(),
  isAiConfigured: vi.fn(),
  getEnv: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({ chatJson: mocks.chatJson }));
vi.mock("@/server/ai/config", () => ({
  getOrgAiConfig: mocks.getOrgAiConfig,
  getOrgAiSettingsView: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  isAiConfigured: mocks.isAiConfigured,
  getEnv: mocks.getEnv,
}));

const ORG_AI = {
  provider: "openrouter",
  dialect: "openai",
  baseUrl: "https://api.test/v1",
  apiKey: "clave-de-prueba",
  model: "modelo-test",
  judgeModel: null,
};

async function loadService() {
  vi.resetModules();
  return await import("@/server/dashboard-management/ai");
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.DASHBOARD_AI_DAILY_LIMIT;
  mocks.isAiConfigured.mockReturnValue(false);
  mocks.getEnv.mockReturnValue({});
  mocks.getOrgAiConfig.mockResolvedValue(null);
});

describe("generateModuleInsight", () => {
  it("sin conexión de IA devuelve 503 accionable (Ajustes → IA)", async () => {
    const svc = await loadService();

    const res = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { total: 10 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(503);
      expect(res.code).toBe("ai_not_configured");
      expect(res.message).toContain("Ajustes → IA");
    }
    expect(mocks.chatJson).not.toHaveBeenCalled();
  });

  it("genera con la config de la org, pasa modelo y cachea (force lo saltea)", async () => {
    mocks.getOrgAiConfig.mockResolvedValue(ORG_AI);
    mocks.chatJson.mockResolvedValue({
      ok: true,
      data: { resumen: "todo bien", focos: ["f1"], acciones: ["a1"], mensaje: "" },
      raw: "{}",
    });
    const svc = await loadService();

    const first = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { total: 10 },
    });

    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.insight.resumen).toBe("todo bien");
      expect(first.insight.model).toBe("modelo-test");
      expect(first.insight.cached).toBe(false);
    }
    expect(mocks.chatJson).toHaveBeenCalledTimes(1);
    expect(mocks.chatJson.mock.calls[0]![2]).toMatchObject({ model: "modelo-test" });

    const second = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { total: 10 },
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.insight.cached).toBe(true);
    }
    expect(mocks.chatJson).toHaveBeenCalledTimes(1);

    const forced = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { total: 10 },
      force: true,
    });
    expect(forced.ok).toBe(true);
    expect(mocks.chatJson).toHaveBeenCalledTimes(2);
  });

  it("el fallo del proveedor devuelve 502 con mensaje amable", async () => {
    mocks.getOrgAiConfig.mockResolvedValue(ORG_AI);
    mocks.chatJson.mockResolvedValue({
      ok: false,
      error: "provider_error",
      detail: "timeout del proveedor",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const svc = await loadService();

    const res = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { total: 1 },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(502);
      expect(res.code).toBe("ai_provider");
      expect(res.message).toContain("Probá de nuevo");
    }
    spy.mockRestore();
  });

  it("respeta el tope diario (DASHBOARD_AI_DAILY_LIMIT)", async () => {
    process.env.DASHBOARD_AI_DAILY_LIMIT = "1";
    mocks.getOrgAiConfig.mockResolvedValue(ORG_AI);
    mocks.chatJson.mockResolvedValue({
      ok: true,
      data: { resumen: "x", acciones: ["a"] },
      raw: "{}",
    });
    const svc = await loadService();

    const first = await svc.generateModuleInsight("org-1", {
      module: "pulso",
      mode: "dual",
      context: { a: 1 },
    });
    expect(first.ok).toBe(true);

    const second = await svc.generateModuleInsight("org-1", {
      module: "cartera",
      mode: "dual",
      context: { b: 2 },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(429);
      expect(second.code).toBe("ai_limit");
    }
  });
});

describe("generateClientInsight", () => {
  it("sin nombre en el contexto devuelve 400", async () => {
    const svc = await loadService();

    const res = await svc.generateClientInsight("org-1", {
      clientId: "c1",
      mode: "dual",
      context: {},
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
    }
  });

  it("genera y acepta variantes camelCase de la respuesta", async () => {
    mocks.getOrgAiConfig.mockResolvedValue(ORG_AI);
    mocks.chatJson.mockResolvedValue({
      ok: true,
      data: { accion: "Llamar", porQue: "Vence pronto", pasos: ["1"], mensajeWhatsapp: "Hola" },
      raw: "{}",
    });
    const svc = await loadService();

    const res = await svc.generateClientInsight("org-1", {
      clientId: "c1",
      mode: "dual",
      context: { name: "Ana" },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.insight.accion).toBe("Llamar");
      expect(res.insight.porQue).toBe("Vence pronto");
      expect(res.insight.mensajeWhatsapp).toBe("Hola");
    }
  });
});

describe("dashboardAiStatus", () => {
  it("reporta la conexión configurada de la organización", async () => {
    mocks.getOrgAiConfig.mockResolvedValue(ORG_AI);
    const svc = await loadService();

    const status = await svc.dashboardAiStatus("org-1");

    expect(status.configured).toBe(true);
    expect(status.source).toBe("org");
    expect(status.provider).toBe("openrouter");
    expect(status.model).toBe("modelo-test");
    expect(status.dailyLimit).toBe(300);
  });

  it("cae a la configuración legacy por env sin org", async () => {
    mocks.isAiConfigured.mockReturnValue(true);
    mocks.getEnv.mockReturnValue({ OPENROUTER_MODEL: "modelo-env" });
    const svc = await loadService();

    const status = await svc.dashboardAiStatus("org-1");

    expect(status.configured).toBe(true);
    expect(status.source).toBe("env");
    expect(status.model).toBe("modelo-env");
  });
});
