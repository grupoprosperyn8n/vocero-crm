import { eq, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { isLiveAssignmentStatus, type AlertStatus } from "@/lib/alerts";
import {
  activeGroupIdsForUser,
  assumeExecutorIfFree,
  canManageAlertAssignments,
  markAlertAssignmentsStatus,
  traceAssignmentStatus,
} from "@/server/alerts/assignments";
import {
  getAlertSharePayload,
  resolveEmpleadoForUser,
  resolveSucursalForUser,
  setAlertStatus,
} from "@/server/alerts/service";

/** 030 — la alerta ya tiene un ejecutor vivo que no es quien intenta gestionarla. */
export class AlertBusyError extends Error {
  constructor(public readonly ejecutor: string) {
    super(`La está gestionando ${ejecutor} — un solo ejecutor por vez`);
    this.name = "AlertBusyError";
  }
}

/**
 * 030 — «solo puede gestionar UN empleado a la vez»: si la alerta ya tiene un
 * ejecutor vivo y quien la toca no es él, se bloquea. Administrador,
 * propietario y gerente pasan por encima (son quienes derivan y corrigen);
 * los grupos no bloquean (varios miembros trabajan a la vez).
 */
export async function assertAlertFreeFor(input: {
  session: { userId: string; organizationId: string; role: string };
  alertStoreId: string;
  airtableRecordId?: string | null;
}): Promise<void> {
  if (canManageAlertAssignments(input.session.role)) return;
  const db = getDb();
  const rows = await db
    .select({
      targetKind: schema.alertAssignment.targetKind,
      targetId: schema.alertAssignment.targetId,
      targetName: schema.alertAssignment.targetName,
      status: schema.alertAssignment.status,
    })
    .from(schema.alertAssignment)
    .where(
      scoped(
        schema.alertAssignment.organizationId,
        input.session.organizationId,
        input.airtableRecordId
          ? or(
              eq(schema.alertAssignment.alertStoreId, input.alertStoreId),
              eq(schema.alertAssignment.airtableRecordId, input.airtableRecordId)
            )
          : eq(schema.alertAssignment.alertStoreId, input.alertStoreId)
      )
    );
  const live = rows.filter((r) => isLiveAssignmentStatus(r.status));
  if (!live.length) return;
  const [miEmpleado, misGrupos] = await Promise.all([
    resolveEmpleadoForUser(input.session.userId).catch(() => null),
    activeGroupIdsForUser(input.session.organizationId, input.session.userId),
  ]);
  const soyParte = live.some(
    (r) =>
      (r.targetKind === "employee" &&
        (r.targetId === input.session.userId || (!!miEmpleado && r.targetId === miEmpleado))) ||
      (r.targetKind === "group" && misGrupos.has(r.targetId))
  );
  if (!soyParte) {
    const quien =
      live.find((r) => r.targetKind === "employee")?.targetName ?? live[0]!.targetName;
    throw new AlertBusyError(quien || "otros");
  }
}

/**
 * 030 — el ÚNICO camino de cambio de estado de una alerta desde el CRM:
 * backend (la tabla ALERTA) → fila del ejecutor → traza en Airtable.
 *
 * Lo usan la ruta de estado de Alertas y la sincronización del pipeline: dos
 * copias harían que una se olvide de la otra y el estado mentiría en alguna
 * punta.
 */
export async function changeAlertStatusFromCrm(input: {
  session: { userId: string; organizationId: string; role: string };
  alertStoreId: string;
  estado: AlertStatus;
}): Promise<void> {
  const [empleadoId, sucursalId, payload] = await Promise.all([
    resolveEmpleadoForUser(input.session.userId),
    resolveSucursalForUser(input.session.organizationId, input.session.userId),
    getAlertSharePayload(input.alertStoreId).catch(() => null),
  ]);

  // «Solo un ejecutor por vez» — antes de tocar nada.
  await assertAlertFreeFor({
    session: input.session,
    alertStoreId: input.alertStoreId,
    airtableRecordId: payload?.airtableRecordId ?? null,
  });

  await setAlertStatus(input.alertStoreId, input.estado, { empleadoId, sucursalId });

  await markAlertAssignmentsStatus({
    organizationId: input.session.organizationId,
    alertStoreId: input.alertStoreId,
    airtableRecordId: payload?.airtableRecordId ?? null,
    status: input.estado,
  }).catch(() => null);

  // 030 — «asumida»: estado cambiado sin derivación previa → el ejecutor es
  // quien lo hizo; como toda derivación, queda cerrada para otros.
  await assumeExecutorIfFree({
    session: input.session,
    alertStoreId: input.alertStoreId,
    airtableRecordId: payload?.airtableRecordId ?? null,
    alertType: payload?.type ?? "GENERICA",
    status: input.estado,
  }).catch(() => null);

  await traceAssignmentStatus({
    organizationId: input.session.organizationId,
    alertStoreId: input.alertStoreId,
    status: input.estado,
  }).catch(() => null);
}
