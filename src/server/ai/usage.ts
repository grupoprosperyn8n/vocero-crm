import { desc, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { computeCostUsd, lookupUnitCost, type UnitCost } from "@/lib/ai/pricing";

/**
 * 046 — Registro de consumo de IA + gestor de consumos.
 *
 * `recordAiUsage` es fire-and-forget: una llamada de IA JAMÁS falla porque el
 * registro no se pudo escribir. El costo no se persiste — se estima al leer
 * con el precio vigente (override de la conexión → catálogo de referencia).
 */

export type AiUsageInput = {
  organizationId: string;
  connectionId: string | null;
  provider: string;
  model: string;
  /** Módulo que la usó: laboratorio · agente · paneles-clientes · etc. */
  source: string;
  via: "org" | "system";
  tokensIn: number;
  tokensOut: number;
};

export async function recordAiUsage(input: AiUsageInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(schema.aiUsage).values({
      id: newId("aiUsage"),
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      provider: input.provider,
      model: input.model,
      source: input.source,
      via: input.via,
      tokensIn: Math.max(0, Math.round(input.tokensIn || 0)),
      tokensOut: Math.max(0, Math.round(input.tokensOut || 0)),
    });
  } catch (err) {
    console.warn(
      "[ai-usage] no se pudo registrar el consumo:",
      err instanceof Error ? err.message : err
    );
  }
}

type UsageRow = typeof schema.aiUsage.$inferSelect;

export type UsageBucket = {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
};

export type UsageModelBucket = UsageBucket & {
  provider: string;
  model: string;
  unit: UnitCost | null;
};

export type UsageSummary = {
  days: number;
  totals: UsageBucket;
  byModel: UsageModelBucket[];
  bySource: (UsageBucket & { source: string })[];
  byDay: (UsageBucket & { day: string })[];
};

function emptyBucket(): UsageBucket & { priced: boolean } {
  return { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: null, priced: false };
}

function addToBucket(
  bucket: UsageBucket & { priced: boolean },
  row: UsageRow,
  unit: UnitCost | null
): void {
  bucket.calls += 1;
  bucket.tokensIn += row.tokensIn;
  bucket.tokensOut += row.tokensOut;
  const cost = computeCostUsd(row.tokensIn, row.tokensOut, unit);
  if (cost !== null) {
    bucket.priced = true;
    bucket.costUsd = (bucket.costUsd ?? 0) + cost;
  }
}

function finalize<T extends UsageBucket & { priced: boolean }>(bucket: T): T {
  if (!bucket.priced) bucket.costUsd = null;
  return bucket;
}

/**
 * Agrega filas de consumo en totales + cortes por modelo, módulo y día.
 * Pura (testeable): recibe las filas y la resolución de precio por fila.
 */
export function summarizeUsage(
  rows: UsageRow[],
  unitFor: (row: UsageRow) => UnitCost | null,
  days: number
): UsageSummary {
  const totals = emptyBucket();
  const models = new Map<string, UsageModelBucket & { priced: boolean }>();
  const sources = new Map<string, UsageBucket & { source: string; priced: boolean }>();
  const daysMap = new Map<string, UsageBucket & { day: string; priced: boolean }>();

  for (const row of rows) {
    const unit = unitFor(row);
    addToBucket(totals, row, unit);

    const modelKey = `${row.provider}::${row.model}`;
    let mb = models.get(modelKey);
    if (!mb) {
      mb = { ...emptyBucket(), provider: row.provider, model: row.model, unit };
      models.set(modelKey, mb);
    }
    addToBucket(mb, row, unit);

    let sb = sources.get(row.source);
    if (!sb) {
      sb = { ...emptyBucket(), source: row.source };
      sources.set(row.source, sb);
    }
    addToBucket(sb, row, unit);

    const day = row.createdAt.toISOString().slice(0, 10);
    let db_ = daysMap.get(day);
    if (!db_) {
      db_ = { ...emptyBucket(), day };
      daysMap.set(day, db_);
    }
    addToBucket(db_, row, unit);
  }

  const bySize = (a: UsageBucket, b: UsageBucket) =>
    b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut);

  return {
    days,
    totals: finalize(totals),
    byModel: [...models.values()].map(finalize).sort(bySize),
    bySource: [...sources.values()].map(finalize).sort(bySize),
    byDay: [...daysMap.values()].map(finalize).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** Resumen del consumo de la organización en los últimos `days` días. */
export async function getAiUsageSummary(
  organizationId: string,
  days: number
): Promise<UsageSummary> {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(schema.aiUsage)
    .where(
      scoped(schema.aiUsage.organizationId, organizationId, gte(schema.aiUsage.createdAt, cutoff))
    )
    .orderBy(desc(schema.aiUsage.createdAt))
    .limit(10_000);

  const connections = await db
    .select({
      id: schema.aiConnections.id,
      costInPer1M: schema.aiConnections.costInPer1M,
      costOutPer1M: schema.aiConnections.costOutPer1M,
    })
    .from(schema.aiConnections)
    .where(scoped(schema.aiConnections.organizationId, organizationId));
  const overrides = new Map(connections.map((c) => [c.id, c]));

  const unitFor = (row: UsageRow): UnitCost | null => {
    const catalog = lookupUnitCost(row.model);
    const conn = row.connectionId ? overrides.get(row.connectionId) : undefined;
    if (conn && (conn.costInPer1M !== null || conn.costOutPer1M !== null)) {
      return {
        in: conn.costInPer1M ?? catalog?.in ?? 0,
        out: conn.costOutPer1M ?? catalog?.out ?? 0,
      };
    }
    return catalog;
  };

  return summarizeUsage(rows, unitFor, days);
}
