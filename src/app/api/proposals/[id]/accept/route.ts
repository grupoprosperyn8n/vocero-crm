import { apiError, withAuth } from "@/lib/api";
import { acceptProposalGroup, ProposalError } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * B9 — ACEPTAR la gestión: la publicación está derivada a un grupo del chat
 * interno y este endpoint marca QUIÉN la toma (acceptedBy/acceptedAt), avisa
 * a la sala del grupo y lo deja en el historial. Idempotente: la primera
 * aceptación gana.
 */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  try {
    const proposal = await acceptProposalGroup({
      organizationId: session.organizationId,
      userId: session.userId,
      id,
    });
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals accept] error:", err);
    return apiError(500, "internal", "No se pudo aceptar la gestión");
  }
});
