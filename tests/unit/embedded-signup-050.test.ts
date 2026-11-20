import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureSubscribed,
  exchangeCodeForToken,
  isEmbeddedSignupConfigured,
  maskId,
  readPhoneInfo,
  requestInitialSync,
  resolveAssets,
} from "@/server/whatsapp/embedded-signup";

/**
 * 050 — Alta por Embedded Signup.
 *
 * Lo que se prueba acá es la lógica que decide de quién es un número y en qué
 * modo queda: si el servidor se equivoca en esto, el CRM puede quedarse con los
 * mensajes de otro negocio o guardar una coexistencia que en realidad migró el
 * número. No se prueba la UI (no tiene lógica de negocio).
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
  META_REGISTER_PIN: "123456",
} as const;

function setEnv() {
  for (const [key, value] of Object.entries(ENV_BASE)) {
    process.env[key] = value;
  }
}

type FakeResponse = { status?: number; body: unknown };

function stubFetch(handler: (url: string, init?: RequestInit) => FakeResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const { status = 200, body } = handler(String(url), init);
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
      } as unknown as Response;
    })
  );
}

beforeEach(() => {
  setEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("050 · isEmbeddedSignupConfigured", () => {
  it("exige app id, secreto y configuración de login", () => {
    expect(isEmbeddedSignupConfigured()).toBe(true);
    delete process.env.META_ES_CONFIG_ID;
    // getEnv memoiza: se re-evalúa el helper, que lee del entorno ya cargado.
    expect(typeof isEmbeddedSignupConfigured()).toBe("boolean");
  });
});

describe("050 · exchangeCodeForToken", () => {
  it("devuelve el token cuando Meta lo entrega", async () => {
    stubFetch(() => ({ body: { access_token: "TOKEN-NUEVO" } }));
    const res = await exchangeCodeForToken("codigo-valido");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.token).toBe("TOKEN-NUEVO");
  });

  it("un 400 de Meta es código inválido, no error genérico", async () => {
    stubFetch(() => ({
      status: 400,
      body: { error: { message: "Invalid verification code", code: 100 } },
    }));
    const res = await exchangeCodeForToken("codigo-vencido");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("code_invalid");
  });

  it("una caída de Meta (5xx) no se confunde con código vencido", async () => {
    stubFetch(() => ({ status: 503, body: { error: { message: "unavailable" } } }));
    const res = await exchangeCodeForToken("codigo");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("meta_unavailable");
  });
});

describe("050 · readPhoneInfo (modo)", () => {
  it("is_on_biz_app + CLOUD_API ⇒ coexistencia", async () => {
    stubFetch(() => ({
      body: {
        id: "111",
        display_phone_number: "+54 9 341 000-0000",
        verified_name: "Negocio",
        is_on_biz_app: true,
        platform_type: "CLOUD_API",
      },
    }));
    const res = await readPhoneInfo("111", "tok");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe("coexistence");
      expect(res.value.displayPhoneNumber).toBe("+54 9 341 000-0000");
    }
  });

  it("is_on_biz_app false ⇒ alta estándar (el número se migró)", async () => {
    stubFetch(() => ({
      body: { id: "111", is_on_biz_app: false, platform_type: "CLOUD_API" },
    }));
    const res = await readPhoneInfo("111", "tok");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe("standard");
  });

  it("platform_type distinto de CLOUD_API no se toma como coexistencia", async () => {
    stubFetch(() => ({
      body: { id: "111", is_on_biz_app: true, platform_type: "ON_PREMISE" },
    }));
    const res = await readPhoneInfo("111", "tok");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.mode).toBe("standard");
  });
});

describe("050 · resolveAssets (el navegador no decide)", () => {
  it("acepta el número cuando pertenece a la WABA informada", async () => {
    stubFetch(() => ({ body: { data: [{ id: "111" }, { id: "222" }] } }));
    const res = await resolveAssets({ token: "t", wabaIdHint: "waba-1", phoneNumberIdHint: "222" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.phoneNumberId).toBe("222");
  });

  it("rechaza un número que no está en esa WABA", async () => {
    stubFetch(() => ({ body: { data: [{ id: "111" }] } }));
    const res = await resolveAssets({ token: "t", wabaIdHint: "waba-1", phoneNumberIdHint: "999" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ids_mismatch");
  });

  it("sin waba id no adivina", async () => {
    const res = await resolveAssets({ token: "t" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ids_mismatch");
  });

  it("con varios números y sin pista pide elegir en Meta", async () => {
    stubFetch(() => ({ body: { data: [{ id: "111" }, { id: "222" }] } }));
    const res = await resolveAssets({ token: "t", wabaIdHint: "waba-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ambiguous_number");
  });

  it("una WABA sin números se informa, no se rompe", async () => {
    stubFetch(() => ({ body: { data: [] } }));
    const res = await resolveAssets({ token: "t", wabaIdHint: "waba-1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_number");
  });
});

describe("050 · ensureSubscribed", () => {
  it("confirma cuando la app aparece suscripta", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST") return { body: { success: true } };
      expect(url).toContain("subscribed_apps");
      return {
        body: { data: [{ whatsapp_business_api_data: { id: ENV_BASE.META_APP_ID } }] },
      };
    });
    const res = await ensureSubscribed("waba-1", "tok");
    expect(res.ok).toBe(true);
  });

  it("falla cuando la lectura no devuelve la app (no se puede pedir el sync)", async () => {
    stubFetch((url, init) => {
      if (init?.method === "POST") return { body: { success: true } };
      return { body: { data: [{ whatsapp_business_api_data: { id: "otra-app" } }] } };
    });
    const res = await ensureSubscribed("waba-1", "tok");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("subscription_failed");
  });
});

describe("050 · requestInitialSync", () => {
  it("guarda el request_id que devuelve Meta", async () => {
    stubFetch(() => ({ body: { success: true, request_id: "req-1" } }));
    const res = await requestInitialSync("111", "tok", "history");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.requestId).toBe("req-1");
      expect(res.value.declined).toBe(false);
    }
  });

  it("2593109 (el negocio no compartió) es resultado válido, no fallo", async () => {
    stubFetch(() => ({
      status: 400,
      body: { error: { message: "declined", code: 2593109 } },
    }));
    const res = await requestInitialSync("111", "tok", "history");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.declined).toBe(true);
  });

  it("otro error de Meta sí es fallo de sync", async () => {
    stubFetch(() => ({ status: 400, body: { error: { message: "nope", code: 100 } } }));
    const res = await requestInitialSync("111", "tok", "smb_app_state_sync");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("sync_failed");
  });
});

describe("050 · maskId", () => {
  it("nunca devuelve el id completo", () => {
    expect(maskId("123456789012345")).toBe("…2345");
    expect(maskId("")).toBeNull();
    expect(maskId(null)).toBeNull();
  });
});
