/**
 * 044b-B15 — el BAÚL de análisis de IA del Dashboard Management.
 *
 * Cada informe que la IA genera sobre un MÓDULO del tablero o sobre un
 * CLIENTE (Cliente 360°) se guarda acá con fecha, modo (dual | solo IA) y
 * modelo, junto al contexto de entrada que lo alimentó — así el usuario
 * puede verlo, reformularlo, y eliminar los viejos.
 *
 * El guardado es automático al generar (lo disparan las rutas con `save`).
 */
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

import type {
  InsightRecordDto,
  InsightScope,
} from "@/lib/dashboard-management/types";

type AiInsightRow = typeof schema.aiInsight.$inferSelect;

export function serializeInsight(row: AiInsightRow): InsightRecordDto {
  return {
    id: row.id,
    scope: row.scope as InsightScope,
    refId: row.refId,
    title: row.title,
    mode: row.mode as "dual" | "ia",
    model: row.model,
    payload: row.payload,
    input: row.input,
    generatedAt: row.generatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").trim().slice(0, max);
}

export type SaveInsightInput = {
  scope: InsightScope;
  refId: string;
  title: string;
  mode: "dual" | "ia";
  model: string;
  payload: Record<string, unknown>;
  input: Record<string, unknown>;
  generatedAt: string;
};

/** Guarda un informe recién generado (lo llama la ruta al terminar la IA). */
export async function saveInsight(
  organizationId: string,
  userId: string | null,
  data: SaveInsightInput
): Promise<InsightRecordDto> {
  const db = getDb();
  const generatedAt = new Date(data.generatedAt);

  const inserted = await db
    .insert(schema.aiInsight)
    .values({
      id: newId("aiInsight"),
      organizationId,
      scope: data.scope,
      refId: cleanText(data.refId, 120),
      title: cleanText(data.title, 160) || "Análisis",
      mode: data.mode,
      model: cleanText(data.model, 80),
      payload: data.payload,
      input: data.input,
      generatedAt: Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt,
      createdBy: userId,
    })
    .returning();

  return serializeInsight(inserted[0]!);
}

/** Lista el baúl de la organización (lo más nuevo primero). */
export async function listInsights(
  organizationId: string,
  opts: { scope?: InsightScope; refId?: string; limit?: number } = {}
): Promise<InsightRecordDto[]> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);

  const where = opts.scope
    ? opts.refId
      ? scoped(
          schema.aiInsight.organizationId,
          organizationId,
          eq(schema.aiInsight.scope, opts.scope),
          eq(schema.aiInsight.refId, opts.refId)
        )
      : scoped(
          schema.aiInsight.organizationId,
          organizationId,
          eq(schema.aiInsight.scope, opts.scope)
        )
    : scoped(schema.aiInsight.organizationId, organizationId);

  const rows = await db
    .select()
    .from(schema.aiInsight)
    .where(where)
    .orderBy(desc(schema.aiInsight.generatedAt))
    .limit(limit);

  return rows.map(serializeInsight);
}

/** Elimina un informe del baúl. */
export async function deleteInsight(
  organizationId: string,
  id: string
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.aiInsight)
    .where(
      scoped(
        schema.aiInsight.organizationId,
        organizationId,
        eq(schema.aiInsight.id, id)
      )
    )
    .returning({ id: schema.aiInsight.id });

  return Boolean(deleted[0]);
}

/** Elimina los informes más viejos que `days` días. Devuelve cuántos borró. */
export async function deleteInsightsOlderThan(
  organizationId: string,
  days: number
): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(schema.aiInsight)
    .where(
      and(
        scoped(schema.aiInsight.organizationId, organizationId),
        lt(schema.aiInsight.generatedAt, cutoff)
      )
    )
    .returning({ id: schema.aiInsight.id });

  return deleted.length;
}

/** Trae un informe puntual (para reformular desde el baúl). */
export async function getInsight(
  organizationId: string,
  id: string
): Promise<InsightRecordDto | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiInsight)
    .where(
      scoped(
        schema.aiInsight.organizationId,
        organizationId,
        eq(schema.aiInsight.id, id)
      )
    )
    .limit(1);

  return rows[0] ? serializeInsight(rows[0]) : null;
}
