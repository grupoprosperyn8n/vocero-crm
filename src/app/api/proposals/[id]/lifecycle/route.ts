import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ProposalError } from "@/server/proposals/service";
import {
  deleteProposal,
  setProposalArchived,
  setProposalOnline,
} from "@/server/proposals/lifecycle";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["archive", "restore", "delete", "online", "offline"]),
});

/**
 * 041e — Ciclo de vida de una gestión:
 *   archive/restore → gerente, propietario y dueño;
 *   delete          → SOLO propietario y dueño;
 *   online/offline  → gerente, propietario y dueño (la publicidad enviada).
 * Todo queda registrado en el historial con quién lo hizo.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  if (!/^prop_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de propuesta inválido");
  }

  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const actor = { id: session.userId, role: session.role };

  try {
    switch (body.data.action) {
      case "archive":
      case "restore": {
        const result = await setProposalArchived({
          organizationId: session.organizationId,
          id,
          actor,
          archived: body.data.action === "archive",
        });
        return Response.json({ ok: true, ...result });
      }
      case "delete": {
        const result = await deleteProposal({
          organizationId: session.organizationId,
          id,
          actor,
        });
        return Response.json({ ok: true, ...result });
      }
      default: {
        const result = await setProposalOnline({
          organizationId: session.organizationId,
          id,
          actor,
          online: body.data.action === "online",
        });
        return Response.json({ ok: true, ...result });
      }
    }
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }

    console.error("[api/proposals lifecycle] error:", err);

    return apiError(500, "internal", "No se pudo completar la acción");
  }
});
