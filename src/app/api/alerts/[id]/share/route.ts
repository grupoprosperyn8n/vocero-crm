import { apiError, withAuth } from "@/lib/api";
import {
  AlertsBackendError,
  alertsConfigured,
  resolveEmpleadoForUser,
  shareAlert,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 027b — Compartir una alerta (espejo del share de la PWA): empleados y/o
 * grupos del chat interno. El backend SGSA expande los grupos a sus miembros
 * y postea el aviso DENTRO del chat del grupo. `empleado_que_comparte` viaja
 * resuelto por email → EMPLEADOS, igual que en ack/status.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) {
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
        .filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{5,40}$/.test(x))
        .slice(0, 100)
    : [];
  const grupos = Array.isArray(body.grupos)
    ? body.grupos
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x > 0)
        .slice(0, 50)
    : [];
  if (!empleados.length && !grupos.length) {
    return apiError(400, "invalid_targets", "Elegí al menos un empleado o grupo");
  }

  try {
    const empleadoRef = await resolveEmpleadoForUser(session.userId);
    const result = await shareAlert(id, { empleados, grupos, empleadoRef });
    return Response.json({ ok: true, ...result });
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
