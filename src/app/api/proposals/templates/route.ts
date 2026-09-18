import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { teamGate } from "@/server/settings/access";
import {
  deleteProposalTemplate,
  listTemplates,
  ProposalError,
  upsertTemplate,
} from "@/server/proposals/service";

export const dynamic = "force-dynamic";

/**
 * 041 — Plantillas por tipo de sugerencia (imagen publicitaria, logo del
 * emisor, textos, oferta/beneficio y CTA). GET lo ve todo el equipo (lo
 * necesita al armar una propuesta); PUT lo maneja owner/admin (operación,
 * igual que las plantillas del pipeline).
 *
 * 042e — Cada tipo tiene además su NOMBRE VISIBLE (label, para tipos propios)
 * y su GUÍA del asistente (aiPrompt). El negocio puede crear tipos nuevos:
 * el slug va en minúsculas/números/guión bajo. DELETE borra un tipo PROPIO
 * (nunca los del catálogo) y solo si ninguna publicidad lo usa.
 */
export const GET = withAuth(async (session) => {
  const templates = await listTemplates(session.organizationId);
  return Response.json({
    templates,
    viewer: { role: session.role },
  });
});

const putSchema = z.object({
  kind: z.string().trim().min(1).max(40),
  label: z.string().trim().max(60).optional().nullable(),
  aiPrompt: z.string().trim().max(2000).optional().nullable(),
  title: z.string().trim().max(120).optional(),
  subtitle: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().max(1600).optional(),
  productName: z.string().trim().max(120).optional().nullable(),
  offer: z.string().trim().max(400).optional().nullable(),
  benefit: z.string().trim().max(200).optional().nullable(),
  ctaLabel: z.string().trim().max(60).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  ctaKind: z.enum(["link", "pdf", "agenda"]).optional(),
  assetId: z.string().trim().max(60).optional().nullable(),
  logoAssetId: z.string().trim().max(60).optional().nullable(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  try {
    const template = await upsertTemplate({
      organizationId: session.organizationId,
      ...body.data,
    });
    return Response.json({ template });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals templates] error:", err);
    return apiError(500, "internal", "No se pudo guardar la plantilla");
  }
});

const deleteSchema = z.object({
  kind: z.string().trim().min(1).max(40),
});

/** 042e — Eliminar un tipo propio (si no hay publicidades usándolo). */
export const DELETE = withAuth(async (session, req: Request) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;
  try {
    await deleteProposalTemplate(session.organizationId, body.data.kind);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals templates delete] error:", err);
    return apiError(500, "internal", "No se pudo eliminar el tipo");
  }
});
