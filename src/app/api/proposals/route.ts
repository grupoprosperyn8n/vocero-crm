import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createProposal,
  isPriority,
  listProposals,
  ProposalError,
} from "@/server/proposals/service";

export const dynamic = "force-dynamic";

/**
 * 041 — Propuestas comerciales del Cliente 360°.
 * GET  = lista con embudo (filtros: asignado, estado, cliente).
 * POST = crea una propuesta (borrador) a partir de la plantilla del tipo.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const assignee = url.searchParams.get("assignee")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const clientRef = url.searchParams.get("clientRef")?.trim() || null;
  const { proposals, funnel } = await listProposals({
    organizationId: session.organizationId,
    assigneeUserId: assignee,
    status,
    clientRef,
  });
  return Response.json({ proposals, funnel, viewer: { userId: session.userId, role: session.role } });
});

const createSchema = z.object({
  kind: z.string().trim().min(1).max(40),
  clientRef: z.string().trim().min(4).max(40),
  clientName: z.string().trim().min(1).max(160),
  clientDni: z.string().trim().max(20).optional().nullable(),
  clientPhone: z.string().trim().max(30).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().max(1600).optional().nullable(),
  productName: z.string().trim().max(120).optional().nullable(),
  offer: z.string().trim().max(400).optional().nullable(),
  benefit: z.string().trim().max(200).optional().nullable(),
  companyRef: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(120).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  ctaKind: z.enum(["link", "pdf"]).optional(),
  assetId: z.string().trim().max(60).optional().nullable(),
  logoAssetId: z.string().trim().max(60).optional().nullable(),
  assigneeUserId: z.string().trim().max(60).optional().nullable(),
  priority: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isPriority(v), "prioridad inválida"),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  try {
    const proposal = await createProposal({
      organizationId: session.organizationId,
      userId: session.userId,
      ...body.data,
      priority: body.data.priority && isPriority(body.data.priority) ? body.data.priority : "media",
    });
    return Response.json({ proposal }, { status: 201 });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals] error:", err);
    return apiError(500, "internal", "No se pudo crear la propuesta");
  }
});
