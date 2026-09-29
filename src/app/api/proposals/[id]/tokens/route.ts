import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  emitCouponTokens,
  listCouponTokens,
  ProposalError,
  setCouponTokenStatus,
} from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 044b-B11 — tokens (vouchers) de un cupón.
 * GET   = listado + resumen (emitidos / canjeados).
 * POST  = emitir más tokens (cantidad 1-200, opcional a nombre de alguien).
 * PATCH = marcar canjeado o volver a emitido (si fue un error).
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  try {
    const data = await listCouponTokens({
      organizationId: session.organizationId,
      proposalId: id,
    });
    return Response.json(data);
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals tokens] error:", err);
    return apiError(500, "internal", "No se pudieron leer los tokens");
  }
});

const emitSchema = z.object({
  cantidad: z.number().int().min(1).max(200),
  issuedToName: z.string().trim().max(160).optional().nullable(),
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  const body = await parseBody(req, emitSchema);
  if (!body.ok) return body.response;
  try {
    const creados = await emitCouponTokens({
      organizationId: session.organizationId,
      proposalId: id,
      cantidad: body.data.cantidad,
      issuedToName: body.data.issuedToName ?? null,
    });
    const data = await listCouponTokens({
      organizationId: session.organizationId,
      proposalId: id,
    });
    return Response.json({ creados, ...data }, { status: 201 });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals tokens emit] error:", err);
    return apiError(500, "internal", "No se pudieron emitir los tokens");
  }
});

const statusSchema = z.object({
  tokenId: z.string().trim().min(4).max(60),
  status: z.enum(["emitido", "canjeado"]),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  const body = await parseBody(req, statusSchema);
  if (!body.ok) return body.response;
  try {
    await setCouponTokenStatus({
      organizationId: session.organizationId,
      proposalId: id,
      tokenId: body.data.tokenId,
      status: body.data.status,
    });
    const data = await listCouponTokens({
      organizationId: session.organizationId,
      proposalId: id,
    });
    return Response.json(data);
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals tokens status] error:", err);
    return apiError(500, "internal", "No se pudo actualizar el token");
  }
});
