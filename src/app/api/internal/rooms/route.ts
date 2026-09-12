import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  ChatError,
  createDmRoom,
  createGroupRoom,
  listRoomsForUser,
} from "@/server/internal/chat";

export const dynamic = "force-dynamic";

/** 022 — Mis salas del chat interno (con último mensaje y no leídos). */
export const GET = withAuth(async (session) => {
  const rooms = await listRoomsForUser(session.organizationId, session.userId);
  return Response.json({ rooms });
});

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("dm"),
    userId: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("group"),
    name: z.string().trim().min(1).max(80),
    memberIds: z.array(z.string().trim().min(1)).min(1).max(50),
  }),
]);

/**
 * 022 — Abre un DM (cualquier empleado) o crea un grupo (solo dueño/admin,
 * también validado en el server module).
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  try {
    const room =
      body.data.kind === "dm"
        ? await createDmRoom(session.organizationId, session.userId, body.data.userId)
        : await createGroupRoom({
            organizationId: session.organizationId,
            creatorId: session.userId,
            creatorRole: session.role,
            name: body.data.name,
            memberIds: body.data.memberIds,
          });
    return Response.json({ room }, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
