import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import {
  REVIEW_ENVIO_ALERT_TYPE,
  SISTEMA_SGSA_EMAIL,
  SISTEMA_SGSA_NAME,
} from "@/lib/reviews";
import type { ChatReviewShareDto } from "@/lib/types";
import {
  ChatError,
  assertRoomMember,
  createDmRoom,
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

type ReviewTarget = { kind: "employee" | "group"; id: string };

/**
 * Destino de la tarjeta: la regla del tipo REVISION_ENVIO_SINIESTRO
 * (Alertas → Reglas, la configura dueño/administrador/gerente); sin regla,
 * cae al Propietario para no perder nunca una revisión.
 */
async function resolveReviewTarget(
  organizationId: string
): Promise<ReviewTarget> {
  const db = getDb();
  const rules = await db
    .select({
      targetKind: schema.alertAssignmentRule.targetKind,
      targetId: schema.alertAssignmentRule.targetId,
    })
    .from(schema.alertAssignmentRule)
    .where(
      and(
        eq(schema.alertAssignmentRule.organizationId, organizationId),
        eq(schema.alertAssignmentRule.alertType, REVIEW_ENVIO_ALERT_TYPE),
        eq(schema.alertAssignmentRule.active, true)
      )
    )
    .limit(1);
  const rule = rules[0];
  if (rule?.targetKind === "employee" && rule.targetId) {
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
    if (ok[0]) return { kind: "employee", id: rule.targetId };
  }
  if (rule?.targetKind === "group" && rule.targetId) {
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
    if (ok[0]) return { kind: "group", id: rule.targetId };
  }
  const owner = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.role, "owner")
      )
    )
    .limit(1);
  if (!owner[0]) {
    throw new ChatError(
      500,
      "no_target",
      "No hay a quién avisarle: falta una regla de alertas o un propietario"
    );
  }
  return { kind: "employee", id: owner[0].userId };
}

/** Abre/reusa la sala destino (DM del usuario de sistema con el empleado, o el grupo de la regla). */
async function targetRoom(
  organizationId: string,
  target: ReviewTarget,
  systemUserId: string
): Promise<string> {
  if (target.kind === "group") return target.id;
  const dm = await createDmRoom(organizationId, systemUserId, target.id);
  return dm.id;
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
    await updateReviewMessage({
      organizationId,
      messageId: pending[0].messageId,
      payload: fresh,
      body: `SGSA | Pendiente de aprobación — Registro ${review.recordId}`,
    });
    await db
      .update(schema.reviewRequest)
      .set({
        cliente: review.cliente,
        payload: fresh,
        updatedAt: new Date(),
      })
      .where(eq(schema.reviewRequest.id, pending[0].id));
    return {
      roomId: pending[0].roomId,
      messageId: pending[0].messageId,
      duplicate: true,
    };
  }
  const target = await resolveReviewTarget(organizationId);
  const systemUserId = await ensureSystemUser(organizationId);
  const roomId = await targetRoom(organizationId, target, systemUserId);
  const message = await postChatMessage({
    organizationId,
    roomId,
    senderId: systemUserId,
    body: `SGSA | Pendiente de aprobación — Registro ${review.recordId}`,
    review: fresh,
    system: true,
  });
  await db.insert(schema.reviewRequest).values({
    id: newId("reviewRequest"),
    organizationId,
    recordId: review.recordId,
    cliente: review.cliente,
    roomId,
    messageId: message.id,
    status: "pendiente",
    payload: fresh,
  });
  return { roomId, messageId: message.id, duplicate: false };
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
  const target = await resolveReviewTarget(input.organizationId);
  const systemUserId = await ensureSystemUser(input.organizationId);
  const roomId = await targetRoom(input.organizationId, target, systemUserId);
  const message = await postChatMessage({
    organizationId: input.organizationId,
    roomId,
    senderId: systemUserId,
    body: input.texto,
    system: true,
  });
  return { roomId, messageId: message.id };
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
  await assertRoomMember(organizationId, row.roomId, userId);
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
  if (nextPayload) {
    await updateReviewMessage({
      organizationId,
      messageId: row.messageId,
      payload: nextPayload,
      body:
        status === "aprobado"
          ? `✅ SGSA | Aprobado — Registro ${input.recordId}`
          : `🛑 SGSA | Detenido — Registro ${input.recordId}`,
    });
  }
  const systemUserId = await ensureSystemUser(organizationId);
  await postChatMessage({
    organizationId,
    roomId: row.roomId,
    senderId: systemUserId,
    body:
      status === "aprobado"
        ? `✅ ${decidedPor} aprobó el envío desde el chat interno — el flujo sigue su curso.`
        : `🛑 ${decidedPor} detuvo el envío desde el chat interno para revisión.`,
    system: true,
  });
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
  const patch: Record<string, unknown> = { updatedAt: new Date() };
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
  await updateReviewMessage({
    organizationId: input.organizationId,
    messageId: row.messageId,
    payload,
    body: bodyByEstado[input.update.estado],
  });
  return { updated: true };
}
