import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { downloadFile, getFile } from "@/lib/telegram/client";
import { getTelegramCredentialsByOrg } from "@/server/telegram/credentials";
import { saveMediaFile } from "@/server/whatsapp/media";

/**
 * 021 — Media del canal de Telegram (entrante).
 *
 * Mismo ciclo de vida que los adjuntos de WhatsApp: el asset nace `pending`
 * con el `file_id` de la Bot API guardado, y la descarga (in-process tras la
 * ingesta, u on-demand desde la ruta de media) lo deja `available` en el
 * volumen local. A diferencia de Meta, Telegram no expira los archivos — pero
 * la copia local se hace igual para que la preview de la bandeja no dependa
 * de la red.
 */

/** La Bot API no entrega archivos mayores a 20 MB a bots. */
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export class TelegramMediaError extends Error {
  /** true cuando no tiene sentido reintentar (supera el límite de la API). */
  gone: boolean;
  constructor(message: string, gone = false) {
    super(message);
    this.name = "TelegramMediaError";
    this.gone = gone;
  }
}

/**
 * GET {file_id} → file_path → GET /file/bot… (la URL real de descarga).
 * El token JAMÁS sale del servidor.
 */
export async function downloadTelegramMedia(
  token: string,
  fileId: string,
  maxBytes: number = TELEGRAM_MAX_DOWNLOAD_BYTES
): Promise<{ data: Buffer; fileSize: number }> {
  const meta = await getFile(token, fileId);
  if (!meta.file_path) {
    throw new TelegramMediaError("Telegram no entregó la ruta del archivo");
  }
  if (meta.file_size && meta.file_size > maxBytes) {
    throw new TelegramMediaError(
      "El adjunto supera el límite de descarga de Telegram (20 MB)",
      true
    );
  }
  const data = await downloadFile(token, meta.file_path);
  if (data.byteLength > maxBytes) {
    throw new TelegramMediaError(
      "El adjunto supera el límite de descarga de Telegram (20 MB)",
      true
    );
  }
  return { data, fileSize: data.byteLength };
}

/**
 * Garantiza que el asset de Telegram esté en disco (`fetchStatus=available`).
 * Se usa en la descarga in-process post-ingesta Y on-demand desde la ruta de
 * media. Nunca lanza hacia el webhook: el que llama decide qué hacer con el
 * resultado. Devuelve el asset actualizado o null si no se pudo.
 */
export async function ensureTelegramAssetAvailable(
  organizationId: string,
  assetId: string
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.mediaAsset)
    .where(eq(schema.mediaAsset.id, assetId))
    .limit(1);
  const asset = rows[0];
  if (!asset || asset.organizationId !== organizationId) return null;
  if (asset.fetchStatus === "available") return asset;
  if (!asset.waMediaId) return null; // location/contacts no tienen binario

  const creds = await getTelegramCredentialsByOrg(organizationId);
  if (!creds) return null;

  try {
    const { data, fileSize } = await downloadTelegramMedia(
      creds.token,
      asset.waMediaId
    );
    const storagePath = await saveMediaFile(organizationId, assetId, data);
    const updated = await db
      .update(schema.mediaAsset)
      .set({
        storagePath,
        fileSize,
        fetchStatus: "available",
        fetchError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.mediaAsset.id, assetId))
      .returning();
    return updated[0] ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.mediaAsset)
      .set({ fetchStatus: "failed", fetchError: message, updatedAt: new Date() })
      .where(eq(schema.mediaAsset.id, assetId));
    console.warn(`[media] descarga de Telegram del asset ${assetId} falló: ${message}`);
    return null;
  }
}
