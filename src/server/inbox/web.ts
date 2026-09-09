import { and, asc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  ingestInboundMessage,
  serializeMessage,
} from "@/server/inbox/ingest";
import { WEB_PREFIX, type ResolvedIdentity } from "@/server/inbox/identity";
import { resolveInstanceOrg } from "@/server/bot/auth";

/**
 * 1A — Canal Web (chat embebido del sitio del negocio).
 *
 * El widget NO habla con una plataforma de mensajería: habla con estos
 * endpoints. Una sesión opaca (`web:<sessionId>`, 24+ chars aleatorios) ES
 * la identidad del visitante — el token de la sesión nunca viaja en un
 * lugar público distinto del propio widget que lo generó, y sin él no hay
 * forma de leer ni escribir en esa conversación.
 *
 * El mensaje entrante entra por la MISMA ingesta que WhatsApp/Instagram
 * (server/inbox/ingest.ts): dedup por id, unread, eventos SSE de la bandeja
 * y disparo del agente si la conversación tiene la IA encendida. El canal
 * web no tiene plataforma externa, así que la "entrega" de un mensaje
 * saliente es persistir: el widget lo lee por polling (GET messages).
 */

/** Una sesión del widget: opaca, aleatoria, de 24 a 128 chars seguros. */
export const WEB_SESSION_RE = /^[A-Za-z0-9_-]{24,128}$/;

export function validWebSession(sessionId: string): boolean {
  return WEB_SESSION_RE.test(sessionId);
}

/** Idempotencia: el widget manda su propio id por mensaje (doble-click). */
export function webMessageId(sessionId: string, clientMessageId: string): string {
  return `${WEB_PREFIX}${sessionId}:${clientMessageId}`;
}

export type WebIngestInput = {
  organizationId: string;
  sessionId: string;
  text: string;
  /** Id del mensaje generado por el widget (idempotencia del reenvío). */
  clientMessageId?: string | null;
  /** Nombre que escribió el visitante, si el widget lo pidió. */
  profileName?: string | null;
};

/** Crea o actualiza la identidad web y deja el mensaje en la ingesta común. */
export async function ingestWebMessage(input: WebIngestInput): Promise<void> {
  const identity: ResolvedIdentity = {
    identity: `${WEB_PREFIX}${input.sessionId}`,
    channel: "web",
    phone: null,
    waUserId: null,
    profileName: input.profileName?.trim().slice(0, 80) || null,
  };
  await ingestInboundMessage({
    organizationId: input.organizationId,
    identity,
    waMessageId: input.clientMessageId
      ? webMessageId(input.sessionId, input.clientMessageId)
      : `${WEB_PREFIX}${newId("message")}`,
    type: "text",
    text: input.text,
    // La ingesta común espera epoch en SEGUNDOS (contrato de los webhooks
    // de Meta: toDate() multiplica por 1000). Date.now() solo daría ms.
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
}

export type WebPollingResult = {
  conversation: {
    id: string;
    channel: string;
    aiEnabled: boolean;
    handoffAt: string | null;
    topic: string | null;
    contactName: string | null;
  } | null;
  messages: ReturnType<typeof serializeMessage>[];
};

/**
 * Polling del widget: mensajes de la conversación de la sesión. `after` es
 * un ISO con el `createdAt` del último mensaje que el widget ya mostró
 * (devuelve solo lo más nuevo; sin `after`, devuelve el hilo completo).
 */
export async function webMessages(
  organizationId: string,
  sessionId: string,
  after?: string | null,
  limit = 100
): Promise<WebPollingResult> {
  const db = getDb();
  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.isTest, false),
        eq(schema.contact.channel, "web"),
        eq(schema.contact.waIdentity, `${WEB_PREFIX}${sessionId}`)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { conversation: null, messages: [] };
  }

  const since = after ? new Date(after) : null;
  const msgs = await db
    .select()
    .from(schema.message)
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.message.conversationId, row.conversation.id),
        since ? gt(schema.message.createdAt, since) : undefined
      )
    )
    .orderBy(asc(schema.message.createdAt))
    .limit(limit);

  return {
    conversation: {
      id: row.conversation.id,
      channel: row.conversation.channel,
      aiEnabled: row.conversation.aiEnabled,
      handoffAt: row.conversation.handoffAt?.toISOString() ?? null,
      topic: row.conversation.topic,
      contactName: row.contact.name,
    },
    messages: msgs.map((m) => serializeMessage(m, null)),
  };
}

/** Organización de la instancia, con el error tipado que espera la API. */
export async function requireWebOrg(): Promise<string> {
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    throw new Error("no_org");
  }
  return organizationId;
}
