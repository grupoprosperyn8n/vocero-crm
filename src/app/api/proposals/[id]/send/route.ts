import { apiError, withAuth } from "@/lib/api";
import { markProposalSent, ProposalError } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 041 — «Enviar»: marca la pieza como enviada al cliente, garantiza el
 * contacto/conversación (mismo camino que «Mandar mensaje») y deja el
 * embudo listo para medir respuesta.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  try {
    const proposal = await markProposalSent({
      organizationId: session.organizationId,
      userId: session.userId,
      id,
    });
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals send] error:", err);
    return apiError(500, "internal", "No se pudo registrar el envío");
  }
});
