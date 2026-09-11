import { ingestInboundMessage, type MediaInput } from "@/server/inbox/ingest";
import { TG_PREFIX } from "@/server/inbox/identity";
import type { TelegramCredentials } from "@/server/telegram/credentials";

/**
 * 021 — Ingesta de updates de la Bot API de Telegram.
 *
 * Traduce un update crudo a la identidad y al mensaje del CRM y delega en el
 * motor común (`ingestInboundMessage`): dedup por id de plataforma, contacto
 * por `tg:<chat id>`, SSE en vivo, no-leídos y turno del agente interno —
 * exactamente el mismo trato que un mensaje de WhatsApp.
 *
 * Tolerante por diseño: cualquier update que no sea un mensaje (ediciones,
 * reacciones, cambios de miembro) se ignora sin error y jamás tumba el
 * webhook.
 */

type TelegramChat = {
  id?: number;
  type?: string;
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramFileRef = {
  file_id?: string;
  file_size?: number;
  mime_type?: string;
  file_name?: string;
  is_animated?: boolean;
};

type TelegramInboundMessage = {
  message_id?: number;
  date?: number;
  chat?: TelegramChat;
  from?: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramFileRef[];
  document?: TelegramFileRef;
  voice?: TelegramFileRef;
  audio?: TelegramFileRef;
  video?: TelegramFileRef;
  sticker?: TelegramFileRef;
  location?: { latitude?: number; longitude?: number };
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramInboundMessage;
};

type ParsedContent = {
  type: string;
  text: string | null;
  media: MediaInput | null;
};

/** Nombre visible: título del grupo, o nombre/apodo de quien escribe. */
function profileName(msg: TelegramInboundMessage): string | null {
  const chat = msg.chat ?? {};
  if (chat.type !== "private" && chat.title?.trim()) return chat.title.trim();
  const from = msg.from ?? {};
  const full = [from.first_name, from.last_name]
    .filter((part) => part && part.trim())
    .join(" ")
    .trim();
  if (full) return full;
  if (from.username?.trim()) return `@${from.username.trim()}`;
  return null;
}

/**
 * Contenido del mensaje → tipo/texto/adjunto del CRM. Foto, documento, voz,
 * audio, video, sticker y ubicación — el mismo repertorio que WhatsApp.
 * Devuelve null para lo que no se ingiere (polls, memberships, etc.).
 */
function parseContent(msg: TelegramInboundMessage): ParsedContent | null {
  if (typeof msg.text === "string" && msg.text.length > 0) {
    return { type: "text", text: msg.text, media: null };
  }

  const caption =
    typeof msg.caption === "string" && msg.caption.trim()
      ? msg.caption.trim()
      : null;

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    // Telegram ordena los tamaños de menor a mayor: el último es el más grande.
    const largest = msg.photo[msg.photo.length - 1];
    if (largest?.file_id) {
      return {
        type: "image",
        text: null,
        media: {
          kind: "image",
          waMediaId: largest.file_id,
          mimeType: "image/jpeg",
          fileName: null,
          caption,
          payload: null,
          fetchStatus: "pending",
        },
      };
    }
  }

  if (msg.document?.file_id) {
    return {
      type: "document",
      text: null,
      media: {
        kind: "document",
        waMediaId: msg.document.file_id,
        mimeType: msg.document.mime_type ?? "application/octet-stream",
        fileName: msg.document.file_name ?? null,
        caption,
        payload: null,
        fetchStatus: "pending",
      },
    };
  }

  if (msg.voice?.file_id) {
    return {
      type: "audio",
      text: null,
      media: {
        kind: "audio",
        waMediaId: msg.voice.file_id,
        mimeType: msg.voice.mime_type ?? "audio/ogg",
        fileName: "nota-de-voz.ogg",
        caption: null,
        payload: null,
        fetchStatus: "pending",
      },
    };
  }

  if (msg.audio?.file_id) {
    return {
      type: "audio",
      text: null,
      media: {
        kind: "audio",
        waMediaId: msg.audio.file_id,
        mimeType: msg.audio.mime_type ?? "audio/mpeg",
        fileName: msg.audio.file_name ?? null,
        caption: null,
        payload: null,
        fetchStatus: "pending",
      },
    };
  }

  if (msg.video?.file_id) {
    return {
      type: "video",
      text: null,
      media: {
        kind: "video",
        waMediaId: msg.video.file_id,
        mimeType: msg.video.mime_type ?? "video/mp4",
        fileName: msg.video.file_name ?? null,
        caption,
        payload: null,
        fetchStatus: "pending",
      },
    };
  }

  if (msg.sticker?.file_id) {
    return {
      type: "sticker",
      text: null,
      media: {
        kind: "sticker",
        waMediaId: msg.sticker.file_id,
        mimeType: msg.sticker.is_animated ? "video/webm" : "image/webp",
        fileName: null,
        caption: null,
        payload: null,
        fetchStatus: "pending",
      },
    };
  }

  const lat = msg.location?.latitude;
  const lon = msg.location?.longitude;
  if (typeof lat === "number" && typeof lon === "number") {
    return {
      type: "location",
      text: null,
      media: {
        kind: "location",
        waMediaId: null,
        mimeType: null,
        fileName: null,
        caption: null,
        payload: { latitude: lat, longitude: lon },
        fetchStatus: "available",
      },
    };
  }

  return null;
}

/**
 * Procesa UN update ya autenticado (el webhook resolvió la conexión por el
 * secreto). Devuelve true si era un mensaje ingerible.
 */
export async function processTelegramUpdate(
  update: unknown,
  credentials: TelegramCredentials
): Promise<boolean> {
  const u = update as TelegramUpdate;
  const msg = u?.message;
  const chatId = msg?.chat?.id;
  if (!msg || typeof chatId !== "number" || typeof msg.message_id !== "number") {
    return false;
  }

  const parsed = parseContent(msg);
  if (!parsed) return false;

  await ingestInboundMessage({
    organizationId: credentials.organizationId,
    identity: {
      identity: `${TG_PREFIX}${chatId}`,
      channel: "telegram",
      phone: null,
      waUserId: null,
      profileName: profileName(msg),
    },
    // Dedup estable por mensaje de la plataforma (mismo update re-entregado
    // no duplica efectos).
    waMessageId: `tg:${chatId}:${msg.message_id}`,
    type: parsed.type,
    text: parsed.text,
    timestamp: msg.date ? String(msg.date) : "",
    media: parsed.media,
  });
  return true;
}
