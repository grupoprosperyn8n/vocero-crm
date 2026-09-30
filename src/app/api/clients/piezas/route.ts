import { and, desc, eq, or } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/**
 * 044b-B13 — el dashboard INDIVIDUAL del cliente dentro del CRM:
 * sus respuestas a formularios/encuestas y sus vouchers de cupón.
 * Se abre desde la ficha del cliente (misma vista que Cliente 360°) y desde
 * Cola de hoy · Retención · Reactivación · Venta cruzada.
 *
 * GET /api/clients/piezas?ref=<ficha>&name=<nombre>&phone=<tel>&contactId=<crm>
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const ref = url.searchParams.get("ref")?.trim() || null;
  const name = url.searchParams.get("name")?.trim() || null;
  const phone = url.searchParams.get("phone")?.trim() || null;
  const contactId = url.searchParams.get("contactId")?.trim() || null;

  const org = session.organizationId;

  /* Piezas del cliente: por ficha (client_ref), contacto del CRM, nombre o teléfono. */
  const porPieza = [
    ref ? eq(schema.proposal.clientRef, ref) : null,
    contactId ? eq(schema.proposal.contactId, contactId) : null,
    name ? eq(schema.proposal.clientName, name) : null,
    phone ? eq(schema.proposal.clientPhone, phone) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  if (porPieza.length === 0) {
    return Response.json({ respuestas: [], vouchers: [] });
  }

  const db = getDb();

  const respuestas = await db
    .select({
      id: schema.proposalResponse.id,
      kind: schema.proposalResponse.kind,
      data: schema.proposalResponse.data,
      clientName: schema.proposalResponse.clientName,
      createdAt: schema.proposalResponse.createdAt,
      proposalId: schema.proposal.id,
      proposalTitle: schema.proposal.title,
      proposalKind: schema.proposal.kind,
      proposalToken: schema.proposal.token,
    })
    .from(schema.proposalResponse)
    .innerJoin(
      schema.proposal,
      eq(schema.proposalResponse.proposalId, schema.proposal.id)
    )
    .where(
      and(
        scoped(schema.proposalResponse.organizationId, org),
        or(...porPieza)
      )
    )
    .orderBy(desc(schema.proposalResponse.createdAt))
    .limit(80);

  /* Vouchers: por la pieza del cliente, por contacto del CRM o por nombre. */
  const porToken = [
    contactId ? eq(schema.couponToken.contactId, contactId) : null,
    name ? eq(schema.couponToken.issuedToName, name) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const vouchers = await db
    .select({
      id: schema.couponToken.id,
      token: schema.couponToken.token,
      status: schema.couponToken.status,
      issuedToName: schema.couponToken.issuedToName,
      redeemedAt: schema.couponToken.redeemedAt,
      createdAt: schema.couponToken.createdAt,
      proposalId: schema.proposal.id,
      proposalTitle: schema.proposal.title,
      proposalToken: schema.proposal.token,
    })
    .from(schema.couponToken)
    .innerJoin(schema.proposal, eq(schema.couponToken.proposalId, schema.proposal.id))
    .where(
      and(
        scoped(schema.couponToken.organizationId, org),
        or(...porPieza, ...porToken)
      )
    )
    .orderBy(desc(schema.couponToken.createdAt))
    .limit(80);

  return Response.json({
    respuestas: respuestas.map((r) => ({
      id: r.id,
      kind: r.kind,
      data: r.data ?? [],
      clientName: r.clientName,
      createdAt: r.createdAt.toISOString(),
      proposalId: r.proposalId,
      proposalTitle: r.proposalTitle,
      proposalKind: r.proposalKind,
      proposalToken: r.proposalToken,
    })),
    vouchers: vouchers.map((v) => ({
      id: v.id,
      token: v.token,
      status: v.status,
      issuedToName: v.issuedToName,
      redeemedAt: v.redeemedAt ? v.redeemedAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      proposalId: v.proposalId,
      proposalTitle: v.proposalTitle,
      proposalToken: v.proposalToken,
    })),
  });
});
