import { and, asc, eq, inArray, or } from "drizzle-orm";
import { canSeeAllInbox } from "@/lib/roles";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import type { ChatAlertShareDto, SgsaAlertDto } from "@/lib/types";
import { createDmRoom, postChatMessage } from "@/server/internal/chat";
import { alertSharePayload, resolveEmpleadoForUser } from "@/server/alerts/service";
import { withClientRecordIds } from "@/server/alerts/client-record";

type SessionLike = { userId: string; organizationId: string; role: string };

type AssignmentTarget = {
  kind: "employee" | "group";
  id: string;
  name: string;
};

export type AlertRuleView = {
  id: string;
  alertType: string;
  targetKind: "employee" | "group";
  targetId: string;
  targetName: string;
  createdAt: string;
};

export function canManageAlertAssignments(role: string): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * 030 — ¿La derivación sigue VIVA? (mientras lo esté, la alerta pertenece a
 * su ejecutor y no se re-deriva a otro). Cerrada con CONCLUIDA/ANULADA la
 * alerta terminó: ya no hay nada que re-derivar.
 */
export function isActiveAssignmentStatus(status: string): boolean {
  const s = status.toUpperCase();
  return s !== "CONCLUIDA" && s !== "ANULADA";
}

/** Nombres visibles del estado del ejecutor para mensajes («En progreso»). */
export function assignmentStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "ASSIGNED":
      return "derivada (sin empezar)";
    case "EN_PROGRESO":
      return "en progreso";
    case "TURNO_CONFIRMADO":
      return "turno confirmado";
    case "CONCLUIDA":
      return "concluida";
    case "ANULADA":
      return "anulada";
    default:
      return status.toLowerCase();
  }
}

function alertRef(alert: Pick<SgsaAlertDto, "id" | "airtableRecordId">): string {
  return alert.airtableRecordId || alert.id;
}

function cleanTargetIds(xs: unknown, max: number): string[] {
  if (!Array.isArray(xs)) return [];
  return Array.from(
    new Set(
      xs
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter((x) => /^[A-Za-z0-9_-]{1,80}$/.test(x))
    )
  ).slice(0, max);
}

export function parseAssignmentTargets(body: {
  empleados?: unknown;
  grupos?: unknown;
}): { empleados: string[]; grupos: string[] } {
  return {
    empleados: cleanTargetIds(body.empleados, 100),
    grupos: cleanTargetIds(body.grupos, 50),
  };
}

export async function listAlertRules(organizationId: string): Promise<AlertRuleView[]> {
  const rows = await getDb()
    .select({
      id: schema.alertAssignmentRule.id,
      alertType: schema.alertAssignmentRule.alertType,
      targetKind: schema.alertAssignmentRule.targetKind,
      targetId: schema.alertAssignmentRule.targetId,
      targetName: schema.alertAssignmentRule.targetName,
      createdAt: schema.alertAssignmentRule.createdAt,
    })
    .from(schema.alertAssignmentRule)
    .where(
      and(
        eq(schema.alertAssignmentRule.organizationId, organizationId),
        eq(schema.alertAssignmentRule.active, true)
      )
    )
    .orderBy(asc(schema.alertAssignmentRule.alertType), asc(schema.alertAssignmentRule.targetName));

  return rows.map((r) => ({
    ...r,
    targetKind: r.targetKind === "group" ? "group" : "employee",
    createdAt: r.createdAt.toISOString(),
  }));
}

async function targetNames(
  organizationId: string,
  targets: { empleados: string[]; grupos: string[] }
): Promise<AssignmentTarget[]> {
  const db = getDb();
  const result: AssignmentTarget[] = [];

  if (targets.empleados.length) {
    const rows = await db
      .select({ userId: schema.member.userId, name: schema.user.name })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(
        and(
          eq(schema.member.organizationId, organizationId),
          inArray(schema.member.userId, targets.empleados)
        )
      );
    for (const row of rows) {
      result.push({ kind: "employee", id: row.userId, name: row.name?.trim() || "Empleado" });
    }
  }

  if (targets.grupos.length) {
    const rows = await db
      .select({ id: schema.chatRoom.id, name: schema.chatRoom.name })
      .from(schema.chatRoom)
      .where(
        and(
          eq(schema.chatRoom.organizationId, organizationId),
          eq(schema.chatRoom.kind, "group"),
          inArray(schema.chatRoom.id, targets.grupos)
        )
      );
    for (const row of rows) {
      result.push({ kind: "group", id: row.id, name: row.name?.trim() || "Grupo" });
    }
  }

  return result;
}

export async function replaceAlertRules(input: {
  session: SessionLike;
  alertType: string;
  targets: { empleados: string[]; grupos: string[] };
}): Promise<AlertRuleView[]> {
  const alertType = input.alertType.trim().toUpperCase().slice(0, 80);
  if (!alertType) return [];
  const db = getDb();
  const targets = await targetNames(input.session.organizationId, input.targets);

  await db
    .update(schema.alertAssignmentRule)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(schema.alertAssignmentRule.organizationId, input.session.organizationId),
        eq(schema.alertAssignmentRule.alertType, alertType),
        eq(schema.alertAssignmentRule.active, true)
      )
    );

  if (targets.length) {
    await db.insert(schema.alertAssignmentRule).values(
      targets.map((t) => ({
        id: newId("alertAssignmentRule"),
        organizationId: input.session.organizationId,
        alertType,
        targetKind: t.kind,
        targetId: t.id,
        targetName: t.name,
        active: true,
        createdBy: input.session.userId,
        updatedAt: new Date(),
      }))
    );
  }

  return listAlertRules(input.session.organizationId);
}

async function activeGroupIdsForUser(organizationId: string, userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ roomId: schema.chatRoomMember.roomId })
    .from(schema.chatRoomMember)
    .innerJoin(schema.chatRoom, eq(schema.chatRoom.id, schema.chatRoomMember.roomId))
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        eq(schema.chatRoomMember.userId, userId),
        eq(schema.chatRoom.kind, "group")
      )
    );
  return new Set(rows.map((r) => r.roomId));
}

export async function ensureRuleAssignments(
  session: SessionLike,
  alerts: SgsaAlertDto[]
): Promise<void> {
  if (!alerts.length) return;
  const rules = await getDb()
    .select()
    .from(schema.alertAssignmentRule)
    .where(
      and(
        eq(schema.alertAssignmentRule.organizationId, session.organizationId),
        eq(schema.alertAssignmentRule.active, true)
      )
    );
  if (!rules.length) return;

  // 030 — un solo ejecutor por vez: las alertas que YA tienen derivación (o
  // fueron asumidas) quedan como están, y de las reglas aplica solo la
  // primera que matchee el tipo (una regla = un destino).
  const refs = alerts.map(alertRef);
  const conAsignacion = new Set(
    (
      await getDb()
        .select({ alertRef: schema.alertAssignment.alertRef })
        .from(schema.alertAssignment)
        .where(
          and(
            eq(schema.alertAssignment.organizationId, session.organizationId),
            inArray(schema.alertAssignment.alertRef, refs)
          )
        )
    ).map((r) => r.alertRef)
  );
  const ordenadas = [...rules].sort(
    (r1, r2) => r1.createdAt.getTime() - r2.createdAt.getTime() || r1.id.localeCompare(r2.id)
  );

  const values: (typeof schema.alertAssignment.$inferInsert)[] = [];
  const now = new Date();
  for (const a of alerts) {
    const ref = alertRef(a);
    if (conAsignacion.has(ref)) continue;
    const rule = ordenadas.find((r) => r.alertType === a.tipo);
    if (!rule) continue;
    values.push({
      id: newId("alertAssignment"),
      organizationId: session.organizationId,
      alertStoreId: a.id,
      airtableRecordId: a.airtableRecordId,
      alertRef: ref,
      alertType: a.tipo,
      targetKind: rule.targetKind,
      targetId: rule.targetId,
      targetName: rule.targetName,
      source: "rule",
      ruleId: rule.id,
      assignedBy: rule.createdBy,
      assignedAt: now,
      status: "assigned",
      updatedAt: now,
    });
  }
  if (!values.length) return;
  await getDb().insert(schema.alertAssignment).values(values).onConflictDoNothing();
}

export async function decorateAlertsForSession(
  session: SessionLike,
  alerts: SgsaAlertDto[],
  mineOnly: boolean,
  opts: { withClients?: boolean } = {}
): Promise<SgsaAlertDto[]> {
  await ensureRuleAssignments(session, alerts);
  const refs = alerts.map(alertRef);
  if (!refs.length) return alerts;

  const rows = await getDb()
    .select()
    .from(schema.alertAssignment)
    .where(
      and(
        eq(schema.alertAssignment.organizationId, session.organizationId),
        inArray(schema.alertAssignment.alertRef, refs)
      )
    );
  const groups = await activeGroupIdsForUser(session.organizationId, session.userId);
  const byRef = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byRef.get(r.alertRef) ?? [];
    list.push(r);
    byRef.set(r.alertRef, list);
  }

  const canSeeAll = canSeeAllInbox(session.role) && !mineOnly;
  const scoped = alerts
    .map((a) => {
      const assigned = byRef.get(alertRef(a)) ?? [];
      const assignedToMe = assigned.some(
        (r) =>
          (r.targetKind === "employee" && r.targetId === session.userId) ||
          (r.targetKind === "group" && groups.has(r.targetId))
      );
      return {
        ...a,
        asignadaParaMi: assignedToMe,
        asignaciones: assigned.map((r) => ({
          targetKind: r.targetKind === "group" ? "group" : "employee",
          targetId: r.targetId,
          targetName: r.targetName,
          source: r.source === "rule" ? "rule" : r.source === "assumed" ? "assumed" : "manual",
          status: r.status,
        })),
      } satisfies SgsaAlertDto;
    })
    .filter((a) => canSeeAll || a.asignadaParaMi);
  return opts.withClients ? await withClientRecordIds(scoped) : scoped;
}

/** Campos de trazabilidad de Airtable para una alerta derivada (o null). */
async function airtableTraceFields(input: {
  alert: SgsaAlertDto;
  targets: AssignmentTarget[];
  assignedBy: string;
  ruleId?: string | null;
}): Promise<Record<string, unknown> | null> {
  if (!input.alert.airtableRecordId) return null;
  const employeeUserIds = new Set<string>();
  for (const t of input.targets) {
    if (t.kind === "employee") employeeUserIds.add(t.id);
  }
  const groupIds = input.targets.filter((t) => t.kind === "group").map((t) => t.id);
  if (groupIds.length) {
    const memberRows = await getDb()
      .select({ userId: schema.chatRoomMember.userId })
      .from(schema.chatRoomMember)
      .where(inArray(schema.chatRoomMember.roomId, groupIds));
    for (const r of memberRows) employeeUserIds.add(r.userId);
  }

  const derivedEmployeeIds: string[] = [];
  for (const userId of employeeUserIds) {
    const eid = await resolveEmpleadoForUser(userId);
    if (eid) derivedEmployeeIds.push(eid);
  }
  const actor = await resolveEmpleadoForUser(input.assignedBy);
  const groupLabel = input.targets
    .filter((t) => t.kind === "group")
    .map((t) => `${t.name} (${t.id})`)
    .join("\n");

  const fields: Record<string, unknown> = {
    FECHA_DERIVACION: new Date().toISOString(),
    ESTADO_DERIVACION_CRM: "ASIGNADA",
    REGLA_DERIVACION_ID: input.ruleId ?? "manual",
  };
  if (derivedEmployeeIds.length) fields.DERIVADA_A = Array.from(new Set(derivedEmployeeIds));
  if (actor) fields.DERIVADA_POR = [actor];
  if (groupLabel) fields.GRUPO_DERIVACION_CRM = groupLabel;
  return fields;
}

/** PATCH en lote de trazabilidad (Airtable acepta 10 registros por llamada). */
async function patchAirtableTraces(
  updates: { id: string; fields: Record<string, unknown> }[]
): Promise<void> {
  if (!updates.length) return;
  const pat = process.env.SGSA_AIRTABLE_PAT?.trim();
  if (!pat) return;
  const baseId = process.env.SGSA_BASE_ID?.trim() || "appuhslj3GFf60Tea";
  for (let i = 0; i < updates.length; i += 10) {
    const records = updates.slice(i, i + 10).map((u) => ({ id: u.id, fields: u.fields }));
    try {
      const res = await fetch(`https://api.airtable.com/v0/${baseId}/ALERTAS`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records, typecast: true }),
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.warn(`[alerts] Airtable trace skipped ${res.status}: ${detail.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn("[alerts] Airtable trace error:", err instanceof Error ? err.message : err);
    }
    if (i + 10 < updates.length) await new Promise((r) => setTimeout(r, 220));
  }
}

/** Estados que la derivación refleja en Airtable. */
const TRACE_STATUSES = new Set([
  "ASIGNADA",
  "EN_PROGRESO",
  "TURNO_CONFIRMADO",
  "CONCLUIDA",
  "ANULADA",
]);

/**
 * 028 — el avance de la alerta (Leído/Progreso/Turno/Concluido/Anulado) se
 * refleja en la trazabilidad de Airtable, SOLO si la alerta tiene derivaciones.
 */
export async function traceAssignmentStatus(input: {
  organizationId: string;
  alertStoreId: string;
  status: string;
}): Promise<void> {
  const status = input.status.trim().toUpperCase();
  if (!TRACE_STATUSES.has(status)) return;
  const pat = process.env.SGSA_AIRTABLE_PAT?.trim();
  if (!pat) return;
  const row = await getDb()
    .select({ airtableRecordId: schema.alertAssignment.airtableRecordId })
    .from(schema.alertAssignment)
    .where(
      and(
        eq(schema.alertAssignment.organizationId, input.organizationId),
        eq(schema.alertAssignment.alertStoreId, input.alertStoreId)
      )
    )
    .limit(1);
  const recordId = row[0]?.airtableRecordId ?? null;
  if (!recordId) return;
  await patchAirtableTraces([{ id: recordId, fields: { ESTADO_DERIVACION_CRM: status } }]);
}

async function postToTarget(input: {
  session: SessionLike;
  target: AssignmentTarget;
  body: string;
  alert?: ChatAlertShareDto;
}): Promise<void> {
  if (input.target.kind === "employee") {
    const room = await createDmRoom(
      input.session.organizationId,
      input.session.userId,
      input.target.id
    );
    await postChatMessage({
      organizationId: input.session.organizationId,
      roomId: room.id,
      senderId: input.session.userId,
      body: input.body,
      alert: input.alert,
    });
    return;
  }
  await postChatMessage({
    organizationId: input.session.organizationId,
    roomId: input.target.id,
    senderId: input.session.userId,
    body: input.body,
    alert: input.alert,
  });
}

/** Aviso de UNA alerta derivada (tarjeta con el snapshot en el chat interno). */
async function sendAssignmentNotice(input: {
  session: SessionLike;
  target: AssignmentTarget;
  alert: SgsaAlertDto;
  note?: string | null;
}): Promise<void> {
  const [alert] = await withClientRecordIds([input.alert]);
  const payload = alertSharePayload(alert ?? input.alert);
  await postToTarget({
    session: input.session,
    target: input.target,
    body: input.note?.trim() || "Te derivo esta alerta para gestionar.",
    alert: payload ?? undefined,
  });
}

/** Aviso de una derivación EN LOTE: un solo mensaje resumen por destino. */
async function sendAssignmentSummary(input: {
  session: SessionLike;
  target: AssignmentTarget;
  count: number;
  tipos: string[];
  note?: string | null;
}): Promise<void> {
  const tipoLabel = input.tipos.length === 1 ? ` del tipo ${input.tipos[0]}` : "";
  const plural = input.count === 1 ? "alerta" : "alertas";
  const base = `Te derivé ${input.count} ${plural}${tipoLabel} para gestionar. Las encontrás en la sección Alertas del CRM.`;
  const note = input.note?.trim();
  await postToTarget({
    session: input.session,
    target: input.target,
    body: note ? `${base}\nNota: ${note}` : base,
  });
}

export async function assignAlerts(input: {
  session: SessionLike;
  alerts: SgsaAlertDto[];
  targets: { empleados: string[]; grupos: string[] };
  source: "manual" | "rule";
  ruleId?: string | null;
  note?: string | null;
}): Promise<{
  assigned: number;
  creadas: number;
  compartidaCon: string[];
  grupos: string[];
  chatGrupos: string[];
  errores: string[];
  /** 030 — alertas que ya tenían ejecutor: no se re-derivan a otro. */
  bloqueadas: { alertRef: string; title: string; targetName: string; status: string }[];
  /** 030 — el destino pedido YA era el ejecutor (idempotente, sin novedad). */
  yaEstaba: number;
}> {
  const targets = await targetNames(input.session.organizationId, input.targets);
  if (!targets.length || !input.alerts.length) {
    return {
      assigned: 0,
      creadas: 0,
      compartidaCon: [],
      grupos: [],
      chatGrupos: [],
      errores: [],
      bloqueadas: [],
      yaEstaba: 0,
    };
  }

  const now = new Date();

  // 030 — UN SOLO EJECUTOR POR VEZ: si la alerta ya fue derivada o asumida,
  // no se entrega a otro. Mismo destino ⇒ idempotente (sin aviso nuevo).
  const refs = input.alerts.map((a) => alertRef(a));
  const previas = await getDb()
    .select({
      alertRef: schema.alertAssignment.alertRef,
      targetKind: schema.alertAssignment.targetKind,
      targetId: schema.alertAssignment.targetId,
      targetName: schema.alertAssignment.targetName,
      status: schema.alertAssignment.status,
    })
    .from(schema.alertAssignment)
    .where(
      and(
        eq(schema.alertAssignment.organizationId, input.session.organizationId),
        inArray(schema.alertAssignment.alertRef, refs)
      )
    );
  const previasPorRef = new Map<string, typeof previas>();
  for (const p of previas) {
    const list = previasPorRef.get(p.alertRef) ?? [];
    list.push(p);
    previasPorRef.set(p.alertRef, list);
  }

  const bloqueadas: { alertRef: string; title: string; targetName: string; status: string }[] = [];
  const alertsLibres: SgsaAlertDto[] = [];
  let yaEstaba = 0;
  for (const alert of input.alerts) {
    const previasDeLaAlerta = previasPorRef.get(alertRef(alert)) ?? [];
    if (!previasDeLaAlerta.length) {
      alertsLibres.push(alert);
      continue;
    }
    const mismoDestino = previasDeLaAlerta.some(
      (p) =>
        (p.targetKind === "employee" && input.targets.empleados.includes(p.targetId)) ||
        (p.targetKind === "group" && input.targets.grupos.includes(p.targetId))
    );
    if (mismoDestino) {
      yaEstaba += 1;
      continue;
    }
    const actual =
      previasDeLaAlerta.find((p) => isActiveAssignmentStatus(p.status)) ?? previasDeLaAlerta[0]!;
    bloqueadas.push({
      alertRef: alertRef(alert),
      title: alert.titulo,
      targetName: actual.targetName,
      status: actual.status,
    });
  }

  const rows: (typeof schema.alertAssignment.$inferInsert)[] = [];
  for (const alert of alertsLibres) {
    for (const t of targets) {
      rows.push({
        id: newId("alertAssignment"),
        organizationId: input.session.organizationId,
        alertStoreId: alert.id,
        airtableRecordId: alert.airtableRecordId,
        alertRef: alertRef(alert),
        alertType: alert.tipo,
        targetKind: t.kind,
        targetId: t.id,
        targetName: t.name,
        source: input.source,
        ruleId: input.ruleId ?? null,
        assignedBy: input.session.userId,
        assignedAt: now,
        status: "assigned",
        note: input.note?.trim() || null,
        updatedAt: now,
      });
    }
  }
  // Solo lo realmente nuevo: re-derivar no duplica filas ni re-avisa.
  const inserted = rows.length
    ? await getDb()
        .insert(schema.alertAssignment)
        .values(rows)
        .onConflictDoNothing()
        .returning({
          alertRef: schema.alertAssignment.alertRef,
          targetKind: schema.alertAssignment.targetKind,
          targetId: schema.alertAssignment.targetId,
        })
    : [];

  const freshByTarget = new Map<string, Set<string>>();
  for (const r of inserted) {
    const key = `${r.targetKind}:${r.targetId}`;
    const refsDeTarget = freshByTarget.get(key) ?? new Set<string>();
    refsDeTarget.add(r.alertRef);
    freshByTarget.set(key, refsDeTarget);
  }

  const aggregate = {
    assigned: alertsLibres.length,
    creadas: inserted.length,
    compartidaCon: [] as string[],
    grupos: [] as string[],
    chatGrupos: [] as string[],
    errores: [] as string[],
    bloqueadas,
    yaEstaba,
  };
  const single = alertsLibres.length === 1 ? alertsLibres[0]! : null;
  const tipos = Array.from(new Set(alertsLibres.map((a) => a.tipo)));

  for (const t of targets) {
    const fresh = freshByTarget.get(`${t.kind}:${t.id}`)?.size ?? 0;
    if (!fresh) continue; // ya estaba derivada a ese destino: sin aviso duplicado
    try {
      if (single && fresh === 1) {
        await sendAssignmentNotice({
          session: input.session,
          target: t,
          alert: single,
          note: input.note,
        });
      } else {
        await sendAssignmentSummary({
          session: input.session,
          target: t,
          count: fresh,
          tipos,
          note: input.note,
        });
      }
      if (t.kind === "employee") {
        aggregate.compartidaCon.push(t.name);
      } else {
        aggregate.grupos.push(t.name);
        aggregate.chatGrupos.push(t.id);
      }
    } catch (err) {
      aggregate.errores.push(`${t.name}: ${err instanceof Error ? err.message : "no se pudo avisar"}`);
    }
  }

  // Trazabilidad en Airtable solo para alertas con derivaciones nuevas.
  const newRefs = new Set(inserted.map((r) => r.alertRef));
  const updates: { id: string; fields: Record<string, unknown> }[] = [];
  for (const alert of alertsLibres) {
    if (!newRefs.has(alertRef(alert)) || !alert.airtableRecordId) continue;
    const fields = await airtableTraceFields({
      alert,
      targets,
      assignedBy: input.session.userId,
      ruleId: input.ruleId,
    });
    if (fields) updates.push({ id: alert.airtableRecordId, fields });
  }
  await patchAirtableTraces(updates);

  aggregate.compartidaCon = Array.from(new Set(aggregate.compartidaCon));
  aggregate.grupos = Array.from(new Set(aggregate.grupos));
  aggregate.chatGrupos = Array.from(new Set(aggregate.chatGrupos));
  return aggregate;
}

/**
 * 030 — «asumir»: quien marca/gestiona una alerta que NADIE tenía derivada
 * pasa a ser su ejecutor. Queda registrado (source `assumed`) y, como toda
 * derivación, cierra la puerta a entregársela a otro.
 */
export async function assumeExecutorIfFree(input: {
  session: SessionLike;
  alertStoreId: string;
  airtableRecordId?: string | null;
  alertType: string;
  status: string;
}): Promise<boolean> {
  const db = getDb();
  const conditions = [eq(schema.alertAssignment.alertStoreId, input.alertStoreId)];
  if (input.airtableRecordId) {
    conditions.push(eq(schema.alertAssignment.airtableRecordId, input.airtableRecordId));
  }
  const existing = await db
    .select({ id: schema.alertAssignment.id })
    .from(schema.alertAssignment)
    .where(
      and(
        eq(schema.alertAssignment.organizationId, input.session.organizationId),
        or(...conditions)
      )
    )
    .limit(1);
  if (existing[0]) return false; // ya tiene ejecutor: no se pisa

  const nameRow = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, input.session.userId))
    .limit(1);

  const now = new Date();
  await db
    .insert(schema.alertAssignment)
    .values({
      id: newId("alertAssignment"),
      organizationId: input.session.organizationId,
      alertStoreId: input.alertStoreId,
      airtableRecordId: input.airtableRecordId ?? null,
      alertRef: input.airtableRecordId || input.alertStoreId,
      alertType: input.alertType,
      targetKind: "employee",
      targetId: input.session.userId,
      targetName: nameRow[0]?.name ?? "Empleado",
      source: "assumed",
      ruleId: null,
      assignedBy: input.session.userId,
      assignedAt: now,
      status: input.status,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return true;
}

export async function markAlertAssignmentsStatus(input: {
  organizationId: string;
  alertStoreId: string;
  airtableRecordId?: string | null;
  status: string;
}): Promise<void> {
  const conditions = [eq(schema.alertAssignment.alertStoreId, input.alertStoreId)];
  if (input.airtableRecordId) conditions.push(eq(schema.alertAssignment.airtableRecordId, input.airtableRecordId));
  await getDb()
    .update(schema.alertAssignment)
    .set({ status: input.status, updatedAt: new Date() })
    .where(
      and(
        eq(schema.alertAssignment.organizationId, input.organizationId),
        or(...conditions)
      )
    );
}
