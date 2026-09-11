import { after } from "next/server";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import { getTelegramCredentialsByWebhookSecret } from "@/server/telegram/credentials";
import { processTelegramUpdate } from "@/server/telegram/ingest";

/**
 * 021 — Webhook público del canal de Telegram.
 *
 * Telegram entrega acá los updates del bot. La URL la elige ESTA aplicación
 * (`setWebhook` se llama al conectar), así que las dos capas de seguridad son
 * nuestras y viajan en la misma conexión:
 *
 *   1. el segmento `[webhookToken]` es el secreto de la conexión (random de
 *      la instancia) y enruta a la organización — uno desconocido es 404;
 *   2. Telegram repite ese mismo secreto en el header
 *      `X-Telegram-Bot-Api-Secret-Token` de cada entrega — sin coincidencia,
 *      401 y no se procesa nada.
 *
 * La respuesta es 200 `{ok:true}` inmediato: el procesamiento corre en
 * segundo plano (`after`) para que un reintento de Telegram no duplique
 * trabajo sobre un webhook lento.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!isChannelEnabled("telegram")) return channelDisabledResponse();

  const { webhookToken } = await params;
  // El secreto siempre es hex de 24 bytes (48 chars); cualquier otra forma no
  // puede corresponder a una conexión y muere temprano.
  if (!/^[a-f0-9]{32,64}$/.test(webhookToken)) {
    return new Response(null, { status: 404 });
  }

  const credentials = await getTelegramCredentialsByWebhookSecret(webhookToken);
  if (!credentials) return new Response(null, { status: 404 });

  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!headerSecret || headerSecret !== credentials.webhookSecret) {
    return new Response(null, { status: 401 });
  }

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Cuerpo ilegible: 200 igualmente para que Telegram no reintente en vano.
    return Response.json({ ok: true });
  }

  after(async () => {
    try {
      const updates = Array.isArray(payload) ? payload : [payload];
      for (const update of updates) {
        await processTelegramUpdate(update, credentials);
      }
    } catch (err) {
      console.error("[telegram] error procesando update:", err);
    }
  });

  return Response.json({ ok: true });
}
