import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { canSeeAllInbox } from "@/lib/roles";
import { isWindowOpen, windowRemainingMs } from "@/server/inbox/window";
import type { ConversationDto } from "@/lib/types";

export type ConversationStatus = "open" | "closed" | "archived";

/** 026 — quién mira la bandeja; el rol decide el alcance. */
export type InboxViewer = { userId: string; role: string };

/** 026 — filtro por empleado a cargo (solo gerente/admin/propietario). */
export type InboxAssigneeFilter = string | "none" | undefined;

/**
 * 026 — Condiciones comunes de la bandeja (pedido Diego: «cada usuario tiene
 * que tener su bandeja de entrada y ver solo sus comunicaciones... los
 * gerentes pueden ver todas las conversaciones y filtrar por las suyas o de
 * cualquier empleado, y administrador lo mismo y propietario igual»):
 *  - alcance por rol: gerente/admin/propietario ven todo; un miembro ve SOLO
 *    lo asignado a él (estricto, pedido Diego: «ver solo sus comunicaciones»);
 *  - archivo PERSONAL: «abiertas» excluye las que YO archivé; la pestaña
 *    «Archivadas (mías)» muestra exactamente esas (siempre abiertas);
 *  - filtro por empleado a cargo (el caller solo lo pasa si puede ver todo).
 */
function inboxConds(
  viewer: InboxViewer | undefined,
  status: ConversationStatus,
  assigneeFilter: InboxAssigneeFilter
) {
  const personalArchive = viewer
    ? status === "archived"
      ? sql`exists (select 1 from conversation_archive ca where ca.conversation_id = ${schema.conversation.id} and ca.user_id = ${viewer.userId})`
      : sql`not exists (select 1 from conversation_archive ca where ca.conversation_id = ${schema.conversation.id} and ca.user_id = ${viewer.userId})`
    : undefined;
  return [
    eq(schema.conversation.isTest, false),
    // 1F: la cola viva y «Archivadas (mías)» son abiertas; el archivo global
    // («Cerradas») es el cierre 1F con su resumen.
    status === "closed"
      ? isNotNull(schema.conversation.closedAt)
      : isNull(schema.conversation.closedAt),
    viewer && !canSeeAllInbox(viewer.role)
      ? eq(schema.conversation.assigneeId, viewer.userId)
      : undefined,
    personalArchive,
    assigneeFilter === "none"
      ? isNull(schema.conversation.assigneeId)
      : assigneeFilter
        ? eq(schema.conversation.assigneeId, assigneeFilter)
        : undefined,
  ];
}

export async function listConversations(
  organizationId: string,
  since?: Date,
  status: ConversationStatus = "open",
  viewer?: InboxViewer,
  assigneeFilter: InboxAssigneeFilter = undefined
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
      // 034 — ¿la tengo fijada? (pin personal; sin viewer no hay pin).
      pinned: viewer
        ? sql<boolean>`exists (select 1 from conversation_pin cp where cp.conversation_id = ${schema.conversation.id} and cp.user_id = ${viewer.userId})`
        : sql<boolean>`false`,
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
        // 026: alcance por rol + archivo personal + filtro por empleado.
        and(...inboxConds(viewer, status, assigneeFilter)),
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

  const dtos = rows.map((r) => {
    const asg = r.assignee;
    return serializeConversation(
      r.conversation,
      r.contact,
      asg?.id ? { id: asg.id, name: asg.name } : null,
      r.preview,
      r.stageName,
      r.closer?.name ?? null,
      r.pinned === true
    );
  });
  // 034 — mis fijadas van arriba (sort estable: adentro se conserva el orden).
  // En «Cerradas» (archivo GLOBAL, 2A) no aplica: manda la fecha de cierre.
  if (status !== "closed") {
    dtos.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }
  return dtos;
}

/** 2A: total de conversaciones en un estado, para los contadores de las tabs. */
export async function countConversations(
  organizationId: string,
  status: ConversationStatus,
  viewer?: InboxViewer
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        // 026: el contador respeta el alcance por rol y el archivo personal.
        and(...inboxConds(viewer, status, undefined))
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
  closedByName: string | null = null,
  /** 034 — pin personal (lo resuelve el caller por viewer). */
  pinned: boolean = false
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
    pinned,
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

/**
 * 026 — Archiva/desarchiva una conversación SOLO para mí (bandeja personal
 * persistente; pedido Diego: «cada empleado pueda guardar persistentemente su
 * bandeja de entrada»). El cierre global (1F) es otra cosa y no se toca acá.
 * Devuelve null si la conversación no existe en la organización.
 */
export async function setConversationArchived(input: {
  organizationId: string;
  conversationId: string;
  userId: string;
  archived: boolean;
}): Promise<{ archived: boolean } | null> {
  const db = getDb();
  const conv = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  if (!conv[0]) return null;
  if (input.archived) {
    await db
      .insert(schema.conversationArchive)
      .values({
        id: newId("conversationArchive"),
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        userId: input.userId,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.conversationArchive)
      .where(
        and(
          eq(schema.conversationArchive.organizationId, input.organizationId),
          eq(schema.conversationArchive.conversationId, input.conversationId),
          eq(schema.conversationArchive.userId, input.userId)
        )
      );
  }
  return { archived: input.archived };
}

/**
 * 034 — Fija/desfija una conversación SOLO para mí (pedido Diego: «se deben de
 * poder pinear y despinear aparte de archivar»). Personal e independiente del
 * archivo y del cierre. Devuelve null si la conversación no existe en la org.
 */
export async function setConversationPinned(input: {
  organizationId: string;
  conversationId: string;
  userId: string;
  pinned: boolean;
}): Promise<{ pinned: boolean } | null> {
  const db = getDb();
  const conv = await db
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  if (!conv[0]) return null;
  if (input.pinned) {
    await db
      .insert(schema.conversationPin)
      .values({
        id: newId("conversationPin"),
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        userId: input.userId,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.conversationPin)
      .where(
        and(
          eq(schema.conversationPin.organizationId, input.organizationId),
          eq(schema.conversationPin.conversationId, input.conversationId),
          eq(schema.conversationPin.userId, input.userId)
        )
      );
  }
  return { pinned: input.pinned };
}
