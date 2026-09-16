import { apiError, withAuth } from "@/lib/api";
import { seesWholeTeam } from "@/lib/pipeline";
import { ChatError, createDmRoom, postChatMessage } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

/**
 * 037b — «Pedir tarea»: el gerente/dueño/propietario le crea el pedido a un
 * empleado. La tarjeta viaja al chat interno (se abre/reusa el DM con el
 * empleado) y él la acepta; recién ahí la tarea se suma a su tablero (ver
 * /api/internal/task-requests/[id]). La UI esconde el botón a los members,
 * pero la decisión final se valida ACÁ.
 */
export const POST = withAuth(async (session, req: Request) => {
  if (!seesWholeTeam(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Solo gerentes, dueños o administradores pueden pedir tareas"
    );
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(422, "invalid_body", "El body debe ser JSON válido");
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const toUserId = String(o.toUserId ?? "").trim();
  const title = String(o.title ?? "").trim();
  if (!toUserId || !title) {
    return apiError(422, "missing_fields", "Elegí al empleado y poné un título");
  }
  try {
    const room = await createDmRoom(session.organizationId, session.userId, toUserId);
    const assigneeName =
      room.members.find((m) => m.userId === toUserId)?.name ?? "Empleado";
    const message = await postChatMessage({
      organizationId: session.organizationId,
      roomId: room.id,
      senderId: session.userId,
      body: "",
      task: {
        title,
        notes: o.notes,
        dueAt: o.dueAt,
        priority: o.priority,
        assigneeId: toUserId,
        assigneeName,
      },
    });
    return Response.json({ roomId: room.id, message }, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
