import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { shareProposal, ProposalError } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  /** Cliente del sistema (Airtable) — uno de estos dos, no ambos. */
  clientRef: z.string().trim().max(60).optional().nullable(),
  /** Contacto del CRM (prospecto del WhatsApp). */
  contactId: z.string().trim().max(64).optional().nullable(),
  clientName: z.string().trim().max(160).optional().nullable(),
  clientPhone: z.string().trim().max(40).optional().nullable(),
});

/**
 * B9 — COMPARTIR la publicación creada a un cliente directo: del sistema o
 * un contacto del CRM. La pieza queda con ese destinatario (y su conversación
 * al enviar). Queda registrado en el historial quién la compartió y a quién.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    const proposal = await shareProposal({
      organizationId: session.organizationId,
      userId: session.userId,
      id,
      clientRef: body.data.clientRef ?? null,
      contactId: body.data.contactId ?? null,
      clientName: body.data.clientName ?? null,
      clientPhone: body.data.clientPhone ?? null,
    });
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals share] error:", err);
    return apiError(500, "internal", "No se pudo compartir la publicación");
  }
});
