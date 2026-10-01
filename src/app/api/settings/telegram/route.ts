import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { TelegramApiError, deleteWebhook, getMe, setWebhook, type TelegramMe } from "@/lib/telegram/client";
import { connectionsGate } from "@/server/settings/access";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import {
  clearTelegramCredentials,
  getTelegramCredentialsByOrg,
  saveTelegramCredentials,
  tokenLast4,
} from "@/server/telegram/credentials";

export const dynamic = "force-dynamic";

/** 021 — Estado de la conexión de Telegram (el token nunca sale entero). */
export const GET = withAuth(async (session) => {
  const gate = connectionsGate(session);
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
 * 046 — Propietario o dueño (admin): las conexiones sumaron al dueño por
 * pedido de Diego (30Sep): «activemos el rol dueño para que pueda entrar
 * solamente a whatsapp, telegram y también para conectar una IA».
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  const gate = connectionsGate(session);
  if (gate) return gate;
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

/**
 * 047 — Desconectar el bot (Ajustes → Telegram): apaga el webhook en Telegram
 * (best-effort) y borra la conexión local. La UI vuelve al formulario de
 * conexión; para reconectar se pega el token de BotFather otra vez.
 */
export const DELETE = withAuth(async (session) => {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();
  const gate = connectionsGate(session);
  if (gate) return gate;
  let creds: Awaited<ReturnType<typeof getTelegramCredentialsByOrg>> = null;
  try {
    creds = await getTelegramCredentialsByOrg(session.organizationId);
  } catch (err) {
    // Token ilegible (cifrado roto): se desconecta igual — el objetivo es
    // dejar la organización sin conexión.
    console.warn(
      "[telegram] credenciales ilegibles; se desconecta igual:",
      err instanceof Error ? err.message : err
    );
  }
  if (creds) {
    try {
      await deleteWebhook(creds.token);
    } catch (err) {
      console.warn(
        "[telegram] deleteWebhook falló (se desconecta igual):",
        err instanceof Error ? err.message : err
      );
    }
    await clearTelegramCredentials(session.organizationId);
  }
  return Response.json({ ok: true });
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
