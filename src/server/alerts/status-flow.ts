import type { AlertStatus } from "@/lib/alerts";
import {
  assumeExecutorIfFree,
  markAlertAssignmentsStatus,
  traceAssignmentStatus,
} from "@/server/alerts/assignments";
import {
  getAlertSharePayload,
  resolveEmpleadoForUser,
  resolveSucursalForUser,
  setAlertStatus,
} from "@/server/alerts/service";

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
  const [empleadoId, sucursalId] = await Promise.all([
    resolveEmpleadoForUser(input.session.userId),
    resolveSucursalForUser(input.session.organizationId, input.session.userId),
  ]);
  await setAlertStatus(input.alertStoreId, input.estado, { empleadoId, sucursalId });

  const payload = await getAlertSharePayload(input.alertStoreId).catch(() => null);
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
