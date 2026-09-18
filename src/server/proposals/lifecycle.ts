/*
 * 041e — CICLO DE VIDA de una gestión (propuesta comercial).
 *
 * Pedido de Diego:
 *  · eliminar una gestión: SOLO propietario y dueño;
 *  · archivar: gerente (y hacia arriba) — se puede desarchivar;
 *  · editar: todos, pero queda REGISTRADO quién editó y qué cambió;
 *  · poner online u offline la publicidad ENVIADA.
 *
 * Todo lo que pasa queda en `proposal_event` (historial visible en el panel).
 */

import { and, eq, isNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

import { ProposalError } from "./service";
import { recordProposalEvent, resolveUserName } from "./events";
import {
  canArchiveProposal,
  canDeleteProposal,
  canToggleProposalOnline,
} from "./permissions";

export type ProposalActor = {
  id: string;
  role: string;
};

async function loadRow(organizationId: string, id: string) {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.proposal)
    .where(
      and(
        scoped(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.id, id)
      )
    )
    .limit(1);

  const row = rows[0];

  if (!row || row.deletedAt) {
    throw new ProposalError("Propuesta no encontrada", 404, "not_found");
  }

  return row;
}

/** Archivar / desarchivar (gerente y hacia arriba). */
export async function setProposalArchived(input: {
  organizationId: string;
  id: string;
  actor: ProposalActor;
  archived: boolean;
}): Promise<{ archivedAt: string | null }> {
  if (!canArchiveProposal(input.actor.role)) {
    throw new ProposalError(
      "Solo el gerente, el propietario o el dueño pueden archivar",
      403,
      "forbidden"
    );
  }

  const row = await loadRow(input.organizationId, input.id);
  const db = getDb();
  const actorName = await resolveUserName(input.actor.id);
  const archivedAt = input.archived ? new Date() : null;

  await db
    .update(schema.proposal)
    .set({ archivedAt })
    .where(
      and(
        scoped(schema.proposal.organizationId, input.organizationId),
        eq(schema.proposal.id, input.id)
      )
    );

  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: input.id,
    actorId: input.actor.id,
    actorName,
    action: input.archived ? "archivada" : "restaurada",
    detail: input.archived
      ? `Archivó «${row.title}»`
      : `Sacó del archivo «${row.title}»`,
  });

  return { archivedAt: archivedAt ? archivedAt.toISOString() : null };
}

/** Poner online u offline la publicidad ya enviada (gerente y hacia arriba). */
export async function setProposalOnline(input: {
  organizationId: string;
  id: string;
  actor: ProposalActor;
  online: boolean;
}): Promise<{ online: boolean }> {
  if (!canToggleProposalOnline(input.actor.role)) {
    throw new ProposalError(
      "Solo el gerente, el propietario o el dueño pueden pausar la publicidad",
      403,
      "forbidden"
    );
  }

  await loadRow(input.organizationId, input.id);

  const db = getDb();
  const actorName = await resolveUserName(input.actor.id);

  await db
    .update(schema.proposal)
    .set({ online: input.online })
    .where(
      and(
        scoped(schema.proposal.organizationId, input.organizationId),
        eq(schema.proposal.id, input.id)
      )
    );

  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: input.id,
    actorId: input.actor.id,
    actorName,
    action: input.online ? "publicada" : "pausada",
    detail: input.online
      ? "La publicidad volvió a estar visible"
      : "La publicidad quedó pausada (el link ya no se muestra)",
  });

  return { online: input.online };
}

/** Eliminar (soft delete): SOLO propietario y dueño. */
export async function deleteProposal(input: {
  organizationId: string;
  id: string;
  actor: ProposalActor;
}): Promise<{ title: string }> {
  if (!canDeleteProposal(input.actor.role)) {
    throw new ProposalError(
      "Solo el propietario o el dueño pueden eliminar una gestión",
      403,
      "forbidden"
    );
  }

  const row = await loadRow(input.organizationId, input.id);
  const db = getDb();
  const actorName = await resolveUserName(input.actor.id);

  await db
    .update(schema.proposal)
    .set({ deletedAt: new Date() })
    .where(
      and(
        scoped(schema.proposal.organizationId, input.organizationId),
        eq(schema.proposal.id, input.id)
      )
    );

  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: input.id,
    actorId: input.actor.id,
    actorName,
    action: "eliminada",
    detail: `Eliminó «${row.title}»`,
  });

  return { title: row.title };
}

const EDITABLE_FIELDS = [
  "title",
  "subtitle",
  "body",
  "offer",
  "benefit",
  "ctaLabel",
  "productName",
  "priority",
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

const FIELD_LABELS: Record<EditableField, string> = {
  title: "título",
  subtitle: "subtítulo",
  body: "mensaje",
  offer: "oferta",
  benefit: "beneficio",
  ctaLabel: "botón",
  productName: "producto",
  priority: "prioridad",
};

/**
 * Editar los textos de una gestión. Puede cualquiera del equipo; el historial
 * registra quién y QUÉ campos tocó ("editó: título, oferta").
 */
export async function updateProposalContent(input: {
  organizationId: string;
  id: string;
  actor: ProposalActor;
  patch: Partial<Record<EditableField, string | null>>;
}): Promise<{ title: string }> {
  const row = await loadRow(input.organizationId, input.id);
  const db = getDb();
  const actorName = await resolveUserName(input.actor.id);

  const changes: Partial<Record<EditableField, string | null>> = {};
  const touched: EditableField[] = [];

  for (const field of EDITABLE_FIELDS) {
    if (!(field in input.patch)) continue;

    const raw = input.patch[field];
    const value =
      typeof raw === "string"
        ? raw.replace(/\s+/g, " ").trim().slice(0, field === "body" ? 2000 : 240)
        : null;

    const actual = (row as Record<string, unknown>)[field] ?? null;

    if ((value || null) !== (actual || null)) {
      changes[field] = value || null;
      touched.push(field);
    }
  }

  if (touched.length === 0) {
    return { title: row.title };
  }

  await db
    .update(schema.proposal)
    .set(changes as Partial<typeof schema.proposal.$inferInsert>)
    .where(
      and(
        scoped(schema.proposal.organizationId, input.organizationId),
        eq(schema.proposal.id, input.id)
      )
    );

  const labels = touched.map((f) => FIELD_LABELS[f]).join(", ");

  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: input.id,
    actorId: input.actor.id,
    actorName,
    action: "editada",
    detail: `Editó: ${labels}`,
  });

  return { title: (changes.title as string) ?? row.title };
}

/** Filtro base para listados: vivos (sin eliminar). */
export function liveProposalFilter() {
  return isNull(schema.proposal.deletedAt);
}
