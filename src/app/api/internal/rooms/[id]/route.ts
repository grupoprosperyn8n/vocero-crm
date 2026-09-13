import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  ChatError,
  deleteGroupRoom,
  setRoomArchivedForUser,
  updateGroupRoom,
} from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  addUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  removeUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  /** 022c — pausa reversible de integrantes (dueño/administrador). */
  pauseUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  unpauseUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  /** 026 — archivar la sala SOLO para mí (cualquier miembro). */
  archived: z.boolean().optional(),
});

/**
 * 022 — Administrar grupo: nombre, miembros y pausas (solo dueño/administrador,
 * validado en el server module; los DM no se administran). 026 — `archived`
 * es personal: lo puede tocar cualquier integrante.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  // 026: archivar/desarchivar MI vista de la sala (no requiere ser admin).
  if (body.data.archived !== undefined) {
    try {
      const r = await setRoomArchivedForUser({
        organizationId: session.organizationId,
        roomId: id,
        userId: session.userId,
        archived: body.data.archived,
      });
      return Response.json({ ok: true, ...r });
    } catch (err) {
      if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
      throw err;
    }
  }
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
