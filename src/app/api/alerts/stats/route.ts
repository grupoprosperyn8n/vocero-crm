import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isLiveAssignmentStatus } from "@/lib/alerts";
import { airtableListAll } from "@/server/alerts/airtable-read";
import { canManageAlertAssignments } from "@/server/alerts/assignments";

export const dynamic = "force-dynamic";

/**
 * 030 — Estado general de las alertas (administrador, propietario y gerente).
 *
 * Los tres roles ven el MISMO estado general; el filtro `?empleado=` mira el
 * mismo tablero desde un ejecutor. El estado sale de la tabla ALERTAS de
 * Airtable (todas: pendientes, en curso y cerradas — las listas del CRM no
 * muestran las cerradas) y el «por empleado» de las derivaciones del CRM.
 */
let cache: {
  at: number;
  rows: { rec: string; estado: string; tipo: string; prioridad: string }[];
} | null = null;
const CACHE_TTL_MS = 60_000;

async function dataset() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const recs = await airtableListAll("ALERTAS", ["ESTADO", "TIPO_ALERTA", "PRIORIDAD"]);
  const rows = recs.map((r) => ({
    rec: r.id,
    estado: String(r.fields["ESTADO"] ?? "").trim().toUpperCase() || "SIN ESTADO",
    tipo: String(r.fields["TIPO_ALERTA"] ?? "").trim() || "Sin tipo",
    prioridad: String(r.fields["PRIORIDAD"] ?? "").trim() || "Sin prioridad",
  }));
  cache = { at: Date.now(), rows };
  return rows;
}

function cuenta(vals: string[]): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export const GET = withAuth(async (session, req: Request) => {
  if (!canManageAlertAssignments(session.role)) {
    return apiError(403, "forbidden", "El estado general es para administrador, propietario o gerente");
  }
  const empleado = (new URL(req.url).searchParams.get("empleado") ?? "").trim() || null;
  try {
    const rows = await dataset();
    const db = getDb();
    const asign = await db
      .select({
        airtableRecordId: schema.alertAssignment.airtableRecordId,
        alertRef: schema.alertAssignment.alertRef,
        targetName: schema.alertAssignment.targetName,
        status: schema.alertAssignment.status,
      })
      .from(schema.alertAssignment)
      .where(
        scoped(schema.alertAssignment.organizationId, session.organizationId)
      );

    const porEmpleado = new Map<string, { activas: number; concluidas: number }>();
    for (const a of asign) {
      const name = a.targetName || "Sin nombre";
      const cur = porEmpleado.get(name) ?? { activas: 0, concluidas: 0 };
      if (isLiveAssignmentStatus(a.status)) cur.activas += 1;
      else cur.concluidas += 1;
      porEmpleado.set(name, cur);
    }
    const empleados = [...porEmpleado.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.activas + b.concluidas - (a.activas + a.concluidas));

    let scope = rows;
    if (empleado) {
      const refs = new Set(
        asign
          .filter((a) => (a.targetName || "Sin nombre") === empleado)
          .map((a) => a.airtableRecordId || a.alertRef)
          .filter((r): r is string => Boolean(r))
      );
      scope = rows.filter((r) => refs.has(r.rec));
    }

    return Response.json({
      ok: true,
      total: scope.length,
      totalGeneral: rows.length,
      porEstado: cuenta(scope.map((r) => r.estado)),
      porTipo: cuenta(scope.map((r) => r.tipo)).slice(0, 10),
      porPrioridad: cuenta(scope.map((r) => r.prioridad)),
      empleados,
      empleado,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/alerts/stats] error:", err);
    return apiError(502, "backend_error", "No se pudo leer el estado de las alertas");
  }
});
