import { apiError, withAuth } from "@/lib/api";
import { ChatError, respondTaskRequest } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 037b — Responder un pedido de tarea: aceptar (se suma SOLA al tablero del
 * empleado) o rechazar (con motivo). Solo la persona destinataria puede.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(422, "invalid_body", "El body debe ser JSON válido");
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const decision =
    o.decision === "accept" || o.decision === "reject" ? o.decision : null;
  if (!decision) {
    return apiError(422, "invalid_decision", "Decisión inválida");
  }
  try {
    const message = await respondTaskRequest({
      organizationId: session.organizationId,
      messageId: id,
      userId: session.userId,
      decision,
      reason: typeof o.reason === "string" ? o.reason : null,
    });
    return Response.json({ ok: true, message });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
