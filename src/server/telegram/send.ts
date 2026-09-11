import {
  sendLocationMessage,
  sendMediaMessage,
  sendMessageText,
  type OutboundTelegramMedia,
} from "@/lib/telegram/client";
import type { TelegramCredentials } from "@/server/telegram/credentials";

/**
 * 021 — Envío por el canal de Telegram.
 *
 * Traduce los fallos al mismo vocabulario de SendError que ya usan WhatsApp,
 * Instagram y Messenger, para que la bandeja no tenga que aprender un idioma
 * por plataforma. La traducción de errores vive en la capa de despacho
 * (`server/inbox/send.ts`), igual que con los demás canales.
 */

export async function sendTelegramText(input: {
  credentials: TelegramCredentials;
  chatId: string;
  text: string;
}): Promise<{ platformMessageId: string }> {
  const platformMessageId = await sendMessageText(
    input.credentials.token,
    input.chatId,
    input.text
  );
  return { platformMessageId };
}

export async function sendTelegramMedia(input: {
  credentials: TelegramCredentials;
  chatId: string;
  kind: OutboundTelegramMedia;
  data: Buffer | Uint8Array;
  mimeType: string;
  fileName?: string;
  caption?: string;
}): Promise<{ platformMessageId: string }> {
  const platformMessageId = await sendMediaMessage(
    input.credentials.token,
    input.chatId,
    input.kind,
    {
      data: input.data,
      mimeType: input.mimeType,
      fileName: input.fileName,
      caption: input.caption,
    }
  );
  return { platformMessageId };
}

export async function sendTelegramLocation(input: {
  credentials: TelegramCredentials;
  chatId: string;
  latitude: number;
  longitude: number;
}): Promise<{ platformMessageId: string }> {
  const platformMessageId = await sendLocationMessage(
    input.credentials.token,
    input.chatId,
    { latitude: input.latitude, longitude: input.longitude }
  );
  return { platformMessageId };
}
