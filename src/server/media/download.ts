import type { schema } from "@/lib/db";
import type { Channel } from "@/lib/channels";
import { ensureAssetAvailable } from "@/server/whatsapp/media";
import { ensureTelegramAssetAvailable } from "@/server/telegram/media";

/**
 * 021 — Descarga on-demand de un adjunto, por el descargador de su canal.
 *
 * WhatsApp descarga por Graph; Telegram por la Bot API; los demás canales o
 * no tienen binario saliente o no lo soportan todavía — para ellos queda el
 * camino de WhatsApp, que devuelve null sin efectos cuando el asset no tiene
 * una referencia descargable.
 */
export async function ensureAssetDownload(
  channel: Channel | string | undefined,
  organizationId: string,
  assetId: string
): Promise<typeof schema.mediaAsset.$inferSelect | null> {
  if (channel === "telegram") {
    return ensureTelegramAssetAvailable(organizationId, assetId);
  }
  return ensureAssetAvailable(organizationId, assetId);
}
