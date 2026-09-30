import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createPieceTemplate,
  listPieceTemplates,
  PieceTemplateError,
  pieceTemplateErrorStatus,
  serializePieceTemplate,
} from "@/server/proposals/piece-templates";

export const dynamic = "force-dynamic";

/**
 * 044b-B13 — el BAÚL de plantillas de piezas (publicación/formulario/encuesta/
 * cupón). Lo usan TODOS los roles: GET lista, POST guarda una pieza nueva.
 */
export const GET = withAuth(async (session) => {
  const rows = await listPieceTemplates(session.organizationId);
  return Response.json({ templates: rows.map(serializePieceTemplate) });
});

const createSchema = z.object({
  kind: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  segment: z.string().trim().max(60).optional().nullable(),
  data: z.record(z.string(), z.unknown()),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  try {
    const row = await createPieceTemplate(
      session.organizationId,
      session.userId,
      body.data as { kind: unknown; name: unknown; segment: unknown; data: unknown }
    );
    return Response.json(
      { template: serializePieceTemplate(row) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof PieceTemplateError) {
      return apiError(pieceTemplateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
