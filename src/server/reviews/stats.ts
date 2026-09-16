/**
 * 033 — Estadísticas del flujo de siniestros (revisión de envío SGSA).
 *
 * Lee `review_request` completo de la organización y delega en la agregación
 * pura de `@/lib/reviews-stats`. Lo consume el tablero del CRM
 * (`ReviewStatsPanel`, visible para administrador, propietario y gerente).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  aggregateReviewStats,
  type ReviewFlowStats,
  type ReviewStatRow,
} from "@/lib/reviews-stats";

export type ReviewFlowStatsResponse = ReviewFlowStats & {
  dias: number;
  generatedAt: string;
};

export async function reviewFlowStats(
  organizationId: string,
  dias = 30
): Promise<ReviewFlowStatsResponse> {
  const now = new Date();
  const rows = await getDb()
    .select({
      status: schema.reviewRequest.status,
      decidedVia: schema.reviewRequest.decidedVia,
      decidedAt: schema.reviewRequest.decidedAt,
      createdAt: schema.reviewRequest.createdAt,
      payload: schema.reviewRequest.payload,
    })
    .from(schema.reviewRequest)
    .where(eq(schema.reviewRequest.organizationId, organizationId));

  return {
    dias,
    generatedAt: now.toISOString(),
    ...aggregateReviewStats(rows as ReviewStatRow[], { dias, now }),
  };
}
