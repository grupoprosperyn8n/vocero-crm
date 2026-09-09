import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { publish } from "@/server/events/bus";
import { serializeConversation, getConversation, updateConversation } from "@/server/inbox/queries";
import { closeConversation } from "@/server/inbox/closure";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  aiEnabled: z.boolean().optional(),
  reactivate: z.boolean().optional(),
  markRead: z.boolean().optional(),
  // 1B: catalogar la conversación desde la bandeja (null la deja sin topic).
  topic: z.string().trim().min(1).max(120).nullable().optional(),
  // 1F: cerrar la conversación: archiva en el CRM (sale de la cola) y emite
  // el webhook saliente con la gestión curada hacia el backend.
  close: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  // 1F: cierre (con curado + webhook saliente). El service es idempotente.
  let closure: Awaited<ReturnType<typeof closeConversation>> | null = null;
  if (body.data.close) {
    try {
      closure = await closeConversation({
        organizationId: session.organizationId,
        conversationId: id,
        closedByUserId: session.userId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError(404, "not_found", msg);
    }
  } else {
    const updated = await updateConversation(session.organizationId, id, body.data);
    if (!updated) return apiError(404, "not_found", "Conversación no encontrada");
  }

  const row = await getConversation(session.organizationId, id);
  if (row) {
    const dto = serializeConversation(row.conversation, row.contact);
    publish(session.organizationId, {
      type: "conversation.updated",
      data: { conversation: dto },
    });
    return Response.json({
      conversation: dto,
      ...(closure ? { closure } : {}),
    });
  }
  return Response.json({ conversation: null });
});
