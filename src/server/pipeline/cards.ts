import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { recordLeadCreated } from "@/server/leads/stage-history";
import { resolveAlertClientRecords } from "@/server/alerts/client-record";
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
  /** 037 — tarea: vencimiento con hora, nota y prioridad. */
  dueAt?: Date | null;
  notes?: string | null;
  priority?: "alta" | "media" | "baja" | null;
}): Promise<CreateCardResult> {
  const db = getDb();

  // Un contacto de OTRA organización no debe poder colarse por el API: la
  // tarjeta quedaría apuntando a una ficha ajena.
  if (input.sourceKind === "contact" && !input.contactId) {
    return { ok: false, reason: "contact_not_found" };
  }
  if (input.contactId) {
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

  // 037 — las tareas NO son idempotentes: un contacto puede tener varias (su
  // checklist), así que en el tablero de tareas cada gesto de crear crea.
  const existing = input.board === "tareas" ? null : await findExistingCard(input);
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
  const meta = await enrichAlertMeta(input);
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
      meta,
      stageId,
      position: (maxPos[0]?.max ?? -1) + 1,
      lastActivityAt: null,
      dueAt: input.dueAt ?? null,
      notes: input.notes ?? null,
      priority: input.priority ?? null,
    });
  } catch (err) {
    // Carrera de doble clic: otro insert idéntico ganó; devolvemos el suyo.
    // (En tareas no hay unicidad por contacto: el error es real y se eleva.)
    const raced = input.board === "tareas" ? null : await findExistingCard(input);
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

/**
 * 030e — «macheado» del cliente en tarjetas de alerta: si el navegador mandó
 * la tarjeta sin `clienteRecordId` (bundle viejo, payload de chat anterior a
 * 030e, etc.), lo resolvemos acá leyendo CLIENTE/CLIENTES de la alerta en
 * Airtable. Best-effort: si Airtable no responde, la tarjeta nace igual.
 */
async function enrichAlertMeta(input: {
  sourceKind: PipelineSourceKind;
  sgsaRef?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<Record<string, unknown> | null> {
  const meta = input.meta ?? null;
  if (input.sourceKind !== "alert") return meta;
  const ref = typeof input.sgsaRef === "string" ? input.sgsaRef.trim() : "";
  if (!/^rec[A-Za-z0-9]{14}$/.test(ref)) return meta;
  const m = { ...(meta && typeof meta === "object" ? meta : {}) } as Record<string, unknown>;
  const cur = m.clienteRecordId;
  if (typeof cur === "string" && /^rec[A-Za-z0-9]{14}$/.test(cur)) return m;
  try {
    const map = await resolveAlertClientRecords([ref]);
    const cli = map.get(ref);
    if (cli) m.clienteRecordId = cli;
  } catch {
    // best-effort: la tarjeta puede vivir sin el cliente
  }
  return m;
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
