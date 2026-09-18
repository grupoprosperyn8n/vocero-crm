import { apiError, parseBody, withAuth } from "@/lib/api";
import { draftProposalCopy } from "@/server/proposals/copy";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * 041c — Asistente de redacción de la publicidad.
 * POST = escribe (o reescribe) la pieza o el mensaje con el tono y el
 * concepto de venta elegidos, sobre la conexión de IA del CRM.
 */
const copySchema = z.object({
  target: z.enum(["pieza", "mensaje"]),
  tone: z.enum(["cercana", "formal", "directa", "entusiasta"]),
  angle: z
    .enum(["beneficio", "ahorro", "proteccion", "urgencia", "familia", "confianza"])
    .optional()
    .nullable(),
  instructions: z.string().trim().max(400).optional().nullable(),
  clientName: z.string().trim().min(1).max(120),
  kind: z.string().trim().min(1).max(60),
  productName: z.string().trim().max(120).optional().nullable(),
  companyName: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().max(160).optional().nullable(),
  subtitle: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().max(2000).optional().nullable(),
  offer: z.string().trim().max(200).optional().nullable(),
  benefit: z.string().trim().max(160).optional().nullable(),
  ctaLabel: z.string().trim().max(40).optional().nullable(),
  draftMessage: z.string().trim().max(900).optional().nullable(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, copySchema);

  if (!body.ok) {
    return body.response;
  }

  const result = await draftProposalCopy({
    organizationId: session.organizationId,
    context: body.data,
  });

  if (!result.ok) {
    return apiError(result.status, result.code, result.message);
  }

  return Response.json({
    copy: result.copy,
    tone: body.data.tone,
    angle: body.data.angle ?? null,
  });
});
