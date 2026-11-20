import { graphRequest, graphRequestPublic, MetaApiError } from "@/lib/meta/client";
import { getEnv } from "@/lib/env";

/**
 * 050 — Alta del canal por Embedded Signup (coexistencia incluida).
 *
 * Esta es la única frontera del alta: canjea el `code` que devuelve el diálogo
 * de Meta, resuelve a qué WABA pertenece el número, decide si el alta es
 * coexistencia o estándar, asegura la suscripción de la app y dispara la
 * sincronización inicial — en ese orden, que no es negociable: `smb_app_data`
 * se puede pedir una sola vez en la vida del alta.
 *
 * Nunca recibe ni devuelve el token al navegador: el llamador lo cifra.
 */

export type OnboardingMode = "coexistence" | "standard";

export type OnboardingFailureCode =
  | "not_configured"
  | "code_invalid"
  | "ids_mismatch"
  | "no_number"
  | "ambiguous_number"
  | "subscription_failed"
  | "register_failed"
  | "sync_failed"
  | "meta_unavailable"
  | "meta_error";

export type OnboardingOk<T> = { ok: true; value: T };
export type OnboardingFail = {
  ok: false;
  code: OnboardingFailureCode;
  message: string;
  /** Código numérico de Meta, si vino de una respuesta suya. */
  metaCode?: number | null;
};
export type OnboardingResult<T> = OnboardingOk<T> | OnboardingFail;

/** true solo si la instancia puede ofrecer el alta automática. */
export function isEmbeddedSignupConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.META_APP_ID && env.META_APP_SECRET && env.META_ES_CONFIG_ID);
}

function fail(
  code: OnboardingFailureCode,
  message: string,
  metaCode?: number | null
): OnboardingFail {
  return { ok: false, code, message, metaCode: metaCode ?? null };
}

/** Traduce el error de Meta sin filtrar el mensaje crudo al cliente. */
function fromMetaError(err: unknown, fallback: OnboardingFailureCode): OnboardingFail {
  if (err instanceof MetaApiError) {
    if (err.status === 0 || err.status >= 500) {
      return fail("meta_unavailable", "Meta no está disponible en este momento; probá de nuevo en unos minutos.", err.code);
    }
    if (err.isAuthError || err.code === 190) {
      return fail("code_invalid", "El código de autorización venció o ya se usó. Reabrí el diálogo y volvé a autorizar.", err.code);
    }
    return fail(fallback, "Meta rechazó la operación. Revisá los permisos de la app y volvé a intentar.", err.code);
  }
  return fail(fallback, "Ocurrió un error inesperado hablando con Meta.");
}

/**
 * Canjea el `code` de Embedded Signup por un access token.
 * Las credenciales de la app viajan solo acá, del lado servidor.
 */
export async function exchangeCodeForToken(
  code: string
): Promise<OnboardingResult<{ token: string }>> {
  const env = getEnv();
  if (!isEmbeddedSignupConfigured()) {
    return fail(
      "not_configured",
      "Esta instancia no tiene el alta automática configurada (falta META_APP_ID, META_APP_SECRET o META_ES_CONFIG_ID)."
    );
  }
  const qs = new URLSearchParams({
    client_id: env.META_APP_ID as string,
    client_secret: env.META_APP_SECRET as string,
    code,
  });
  try {
    const res = await graphRequestPublic<{ access_token?: string }>(
      `oauth/access_token?${qs.toString()}`
    );
    if (!res.access_token) {
      return fail("code_invalid", "Meta no devolvió un token para ese código. Reabrí el diálogo y volvé a autorizar.");
    }
    return { ok: true, value: { token: res.access_token } };
  } catch (err) {
    return fromMetaError(err, "code_invalid");
  }
}

export type PhoneInfo = {
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  isOnBizApp: boolean;
  platformType: string | null;
  mode: OnboardingMode;
};

/**
 * Lee el número y decide el modo. `is_on_biz_app` y `platform_type` viven en el
 * PHONE NUMBER, no en la WABA: pedirlos a la WABA devuelve vacío y haría que
 * toda alta se guarde como estándar.
 */
export async function readPhoneInfo(
  phoneNumberId: string,
  token: string
): Promise<OnboardingResult<PhoneInfo>> {
  try {
    const res = await graphRequest<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
      is_on_biz_app?: boolean;
      platform_type?: string;
    }>(
      `${phoneNumberId}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
      { token }
    );
    const isOnBizApp = res.is_on_biz_app === true;
    const mode: OnboardingMode =
      isOnBizApp && res.platform_type === "CLOUD_API" ? "coexistence" : "standard";
    return {
      ok: true,
      value: {
        phoneNumberId: res.id,
        displayPhoneNumber: res.display_phone_number ?? null,
        verifiedName: res.verified_name ?? null,
        isOnBizApp,
        platformType: res.platform_type ?? null,
        mode,
      },
    };
  } catch (err) {
    return fromMetaError(err, "meta_error");
  }
}

/**
 * Comprueba que el número pertenezca a la WABA que dice el navegador.
 * El `wabaId` del cliente es una pista, no una verdad: manda lo que responde
 * Meta con el token recién canjeado.
 */
export async function resolveAssets(input: {
  token: string;
  phoneNumberIdHint?: string;
  wabaIdHint?: string;
}): Promise<OnboardingResult<{ wabaId: string; phoneNumberId: string }>> {
  const { token, phoneNumberIdHint, wabaIdHint } = input;
  if (!wabaIdHint) {
    return fail(
      "ids_mismatch",
      "Meta no informó la cuenta de WhatsApp Business del alta. Reabrí el diálogo y completá el flujo hasta el final."
    );
  }
  try {
    const res = await graphRequest<{
      data?: Array<{ id: string; display_phone_number?: string }>;
    }>(`${wabaIdHint}/phone_numbers?fields=id,display_phone_number`, { token });
    const numbers = res.data ?? [];
    if (numbers.length === 0) {
      return fail("no_number", "Esa cuenta de WhatsApp Business no tiene ningún número asociado.");
    }
    if (phoneNumberIdHint) {
      const match = numbers.find((n) => n.id === phoneNumberIdHint);
      if (!match) {
        return fail(
          "ids_mismatch",
          "El número que devolvió el diálogo no pertenece a esa cuenta de WhatsApp Business."
        );
      }
      return { ok: true, value: { wabaId: wabaIdHint, phoneNumberId: match.id } };
    }
    if (numbers.length > 1) {
      return fail(
        "ambiguous_number",
        "Esa cuenta tiene varios números: elegí uno en el diálogo de Meta y volvé a intentar."
      );
    }
    const only = numbers[0];
    if (!only) {
      return fail("no_number", "Esa cuenta de WhatsApp Business no tiene ningún número asociado.");
    }
    return { ok: true, value: { wabaId: wabaIdHint, phoneNumberId: only.id } };
  } catch (err) {
    return fromMetaError(err, "meta_error");
  }
}

/**
 * Suscribe la app a la WABA y CONFIRMA con una lectura: sin suscripción no
 * llegan los mensajes, y el sync inicial depende de que los webhooks lleguen.
 */
export async function ensureSubscribed(
  wabaId: string,
  token: string
): Promise<OnboardingResult<{ subscribed: true }>> {
  const env = getEnv();
  try {
    await graphRequest(`${wabaId}/subscribed_apps`, { method: "POST", token });
  } catch (err) {
    const mapped = fromMetaError(err, "subscription_failed");
    return { ...mapped, message: "No se pudo suscribir la app a la cuenta de WhatsApp Business." };
  }
  try {
    const res = await graphRequest<{
      data?: Array<{ whatsapp_business_api_data?: { id?: string } }>;
    }>(`${wabaId}/subscribed_apps`, { token });
    const apps = res.data ?? [];
    const mine = env.META_APP_ID
      ? apps.some((a) => a.whatsapp_business_api_data?.id === env.META_APP_ID)
      : apps.length > 0;
    if (!mine) {
      return fail(
        "subscription_failed",
        "La suscripción no quedó confirmada en Meta: sin eso no llegan los mensajes."
      );
    }
    return { ok: true, value: { subscribed: true } };
  } catch (err) {
    return fromMetaError(err, "subscription_failed");
  }
}

/**
 * Registro del número para el alta estándar. En coexistencia NO se llama: el
 * número ya está registrado y repetirlo rompe la cuenta.
 */
export async function registerNumber(
  phoneNumberId: string,
  token: string
): Promise<OnboardingResult<{ registered: true }>> {
  const env = getEnv();
  if (!env.META_REGISTER_PIN) {
    return fail(
      "register_failed",
      "Falta el PIN de registro de 6 dígitos (META_REGISTER_PIN) para conectar un número nuevo."
    );
  }
  try {
    await graphRequest(`${phoneNumberId}/register`, {
      method: "POST",
      token,
      body: { messaging_product: "whatsapp", pin: env.META_REGISTER_PIN },
    });
    return { ok: true, value: { registered: true } };
  } catch (err) {
    return fromMetaError(err, "register_failed");
  }
}

export type SyncType = "smb_app_state_sync" | "history";

/**
 * Pide la sincronización inicial (contactos o historial). Solo una vez por alta:
 * un reintento obliga a offboardear al cliente. El 2593109 (el negocio decidió
 * no compartir) es un resultado válido, no un fallo.
 */
export async function requestInitialSync(
  phoneNumberId: string,
  token: string,
  syncType: SyncType
): Promise<OnboardingResult<{ requestId: string | null; declined: boolean }>> {
  try {
    const res = await graphRequest<{ request_id?: string; success?: boolean }>(
      `${phoneNumberId}/smb_app_data`,
      { method: "POST", token, body: { messaging_product: "whatsapp", sync_type: syncType } }
    );
    return { ok: true, value: { requestId: res.request_id ?? null, declined: false } };
  } catch (err) {
    if (err instanceof MetaApiError && err.code === 2593109) {
      return { ok: true, value: { requestId: null, declined: true } };
    }
    return fromMetaError(err, "sync_failed");
  }
}

/** Enmascara un id para el log: últimos 4 caracteres. */
export function maskId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.length <= 4 ? id : `…${id.slice(-4)}`;
}
