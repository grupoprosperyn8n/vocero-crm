import { and, count, desc, inArray } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/**
 * 044b-B13 — el dashboard GENERAL de Resultados: todas las piezas que tienen
 * respuestas (formularios/encuestas) o vouchers (cupones), con sus números.
 * Es la vista de conjunto de la pestaña «Resultados» de Propuestas; cada fila
 * abre el dashboard de esa pieza (el mismo de siempre, sin duplicar vistas).
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const org = session.organizationId;

  const resp = await db
    .select({ proposalId: schema.proposalResponse.proposalId, n: count() })
    .from(schema.proposalResponse)
    .where(scoped(schema.proposalResponse.organizationId, org))
    .groupBy(schema.proposalResponse.proposalId);

  const toks = await db
    .select({
      proposalId: schema.couponToken.proposalId,
      status: schema.couponToken.status,
      n: count(),
    })
    .from(schema.couponToken)
    .where(scoped(schema.couponToken.organizationId, org))
    .groupBy(schema.couponToken.proposalId, schema.couponToken.status);

  const respMap = new Map(resp.map((r) => [r.proposalId, r.n]));
  const toksMap = new Map<string, { emitidos: number; canjeados: number }>();
  for (const t of toks) {
    const cur = toksMap.get(t.proposalId) ?? { emitidos: 0, canjeados: 0 };
    cur.emitidos += t.n;
    if (t.status === "canjeado") cur.canjeados += t.n;
    toksMap.set(t.proposalId, cur);
  }

  const ids = [
    ...new Set([...resp.map((r) => r.proposalId), ...toks.map((t) => t.proposalId)]),
  ];
  if (ids.length === 0) return Response.json({ piezas: [] });

  const piezas = await db
    .select({
      id: schema.proposal.id,
      title: schema.proposal.title,
      kind: schema.proposal.kind,
      token: schema.proposal.token,
      widget: schema.proposal.widget,
      createdAt: schema.proposal.createdAt,
    })
    .from(schema.proposal)
    .where(
      and(scoped(schema.proposal.organizationId, org), inArray(schema.proposal.id, ids))
    )
    .orderBy(desc(schema.proposal.createdAt))
    .limit(200);

  return Response.json({
    piezas: piezas.map((p) => {
      const t = toksMap.get(p.id) ?? { emitidos: 0, canjeados: 0 };
      return {
        id: p.id,
        title: p.title,
        kind: p.kind,
        token: p.token,
        widget: p.widget ?? null,
        createdAt: p.createdAt.toISOString(),
        respuestas: respMap.get(p.id) ?? 0,
        tokensEmitidos: t.emitidos,
        tokensCanjeados: t.canjeados,
      };
    }),
  });
});
