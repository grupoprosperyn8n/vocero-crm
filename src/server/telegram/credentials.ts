import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * 021 — Credenciales del canal de Telegram.
 *
 * Mismo contrato que las de WhatsApp, Instagram y Messenger: el token viaja
 * descifrado solo en memoria y nunca sale en una respuesta de la API — hacia
 * fuera se expone únicamente su cola. A diferencia de las otras plataformas,
 * el `webhookSecret` es obligatorio: con él Telegram firma cada entrega
 * (header) y además es el segmento de la URL que enruta el webhook.
 */

export type TelegramCredentials = {
  id: string;
  organizationId: string;
  /** ID numérico del bot (getMe), como texto. */
  botId: string;
  botUsername: string | null;
  webhookSecret: string;
  status: "connected" | "reconnect_required";
  token: string;
};

type Row = typeof schema.telegramCredentials.$inferSelect;

function toCredentials(row: Row): TelegramCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    botId: row.botId,
    botUsername: row.botUsername,
    webhookSecret: row.webhookSecret,
    status: row.status,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

export async function getTelegramCredentialsByOrg(
  organizationId: string
): Promise<TelegramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Enrutado del webhook: el segmento de la URL es el secreto de la conexión. */
export async function getTelegramCredentialsByWebhookSecret(
  webhookSecret: string
): Promise<TelegramCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.telegramCredentials)
    .where(eq(schema.telegramCredentials.webhookSecret, webhookSecret))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveTelegramCredentials(input: {
  organizationId: string;
  botId: string;
  botUsername: string | null;
  token: string;
  webhookSecret: string;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const existing = await getTelegramCredentialsByOrg(input.organizationId);

  const values = {
    organizationId: input.organizationId,
    botId: input.botId,
    botUsername: input.botUsername,
    tokenCipher: enc.cipher,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    webhookSecret: input.webhookSecret,
    status: "connected" as const,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.telegramCredentials)
      .set(values)
      .where(eq(schema.telegramCredentials.id, existing.id));
    return;
  }
  await db
    .insert(schema.telegramCredentials)
    .values({ id: newId("credentials"), ...values });
}

/** El token murió: se pausan los envíos y la UI pide reconectar. */
export async function markTelegramReconnectRequired(
  organizationId: string
): Promise<void> {
  await getDb()
    .update(schema.telegramCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.telegramCredentials.organizationId, organizationId));
}

export function tokenLast4(token: string): string {
  return token.slice(-4);
}
