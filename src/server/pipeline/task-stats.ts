/**
 * 037c — Métricas del tablero de Tareas: lectura + armado, y la agregación en
 * la lib pura `@/lib/task-stats`. Lo consume el dashboard (`TaskStatsPanel`,
 * gerente/administrador/propietario).
 *
 * Actividad del CRM: conversaciones NO de prueba (is_test=false). Los
 * «mensajes enviados» se atribuyen por la conversación A CARGO (la tabla de
 * mensajes no guarda quién de la persona los mandó).
 */

import { and, count, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  aggregateTaskStats,
  type PersonActivity,
  type TaskBoardStats,
  type TaskStatRow,
} from "@/lib/task-stats";
import { listStaff } from "@/server/internal/chat";

export type TaskBoardStatsResponse = TaskBoardStats & {
  dias: number;
  generatedAt: string;
};

const DAY_MS = 86_400_000;

export async function taskBoardStats(
  organizationId: string,
  dias = 30
): Promise<TaskBoardStatsResponse> {
  const db = getDb();
  const now = new Date();
  const sinceMs = dias > 0 ? now.getTime() - dias * DAY_MS : 0;

  const rowsRaw = await db
    .select({
      ownerUserId: schema.lead.ownerUserId,
      createdAt: schema.lead.createdAt,
      dueAt: schema.lead.dueAt,
      completedAt: schema.lead.completedAt,
      meta: schema.lead.meta,
      stageKind: schema.pipelineStage.kind,
      stagePosition: schema.pipelineStage.position,
    })
    .from(schema.lead)
    .leftJoin(
      schema.pipelineStage,
      eq(schema.lead.stageId, schema.pipelineStage.id)
    )
    .where(
      and(
        eq(schema.lead.organizationId, organizationId),
        eq(schema.lead.board, "tareas")
      )
    );

  // Las etapas abiertas del tablero, vistas en orden: «Pendientes» es la
  // primera columna y «En curso» las siguientes (la posición absoluta puede
  // dejar huecos, así que se renumera 0, 1, 2…).
  const openPositions = [
    ...new Set(
      rowsRaw
        .filter((r) => (r.stageKind ?? "open") === "open" && r.stagePosition !== null)
        .map((r) => r.stagePosition!)
    ),
  ].sort((a, b) => a - b);
  const posIndex = new Map(openPositions.map((pos, i) => [pos, i]));

  const rows: TaskStatRow[] = rowsRaw.map((r) => ({
    ownerUserId: r.ownerUserId,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
    fromRequest:
      ((r.meta ?? {}) as { originKind?: string }).originKind === "task_request",
    stageKind: r.stageKind ?? "open",
    stagePosition:
      (r.stageKind ?? "open") === "open"
        ? (posIndex.get(r.stagePosition ?? -1) ?? 0)
        : (r.stagePosition ?? 0),
  }));

  const staff = await listStaff(organizationId);
  const people = staff.map((s) => ({ userId: s.userId, name: s.name }));

  // Actividad CRM (conversaciones reales).
  const convRows = await db
    .select({
      assigneeId: schema.conversation.assigneeId,
      closedBy: schema.conversation.closedBy,
      closedAt: schema.conversation.closedAt,
    })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.isTest, false)
      )
    );

  const sinceDate = new Date(sinceMs);
  const msgRows = await db
    .select({
      assigneeId: schema.conversation.assigneeId,
      n: count(),
    })
    .from(schema.message)
    .innerJoin(
      schema.conversation,
      eq(schema.message.conversationId, schema.conversation.id)
    )
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.message.direction, "out"),
        eq(schema.message.origin, "operator"),
        eq(schema.conversation.isTest, false),
        gte(schema.message.createdAt, sinceDate)
      )
    )
    .groupBy(schema.conversation.assigneeId);

  const chatRows = await db
    .select({ senderId: schema.chatMessage.senderId, n: count() })
    .from(schema.chatMessage)
    .where(
      and(
        eq(schema.chatMessage.organizationId, organizationId),
        gte(schema.chatMessage.createdAt, sinceDate)
      )
    )
    .groupBy(schema.chatMessage.senderId);

  const actMap = new Map<string, PersonActivity>();
  const asegurar = (userId: string): PersonActivity => {
    const cur = actMap.get(userId);
    if (cur) return cur;
    const fresh: PersonActivity = {
      userId,
      conversaciones: 0,
      atendidas: 0,
      mensajesCrm: 0,
      mensajesInternos: 0,
    };
    actMap.set(userId, fresh);
    return fresh;
  };
  for (const c of convRows) {
    if (c.assigneeId) asegurar(c.assigneeId).conversaciones += 1;
    if (c.closedBy && c.closedAt && c.closedAt.getTime() >= sinceMs) {
      asegurar(c.closedBy).atendidas += 1;
    }
  }
  for (const m of msgRows) {
    if (m.assigneeId) asegurar(m.assigneeId).mensajesCrm = Number(m.n);
  }
  for (const c of chatRows) {
    asegurar(c.senderId).mensajesInternos = Number(c.n);
  }

  return {
    dias,
    generatedAt: now.toISOString(),
    ...aggregateTaskStats({
      rows,
      people,
      activity: [...actMap.values()],
      dias,
      now,
    }),
  };
}
