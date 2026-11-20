import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { connectionsGate } from "@/server/settings/access";
import { isEmbeddedSignupConfigured } from "@/server/whatsapp/embedded-signup";
import {
  clearCredentials,
  getCredentialsByOrg,
  saveCredentials,
  tokenLast4,
} from "@/server/whatsapp/credentials";
import { subscribeAppToWaba, testConnection } from "@/server/whatsapp/connect";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const env = getEnv();
  const creds = await getCredentialsByOrg(session.organizationId);
  /**
   * 050 — Datos públicos del alta automática (app id y configuración de
   * Facebook Login for Business). No son secretos: van embebidos en el
   * navegador por diseño de Meta. El App Secret nunca sale del servidor.
   */
  const embeddedSignup = isEmbeddedSignupConfigured()
    ? { enabled: true, appId: env.META_APP_ID ?? null, configId: env.META_ES_CONFIG_ID ?? null }
    : { enabled: false, appId: null, configId: null };

  if (!creds) return Response.json({ connection: null, embeddedSignup });
  return Response.json({
    connection: {
      wabaId: creds.wabaId,
      phoneNumberId: creds.phoneNumberId,
      displayPhoneNumber: creds.displayPhoneNumber,
      verifiedName: creds.verifiedName,
      status: creds.status,
      /** 050 — manual | coexistence. */
      mode: creds.mode,
      /** 050 — primer evento real recibido; null = vinculada sin tráfico probado. */
      operationalAt: creds.operationalAt ? creds.operationalAt.toISOString() : null,
      tokenLast4: tokenLast4(creds.token),
    },
    embeddedSignup,
  });
});

const putSchema = z.object({
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Guarda la conexión: re-valida contra Meta, cifra y suscribe (FR-040). */
export const PUT = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const check = await testConnection(body.data.phoneNumberId, body.data.token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  await saveCredentials({
    organizationId: session.organizationId,
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });

  // Best-effort: necesaria en modo directo; el modo agencia usa su override.
  await subscribeAppToWaba(body.data.wabaId, body.data.token);

  return Response.json({
    ok: true,
    displayPhoneNumber: check.displayPhoneNumber,
  });
});

/**
 * 047 — Desconectar el número (Ajustes → WhatsApp): borra las credenciales de
 * la organización; el webhook deja de enrutar mensajes de ese número. Para
 * reconectar se vuelve a pasar por el asistente. No se des-suscribe la app en
 * Meta: la reconexión re-suscribe sola y sin conexión local los eventos
 * entrantes se ignoran.
 */
export const DELETE = withAuth(async (session) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  await clearCredentials(session.organizationId);
  return Response.json({ ok: true });
});
