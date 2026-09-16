import { apiError, withAuth } from "@/lib/api";
import { ChatError } from "@/server/internal/chat";
import { decideReview } from "@/server/reviews/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

/**
 * 033 — Decisión de una revisión desde el chat interno (✅ aprobar / 🛑
 * detener). Dispara el MISMO webhook del flujo que los botones de Telegram:
 * el lock del flujo evita el doble envío y la tarjeta registra quién decidió
 * y por dónde. Solo puede decidir quien participa de la sala que recibió la
 * tarjeta.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { recordId } = await ctx.params;
  const id = decodeURIComponent(recordId);
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return apiError(400, "invalid_record", "Registro inválido");
  }
  let body: { decision?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido");
  }
  const decision =
    body.decision === "approve" || body.decision === "hold"
      ? body.decision
      : null;
  if (!decision) {
    return apiError(422, "invalid_decision", "Decisión inválida");
  }
  try {
    const result = await decideReview({
      session: {
        userId: session.userId,
        organizationId: session.organizationId,
      },
      recordId: id,
      decision,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ChatError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
});
