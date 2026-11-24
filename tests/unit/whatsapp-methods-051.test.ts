import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSET_CARDS,
  ASSET_NOTE,
  ASSISTANT_STEPS,
  COEXISTENCE_REQUIREMENTS,
  CONNECT_METHODS,
} from "@/components/settings/whatsapp-steps";

/**
 * 051 — Ayuda por paso dentro del asistente + elección del método de conexión.
 *
 * Lo que se prueba es lo que el cliente lee y decide: que cada paso tenga la
 * pantalla de Meta, qué copiar y el error típico; que «Asignar activos» nombre
 * los dos activos con su permiso; y que la coexistencia declare su requisito
 * real (Tech Provider) en vez de ofrecerse como si estuviera disponible.
 */

const ENV_BASE = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost/test",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-de-prueba",
  META_APP_ID: "aaaaaaaaaaaaaaa",
  META_APP_SECRET: "secreto-de-prueba",
  META_ES_CONFIG_ID: "999999999",
} as const;

function setEnv(extra: Record<string, string> = {}) {
  Object.assign(process.env, ENV_BASE, extra);
}

beforeEach(() => {
  setEnv();
  delete process.env.META_TECH_PROVIDER_APPROVED;
});

afterEach(() => {
  vi.resetModules();
});

describe("051 · ayuda dentro de cada paso", () => {
  it("los 7 pasos traen pantalla de Meta, al menos dos indicaciones y una advertencia", () => {
    for (const s of ASSISTANT_STEPS) {
      expect(s.help.where.length).toBeGreaterThan(8);
      expect(s.help.items.length).toBeGreaterThanOrEqual(2);
      for (const item of s.help.items) expect(item.length).toBeGreaterThan(10);
      expect(Boolean(s.help.copy || s.help.dont)).toBe(true);
    }
  });

  it("cada paso dice dónde se hace, sin mandar a otra pestaña", () => {
    const donde = ASSISTANT_STEPS.map((s) => s.help.where.toLowerCase());
    expect(donde[0]).toContain("configuración del negocio");
    expect(donde[1]).toContain("developers.facebook.com");
    expect(donde[2]).toContain("api setup");
    expect(donde[3]).toContain("agregar número");
    expect(donde[4]).toContain("usuarios del sistema");
    expect(donde[6]).toContain("webhook");
  });

  it("el paso 5 explicita «Asignar activos» y los dos activos con su permiso", () => {
    const paso5 = ASSISTANT_STEPS.find((s) => s.n === 5)!;
    expect(paso5.help.items.join(" ")).toContain("Asignar activos");
    expect(ASSET_CARDS.map((c) => c.title)).toEqual([
      "1. Apps",
      "2. Cuentas de WhatsApp",
    ]);
    for (const card of ASSET_CARDS) {
      expect(card.permission).toMatch(/acceso total/i);
      expect(card.text.length).toBeGreaterThan(20);
    }
    expect(ASSET_NOTE).toContain("Activos asignados");
  });

  it("avisa que el acceso es a dos activos y no a todo el negocio", () => {
    const paso5 = ASSISTANT_STEPS.find((s) => s.n === 5)!;
    expect(`${paso5.help.dont} ${ASSET_NOTE}`).toMatch(/no a todo el negocio/i);
  });
});

describe("051 · los dos métodos de conexión", () => {
  it("existen coexistencia y manual, cada uno con lo que gana y pierde", () => {
    expect(CONNECT_METHODS.map((m) => m.id)).toEqual([
      "coexistence",
      "manual",
    ]);
    for (const m of CONNECT_METHODS) {
      expect(m.keeps.length).toBeGreaterThan(0);
      expect(m.loses.length).toBeGreaterThan(0);
      expect(m.needs.length).toBeGreaterThan(20);
      expect(m.lead.length).toBeGreaterThan(30);
    }
  });

  it("la coexistencia declara que necesita la aprobación de Meta como proveedor", () => {
    const coex = CONNECT_METHODS.find((m) => m.id === "coexistence")!;
    expect(coex.needs).toMatch(/proveedor de tecnología/i);
    expect(COEXISTENCE_REQUIREMENTS.join(" ")).toMatch(/Tech Provider|proveedor de tecnología/i);
    expect(COEXISTENCE_REQUIREMENTS.join(" ")).toContain("2.24.17");
  });

  it("el camino manual dice que funciona hoy, sin aprobaciones", () => {
    const manual = CONNECT_METHODS.find((m) => m.id === "manual")!;
    expect(manual.needs).toMatch(/hoy/i);
  });
});

describe("051 · estado del Tech Provider", () => {
  it("sin bandera: no aprobado, QR no disponible y motivo visible", async () => {
    vi.resetModules();
    const { getTechProviderStatus } = await import(
      "@/server/whatsapp/embedded-signup"
    );
    const st = getTechProviderStatus();
    expect(st.approved).toBe(false);
    expect(st.embeddedSignupAvailable).toBe(false);
    expect(st.reason).toMatch(/proveedor de tecnología/i);
  });

  it("con META_TECH_PROVIDER_APPROVED=on y credenciales: QR disponible", async () => {
    setEnv({ META_TECH_PROVIDER_APPROVED: "on" });
    vi.resetModules();
    const { getTechProviderStatus } = await import(
      "@/server/whatsapp/embedded-signup"
    );
    const st = getTechProviderStatus();
    expect(st.approved).toBe(true);
    expect(st.embeddedSignupAvailable).toBe(true);
    expect(st.reason).toBeNull();
  });

  it("aprobado pero sin credenciales de Meta: no disponible y explica qué falta", async () => {
    setEnv({ META_TECH_PROVIDER_APPROVED: "true" });
    delete process.env.META_ES_CONFIG_ID;
    vi.resetModules();
    const { getTechProviderStatus } = await import(
      "@/server/whatsapp/embedded-signup"
    );
    const st = getTechProviderStatus();
    expect(st.approved).toBe(true);
    expect(st.embeddedSignupAvailable).toBe(false);
    expect(st.reason).toContain("META_ES_CONFIG_ID");
  });
});
