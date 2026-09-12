import { apiError, withAuth } from "@/lib/api";
import { ChatError, markRoomRead } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 022 — Marcar la sala como leída (apaga el badge de no leídos). */
export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const lastReadAt = await markRoomRead(session.organizationId, id, session.userId);
    return Response.json({ ok: true, lastReadAt });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
