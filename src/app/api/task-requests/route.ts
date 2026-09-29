import { and, inArray } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
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

  // 044b-B10 — contactos del pedido: uno o varios, del CRM o del sistema.
  // Los del CRM se validan contra la organización; los del sistema viajan
  // con su recordId (rec…).
  const rawContacts = Array.isArray(o.contacts) ? o.contacts : [];
  const taskContacts = rawContacts
    .slice(0, 12)
    .map((c) => {
      const cc = (c ?? {}) as Record<string, unknown>;
      const kind =
        cc.kind === "sgsa_client"
          ? ("sgsa_client" as const)
          : cc.kind === "contact"
            ? ("contact" as const)
            : null;
      const id = String(cc.id ?? "").trim().slice(0, 64);
      const label = String(cc.label ?? "").trim().slice(0, 120);
      if (!kind || !id || !label) return null;
      return { kind, id, label };
    })
    .filter(
      (c): c is { kind: "contact" | "sgsa_client"; id: string; label: string } =>
        c !== null
    );
  if (taskContacts.length > 0) {
    const crmIds = taskContacts
      .filter((c) => c.kind === "contact")
      .map((c) => c.id);
    if (crmIds.length > 0) {
      const db = getDb();
      const valid = await db
        .select({ id: schema.contact.id })
        .from(schema.contact)
        .where(
          and(
            scoped(schema.contact.organizationId, session.organizationId),
            inArray(schema.contact.id, crmIds)
          )
        );
      const ok = new Set(valid.map((v) => v.id));
      for (const c of taskContacts) {
        if (c.kind === "contact" && !ok.has(c.id)) {
          return apiError(
            422,
            "invalid_contact",
            "Uno de los contactos del CRM no existe en este CRM"
          );
        }
      }
    }
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
        contacts: taskContacts,
      },
    });
    return Response.json({ roomId: room.id, message }, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    throw err;
  }
});
