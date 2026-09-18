import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deriveProposal,
  isPriority,
  ProposalError,
} from "@/server/proposals/service";
import type { ProposalPriority } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  assigneeUserId: z.string().trim().min(1).max(60),
  priority: z.string().trim().refine(isPriority, "prioridad inválida"),
  note: z.string().trim().max(300).optional().nullable(),
});

/**
 * 041 — DERIVAR la propuesta a un empleado del CRM con prioridad, igual que
 * las alertas: queda asignada, se registra en el historial del tablero y el
 * aviso con el link público le llega por el chat interno (DM).
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    const proposal = await deriveProposal({
      organizationId: session.organizationId,
      userId: session.userId,
      id,
      assigneeUserId: body.data.assigneeUserId,
      priority: body.data.priority as ProposalPriority,
      note: body.data.note ?? null,
    });
    return Response.json({ proposal });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals derive] error:", err);
    return apiError(500, "internal", "No se pudo derivar la propuesta");
  }
});
