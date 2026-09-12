import { apiError, withAuth } from "@/lib/api";
import { ChatError, listChatMessages, postChatMessage } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 022 — Historial de una sala (solo miembros). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const data = await listChatMessages({
      organizationId: session.organizationId,
      roomId: id,
      meId: session.userId,
    });
    return Response.json(data);
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** 022 — Mandar un mensaje (solo miembros). */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(422, "invalid_body", "El body debe ser JSON válido");
  }
  const body = (raw as { body?: unknown })?.body;
  try {
    const message = await postChatMessage({
      organizationId: session.organizationId,
      roomId: id,
      senderId: session.userId,
      body: typeof body === "string" ? body : "",
    });
    return Response.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
