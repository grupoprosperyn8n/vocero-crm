import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { recordLeadCreated } from "@/server/leads/stage-history";
import type { PipelineBoard, PipelineSourceKind } from "@/lib/types";

/**
 * 029 — crear una tarjeta del pipeline PERSONAL.
 *
 * Reemplaza al viejo autocargado (cada mensaje entrante creaba el lead solo):
 * ahora agregar es un gesto EXPLÍCITO desde el chat, la ficha del contacto, la
 * ficha del cliente del sistema o la tarjeta de una alerta. Este módulo es el
 * único camino de creación además del seed de demo — hay un test de vigilancia
 * que escanea `.insert(schema.lead)` fuera de este archivo.
 *
 * Idempotente por dueño: volver a tocar «Agregar» devuelve la tarjeta que ya
 * existe en vez de duplicarla (`created: false`).
 */

export type CreateCardResult =
  | { ok: true; id: string; stageId: string; created: boolean }
  | { ok: false; reason: "no_stage" | "contact_not_found" };

export async function createPipelineCard(input: {
  organizationId: string;
  ownerUserId: string;
  board: PipelineBoard;
  sourceKind: PipelineSourceKind;
  contactId?: string | null;
  sgsaRef?: string | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
  stageId?: string | null;
}): Promise<CreateCardResult> {
  const db = getDb();

  // Un contacto de OTRA organización no debe poder colarse por el API: la
  // tarjeta quedaría apuntando a una ficha ajena.
  if (input.sourceKind === "contact") {
    if (!input.contactId) return { ok: false, reason: "contact_not_found" };
    const found = await db
      .select({ id: schema.contact.id })
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          input.organizationId,
          eq(schema.contact.id, input.contactId)
        )
      )
      .limit(1);
    if (!found[0]) return { ok: false, reason: "contact_not_found" };
  }

  const existing = await findExistingCard(input);
  if (existing) {
    return { ok: true, id: existing.id, stageId: existing.stageId, created: false };
  }

  const stageId = await resolveOpenStage(input.organizationId, input.board, input.stageId);
  if (!stageId) return { ok: false, reason: "no_stage" };

  // La posición se calcula sobre TODAS las tarjetas de la columna (de todos
  // los dueños): llegar al final de la columna es lo que uno espera, y el
  // orden relativo entre tarjetas de dueños distintos no significa nada.
  const maxPos = await db
    .select({ max: sql<number>`coalesce(max(${schema.lead.position}), -1)` })
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.organizationId, input.organizationId),
        eq(schema.lead.stageId, stageId)
      )
    );

  const id = newId("lead");
  try {
    await db.insert(schema.lead).values({
      id,
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      board: input.board,
      sourceKind: input.sourceKind,
      contactId: input.contactId ?? null,
      sgsaRef: input.sgsaRef ?? null,
      label: input.label ?? null,
      meta: input.meta ?? null,
      stageId,
      position: (maxPos[0]?.max ?? -1) + 1,
      lastActivityAt: null,
    });
  } catch (err) {
    // Carrera de doble clic: otro insert idéntico ganó; devolvemos el suyo.
    const raced = await findExistingCard(input);
    if (raced) {
      return { ok: true, id: raced.id, stageId: raced.stageId, created: false };
    }
    throw err;
  }

  // El nacimiento también es un evento del embudo: "prospectos que entraron
  // en el periodo" se cuenta desde la bitácora (best-effort, igual que antes).
  await recordLeadCreated({
    organizationId: input.organizationId,
    leadId: id,
    contactId: input.contactId ?? null,
    stageId,
    source: "dueno",
    actorUserId: input.ownerUserId,
  });

  return { ok: true, id, stageId, created: true };
}

async function findExistingCard(input: {
  organizationId: string;
  ownerUserId: string;
  board: PipelineBoard;
  contactId?: string | null;
  sgsaRef?: string | null;
}): Promise<{ id: string; stageId: string } | null> {
  const db = getDb();
  const conds = [
    eq(schema.lead.organizationId, input.organizationId),
    eq(schema.lead.ownerUserId, input.ownerUserId),
    eq(schema.lead.board, input.board),
  ];
  if (input.contactId) conds.push(eq(schema.lead.contactId, input.contactId));
  else if (input.sgsaRef) conds.push(eq(schema.lead.sgsaRef, input.sgsaRef));
  else return null;

  const rows = await db
    .select({ id: schema.lead.id, stageId: schema.lead.stageId })
    .from(schema.lead)
    .where(and(...conds))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * La etapa de entrada: la pedida (si es una etapa ABIERTA del tablero) o la
 * primera abierta. Una tarjeta no puede nacer en "perdido" — jamás hay un
 * motivo de pérdida que capturar en ese momento.
 */
async function resolveOpenStage(
  organizationId: string,
  board: PipelineBoard,
  requested: string | null | undefined
): Promise<string | null> {
  const db = getDb();
  if (requested) {
    const rows = await db
      .select({ id: schema.pipelineStage.id })
      .from(schema.pipelineStage)
      .where(
        scoped(
          schema.pipelineStage.organizationId,
          organizationId,
          and(
            eq(schema.pipelineStage.id, requested),
            eq(schema.pipelineStage.board, board),
            eq(schema.pipelineStage.kind, "open")
          )
        )
      )
      .limit(1);
    if (rows[0]) return rows[0].id;
  }
  const first = await db
    .select({ id: schema.pipelineStage.id })
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        organizationId,
        and(
          eq(schema.pipelineStage.board, board),
          eq(schema.pipelineStage.kind, "open")
        )
      )
    )
    .orderBy(asc(schema.pipelineStage.position))
    .limit(1);
  return first[0]?.id ?? null;
}
