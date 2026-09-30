import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deletePieceTemplate,
  PieceTemplateError,
  pieceTemplateErrorStatus,
  serializePieceTemplate,
  updatePieceTemplate,
} from "@/server/proposals/piece-templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 044b-B13 — PATCH edita una plantilla del baúl (nombre, segmento, datos, activa). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^btpl_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de plantilla inválido");
  }
  const patchSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    segment: z.string().trim().max(60).optional().nullable(),
    data: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional(),
  });
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  try {
    const row = await updatePieceTemplate(session.organizationId, id, body.data);
    return Response.json({ template: serializePieceTemplate(row) });
  } catch (err) {
    if (err instanceof PieceTemplateError) {
      return apiError(pieceTemplateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});

/** 044b-B13 — DELETE saca una plantilla del baúl. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^btpl_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de plantilla inválido");
  }
  try {
    await deletePieceTemplate(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof PieceTemplateError) {
      return apiError(pieceTemplateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
