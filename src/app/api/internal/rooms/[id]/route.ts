import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ChatError, deleteGroupRoom, updateGroupRoom } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  addUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  removeUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  /** 022c — pausa reversible de integrantes (dueño/administrador). */
  pauseUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  unpauseUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
});

/**
 * 022 — Administrar grupo: nombre, miembros y pausas (solo dueño/administrador,
 * validado en el server module; los DM no se administran).
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  try {
    await updateGroupRoom({
      organizationId: session.organizationId,
      roomId: id,
      actorId: session.userId,
      actorRole: session.role,
      ...body.data,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});

/** 022c — Elimina el grupo con su historia (solo dueño/administrador). */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    await deleteGroupRoom({
      organizationId: session.organizationId,
      roomId: id,
      actorRole: session.role,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
