import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  REVIEW_ENVIO_ALERT_TYPE,
  REVIEW_GROUP_NAME,
  SISTEMA_SGSA_EMAIL,
  SISTEMA_SGSA_NAME,
} from "@/lib/reviews";
import type { ChatReviewShareDto, ReviewDelivery } from "@/lib/types";
import {
  ChatError,
  assertRoomMember,
  postChatMessage,
  updateReviewMessage,
} from "@/server/internal/chat";

/**
 * 033 — Revisión de envío SGSA ↔ chat interno (DUAL con Telegram).
 *
 * El flujo de siniestros (n8n) llega a «PENDIENTE APROBACION» y publica su
 * mensaje de revisión en el grupo de Telegram. En paralelo (aditivo: Telegram
 * sigue igual) llama a este servicio y el CRM publica la MISMA revisión como
 * tarjeta en el chat interno, con el demo exacto del mensaje al cliente, el
 * audio y el análisis IA. Los botones del chat pegan al MISMO webhook del
 * flujo (`sgsa-aprobacion-envio`) que usan los botones de Telegram: el lock
 * del flujo evita el doble envío y acá queda registrado quién decidió y por
 * dónde. Además el flujo informa la condición final (despachado / trabado).
 *
 * 033c — el flujo vive en un grupo del chat interno llamado «Alerta de
 * Siniestro»: ahí caen TODAS las tarjetas, avisos y cambios de estado. La
 * gestión (dueño/administrador/gerente) siempre participa (grupo macro) y los
 * empleados designados en Reglas entran como miembros — decisión grupal, sin
 * copias individuales. Los grupos elegidos en Reglas reciben además su copia.
 *
 * Config (env):
 * - `REVIEWS_INBOUND_KEY`   clave Bearer de los endpoints server-to-server.
 * - `SGSA_APPROVAL_WEBHOOK_KEY`  clave (`k`) del webhook de aprobación de n8n.
 * - `SGSA_APPROVAL_WEBHOOK_URL`  base del webhook (default: la de producción).
 * - `REVIEWS_ORG_ID`        organización destino (default: la primera/única).
 */

/** La función está configurada cuando existe la clave de ingreso (n8n → CRM). */
export function reviewsConfigured(): boolean {
  return Boolean(process.env.REVIEWS_INBOUND_KEY?.trim());
}

/** Clave compartida de los endpoints server-to-server (n8n ↔ CRM). */
export function reviewsInboundKey(): string | null {
  const key = process.env.REVIEWS_INBOUND_KEY?.trim();
  return key || null;
}

/** Comparación en tiempo constante del header Authorization (Bearer). */
export function reviewsKeyOk(headerValue: string | null): boolean {
  const key = reviewsInboundKey();
  if (!key) return false;
  const value = String(headerValue ?? "");
  const prefix = "Bearer ";
  if (!value.startsWith(prefix)) return false;
  const token = value.slice(prefix.length).trim();
  if (token.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ key.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Webhook del flujo n8n que disparan los botones de Telegram
 * (`?k=…&decision=approve|hold&record_id=rec…`). El chat interno pega a ESTE
 * mismo webhook: un solo canal de decisión, un solo lock.
 */
function approvalWebhook(): { url: string; key: string } | null {
  const base = (
    process.env.SGSA_APPROVAL_WEBHOOK_URL?.trim() ||
    "https://primary-production-0abcf.up.railway.app"
  ).replace(/\/+$/, "");
  const key = process.env.SGSA_APPROVAL_WEBHOOK_KEY?.trim() || "";
  if (!base || !key) return null;
  return { url: `${base}/webhook/sgsa-aprobacion-envio`, key };
}

/** ¿Está configurado el disparo al flujo (decidir desde el chat)? */
export function reviewsDecisionConfigured(): boolean {
  return approvalWebhook() !== null;
}

/** La organización del despliegue (env override para multi-org futuro). */
export async function resolveReviewsOrganizationId(): Promise<string | null> {
  const envOrg = process.env.REVIEWS_ORG_ID?.trim();
  if (envOrg) return envOrg;
  const rows = await getDb()
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .orderBy(asc(schema.organization.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Usuario de SISTEMA «SGSA · Avisos»: firma las tarjetas y los avisos del
 * flujo. No tiene cuenta de acceso (nunca se crea en `account`), no aparece
 * en los selectores del equipo (listStaff / destinos / Equipo lo filtran) y
 * existe una sola vez (por email global).
 */
export async function ensureSystemUser(organizationId: string): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, SISTEMA_SGSA_EMAIL))
    .limit(1);
  let userId = existing[0]?.id ?? null;
  if (!userId) {
    userId = newId("systemUser");
    await db.insert(schema.user).values({
      id: userId,
      name: SISTEMA_SGSA_NAME,
      email: SISTEMA_SGSA_EMAIL,
      emailVerified: true,
    });
  }
  const member = await db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, userId)
      )
    )
    .limit(1);
  if (!member[0]) {
    await db.insert(schema.member).values({
      id: newId("member"),
      organizationId,
      userId,
      role: "member",
    });
  }
  return userId;
}

type ReviewRecipients = {
  employees: { id: string; name: string | null }[];
  groups: { id: string; name: string | null }[];
};

/**
 * 033c — Destinos configurados en Alertas → Reglas para la revisión de envío:
 * TODAS las reglas activas del tipo (varios empleados y/o grupos). Los
 * EMPLEADOS entran al grupo del flujo como miembros (la decisión es grupal);
 * los GRUPOS elegidos reciben además su propia copia de la tarjeta.
 */
async function resolveReviewRecipients(
  organizationId: string
): Promise<ReviewRecipients> {
  const db = getDb();
  const rules = await db
    .select({
      id: schema.alertAssignmentRule.id,
      targetKind: schema.alertAssignmentRule.targetKind,
      targetId: schema.alertAssignmentRule.targetId,
      targetName: schema.alertAssignmentRule.targetName,
      createdAt: schema.alertAssignmentRule.createdAt,
    })
    .from(schema.alertAssignmentRule)
    .where(
      and(
        eq(schema.alertAssignmentRule.organizationId, organizationId),
        eq(schema.alertAssignmentRule.alertType, REVIEW_ENVIO_ALERT_TYPE),
        eq(schema.alertAssignmentRule.active, true)
      )
    )
    .orderBy(
      asc(schema.alertAssignmentRule.createdAt),
      asc(schema.alertAssignmentRule.id)
    );
  const employees: ReviewRecipients["employees"] = [];
  const groups: ReviewRecipients["groups"] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!rule.targetId) continue;
    const key = `${rule.targetKind}:${rule.targetId}`;
    if (seen.has(key)) continue;
    if (rule.targetKind === "employee") {
      const ok = await db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, organizationId),
            eq(schema.member.userId, rule.targetId)
          )
        )
        .limit(1);
      if (ok[0]) {
        seen.add(key);
        employees.push({ id: rule.targetId, name: rule.targetName });
      }
      continue;
    }
    if (rule.targetKind === "group") {
      const ok = await db
        .select({ id: schema.chatRoom.id })
        .from(schema.chatRoom)
        .where(
          and(
            eq(schema.chatRoom.organizationId, organizationId),
            eq(schema.chatRoom.id, rule.targetId),
            eq(schema.chatRoom.kind, "group")
          )
        )
        .limit(1);
      if (ok[0]) {
        seen.add(key);
        groups.push({ id: rule.targetId, name: rule.targetName });
      }
    }
  }
  return { employees, groups };
}

/**
 * Alta idempotente del grupo del flujo («Alerta de Siniestro»): se crea una
 * sola vez por organización y el usuario de sistema —quien firma las
 * tarjetas— siempre participa.
 */
async function ensureReviewGroup(
  organizationId: string,
  systemUserId: string
): Promise<string> {
  const db = getDb();
  const found = await db
    .select({ id: schema.chatRoom.id })
    .from(schema.chatRoom)
    .where(
      and(
        eq(schema.chatRoom.organizationId, organizationId),
        eq(schema.chatRoom.kind, "group"),
        eq(schema.chatRoom.name, REVIEW_GROUP_NAME)
      )
    )
    .orderBy(asc(schema.chatRoom.createdAt))
    .limit(1);
  let roomId = found[0]?.id ?? null;
  if (!roomId) {
    roomId = newId("chatRoom");
    await db.insert(schema.chatRoom).values({
      id: roomId,
      organizationId,
      kind: "group",
      name: REVIEW_GROUP_NAME,
      createdBy: systemUserId,
    });
  }
  const asMember = await db
    .select({ id: schema.chatRoomMember.id })
    .from(schema.chatRoomMember)
    .where(
      and(
        eq(schema.chatRoomMember.roomId, roomId),
        eq(schema.chatRoomMember.userId, systemUserId)
      )
    )
    .limit(1);
  if (!asMember[0]) {
    await db.insert(schema.chatRoomMember).values({
      id: newId("chatRoomMember"),
      organizationId,
      roomId,
      userId: systemUserId,
    });
  }
  return roomId;
}

/** Audiencia del grupo macro: sistema + gestión (dueño/administrador/gerente) + empleados designados. */
async function reviewGroupAudience(
  organizationId: string,
  recipients: ReviewRecipients,
  systemUserId: string
): Promise<string[]> {
  const managers = await getDb()
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        inArray(schema.member.role, ["owner", "admin", "manager"])
      )
    );
  return [
    ...new Set([
      systemUserId,
      ...managers.map((m) => m.userId),
      ...recipients.employees.map((e) => e.id),
    ]),
  ];
}

/**
 * Sincroniza la audiencia del grupo (alta idempotente, nunca quita miembros:
 * la baja se administra desde el propio grupo en el chat).
 */
async function syncReviewGroupMembers(
  organizationId: string,
  roomId: string,
  userIds: string[]
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ userId: schema.chatRoomMember.userId })
    .from(schema.chatRoomMember)
    .where(eq(schema.chatRoomMember.roomId, roomId));
  const have = new Set(existing.map((e) => e.userId));
  const missing = [...new Set(userIds)].filter((u) => !have.has(u));
  if (!missing.length) return;
  await db.insert(schema.chatRoomMember).values(
    missing.map((userId) => ({
      id: newId("chatRoomMember"),
      organizationId,
      roomId,
      userId,
    }))
  );
}

/**
 * 033c — deja el grupo del flujo creado y con la audiencia al día. Lo llama
 * también el guardado de Reglas: elegir empleados los suma al grupo en el acto.
 */
export async function syncReviewGroupFromRules(
  organizationId: string
): Promise<string> {
  const systemUserId = await ensureSystemUser(organizationId);
  const groupRoomId = await ensureReviewGroup(organizationId, systemUserId);
  const recipients = await resolveReviewRecipients(organizationId);
  await syncReviewGroupMembers(
    organizationId,
    groupRoomId,
    await reviewGroupAudience(organizationId, recipients, systemUserId)
  );
  return groupRoomId;
}

/**
 * Salas que reciben el flujo: SIEMPRE el grupo «Alerta de Siniestro» (la casa
 * de las aprobaciones) y, además, cada grupo elegido en Reglas. Los empleados
 * designados no reciben copias: son MIEMBROS del grupo (decisión grupal).
 */
async function resolveReviewRooms(organizationId: string): Promise<{
  rooms: { roomId: string; name: string | null }[];
  systemUserId: string;
}> {
  const systemUserId = await ensureSystemUser(organizationId);
  const groupRoomId = await ensureReviewGroup(organizationId, systemUserId);
  const recipients = await resolveReviewRecipients(organizationId);
  await syncReviewGroupMembers(
    organizationId,
    groupRoomId,
    await reviewGroupAudience(organizationId, recipients, systemUserId)
  );
  const rooms: { roomId: string; name: string | null }[] = [
    { roomId: groupRoomId, name: REVIEW_GROUP_NAME },
  ];
  for (const group of recipients.groups) {
    if (group.id !== groupRoomId) {
      rooms.push({ roomId: group.id, name: group.name });
    }
  }
  return { rooms, systemUserId };
}

/** 033b — Copias de la tarjeta de una fila (fallback: la entrega principal). */
function rowDeliveries(row: {
  deliveries: ReviewDelivery[] | null;
  roomId: string;
  messageId: string;
}): { roomId: string; messageId: string }[] {
  const list = Array.isArray(row.deliveries)
    ? row.deliveries.filter(
        (d) => d && typeof d.roomId === "string" && typeof d.messageId === "string"
      )
    : [];
  if (list.length) {
    return list.map((d) => ({ roomId: d.roomId, messageId: d.messageId }));
  }
  return [{ roomId: row.roomId, messageId: row.messageId }];
}

export type ReviewIngestResult = {
  roomId: string;
  messageId: string;
  /** true = ya había una revisión pendiente de ese registro: se refrescó, no se duplicó. */
  duplicate: boolean;
};

/**
 * Publica (o refresca) la tarjeta de revisión de un registro en el chat
 * interno. Idempotente por registro: si ya hay una revisión PENDIENTE, se
 * actualiza el contenido en vez de duplicar la tarjeta.
 */
export async function ingestReviewRequest(input: {
  organizationId: string;
  review: ChatReviewShareDto;
}): Promise<ReviewIngestResult> {
  const db = getDb();
  const { organizationId, review } = input;
  const fresh: ChatReviewShareDto = {
    ...review,
    estado: "pendiente",
    detalle: null,
    decididoPor: null,
    decididoEl: null,
    via: null,
  };
  const pending = await db
    .select({
      id: schema.reviewRequest.id,
      roomId: schema.reviewRequest.roomId,
      messageId: schema.reviewRequest.messageId,
      deliveries: schema.reviewRequest.deliveries,
    })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        eq(schema.reviewRequest.recordId, review.recordId),
        eq(schema.reviewRequest.status, "pendiente")
      )
    )
    .limit(1);
  if (pending[0]) {
    const copies = rowDeliveries(pending[0]);
    for (const copy of copies) {
      await updateReviewMessage({
        organizationId,
        messageId: copy.messageId,
        payload: fresh,
        body: `SGSA | Pendiente de aprobación — Registro ${review.recordId}`,
      });
    }
    await db
      .update(schema.reviewRequest)
      .set({
        cliente: review.cliente,
        payload: fresh,
        updatedAt: new Date(),
      })
      .where(eq(schema.reviewRequest.id, pending[0].id));
    return {
      roomId: copies[0]!.roomId,
      messageId: copies[0]!.messageId,
      duplicate: true,
    };
  }
  const { rooms, systemUserId } = await resolveReviewRooms(organizationId);
  const deliveries: ReviewDelivery[] = [];
  for (const room of rooms) {
    const message = await postChatMessage({
      organizationId,
      roomId: room.roomId,
      senderId: systemUserId,
      body: `SGSA | Pendiente de aprobación — Registro ${review.recordId}`,
      review: fresh,
      system: true,
    });
    deliveries.push({
      roomId: room.roomId,
      messageId: message.id,
      kind: "group",
      targetId: room.roomId,
      name: room.name,
    });
  }
  await db.insert(schema.reviewRequest).values({
    id: newId("reviewRequest"),
    organizationId,
    recordId: review.recordId,
    cliente: review.cliente,
    roomId: deliveries[0]!.roomId,
    messageId: deliveries[0]!.messageId,
    deliveries,
    status: "pendiente",
    payload: fresh,
  });
  return {
    roomId: deliveries[0]!.roomId,
    messageId: deliveries[0]!.messageId,
    duplicate: false,
  };
}

/**
 * Espejo de los AVISOS del bot de monitoreo (⚠️/🚨: caso enviado a ERROR DE
 * ENVIO, caso ya procesado, errores de workflow…): un mensaje fiel del texto
 * que salió al grupo de Telegram, firmado por el usuario de sistema.
 */
export async function postReviewAviso(input: {
  organizationId: string;
  texto: string;
  recordId?: string | null;
}): Promise<{ roomId: string; messageId: string }> {
  const { rooms, systemUserId } = await resolveReviewRooms(input.organizationId);
  let first: { roomId: string; messageId: string } | null = null;
  for (const room of rooms) {
    const message = await postChatMessage({
      organizationId: input.organizationId,
      roomId: room.roomId,
      senderId: systemUserId,
      body: input.texto,
      system: true,
    });
    if (!first) first = { roomId: room.roomId, messageId: message.id };
  }
  return first!;
}

export type ReviewDecision = "approve" | "hold";

/**
 * Decisión desde el CHAT INTERNO: valida pertenencia a la sala, lockea la
 * revisión, dispara el webhook del flujo y actualiza la tarjeta con quién
 * decidió. Si el flujo no responde, la revisión vuelve a «pendiente».
 */
export async function decideReview(input: {
  session: { userId: string; organizationId: string };
  recordId: string;
  decision: ReviewDecision;
}): Promise<{ status: "aprobado" | "detenido"; via: "chat" }> {
  const db = getDb();
  const { organizationId, userId } = input.session;
  const rows = await db
    .select()
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        eq(schema.reviewRequest.recordId, input.recordId),
        eq(schema.reviewRequest.status, "pendiente")
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ChatError(
      409,
      "already_decided",
      "Esta revisión ya no está pendiente"
    );
  }
  // 033b — la revisión puede tener VARIAS copias (multi-destino): puede
  // decidir quien participe de CUALQUIERA de las salas que la recibieron.
  let isMember = false;
  for (const copy of rowDeliveries(row)) {
    try {
      await assertRoomMember(organizationId, copy.roomId, userId);
      isMember = true;
      break;
    } catch {
      // no es miembro de esta copia: se prueba con la próxima
    }
  }
  if (!isMember) {
    throw new ChatError(
      403,
      "not_member",
      "No participás de ninguna conversación que recibió esta revisión"
    );
  }
  const hook = approvalWebhook();
  if (!hook) {
    throw new ChatError(
      503,
      "not_configured",
      "El envío automático no está configurado en este CRM"
    );
  }
  // Lock optimista: el primero que decide gana (evita doble disparo).
  const locked = await db
    .update(schema.reviewRequest)
    .set({ status: "decidiendo", updatedAt: new Date() })
    .where(
      and(
        eq(schema.reviewRequest.id, row.id),
        eq(schema.reviewRequest.status, "pendiente")
      )
    )
    .returning({ id: schema.reviewRequest.id });
  if (!locked[0]) {
    throw new ChatError(
      409,
      "already_decided",
      "Esta revisión ya no está pendiente"
    );
  }
  const decisionParam = input.decision === "approve" ? "approve" : "hold";
  const url = `${hook.url}?k=${encodeURIComponent(hook.key)}&decision=${decisionParam}&record_id=${encodeURIComponent(input.recordId)}&via=chat`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  } catch {
    await db
      .update(schema.reviewRequest)
      .set({ status: "pendiente", updatedAt: new Date() })
      .where(eq(schema.reviewRequest.id, row.id));
    throw new ChatError(
      502,
      "flow_unreachable",
      "No se pudo avisar al flujo de envío: probá de nuevo en un momento"
    );
  }
  const status = input.decision === "approve" ? "aprobado" : "detenido";
  const now = new Date();
  const byRows = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  const decidedPor = byRows[0]?.name ?? "Empleado";
  const base = (row.payload ?? null) as ChatReviewShareDto | null;
  // El payload se persiste también en la fila: markReviewStatus lo usa como
  // base para los hitos posteriores y no debe perder «quién/por dónde».
  const nextPayload = base
    ? {
        ...base,
        estado: status,
        detalle: null,
        decididoPor: decidedPor,
        decididoEl: now.toISOString(),
        via: "chat",
      }
    : null;
  await db
    .update(schema.reviewRequest)
    .set({
      status,
      decidedBy: userId,
      decidedAt: now,
      decidedVia: "chat",
      updatedAt: now,
      ...(nextPayload ? { payload: nextPayload } : {}),
    })
    .where(eq(schema.reviewRequest.id, row.id));
  const copies = rowDeliveries(row);
  if (nextPayload) {
    for (const copy of copies) {
      await updateReviewMessage({
        organizationId,
        messageId: copy.messageId,
        payload: nextPayload,
        body:
          status === "aprobado"
            ? `✅ SGSA | Aprobado — Registro ${input.recordId}`
            : `🛑 SGSA | Detenido — Registro ${input.recordId}`,
      });
    }
  }
  const systemUserId = await ensureSystemUser(organizationId);
  for (const copy of copies) {
    await postChatMessage({
      organizationId,
      roomId: copy.roomId,
      senderId: systemUserId,
      body:
        status === "aprobado"
          ? `✅ ${decidedPor} aprobó el envío desde el chat interno — el flujo sigue su curso.`
          : `🛑 ${decidedPor} detuvo el envío desde el chat interno para revisión.`,
      system: true,
    });
  }
  return { status, via: "chat" };
}

export type ReviewStatusUpdate = {
  estado: "aprobado" | "detenido" | "enviado" | "trabado";
  detalle?: string | null;
  via?: string | null;
};

/**
 * Estado informado por el FLUJO (server-to-server): la decisión se tomó por
 * Telegram, o cambió la condición del envío (despachado / trabado). Actualiza
 * la fila y la tarjeta del chat interno; el aviso corto en la sala lo postea
 * el flujo como aviso (o queda el cambio de estado en la propia tarjeta).
 */
export async function markReviewStatus(input: {
  organizationId: string;
  recordId: string;
  update: ReviewStatusUpdate;
}): Promise<{ updated: boolean }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, input.organizationId),
        eq(schema.reviewRequest.recordId, input.recordId)
      )
    )
    .orderBy(desc(schema.reviewRequest.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { updated: false };
  const base = (row.payload ?? null) as ChatReviewShareDto | null;
  if (!base) return { updated: false };
  const detalle =
    typeof input.update.detalle === "string" && input.update.detalle.trim()
      ? input.update.detalle.trim().slice(0, 300)
      : null;
  // La `via` solo se acepta al aplicar la DECISIÓN sobre una fila pendiente:
  // en hitos posteriores (enviado/trabado) se conserva la de la decisión para
  // no pisar «quién decidió y por dónde».
  const cleanVia =
    typeof input.update.via === "string" && input.update.via.trim()
      ? input.update.via.trim().slice(0, 20)
      : null;
  const deciding =
    row.status === "pendiente" &&
    (input.update.estado === "aprobado" || input.update.estado === "detenido");
  const via = deciding ? (cleanVia ?? "telegram") : base.via;
  const payload: ChatReviewShareDto = {
    ...base,
    estado: input.update.estado,
    detalle,
    via,
    decididoEl: deciding ? new Date().toISOString() : base.decididoEl,
  };
  // Persistimos el payload también en la FILA (no solo en el mensaje): es la
  // base de los hitos posteriores (enviado/trabado). Sin esto, una decisión
  // por Telegram perdía su `via` en el primer hito siguiente.
  const patch: Record<string, unknown> = { updatedAt: new Date(), payload };
  if (deciding) {
    patch.status = input.update.estado;
    patch.decidedVia = via ?? "telegram";
    patch.decidedAt = new Date();
  }
  await db
    .update(schema.reviewRequest)
    .set(patch)
    .where(eq(schema.reviewRequest.id, row.id));
  const bodyByEstado: Record<string, string> = {
    aprobado: `✅ SGSA | Aprobado — Registro ${input.recordId}`,
    detenido: `🛑 SGSA | Detenido — Registro ${input.recordId}`,
    enviado: `✅ SGSA | Envío despachado — Registro ${input.recordId}`,
    trabado: `⚠️ SGSA | Envío trabado — Registro ${input.recordId}`,
  };
  for (const copy of rowDeliveries(row)) {
    await updateReviewMessage({
      organizationId: input.organizationId,
      messageId: copy.messageId,
      payload,
      body: bodyByEstado[input.update.estado],
    });
  }
  return { updated: true };
}
