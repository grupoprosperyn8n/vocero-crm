/*
 * 041e — Historial de una gestión: piezas de bajo nivel (sin dependencias
 * del servicio, para que puedan usarlo tanto el servicio como el ciclo de
 * vida sin ciclos de imports).
 */

import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export type ProposalEventDto = {
  id: string;
  action: string;
  detail: string | null;
  actorName: string | null;
  actorId: string | null;
  createdAt: string;
};

/** Nombre visible del usuario (se guarda copia: puede irse del equipo). */
export async function resolveUserName(userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);

  return rows[0]?.name ?? null;
}

export async function recordProposalEvent(input: {
  organizationId: string;
  proposalId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  detail?: string | null;
}): Promise<void> {
  const db = getDb();

  await db.insert(schema.proposalEvent).values({
    id: newId("proposalEvent"),
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    actorId: input.actorId,
    actorName: input.actorName?.slice(0, 120) ?? null,
    action: input.action,
    detail: input.detail?.slice(0, 400) ?? null,
  });
}

export async function listProposalEvents(input: {
  organizationId: string;
  proposalId: string;
}): Promise<ProposalEventDto[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.proposalEvent)
    .where(
      and(
        scoped(schema.proposalEvent.organizationId, input.organizationId),
        eq(schema.proposalEvent.proposalId, input.proposalId)
      )
    )
    .orderBy(desc(schema.proposalEvent.createdAt))
    .limit(60);

  return rows.map((e) => ({
    id: e.id,
    action: e.action,
    detail: e.detail,
    actorName: e.actorName,
    actorId: e.actorId,
    createdAt: e.createdAt.toISOString(),
  }));
}
