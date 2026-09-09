import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";
import type { ConversationDto } from "@/lib/types";

export type ConversationStatus = "open" | "closed";

export async function listConversations(
  organizationId: string,
  since?: Date,
  status: ConversationStatus = "open"
): Promise<ConversationDto[]> {
  const db = getDb();
  const previewSql = sql<string | null>`(
    select coalesce(m.text, m.type)
    from message m
    where m.conversation_id = ${schema.conversation.id}
    order by m.created_at desc
    limit 1
  )`;
  const stageSql = sql<string | null>`(
    select s.name from lead l
    join pipeline_stage s on s.id = l.stage_id
    where l.contact_id = ${schema.conversation.contactId}
    limit 1
  )`;
  // 2A: operador que cerró la conversación (para la vista Cerradas).
  const closer = alias(schema.user, "closer");

  const rows = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
      // 1D: nombre del empleado a cargo, para el chip de la bandeja.
      assignee: {
        id: schema.user.id,
        name: schema.user.name,
      },
      closer: {
        id: closer.id,
        name: closer.name,
      },
      preview: previewSql,
      stageName: stageSql,
    })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .leftJoin(
      schema.user,
      eq(schema.conversation.assigneeId, schema.user.id)
    )
    .leftJoin(closer, eq(schema.conversation.closedBy, closer.id))
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        // 1F: la bandeja muestra la cola viva; 2A: la pestaña Cerradas
        // muestra las archivadas (con su resumen), por fecha de cierre.
        and(
          eq(schema.conversation.isTest, false),
          status === "closed"
            ? isNotNull(schema.conversation.closedAt)
            : isNull(schema.conversation.closedAt)
        ),
        since ? gt(schema.conversation.updatedAt, since) : undefined
      )
    )
    .orderBy(
      status === "closed"
        ? desc(schema.conversation.closedAt)
        : desc(
            sql`coalesce(${schema.conversation.lastMessageAt}, ${schema.conversation.createdAt})`
          )
    );

  return rows.map((r) => {
    const asg = r.assignee;
    return serializeConversation(
      r.conversation,
      r.contact,
      asg?.id ? { id: asg.id, name: asg.name } : null,
      r.preview,
      r.stageName,
      r.closer?.name ?? null
    );
  });
}

/** 2A: total de conversaciones en un estado, para los contadores de las tabs. */
export async function countConversations(
  organizationId: string,
  status: ConversationStatus
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.isTest, false),
        status === "closed"
          ? isNotNull(schema.conversation.closedAt)
          : isNull(schema.conversation.closedAt)
      )
    );
  return rows[0]?.n ?? 0;
}

export async function getConversation(
  organizationId: string,
  conversationId: string
) {
  const db = getDb();
  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listMessages(
  organizationId: string,
  conversationId: string,
  since?: Date
) {
  const db = getDb();
  return db
    .select({ message: schema.message, media: schema.mediaAsset })
    .from(schema.message)
    .leftJoin(
      schema.mediaAsset,
      eq(schema.message.mediaAssetId, schema.mediaAsset.id)
    )
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId),
        since ? gt(schema.message.createdAt, since) : undefined
      )
    )
    .orderBy(schema.message.createdAt);
}

export function serializeConversation(
  c: typeof schema.conversation.$inferSelect,
  contact: typeof schema.contact.$inferSelect,
  assignee: { id: string; name: string } | null = null,
  preview: string | null = null,
  stageName: string | null = null,
  closedByName: string | null = null
): ConversationDto {
  return {
    id: c.id,
    channel: c.channel,
    contact: { id: contact.id, name: contact.name, phone: contact.phone },
    stageName,
    aiEnabled: c.aiEnabled,
    handoffAt: c.handoffAt?.toISOString() ?? null,
    handoffReason: c.handoffReason,
    topic: c.topic,
    assignee,
    assignedAt: c.assignedAt?.toISOString() ?? null,
    /** 1F: cerrada = salió de la cola de la bandeja (el SSE la descarta). */
    closedAt: c.closedAt?.toISOString() ?? null,
    /** 2A: resumen curado al cerrar (se muestra en la pestaña Cerradas). */
    closureSummary: c.closureSummary,
    /** 2A: operador que cerró (chip en la tarjeta de Cerradas). */
    closedByName,
    lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
    lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    unreadCount: c.unreadCount,
    windowOpen: isWindowOpen(c.lastInboundAt),
    windowRemainingMs: windowRemainingMs(c.lastInboundAt),
    preview,
  };
}

export async function updateConversation(
  organizationId: string,
  conversationId: string,
  patch: {
    aiEnabled?: boolean;
    reactivate?: boolean;
    markRead?: boolean;
    /** 1B: catalogar/recatalogar (null limpia el topic). */
    topic?: string | null;
  }
) {
  const db = getDb();
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.aiEnabled !== undefined) set.aiEnabled = patch.aiEnabled;
  if (patch.reactivate) {
    set.handoffAt = null;
    set.handoffReason = null;
    set.aiEnabled = patch.aiEnabled ?? true;
    // 1F: reabrir una conversación cerrada la vuelve a la cola (el webhook
    // de cierre ya se emitió; reabrir no lo re-emite).
    set.closedAt = null;
    set.closedBy = null;
    set.closureStatus = null;
    set.closureError = null;
  }
  if (patch.markRead) set.unreadCount = 0;
  if (patch.topic !== undefined) set.topic = patch.topic;

  const updated = await db
    .update(schema.conversation)
    .set(set)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning();
  return updated[0] ?? null;
}
