import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { TelegramApiError, getMe, setWebhook, type TelegramMe } from "@/lib/telegram/client";
import { customizationGate } from "@/server/settings/access";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import {
  getTelegramCredentialsByOrg,
  saveTelegramCredentials,
  tokenLast4,
} from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";

/** 021 — Estado de la conexión de Telegram (el token nunca sale entero). */
export const GET = withAuth(async (session) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  const creds = await getTelegramCredentialsByOrg(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      botId: creds.botId,
      botUsername: creds.botUsername,
      status: creds.status,
      tokenLast4: tokenLast4(creds.token),
      webhookUrl: webhookUrlFor(creds.webhookSecret),
    },
  });
});

const putSchema = z.object({
  // Formato de BotFather: `123456789:AAF…` (largo variable, ~46 chars).
  token: z.string().trim().min(10).max(200),
});

/**
 * Conecta el bot validando ANTES contra Telegram, igual que los demás
 * canales: un token que no sirve no llega a la base. Además del getMe, acá se
 * configura el webhook — es una llamada NUESTRA, así que el operador no pega
 * ninguna URL: entrega el token y el CRM le dice a Telegram dónde entregar.
 * Solo el propietario de la organización puede hacerlo.
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "FORBIDDEN", "Solo el propietario puede conectar el bot");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  let me: TelegramMe;
  try {
    me = await getMe(body.data.token);
  } catch (err) {
    return translateVerify(err);
  }

  // Secreto de la conexión: se genera una vez y sobrevive a reconexiones para
  // que la URL del webhook sea estable.
  const existing = await getTelegramCredentialsByOrg(session.organizationId);
  const secret = existing?.webhookSecret ?? randomBytes(24).toString("hex");
  const url = webhookUrlFor(secret);

  try {
    await setWebhook(body.data.token, { url, secretToken: secret });
  } catch (err) {
    if (err instanceof TelegramApiError) {
      if (err.status === 0) {
        return apiError(
          503,
          "platform_unavailable",
          "No se pudo contactar a Telegram; intenta de nuevo"
        );
      }
      return apiError(
        422,
        "webhook_failed",
        `Telegram rechazó el webhook: ${err.message}`
      );
    }
    throw err;
  }

  await saveTelegramCredentials({
    organizationId: session.organizationId,
    botId: String(me.id),
    botUsername: me.username ?? null,
    token: body.data.token,
    webhookSecret: secret,
  });

  return Response.json({
    ok: true,
    botUsername: me.username ?? null,
    webhookUrl: url,
  });
});

function webhookUrlFor(secret: string): string {
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/telegram/${secret}`;
}

function translateVerify(err: unknown): Response {
  if (err instanceof TelegramApiError) {
    if (err.isAuthError) {
      return apiError(
        422,
        "invalid_token",
        "El token del bot no es válido: copialo de nuevo desde @BotFather"
      );
    }
    if (err.status === 0) {
      return apiError(
        503,
        "platform_unavailable",
        "No se pudo contactar a Telegram; intenta de nuevo"
      );
    }
    return apiError(422, "invalid_token", err.message);
  }
  throw err;
}
