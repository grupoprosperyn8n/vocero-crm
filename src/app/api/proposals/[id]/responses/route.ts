import { apiError, withAuth } from "@/lib/api";
import { listProposalResponses, ProposalError } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 044b-B11 — respuestas recibidas por un formulario o encuesta de esta pieza.
 * GET = listado para el panel del negocio (lo más nuevo primero).
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  try {
    const responses = await listProposalResponses({
      organizationId: session.organizationId,
      proposalId: id,
    });
    return Response.json({ responses, total: responses.length });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals responses] error:", err);
    return apiError(500, "internal", "No se pudieron leer las respuestas");
  }
});
