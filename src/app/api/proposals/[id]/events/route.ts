import { apiError, withAuth } from "@/lib/api";
import { listProposalEvents } from "@/server/proposals/events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 041e — Historial de la gestión: quién la creó, editó, archivó, pausó… */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }

  const events = await listProposalEvents({
    organizationId: session.organizationId,
    proposalId: id,
  });

  return Response.json({ events });
});
