import { getEnv } from "@/lib/env";

/**
 * 021 — Cliente de la Bot API de Telegram.
 *
 * Única frontera con `api.telegram.org` (misma constitución que el cliente de
 * Meta): el token del bot jamás sale del servidor y los errores de la
 * plataforma se traducen a un error tipado que las capas de arriba mapean al
 * vocabulario que ya usa la bandeja (SendError).
 *
 * La base es configurable (`TELEGRAM_BASE_URL`) solo para poder apuntar a un
 * servidor de pruebas; en producción se usa la real.
 */

export class TelegramApiError extends Error {
  status: number;
  /**
   * Token inválido o revocado. En la Bot API un token inexistente responde
   * 401 (o 404 cuando la URL del bot no existe directamente): en ambos casos
   * el único camino es reconectar. Los 403 NO son de auth: significan que el
   * usuario bloqueó al bot.
   */
  isAuthError: boolean;

  constructor(message: string, opts: { status: number; isAuth?: boolean }) {
    super(message);
    this.name = "TelegramApiError";
    this.status = opts.status;
    this.isAuthError = opts.isAuth ?? (opts.status === 401 || opts.status === 404);
  }
}

function baseUrl(): string {
  return getEnv().TELEGRAM_BASE_URL.replace(/\/+$/, "");
}

type TelegramEnvelope<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

/** POST a un método del bot; parsea el sobre `{ok, result}` de Telegram. */
async function request<T>(
  token: string,
  method: string,
  init: { json?: unknown; form?: FormData }
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/bot${token}/${method}`, {
      method: "POST",
      ...(init.form
        ? { body: init.form }
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(init.json ?? {}),
          }),
    });
  } catch {
    throw new TelegramApiError("No se pudo contactar la API de Telegram", {
      status: 0,
      isAuth: false,
    });
  }

  const text = await res.text();
  let json: TelegramEnvelope<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as TelegramEnvelope<T>) : null;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.ok) {
    const status = json?.error_code ?? res.status;
    const description = json?.description ?? `Telegram respondió ${res.status}`;
    throw new TelegramApiError(description, { status });
  }
  return json.result as T;
}

export type TelegramMe = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramFile = {
  file_id: string;
  file_size?: number;
  file_path?: string;
};

type TelegramMessageRef = { message_id: number };

/** Identidad del bot — el "probar antes de guardar" del token. */
export async function getMe(token: string): Promise<TelegramMe> {
  return request<TelegramMe>(token, "getMe", { json: {} });
}

/**
 * Apunta el webhook del bot a nuestra URL. El `secret_token` viaja además
 * como segmento de la URL (las dos capas las elegimos nosotros) y Telegram lo
 * repite en el header de cada entrega. `drop_pending_updates` evita que un
 * bot reconectado re-entregue mensajes viejos encolados.
 */
export async function setWebhook(
  token: string,
  input: { url: string; secretToken: string }
): Promise<true> {
  return request<true>(token, "setWebhook", {
    json: {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    },
  });
}

/** Envía texto plano (sin parse_mode: lo que se escribe es lo que se ve). */
export async function sendMessageText(
  token: string,
  chatId: string,
  text: string
): Promise<string> {
  const res = await request<TelegramMessageRef>(token, "sendMessage", {
    json: { chat_id: chatId, text },
  });
  return String(res.message_id);
}

/** Envía una ubicación. */
export async function sendLocationMessage(
  token: string,
  chatId: string,
  location: { latitude: number; longitude: number }
): Promise<string> {
  const res = await request<TelegramMessageRef>(token, "sendLocation", {
    json: {
      chat_id: chatId,
      latitude: location.latitude,
      longitude: location.longitude,
    },
  });
  return String(res.message_id);
}

export type OutboundTelegramMedia = "image" | "audio" | "video" | "document";

/** Método y campo del multipart según el tipo de adjunto. */
const MEDIA_TARGET: Record<OutboundTelegramMedia, { method: string; field: string }> = {
  image: { method: "sendPhoto", field: "photo" },
  audio: { method: "sendAudio", field: "audio" },
  video: { method: "sendVideo", field: "video" },
  document: { method: "sendDocument", field: "document" },
};

/** Sube un archivo y lo envía (multipart directo, sin upload previo). */
export async function sendMediaMessage(
  token: string,
  chatId: string,
  kind: OutboundTelegramMedia,
  file: {
    data: Buffer | Uint8Array;
    mimeType: string;
    fileName?: string;
    caption?: string;
  }
): Promise<string> {
  const target = MEDIA_TARGET[kind];
  const form = new FormData();
  form.set("chat_id", chatId);
  const bytes = new Uint8Array(file.data);
  form.set(
    target.field,
    new Blob([bytes], { type: file.mimeType }),
    file.fileName ?? "adjunto"
  );
  // sendAudio no acepta caption; el resto sí.
  if (file.caption && kind !== "audio") form.set("caption", file.caption);

  const res = await request<TelegramMessageRef>(token, target.method, { form });
  return String(res.message_id);
}

/** Metadata de un archivo entrante (para descargarlo por /file/bot…). */
export async function getFile(token: string, fileId: string): Promise<TelegramFile> {
  return request<TelegramFile>(token, "getFile", { json: { file_id: fileId } });
}

/** Descarga el binario ya resuelto por `getFile`. */
export async function downloadFile(
  token: string,
  filePath: string
): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/file/bot${token}/${filePath}`);
  } catch {
    throw new TelegramApiError("No se pudo contactar la API de Telegram", {
      status: 0,
      isAuth: false,
    });
  }
  if (!res.ok) {
    throw new TelegramApiError(`La descarga devolvió ${res.status}`, {
      status: res.status,
    });
  }
  return Buffer.from(await res.arrayBuffer());
}
