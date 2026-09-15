import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { onlineUserIds } from "@/server/events/presence";
import { canManageAlertAssignments } from "@/server/alerts/assignments";
import { alertsConfigured } from "@/server/alerts/service";

export const dynamic = "force-dynamic";

/**
 * 027c — Destinatarios locales para compartir una alerta.
 *
 * Los empleados son usuarios locales del CRM (DM por /api/internal/rooms) y los
 * grupos son salas locales del chat interno donde participa el usuario actual.
 * `airtableId` se conserva por compatibilidad con el diálogo viejo, pero ahora
 * contiene el userId local de Vocero.
 */
export const GET = withAuth(async (session) => {
  if (!alertsConfigured()) {
    return Response.json({ ok: false, configured: false, employees: [], groups: [] });
  }
  try {
    const db = getDb();
    const online = new Set(onlineUserIds(session.organizationId));

    const employeeRows = await db
      .select({ userId: schema.member.userId, nombre: schema.user.name })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, session.organizationId))
      .orderBy(asc(schema.user.name));

    const employees = employeeRows
      .filter((e) => e.userId !== session.userId)
      .map((e) => ({
        airtableId: e.userId,
        nombre: e.nombre || "Empleado",
        online: online.has(e.userId),
      }))
      .sort(
        (a, b) =>
          Number(b.online) - Number(a.online) ||
          a.nombre.localeCompare(b.nombre, "es")
      );

    const canManage = canManageAlertAssignments(session.role);
    const myGroups = canManage
      ? []
      : await db
          .select({ roomId: schema.chatRoomMember.roomId })
          .from(schema.chatRoomMember)
          .where(
            and(
              eq(schema.chatRoomMember.organizationId, session.organizationId),
              eq(schema.chatRoomMember.userId, session.userId),
              isNull(schema.chatRoomMember.pausedAt)
            )
          );
    const groupIds = myGroups.map((g) => g.roomId);
    const myGroupIdSet = new Set(groupIds);
    const groupRows = canManage
      ? await db
          .select({ id: schema.chatRoom.id, nombre: schema.chatRoom.name })
          .from(schema.chatRoom)
          .where(
            and(
              eq(schema.chatRoom.organizationId, session.organizationId),
              eq(schema.chatRoom.kind, "group")
            )
          )
          .orderBy(asc(schema.chatRoom.name))
      : groupIds.length
        ? await db
            .select({ id: schema.chatRoom.id, nombre: schema.chatRoom.name })
            .from(schema.chatRoom)
            .where(
              and(
                eq(schema.chatRoom.organizationId, session.organizationId),
                eq(schema.chatRoom.kind, "group"),
                inArray(schema.chatRoom.id, groupIds)
              )
            )
            .orderBy(asc(schema.chatRoom.name))
        : [];

    const groups = groupRows.map((g) => ({
      id: g.id,
      nombre: g.nombre?.trim() || "Grupo",
      // 028 — un manager ve TODOS los grupos para configurar reglas; el flag
      // dice si el usuario escribe ahí (Compartir solo avisa donde escribe).
      member: myGroupIdSet.has(g.id),
    }));

    return Response.json({
      ok: true,
      configured: true,
      // Compatibilidad con el diálogo; ya no depende del empleado SGSA.
      empleadoRef: session.userId,
      employees,
      groups,
    });
  } catch (err) {
    console.error("[api/alerts/share-targets] error:", err);
    return Response.json({
      ok: false,
      configured: true,
      empleadoRef: null,
      employees: [],
      groups: [],
      error: "No se pudieron cargar los destinatarios",
    });
  }
});
