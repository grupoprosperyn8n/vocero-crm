import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getProposalById, ProposalError } from "@/server/proposals/service";
import { updateProposalContent } from "@/server/proposals/lifecycle";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 041e — Editar los textos de una gestión (queda registrado quién y qué). */
const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().max(2000).optional().nullable(),
  offer: z.string().trim().max(200).optional().nullable(),
  benefit: z.string().trim().max(200).optional().nullable(),
  ctaLabel: z.string().trim().max(40).optional().nullable(),
  productName: z.string().trim().max(120).optional().nullable(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    const { title } = await updateProposalContent({
      organizationId: session.organizationId,
      id,
      actor: { id: session.userId, role: session.role },
      patch: body.data,
    });

    const proposal = await getProposalById(session.organizationId, id);

    return Response.json({ ok: true, title, proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }

    console.error("[api/proposals patch] error:", err);

    return apiError(500, "internal", "No se pudieron guardar los cambios");
  }
});

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
