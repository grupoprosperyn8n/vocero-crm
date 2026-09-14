import { withAuth } from "@/lib/api";
import {
  alertsConfigured,
  listShareTargets,
  resolveEmpleadoForUser,
} from "@/server/alerts/service";

export const dynamic = "force-dynamic";

/**
 * 027b — Destinatarios para compartir una alerta: los empleados del sistema
 * (chat interno) + los grupos del chat interno a los que PERTENECE el
 * empleado vinculado al usuario del CRM. Sin match de empleado: empleados sí,
 * grupos vacíos (el CRM no puede saber a qué grupos pertenece).
 */
export const GET = withAuth(async (session) => {
  if (!alertsConfigured()) {
    return Response.json({ ok: false, configured: false, employees: [], groups: [] });
  }
  try {
    const empleadoRef = await resolveEmpleadoForUser(session.userId);
    const { employees, groups } = await listShareTargets(empleadoRef);
    return Response.json({ ok: true, configured: true, empleadoRef, employees, groups });
  } catch (err) {
    console.error("[api/alerts/share-targets] error:", err);
    return Response.json({
      ok: false,
      configured: true,
      employees: [],
      groups: [],
      error: "No se pudieron cargar los destinatarios",
    });
  }
});
