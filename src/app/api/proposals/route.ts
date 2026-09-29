import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import type { ProposalWidget } from "@/lib/types";
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
  const assigneeGroup = url.searchParams.get("assigneeGroup")?.trim() || null;
  const status = url.searchParams.get("status")?.trim() || null;
  const clientRef = url.searchParams.get("clientRef")?.trim() || null;
  // 041e — archivadas: "archived=1" (incluirlas) / "archivedOnly=1" (solo ellas).
  const archived = url.searchParams.get("archived") === "1";
  const archivedOnly = url.searchParams.get("archivedOnly") === "1";
  const { proposals, funnel } = await listProposals({
    organizationId: session.organizationId,
    assigneeUserId: assignee,
    assigneeGroupId: assigneeGroup,
    status,
    clientRef,
    includeArchived: archived || archivedOnly,
    archivedOnly,
    // 041b — gerente/propietario/administrador ven todo; un miembro, lo suyo.
    viewerUserId: session.userId,
    viewerRole: session.role,
  });
  return Response.json({ proposals, funnel, viewer: { userId: session.userId, role: session.role } });
});

const createSchema = z.object({
  kind: z.string().trim().min(1).max(40),
  /** Puede venir vacío: publicaciones para un grupo o alguien sin ficha en el sistema. */
  clientRef: z.string().trim().max(40).optional().nullable(),
  /** B8 — contacto del CRM elegido (prospecto): vincula la publicación a su chat. */
  contactId: z.string().trim().max(64).optional().nullable(),
  clientName: z.string().trim().min(1).max(160),
  clientDni: z.string().trim().max(20).optional().nullable(),
  clientPhone: z.string().trim().max(30).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().max(1600).optional().nullable(),
  productName: z.string().trim().max(120).optional().nullable(),
  productRef: z.string().trim().max(64).optional().nullable(),
  offer: z.string().trim().max(400).optional().nullable(),
  benefit: z.string().trim().max(200).optional().nullable(),
  companyRef: z.string().trim().max(40).optional().nullable(),
  companyName: z.string().trim().max(120).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  ctaKind: z.enum(["link", "pdf", "agenda"]).optional(),
  assetId: z.string().trim().max(60).optional().nullable(),
  logoAssetId: z.string().trim().max(60).optional().nullable(),
  /** 042 — medios en orden: fotos del carrusel + video (mp4/webm). */
  mediaIds: z.array(z.string().trim().max(60)).max(8).optional().nullable(),
  assigneeUserId: z.string().trim().max(60).optional().nullable(),
  priority: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isPriority(v), "prioridad inválida"),
  // 041c — tono y concepto de venta del asistente de publicidad.
  tone: z.enum(["cercana", "formal", "directa", "entusiasta"]).optional().nullable(),
  angle: z
    .enum(["beneficio", "ahorro", "proteccion", "urgencia", "familia", "confianza"])
    .optional()
    .nullable(),
  // 044b-B11 — la pieza especial: formulario, encuesta o cupón/voucher. El
  // detalle interno lo valida y normaliza el servicio (sanitizeWidget).
  widget: z
    .object({ type: z.enum(["form", "survey", "coupon"]) })
    .passthrough()
    .optional()
    .nullable(),
  // 044b-B11 — cupón: cuántos tokens emitir al crearla (0-200).
  emitirTokens: z.number().int().min(0).max(200).optional().nullable(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  try {
    const proposal = await createProposal({
      organizationId: session.organizationId,
      userId: session.userId,
      ...body.data,
      widget: (body.data.widget ?? null) as unknown as ProposalWidget | null,
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
