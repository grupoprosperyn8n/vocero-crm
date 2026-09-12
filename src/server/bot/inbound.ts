import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { normalizeMx } from "@/lib/meta/client";
import type { Channel } from "@/lib/channels";
import { publish } from "@/server/events/bus";
import { toHandoffReason } from "@/server/bot/handoff";
import { assignConversation } from "@/server/router/assign";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { kindFromMime } from "@/server/whatsapp/media";
import {
  BSUID_PREFIX,
  FB_PREFIX,
  IG_PREFIX,
  TG_PREFIX,
  WEB_PREFIX,
  type ResolvedIdentity,
} from "@/server/inbox/identity";

/**
 * 020 — Conector webhook de entrada (cerebros y herramientas externas).
 *
 * Una sola puerta para que CUALQUIER herramienta (n8n/Sira hoy, Telegram,
 * WhatsApp, lo que venga) traiga mensajes del cliente al CRM sin conocer su
 * modelo interno: manda `channel` + `externalId` + `text` y el conector
 * resuelve contacto y conversación, ingesta el mensaje por el motor común
 * (dedup por `eventId`, unread, SSE en vivo) y —si la herramienta lo pide—
 * deriva a un humano por el router de presencia del 1D.
 *
 * La respuesta devuelve el `conversationId` del CRM: es el asa con la que la
 * herramienta responde después por /api/bot/messages (salida) sin volver a
 * preguntar nada.
 *
 * Adjuntos (canal web): si el emisor ya tiene el binario (el widget manda
 * base64 sin prefijo `data:`), lo trae en `attachments` y acá se guarda como
 * mensaje propio del hilo con su archivo en disco (sin pasar por Graph).
 *
 * Por diseño NO dispara el agente interno (scheduleAgent=false): el emisor es
 * el cerebro; si algún día el CRM contesta solo a un canal, se invierte ahí.
 */

export type ExternalHandoff = {
  reason?: string;
  topic?: string;
};

/** Adjunto ya recibido (canal web): base64 crudo, sin prefijo data:. */
export type ExternalInboundAttachment = {
  fileName?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  dataBase64: string;
};

export type ExternalInboundResult = {
  /** true = el eventId ya se había ingerido: sin efectos (idempotencia). */
  deduplicated: boolean;
  conversationId: string;
  contactId: string;
  messageId: string;
  /** Adjuntos guardados como mensajes propios (canal web). */
  attachments: number;
  /** Estado de la derivación pedida (null = no se pidió). */
  handoff: {
    applied: boolean;
    topic: string | null;
    assignee: { id: string; name: string } | null;
  } | null;
};

/** Identidad del canal en el espacio del CRM (prefijos estables, 014/020). */
function identityFor(channel: Channel, externalId: string): ResolvedIdentity {
  switch (channel) {
    case "whatsapp": {
      if (externalId.startsWith(BSUID_PREFIX)) {
        return { identity: externalId, phone: null, waUserId: null, profileName: null };
      }
      const phone = normalizeMx(externalId);
      return { identity: phone, phone, waUserId: null, profileName: null };
    }
    // El emisor manda el id crudo de la plataforma; el prefijo es interno y
    // no debería filtrarse en contratos (el unique es org+channel+identity).
    case "instagram":
      return { identity: `${IG_PREFIX}${externalId}`, channel, phone: null, waUserId: null, profileName: null };
    case "messenger":
      return { identity: `${FB_PREFIX}${externalId}`, channel, phone: null, waUserId: null, profileName: null };
    case "telegram":
      return { identity: `${TG_PREFIX}${externalId}`, channel, phone: null, waUserId: null, profileName: null };
    case "web":
      return { identity: `${WEB_PREFIX}${externalId}`, channel, phone: null, waUserId: null, profileName: null };
  }
}

/** Acepta epoch (s o ms) o ISO 8601; siempre devuelve epoch en segundos. */
function toEpochTimestamp(input?: string): string {
  if (!input) return String(Math.floor(Date.now() / 1000));
  const n = Number(input);
  if (Number.isFinite(n) && n > 0) {
    return String(n < 1e12 ? Math.floor(n) : Math.floor(n / 1000));
  }
  const d = new Date(input);
  if (!Number.isNaN(d.getTime())) return String(Math.floor(d.getTime() / 1000));
  return String(Math.floor(Date.now() / 1000));
}

/** Tope de adjuntos por mensaje, y de base64 individual (~9 MB crudos). */
const MAX_EXTERNAL_ATTACHMENTS = 8;
const MAX_ATTACHMENT_B64_CHARS = 12 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 9 * 1024 * 1024;

/**
 * Guarda los adjuntos ya recibidos (base64) como mensajes propios del hilo:
 * cada uno con su asset en disco y su evento SSE (misma ingesta común que el
 * texto: dedup, unread, bandeja). Un adjunto inválido se descarta solo —
 * jamás tumba el mensaje de texto que lo acompaña.
 */
async function ingestExternalAttachments(input: {
  organizationId: string;
  identity: ResolvedIdentity;
  baseEventId: string;
  timestamp: string;
  attachments: ExternalInboundAttachment[];
}): Promise<number> {
  let count = 0;
  const list = input.attachments.slice(0, MAX_EXTERNAL_ATTACHMENTS);
  for (let i = 0; i < list.length; i++) {
    const att = list[i];
    if (!att) continue;
    try {
      const b64 = String(att.dataBase64 || "");
      if (!b64 || b64.length > MAX_ATTACHMENT_B64_CHARS) continue;
      const data = Buffer.from(b64, "base64");
      if (!data.length || data.length > MAX_ATTACHMENT_BYTES) continue;
      const mimeType =
        String(att.mimeType || "").trim() || "application/octet-stream";
      const kind = kindFromMime(mimeType);
      const caption = String(att.caption || "").trim().slice(0, 1024) || null;
      await ingestInboundMessage({
        organizationId: input.organizationId,
        identity: input.identity,
        waMessageId: `${input.baseEventId}:adj:${i}`,
        type: kind,
        text: caption,
        timestamp: input.timestamp,
        media: {
          kind,
          waMediaId: null,
          mimeType,
          fileName: String(att.fileName || "").trim().slice(0, 200) || null,
          caption,
          payload: null,
          fetchStatus: "available",
          data,
        },
        scheduleAgent: false,
      });
      count += 1;
    } catch (err) {
      console.warn(
        `[bot/inbound] adjunto ${i} descartado:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return count;
}

async function assigneeName(userId: string): Promise<{ id: string; name: string } | null> {
  const rows = await getDb()
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const u = rows[0];
  return u ? { id: u.id, name: u.name } : null;
}

/**
 * Derivación a humano, idempotente y atómica — misma transición que
 * /api/bot/handoff (si ya está derivada no pisa hora ni motivo) seguida del
 * router de presencia (1D), que publica su propio `conversation.updated`.
 */
async function applyExternalHandoff(
  organizationId: string,
  conversationId: string,
  handoff: ExternalHandoff
): Promise<{ applied: boolean; topic: string | null; assignee: { id: string; name: string } | null }> {
  const db = getDb();
  const convs = await db
    .select({ id: schema.conversation.id, handoffAt: schema.conversation.handoffAt, topic: schema.conversation.topic })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  const conv = convs[0];
  if (!conv) return { applied: false, topic: null, assignee: null };

  let topic: string | null = null;
  if (!conv.handoffAt) {
    const nextTopic = handoff.topic ?? conv.topic ?? null;
    await db
      .update(schema.conversation)
      .set({
        aiEnabled: false,
        handoffAt: new Date(),
        handoffReason: toHandoffReason(handoff.reason),
        ...(nextTopic ? { topic: nextTopic } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.conversation.id, conv.id));
    publish(organizationId, {
      type: "conversation.updated",
      data: { conversation: { id: conv.id } },
    });
    const result = await assignConversation(organizationId, conv.id);
    topic = nextTopic;
    const assignee = result.assignedToId ? await assigneeName(result.assignedToId) : null;
    return { applied: true, topic, assignee };
  }

  // Ya derivada: no se re-deriva; se reporta el dueño actual (si lo hay).
  const current = await db
    .select({ assigneeId: schema.conversation.assigneeId, topic: schema.conversation.topic })
    .from(schema.conversation)
    .where(eq(schema.conversation.id, conv.id))
    .limit(1);
  const row = current[0];
  const assignee = row?.assigneeId ? await assigneeName(row.assigneeId) : null;
  return { applied: false, topic: row?.topic ?? null, assignee };
}

export async function ingestExternalInbound(input: {
  organizationId: string;
  channel: Channel;
  externalId: string;
  profileName?: string | null;
  text: string;
  eventId?: string | null;
  timestamp?: string;
  /** Adjuntos ya recibidos (canal web): base64, se guardan como mensajes. */
  attachments?: ExternalInboundAttachment[] | null;
  handoff?: ExternalHandoff | null;
}): Promise<ExternalInboundResult> {
  const { organizationId, channel } = input;

  const identity = identityFor(channel, input.externalId);
  identity.profileName = input.profileName?.trim() || null;

  const ingested = await ingestInboundMessage({
    organizationId,
    identity,
    waMessageId: input.eventId?.trim() || newId("message"),
    type: "text",
    text: input.text,
    timestamp: toEpochTimestamp(input.timestamp),
    scheduleAgent: false,
  });

  if (!ingested) {
    // Idempotencia dura: el eventId ya se ingirió. Se resuelve el asa para
    // que la herramienta pueda seguir hablando aunque reintente.
    const rows = await getDb()
      .select({ conversationId: schema.message.conversationId, contactId: schema.conversation.contactId })
      .from(schema.message)
      .innerJoin(schema.conversation, eq(schema.conversation.id, schema.message.conversationId))
      .where(eq(schema.message.waMessageId, input.eventId ?? ""))
      .limit(1);
    const existing = rows[0];
    if (!existing) {
      throw new Error("mensaje duplicado sin conversación original (eventId reutilizado)");
    }
    return {
      deduplicated: true,
      conversationId: existing.conversationId,
      contactId: existing.contactId,
      messageId: "",
      attachments: 0,
      handoff: null,
    };
  }

  const { contact, conversation, message } = ingested;

  const attachmentCount = await ingestExternalAttachments({
    organizationId,
    identity,
    baseEventId: input.eventId?.trim() || message.id,
    timestamp: toEpochTimestamp(input.timestamp),
    attachments: input.attachments ?? [],
  });

  const handoff = input.handoff
    ? await applyExternalHandoff(organizationId, conversation.id, input.handoff)
    : null;

  return {
    deduplicated: false,
    conversationId: conversation.id,
    contactId: contact.id,
    messageId: message.id,
    attachments: attachmentCount,
    handoff,
  };
}
