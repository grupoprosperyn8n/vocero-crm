import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { PipelineBoard, PipelineCardDto, StageDto } from "@/lib/types";

/**
 * 029 — el tablero que ve cada usuario.
 *
 * Regla de alcance (igual que la bandeja, 026):
 *  · member → SOLO sus tarjetas (no hay parámetro que lo afloje);
 *  · propietario / administrador / gerente → todas, con filtro `assignee`
 *    ("me", "all" o el id de un empleado).
 *
 * El dueño de una tarjeta es quien ÚNICAMENTE puede moverla o editarla: ver
 * el trabajo de los demás no es tocarlo.
 */
export async function listBoardCards(input: {
  organizationId: string;
  viewerUserId: string;
  viewerRole: string;
  board: PipelineBoard;
  /** "me" | "all" | <userId> — ignorado para member. */
  assignee?: string | null;
}): Promise<{ stages: StageDto[]; cards: PipelineCardDto[] }> {
  const db = getDb();

  let ownerFilter: string | null = input.viewerUserId;
  if (input.viewerRole !== "member") {
    if (input.assignee === "me") ownerFilter = input.viewerUserId;
    else if (!input.assignee || input.assignee === "all") ownerFilter = null;
    else ownerFilter = input.assignee;
  }

  const stageRows = await db
    .select()
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        input.organizationId,
        eq(schema.pipelineStage.board, input.board)
      )
    )
    .orderBy(asc(schema.pipelineStage.position));

  const rows = await db
    .select({
      lead: schema.lead,
      contact: {
        id: schema.contact.id,
        name: schema.contact.name,
        phone: schema.contact.phone,
      },
      ownerName: schema.user.name,
    })
    .from(schema.lead)
    .leftJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.lead.ownerUserId, schema.user.id))
    .where(
      scoped(
        schema.lead.organizationId,
        input.organizationId,
        and(
          eq(schema.lead.board, input.board),
          ownerFilter ? eq(schema.lead.ownerUserId, ownerFilter) : undefined
        )
      )
    )
    .orderBy(asc(schema.lead.position));

  // La conversación se resuelve aparte y una por contacto (la última): metida
  // en el join, un contacto con dos canales abiertos duplicaría su tarjeta.
  const contactIds = rows
    .map((r) => r.lead.contactId)
    .filter((id): id is string => Boolean(id));
  const convByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const convs = await db
      .select({
        id: schema.conversation.id,
        contactId: schema.conversation.contactId,
        lastMessageAt: schema.conversation.lastMessageAt,
      })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          input.organizationId,
          and(
            inArray(schema.conversation.contactId, contactIds),
            eq(schema.conversation.isTest, false)
          )
        )
      )
      .orderBy(asc(schema.conversation.lastMessageAt));
    for (const c of convs) {
      if (c.contactId) convByContact.set(c.contactId, c.id); // la última gana
    }
  }

  return {
    stages: stageRows.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      kind: s.kind,
      board: s.board,
    })),
    cards: rows.map((r) => {
      const l = r.lead;
      return {
        id: l.id,
        board: l.board,
        stageId: l.stageId,
        position: l.position,
        ownerUserId: l.ownerUserId,
        ownerName: r.ownerName,
        sourceKind: l.sourceKind,
        sgsaRef: l.sgsaRef,
        label: l.label,
        meta: l.meta,
        lastActivityAt: l.lastActivityAt?.toISOString() ?? null,
        amountCents: l.amountCents,
        currency: l.currency,
        priority: l.priority,
        contact: r.contact?.id
          ? { id: r.contact.id, name: r.contact.name, phone: r.contact.phone }
          : null,
        conversationId: l.contactId
          ? convByContact.get(l.contactId) ?? null
          : null,
      };
    }),
  };
}

/** ¿Ese usuario pertenece a la organización? (valida el filtro `assignee`). */
export async function isOrgMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, userId)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}
