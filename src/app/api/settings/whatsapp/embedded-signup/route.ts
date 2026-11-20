import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { connectionsGate } from "@/server/settings/access";
import {
  getCredentialsByOrg,
  getCredentialsByPhoneNumberId,
  getCredentialsByWabaId,
  saveCredentials,
} from "@/server/whatsapp/credentials";
import {
  ensureSubscribed,
  exchangeCodeForToken,
  isEmbeddedSignupConfigured,
  maskId,
  readPhoneInfo,
  registerNumber,
  requestInitialSync,
  resolveAssets,
  type OnboardingFailureCode,
} from "@/server/whatsapp/embedded-signup";
import { logOnboarding } from "@/server/whatsapp/onboarding-log";

export const dynamic = "force-dynamic";

/**
 * 050 — Alta del canal por Embedded Signup (coexistencia incluida).
 *
 * El navegador aporta el `code` y, si los tiene, los ids que mostró el diálogo.
 * Nada de eso se cree: el token se canjea acá, y con ESE token se comprueba que
 * el número pertenezca a la WABA. Un `token` en el body se rechaza — sería una
 * forma de inyectar credenciales ajenas.
 */

const bodySchema = z
  .object({
    code: z.string().trim().min(8),
    wabaId: z.string().trim().min(1).optional(),
    phoneNumberId: z.string().trim().min(1).optional(),
  })
  .strict();

/** 409/422/424/503 según el motivo; nunca un 500 genérico. */
function statusFor(code: OnboardingFailureCode): number {
  switch (code) {
    case "not_configured":
      return 503;
    case "code_invalid":
    case "ids_mismatch":
    case "no_number":
    case "ambiguous_number":
      return 422;
    case "subscription_failed":
    case "register_failed":
    case "sync_failed":
      return 424;
    case "meta_unavailable":
      return 503;
    default:
      return 502;
  }
}

export const POST = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const organizationId = session.organizationId;

  if (!isEmbeddedSignupConfigured()) {
    return apiError(
      503,
      "not_configured",
      "Esta instancia no tiene el alta automática configurada. Usá el asistente manual."
    );
  }

  // 1) Canje del código: único punto donde se ve el token.
  const exchanged = await exchangeCodeForToken(body.data.code);
  if (!exchanged.ok) {
    await logOnboarding({
      organizationId,
      event: "exchange",
      result: "failed",
      errorCode: exchanged.metaCode ?? null,
    });
    return apiError(statusFor(exchanged.code), exchanged.code, exchanged.message);
  }
  const token = exchanged.value.token;
  await logOnboarding({ organizationId, event: "exchange", result: "ok" });

  // 2) ¿A qué cuenta pertenece el número? Lo dice Meta, no el navegador.
  const assets = await resolveAssets({
    token,
    wabaIdHint: body.data.wabaId,
    phoneNumberIdHint: body.data.phoneNumberId,
  });
  if (!assets.ok) {
    await logOnboarding({
      organizationId,
      event: "verify",
      result: "failed",
      errorCode: assets.metaCode ?? null,
    });
    return apiError(statusFor(assets.code), assets.code, assets.message);
  }
  const { wabaId, phoneNumberId } = assets.value;

  // 3) Modo real (los campos viven en el número, no en la WABA).
  const info = await readPhoneInfo(phoneNumberId, token);
  if (!info.ok) {
    await logOnboarding({
      organizationId,
      event: "verify",
      result: "failed",
      errorCode: info.metaCode ?? null,
      wabaMasked: maskId(wabaId),
      phoneMasked: maskId(phoneNumberId),
    });
    return apiError(statusFor(info.code), info.code, info.message);
  }
  const phone = info.value;

  // 4) Aislamiento: el número o la WABA no pueden pertenecer a otra organización.
  const takenByPhone = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (takenByPhone && takenByPhone.organizationId !== organizationId) {
    await logOnboarding({
      organizationId,
      event: "verify",
      result: "failed",
      wabaMasked: maskId(wabaId),
      phoneMasked: maskId(phoneNumberId),
    });
    return apiError(
      409,
      "phone_taken",
      "Ese número ya está conectado en otra organización de esta instancia. Pedí la baja a quien lo tenga antes de reconectarlo."
    );
  }
  const takenByWaba = await getCredentialsByWabaId(wabaId);
  if (takenByWaba && takenByWaba.organizationId !== organizationId) {
    return apiError(
      409,
      "waba_taken",
      "Esa cuenta de WhatsApp Business ya está conectada en otra organización de esta instancia."
    );
  }

  // 5) Alta estándar: registrar. Coexistencia: NUNCA (el número ya está registrado).
  let registered = false;
  if (phone.mode === "standard") {
    const reg = await registerNumber(phoneNumberId, token);
    if (!reg.ok) {
      await logOnboarding({
        organizationId,
        event: "verify",
        result: "failed",
        errorCode: reg.metaCode ?? null,
        wabaMasked: maskId(wabaId),
        phoneMasked: maskId(phoneNumberId),
        registered: false,
      });
      return apiError(statusFor(reg.code), reg.code, reg.message);
    }
    registered = true;
  }

  // 6) Suscripción confirmada ANTES de pedir el sync (que es de una sola vez).
  const subscribed = await ensureSubscribed(wabaId, token);
  if (!subscribed.ok) {
    await logOnboarding({
      organizationId,
      event: "subscribe",
      result: "failed",
      errorCode: subscribed.metaCode ?? null,
      wabaMasked: maskId(wabaId),
      phoneMasked: maskId(phoneNumberId),
      registered,
    });
    return apiError(statusFor(subscribed.code), subscribed.code, subscribed.message);
  }
  await logOnboarding({
    organizationId,
    event: "subscribe",
    result: "ok",
    wabaMasked: maskId(wabaId),
    phoneMasked: maskId(phoneNumberId),
    registered,
  });

  // 7) Guardar (cifra el token). Idempotente por organización.
  await saveCredentials({
    organizationId,
    wabaId,
    phoneNumberId,
    token,
    displayPhoneNumber: phone.displayPhoneNumber,
    verifiedName: phone.verifiedName,
    mode: phone.mode === "coexistence" ? "coexistence" : "manual",
  });

  // 8) Sync inicial: solo si esta conexión es nueva (es irreversible).
  const alreadyConnected = await getCredentialsByOrg(organizationId);
  const skipSync = Boolean(takenByPhone && takenByPhone.phoneNumberId === phoneNumberId);
  if (skipSync) {
    await logOnboarding({
      organizationId,
      event: "sync",
      result: "skipped",
      wabaMasked: maskId(wabaId),
      phoneMasked: maskId(phoneNumberId),
    });
  } else {
    for (const syncType of ["smb_app_state_sync", "history"] as const) {
      const sync = await requestInitialSync(phoneNumberId, token, syncType);
      await logOnboarding({
        organizationId,
        event: "sync",
        result: sync.ok ? (sync.value.declined ? "declined" : "ok") : "failed",
        errorCode: sync.ok ? null : (sync.metaCode ?? null),
        wabaMasked: maskId(wabaId),
        phoneMasked: maskId(phoneNumberId),
        syncType,
        requestId: sync.ok ? sync.value.requestId : null,
      });
      // Un sync fallido no invalida el alta: el canal ya funciona y el
      // historial queda registrado como no solicitado.
    }
  }

  return Response.json({
    ok: true,
    mode: phone.mode,
    displayPhoneNumber: phone.displayPhoneNumber,
    status: "connected",
    operational: Boolean(alreadyConnected?.operationalAt),
  });
});
