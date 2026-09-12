import { and, asc, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { onlineUserIds } from "@/server/events/presence";
import { artDayKey } from "./office-day";

/**
 * 022 — Chat interno del equipo.
 *
 * Conversaciones entre empleados del CRM (mensajes directos de a dos y
 * grupos), separadas del dominio de la Bandeja: acá no hay contactos ni
 * canales, solo usuarios del equipo.
 *
 * Regla de oro (pedido de Diego): los GRUPOS los crea y los administra
 * únicamente el propietario o un administrador (`canCreateGroup`); los
 * mensajes directos los puede iniciar cualquier empleado. La UI esconde lo
 * que no corresponde, pero la decisión final SIEMPRE se valida acá.
 *
 * Tiempo real: los mensajes se publican por el bus SSE de la organización
 * (`internal.message` / `internal.room`) y el cliente refresca.
 */

export const CHAT_BODY_MAX = 4000;
export const CHAT_NAME_MAX = 80;
/** Tope de mensajes que devuelve una sala (el historial completo no se pagina: el chat interno es chico). */
export const CHAT_PAGE = 200;

export class ChatError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ChatError";
  }
}

/** Solo dueño y administrador crean/administran grupos (requisito textual). */
export function canCreateGroup(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Normaliza el cuerpo: recorta, rechaza vacío y topa el largo. */
export function sanitizeChatBody(raw: unknown): string | null {
  const body = String(raw ?? "").trim();
  if (!body) return null;
  return body.length > CHAT_BODY_MAX ? body.slice(0, CHAT_BODY_MAX) : body;
}

/** Nombre de grupo: espacios colapsados, topado; vacío → null. */
export function sanitizeRoomName(raw: unknown): string | null {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) return null;
  return name.length > CHAT_NAME_MAX ? name.slice(0, CHAT_NAME_MAX) : name;
}

/** Un DM es entre dos personas distintas. */
export function dmPairOk(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a !== b;
}

/** Miembros del grupo: sin duplicados, sin blancos, con el creador incluido. */
export function normalizeGroupMembers(
  creatorId: string,
  memberIds: (string | null | undefined)[]
): string[] {
  const set = new Set<string>();
  for (const id of memberIds) {
    const clean = String(id ?? "").trim();
    if (clean) set.add(clean);
  }
  set.add(creatorId);
  return Array.from(set);
}

export type ChatMemberView = {
  userId: string;
  name: string;
  online: boolean;
  /** 022c — integrante en pausa (no cuenta como miembro activo ni presencia). */
  paused: boolean;
};

export type ChatMessageView = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

export type ChatRoomSummary = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  displayName: string;
  membersCount: number;
  /** 022c — integrantes pausados (no cuentan como miembros activos). */
  pausedCount: number;
  /** 022 — miembros (sin contarme) con conexión viva ahora mismo. */
  onlineCount: number;
  unreadCount: number;
  lastMessage: Omit<ChatMessageView, "roomId"> | null;
  updatedAt: string;
  createdAt: string;
  /** Nombre de quien creó la sala (tarjeta del grupo). */
  createdByName: string | null;
  members: ChatMemberView[];
};

/** En DM, el nombre visible es el del OTRO participante; en grupo, su nombre. */
export function resolveRoomDisplayName(
  room: { kind: string; name: string | null },
  members: { userId: string; name: string }[],
  meId: string
): string {
  if (room.kind === "group") return room.name?.trim() || "Grupo";
  const other = members.find((m) => m.userId !== meId);
  return other?.name?.trim() || "Empleado";
}

async function assertMembership(
  organizationId: string,
  roomId: string,
  userId: string
): Promise<void> {
  const rows = await getDb()
    .select({ id: schema.chatRoomMember.id })
    .from(schema.chatRoomMember)
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        eq(schema.chatRoomMember.roomId, roomId),
        eq(schema.chatRoomMember.userId, userId)
      )
    )
    .limit(1);
  if (!rows[0]) {
    throw new ChatError(403, "not_member", "No participás de esta conversación");
  }
}

/** Resumen de UNA sala, desde la óptica de `meId` (mismo shape que la lista). */
async function getRoomSummary(
  organizationId: string,
  roomId: string,
  meId: string
): Promise<ChatRoomSummary> {
  const rooms = await listRoomsForUser(organizationId, meId);
  const found = rooms.find((r) => r.id === roomId);
  if (!found) {
    throw new ChatError(404, "not_found", "Esa conversación no existe");
  }
  return found;
}

/** Salas donde participo, con último mensaje, no leídos y miembros. */
export async function listRoomsForUser(
  organizationId: string,
  meId: string
): Promise<ChatRoomSummary[]> {
  const db = getDb();
  const myRows = await db
    .select({ roomId: schema.chatRoomMember.roomId })
    .from(schema.chatRoomMember)
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        eq(schema.chatRoomMember.userId, meId),
        // 022c — si estoy pausado en una sala, no participo de ella.
        isNull(schema.chatRoomMember.pausedAt)
      )
    );
  const roomIds = myRows.map((r) => r.roomId);
  if (roomIds.length === 0) return [];

  const roomRows = await db
    .select({ room: schema.chatRoom, createdByName: schema.user.name })
    .from(schema.chatRoom)
    .leftJoin(schema.user, eq(schema.user.id, schema.chatRoom.createdBy))
    .where(
      and(
        eq(schema.chatRoom.organizationId, organizationId),
        inArray(schema.chatRoom.id, roomIds)
      )
    );

  const memberRows = await db
    .select({
      roomId: schema.chatRoomMember.roomId,
      userId: schema.chatRoomMember.userId,
      name: schema.user.name,
      pausedAt: schema.chatRoomMember.pausedAt,
    })
    .from(schema.chatRoomMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.chatRoomMember.userId))
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        inArray(schema.chatRoomMember.roomId, roomIds)
      )
    );

  // Último mensaje por sala: se traen los más recientes y se toma el primero
  // de cada una (volumen del chat interno: chico; sin N+1).
  const recent = await db
    .select({
      id: schema.chatMessage.id,
      roomId: schema.chatMessage.roomId,
      senderId: schema.chatMessage.senderId,
      body: schema.chatMessage.body,
      createdAt: schema.chatMessage.createdAt,
      senderName: schema.user.name,
    })
    .from(schema.chatMessage)
    .innerJoin(schema.user, eq(schema.user.id, schema.chatMessage.senderId))
    .where(
      and(
        eq(schema.chatMessage.organizationId, organizationId),
        inArray(schema.chatMessage.roomId, roomIds)
      )
    )
    .orderBy(desc(schema.chatMessage.createdAt))
    .limit(400);

  const lastByRoom = new Map<string, (typeof recent)[number]>();
  for (const m of recent) {
    if (!lastByRoom.has(m.roomId)) lastByRoom.set(m.roomId, m);
  }

  // No leídos: mensajes de OTROS posteriores a mi última lectura de la sala.
  const unreadRows = await db
    .select({ roomId: schema.chatMessage.roomId, n: count() })
    .from(schema.chatMessage)
    .innerJoin(
      schema.chatRoomMember,
      and(
        eq(schema.chatRoomMember.roomId, schema.chatMessage.roomId),
        eq(schema.chatRoomMember.userId, meId)
      )
    )
    .where(
      and(
        eq(schema.chatMessage.organizationId, organizationId),
        inArray(schema.chatMessage.roomId, roomIds),
        ne(schema.chatMessage.senderId, meId),
        gt(schema.chatMessage.createdAt, schema.chatRoomMember.lastReadAt)
      )
    )
    .groupBy(schema.chatMessage.roomId);
  const unreadByRoom = new Map(
    unreadRows.map((r) => [r.roomId, Number(r.n)])
  );

  // 022 — presencia: conexión SSE viva = en línea (in-process).
  const online = new Set(onlineUserIds(organizationId));
  const membersByRoom = new Map<string, ChatMemberView[]>();
  for (const m of memberRows) {
    const list = membersByRoom.get(m.roomId) ?? [];
    list.push({
      userId: m.userId,
      name: m.name,
      online: online.has(m.userId) && !m.pausedAt,
      paused: Boolean(m.pausedAt),
    });
    membersByRoom.set(m.roomId, list);
  }

  const summaries: ChatRoomSummary[] = roomRows.map(({ room, createdByName }) => {
    const members = membersByRoom.get(room.id) ?? [];
    const active = members.filter((m) => !m.paused);
    const last = lastByRoom.get(room.id);
    return {
      id: room.id,
      kind: room.kind === "group" ? "group" : "dm",
      name: room.name,
      displayName: resolveRoomDisplayName(room, members, meId),
      membersCount: active.length,
      pausedCount: members.length - active.length,
      onlineCount: active.filter((m) => m.userId !== meId && m.online).length,
      unreadCount: unreadByRoom.get(room.id) ?? 0,
      lastMessage: last
        ? {
            id: last.id,
            senderId: last.senderId,
            senderName: last.senderName,
            body: last.body,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      updatedAt: room.updatedAt.toISOString(),
      createdAt: room.createdAt.toISOString(),
      createdByName,
      members,
    };
  });

  summaries.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.updatedAt;
    const bt = b.lastMessage?.createdAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });
  return summaries;
}

/** Abre (o recupera, si ya existe) el DM con otra persona del equipo. */
export async function createDmRoom(
  organizationId: string,
  meId: string,
  otherUserId: string
): Promise<ChatRoomSummary> {
  const other = String(otherUserId ?? "").trim();
  if (!dmPairOk(meId, other)) {
    throw new ChatError(422, "invalid_pair", "No podés iniciar una conversación con vos mismo");
  }
  const db = getDb();
  const exists = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, other)
      )
    )
    .limit(1);
  if (!exists[0]) {
    throw new ChatError(404, "not_found", "Ese compañero no es parte del equipo");
  }

  // ¿Ya hay un DM entre los dos? (intersección de mis salas con las suyas, kind=dm)
  const mine = await db
    .select({ roomId: schema.chatRoomMember.roomId })
    .from(schema.chatRoomMember)
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        eq(schema.chatRoomMember.userId, meId)
      )
    );
  const mineIds = mine.map((r) => r.roomId);
  if (mineIds.length > 0) {
    const shared = await db
      .select({ roomId: schema.chatRoom.id })
      .from(schema.chatRoom)
      .innerJoin(
        schema.chatRoomMember,
        and(
          eq(schema.chatRoomMember.roomId, schema.chatRoom.id),
          eq(schema.chatRoomMember.userId, other)
        )
      )
      .where(
        and(
          eq(schema.chatRoom.organizationId, organizationId),
          eq(schema.chatRoom.kind, "dm"),
          inArray(schema.chatRoom.id, mineIds)
        )
      )
      .limit(1);
    if (shared[0]) return getRoomSummary(organizationId, shared[0].roomId, meId);
  }

  const roomId = newId("chatRoom");
  await db.insert(schema.chatRoom).values({
    id: roomId,
    organizationId,
    kind: "dm",
    name: null,
    createdBy: meId,
  });
  await db.insert(schema.chatRoomMember).values([
    { id: newId("chatRoomMember"), organizationId, roomId, userId: meId },
    { id: newId("chatRoomMember"), organizationId, roomId, userId: other },
  ]);
  publish(organizationId, { type: "internal.room", data: { roomId } });
  return getRoomSummary(organizationId, roomId, meId);
}

/** Crea un grupo — SOLO dueño o administrador (validado acá, no solo en la UI). */
export async function createGroupRoom(input: {
  organizationId: string;
  creatorId: string;
  creatorRole: string;
  name: string;
  memberIds: string[];
}): Promise<ChatRoomSummary> {
  if (!canCreateGroup(input.creatorRole)) {
    throw new ChatError(403, "forbidden", "Solo el dueño o un administrador pueden crear grupos");
  }
  const name = sanitizeRoomName(input.name);
  if (!name) {
    throw new ChatError(422, "invalid_name", "Poné un nombre para el grupo");
  }
  const memberIds = normalizeGroupMembers(input.creatorId, input.memberIds);
  if (memberIds.length < 2) {
    throw new ChatError(422, "no_members", "Elegí al menos un compañero para el grupo");
  }

  const db = getDb();
  const valid = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, input.organizationId),
        inArray(schema.member.userId, memberIds)
      )
    );
  if (valid.length !== memberIds.length) {
    throw new ChatError(422, "invalid_members", "Alguno de los elegidos ya no es parte del equipo");
  }

  const roomId = newId("chatRoom");
  await db.insert(schema.chatRoom).values({
    id: roomId,
    organizationId: input.organizationId,
    kind: "group",
    name,
    createdBy: input.creatorId,
  });
  await db.insert(schema.chatRoomMember).values(
    memberIds.map((userId) => ({
      id: newId("chatRoomMember"),
      organizationId: input.organizationId,
      roomId,
      userId,
    }))
  );
  publish(input.organizationId, { type: "internal.room", data: { roomId } });
  return getRoomSummary(input.organizationId, roomId, input.creatorId);
}

/** Publica un mensaje en una sala (solo miembros) y avisa por SSE. */
export async function postChatMessage(input: {
  organizationId: string;
  roomId: string;
  senderId: string;
  body: string;
}): Promise<ChatMessageView> {
  const body = sanitizeChatBody(input.body);
  if (!body) {
    throw new ChatError(422, "empty", "El mensaje está vacío");
  }
  await assertMembership(input.organizationId, input.roomId, input.senderId);

  const db = getDb();
  // 022c — un integrante pausado no escribe hasta que lo reactiven.
  const myMembership = await db
    .select({ pausedAt: schema.chatRoomMember.pausedAt })
    .from(schema.chatRoomMember)
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, input.organizationId),
        eq(schema.chatRoomMember.roomId, input.roomId),
        eq(schema.chatRoomMember.userId, input.senderId)
      )
    )
    .limit(1);
  if (myMembership[0]?.pausedAt) {
    throw new ChatError(
      403,
      "paused",
      "Estás en pausa en este grupo: pedile a un administrador que te reactive"
    );
  }
  const id = newId("chatMessage");
  const createdAt = new Date();
  await db.insert(schema.chatMessage).values({
    id,
    organizationId: input.organizationId,
    roomId: input.roomId,
    senderId: input.senderId,
    body,
    createdAt,
  });
  await db
    .update(schema.chatRoom)
    .set({ updatedAt: createdAt })
    .where(
      and(
        eq(schema.chatRoom.organizationId, input.organizationId),
        eq(schema.chatRoom.id, input.roomId)
      )
    );

  const senderRows = await db
    .select({ name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, input.senderId))
    .limit(1);

  const view: ChatMessageView = {
    id,
    roomId: input.roomId,
    senderId: input.senderId,
    senderName: senderRows[0]?.name ?? "Empleado",
    body,
    createdAt: createdAt.toISOString(),
  };
  publish(input.organizationId, {
    type: "internal.message",
    data: { roomId: input.roomId, message: view },
  });
  return view;
}

/** Historial de una sala (últimos CHAT_PAGE, ascendente) + resumen para el header. */
export async function listChatMessages(input: {
  organizationId: string;
  roomId: string;
  meId: string;
}): Promise<{ room: ChatRoomSummary; messages: ChatMessageView[] }> {
  await assertMembership(input.organizationId, input.roomId, input.meId);
  const rows = await getDb()
    .select({
      id: schema.chatMessage.id,
      roomId: schema.chatMessage.roomId,
      senderId: schema.chatMessage.senderId,
      body: schema.chatMessage.body,
      createdAt: schema.chatMessage.createdAt,
      senderName: schema.user.name,
    })
    .from(schema.chatMessage)
    .innerJoin(schema.user, eq(schema.user.id, schema.chatMessage.senderId))
    .where(
      and(
        eq(schema.chatMessage.organizationId, input.organizationId),
        eq(schema.chatMessage.roomId, input.roomId)
      )
    )
    .orderBy(desc(schema.chatMessage.createdAt))
    .limit(CHAT_PAGE);
  rows.reverse();

  const room = await getRoomSummary(input.organizationId, input.roomId, input.meId);
  return {
    room,
    messages: rows.map((m) => ({
      id: m.id,
      roomId: m.roomId,
      senderId: m.senderId,
      senderName: m.senderName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Marca la sala como leída (resetea el badge de no leídos). */
export async function markRoomRead(
  organizationId: string,
  roomId: string,
  meId: string
): Promise<string> {
  await assertMembership(organizationId, roomId, meId);
  const now = new Date();
  await getDb()
    .update(schema.chatRoomMember)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(schema.chatRoomMember.organizationId, organizationId),
        eq(schema.chatRoomMember.roomId, roomId),
        eq(schema.chatRoomMember.userId, meId)
      )
    );
  return now.toISOString();
}

/**
 * Administra un grupo (nombre y miembros) — solo dueño/administrador, igual
 * que la creación. Los DM no se administran: son de a dos, para siempre.
 */
export async function updateGroupRoom(input: {
  organizationId: string;
  roomId: string;
  /** Quién administra: la pausa nunca puede caer sobre uno mismo. */
  actorId: string;
  actorRole: string;
  name?: string;
  addUserIds?: string[];
  removeUserIds?: string[];
  /** 022c — pausar integrantes (reversible). */
  pauseUserIds?: string[];
  /** 022c — reactivar integrantes pausados. */
  unpauseUserIds?: string[];
}): Promise<void> {
  if (!canCreateGroup(input.actorRole)) {
    throw new ChatError(403, "forbidden", "Solo el dueño o un administrador pueden administrar grupos");
  }
  const db = getDb();
  const rooms = await db
    .select()
    .from(schema.chatRoom)
    .where(
      and(
        eq(schema.chatRoom.organizationId, input.organizationId),
        eq(schema.chatRoom.id, input.roomId)
      )
    )
    .limit(1);
  const room = rooms[0];
  if (!room) throw new ChatError(404, "not_found", "Ese grupo no existe");
  if (room.kind !== "group") {
    throw new ChatError(422, "not_group", "Un mensaje directo no se administra");
  }

  if (input.name !== undefined) {
    const name = sanitizeRoomName(input.name);
    if (!name) throw new ChatError(422, "invalid_name", "Poné un nombre para el grupo");
    await db
      .update(schema.chatRoom)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.chatRoom.id, room.id));
  }

  const add = (input.addUserIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (add.length > 0) {
    const valid = await db
      .select({ userId: schema.member.userId })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, input.organizationId),
          inArray(schema.member.userId, add)
        )
      );
    const validIds = valid.map((v) => v.userId);
    if (validIds.length > 0) {
      await db
        .insert(schema.chatRoomMember)
        .values(
          validIds.map((userId) => ({
            id: newId("chatRoomMember"),
            organizationId: input.organizationId,
            roomId: room.id,
            userId,
          }))
        )
        .onConflictDoNothing();
    }
  }

  const remove = (input.removeUserIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (remove.length > 0) {
    // El grupo nunca queda sin compañía: siempre ≥ 2 integrantes activos.
    const activeRows = await db
      .select({ userId: schema.chatRoomMember.userId })
      .from(schema.chatRoomMember)
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.roomId, room.id),
          isNull(schema.chatRoomMember.pausedAt)
        )
      );
    const activeIds = new Set(activeRows.map((r) => r.userId));
    const removingActive = remove.filter((id) => activeIds.has(id)).length;
    if (activeIds.size - removingActive < 2) {
      throw new ChatError(
        422,
        "last_member",
        "El grupo necesita al menos otro integrante"
      );
    }
    await db
      .delete(schema.chatRoomMember)
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.roomId, room.id),
          inArray(schema.chatRoomMember.userId, remove)
        )
      );
  }

  // 022c — pausar integrantes: dejan de participar de la sala hasta reactivarlos.
  const pause = (input.pauseUserIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (pause.length > 0) {
    if (pause.includes(input.actorId)) {
      throw new ChatError(422, "self_pause", "No te podés pausar a vos mismo");
    }
    const inRoom = await db
      .select({ userId: schema.chatRoomMember.userId })
      .from(schema.chatRoomMember)
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.roomId, room.id),
          inArray(schema.chatRoomMember.userId, pause)
        )
      );
    if (inRoom.length !== pause.length) {
      throw new ChatError(422, "invalid_members", "Alguno de los elegidos no es parte del grupo");
    }
    await db
      .update(schema.chatRoomMember)
      .set({ pausedAt: new Date(), pausedBy: input.actorId })
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.roomId, room.id),
          inArray(schema.chatRoomMember.userId, pause)
        )
      );
  }

  // 022c — reactivar: arranca de cero, sin acumular los no leídos de la pausa.
  const unpause = (input.unpauseUserIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean);
  if (unpause.length > 0) {
    await db
      .update(schema.chatRoomMember)
      .set({ pausedAt: null, pausedBy: null, lastReadAt: new Date() })
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.roomId, room.id),
          inArray(schema.chatRoomMember.userId, unpause)
        )
      );
  }

  publish(input.organizationId, { type: "internal.room", data: { roomId: room.id } });
}

/** 022c — Elimina un grupo y toda su historia (solo dueño/administrador). */
export async function deleteGroupRoom(input: {
  organizationId: string;
  roomId: string;
  actorRole: string;
}): Promise<void> {
  if (!canCreateGroup(input.actorRole)) {
    throw new ChatError(403, "forbidden", "Solo el dueño o un administrador pueden eliminar grupos");
  }
  const db = getDb();
  const rooms = await db
    .select()
    .from(schema.chatRoom)
    .where(
      and(
        eq(schema.chatRoom.organizationId, input.organizationId),
        eq(schema.chatRoom.id, input.roomId)
      )
    )
    .limit(1);
  const room = rooms[0];
  if (!room) throw new ChatError(404, "not_found", "Ese grupo no existe");
  if (room.kind !== "group") {
    throw new ChatError(422, "not_group", "Un mensaje directo no se elimina");
  }
  // Integrantes y mensajes caen por cascade (FK on delete cascade).
  await db.delete(schema.chatRoom).where(eq(schema.chatRoom.id, room.id));
  publish(input.organizationId, { type: "internal.room", data: { roomId: room.id } });
}

export type StaffMemberView = {
  userId: string;
  name: string;
  role: string;
  online: boolean;
  email: string | null;
  employeeCode: string | null;
  operationalRole: string | null;
  locality: string | null;
  /** 023 — sucursal que marcó hoy (si la eligió). */
  officeName: string | null;
  officeSince: string | null;
};

/** Equipo activo para los selectores del chat y la ficha del empleado. */
export async function listStaff(
  organizationId: string
): Promise<StaffMemberView[]> {
  const rows = await getDb()
    .select({
      userId: schema.member.userId,
      name: schema.user.name,
      role: schema.member.role,
      email: schema.user.email,
      employeeCode: schema.staffProfile.employeeCode,
      operationalRole: schema.staffProfile.operationalRole,
      locality: schema.staffProfile.locality,
      officeName: schema.office.name,
      officeCleanName: schema.office.cleanName,
      officeSince: schema.staffOfficeDay.selectedAt,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .leftJoin(
      schema.staffProfile,
      and(
        eq(schema.staffProfile.organizationId, schema.member.organizationId),
        eq(schema.staffProfile.userId, schema.member.userId)
      )
    )
    .leftJoin(
      schema.staffOfficeDay,
      and(
        eq(schema.staffOfficeDay.organizationId, schema.member.organizationId),
        eq(schema.staffOfficeDay.userId, schema.member.userId),
        eq(schema.staffOfficeDay.day, artDayKey())
      )
    )
    .leftJoin(schema.office, eq(schema.office.id, schema.staffOfficeDay.officeId))
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        isNull(schema.member.offlineAt)
      )
    )
    .orderBy(asc(schema.user.name));
  // 022 — presencia: el selector muestra quién está en línea ahora mismo.
  const online = new Set(onlineUserIds(organizationId));
  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    role: row.role,
    online: online.has(row.userId),
    email: row.email,
    employeeCode: row.employeeCode,
    operationalRole: row.operationalRole,
    locality: row.locality,
    officeName: (row.officeCleanName ?? row.officeName)?.trim() ?? null,
    officeSince: row.officeSince ? row.officeSince.toISOString() : null,
  }));
}
