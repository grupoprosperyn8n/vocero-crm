import { apiError, withAuth } from "@/lib/api";
import { getProposalById, ProposalError } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 041 — Detalle de una propuesta (con su URL pública y métricas). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  try {
    const proposal = await getProposalById(session.organizationId, id);
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
});
