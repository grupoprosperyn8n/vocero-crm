import { and, eq, inArray } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import {
  AlertsBackendError,
  alertsConfigured,
  getAlertSharePayload,
} from "@/server/alerts/service";
import { ChatError, createDmRoom, postChatMessage } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 027c — Comparte una alerta en el chat interno LOCAL de Vocero. Para empleados
 * abre/reusa DM local; para grupos publica directo en la sala local existente.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de alerta inválido");
  }
  if (!alertsConfigured()) {
    return apiError(404, "not_found", "Alertas no configuradas");
  }

  let body: { empleados?: unknown; grupos?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido");
  }

  const empleados = Array.isArray(body.empleados)
    ? body.empleados
        .filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(x))
        .filter((x) => x !== session.userId)
        .slice(0, 100)
    : [];
  const grupos = Array.isArray(body.grupos)
    ? body.grupos
        .filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(x))
        .slice(0, 50)
    : [];
  if (!empleados.length && !grupos.length) {
    return apiError(400, "invalid_targets", "Elegí al menos un empleado o grupo");
  }

  try {
    const payload = await getAlertSharePayload(id);
    if (!payload) {
      return apiError(404, "not_found", "No se encontró la alerta");
    }
    const db = getDb();
    const userRows = empleados.length
      ? await db
          .select({ userId: schema.user.id, name: schema.user.name })
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
          .where(
            and(
              eq(schema.member.organizationId, session.organizationId),
              inArray(schema.member.userId, empleados)
            )
          )
      : [];
    const nameByUser = new Map(
      userRows.map((u) => [u.userId, u.name?.trim() || "Empleado"])
    );

    const compartidaCon: string[] = [];
    const chatGrupos: string[] = [];
    const gruposOk: string[] = [];
    const errores: string[] = [];

    for (const employeeId of empleados) {
      try {
        const room = await createDmRoom(
          session.organizationId,
          session.userId,
          employeeId
        );
        await postChatMessage({
          organizationId: session.organizationId,
          roomId: room.id,
          senderId: session.userId,
          body: "",
          alert: payload,
        });
        compartidaCon.push(nameByUser.get(employeeId) ?? employeeId);
      } catch (err) {
        errores.push(
          err instanceof ChatError
            ? `${nameByUser.get(employeeId) ?? employeeId}: ${err.message}`
            : `${nameByUser.get(employeeId) ?? employeeId}: no se pudo compartir`
        );
      }
    }

    for (const roomId of grupos) {
      try {
        await postChatMessage({
          organizationId: session.organizationId,
          roomId,
          senderId: session.userId,
          body: "",
          alert: payload,
        });
        chatGrupos.push(roomId);
        gruposOk.push(roomId);
      } catch (err) {
        errores.push(
          err instanceof ChatError
            ? `Grupo ${roomId}: ${err.message}`
            : `Grupo ${roomId}: no se pudo compartir`
        );
      }
    }

    return Response.json({
      ok: true,
      compartidaCon,
      grupos: gruposOk,
      chatGrupos,
      errores,
    });
  } catch (err) {
    console.error("[api/alerts share] error:", err);
    const status = err instanceof AlertsBackendError ? (err.status ?? 502) : 502;
    return apiError(
      status >= 400 && status < 600 ? status : 502,
      "backend_error",
      "No se pudo compartir la alerta"
    );
  }
});
