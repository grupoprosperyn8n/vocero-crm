"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  ArrowLeft,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  MessageSquareText,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Send,
  Share2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { CHANNEL_LABEL, isChannel } from "@/lib/channels";
import { ShareContactDialog } from "@/components/contacts/share-contact-dialog";
import type { ChatAlertShareDto, ChatContactShareDto, ChatMessagePayloadDto } from "@/lib/types";
import { useEvents } from "@/components/use-events";

/**
 * 022 — Chat interno del equipo.
 *
 * Dos columnas clásicas: la lista de salas (con buscador y no leídos) y el
 * hilo. Mensajes directos para cualquier empleado; los GRUPOS solo los crea
 * y administra el dueño o un administrador (la UI esconde la opción y el
 * servidor revalida). Tiempo real por SSE (`internal.message`); el catch-up
 * es por refetch al reconectar.
 *
 * 022b — Presencia: conexión SSE viva = empleado en línea (`presence.updated`).
 * Los puntos verdes aparecen en la lista, en los selectores, en el hilo y en
 * la tarjeta de miembros de cada grupo (quién está online DENTRO del grupo).
 */

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  /** 025/027c — `text`, `contact` o `alert` (adjunto compartido). */
  kind: "text" | "contact" | "alert";
  /** 025/027c — snapshot del adjunto compartido; null en los textos. */
  payload: ChatMessagePayloadDto | null;
  createdAt: string;
};

type ChatRoom = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  displayName: string;
  membersCount: number;
  /** 022c — integrantes pausados (no cuentan como activos). */
  pausedCount: number;
  onlineCount: number;
  unreadCount: number;
  lastMessage: Omit<ChatMessage, "roomId"> | null;
  updatedAt: string;
  createdAt: string;
  createdByName: string | null;
  /** 026 — archivada SOLO para mí (bandeja personal persistente). */
  archived: boolean;
  members: {
    userId: string;
    name: string;
    online: boolean;
    paused: boolean;
  }[];
};

type StaffMember = {
  userId: string;
  name: string;
  role: string;
  online: boolean;
  email: string | null;
  employeeCode: string | null;
  operationalRole: string | null;
  locality: string | null;
  /** 023 — sucursal marcada hoy (si la eligió). */
  officeName: string | null;
  officeSince: string | null;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return fmtTime(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function fmtProfileDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function roleLabel(role: string): string {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Administrador";
  return "Miembro";
}

function sortRooms(rooms: ChatRoom[]): ChatRoom[] {
  return [...rooms].sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.updatedAt;
    const bt = b.lastMessage?.createdAt ?? b.updatedAt;
    return bt.localeCompare(at);
  });
}

/** Punto de presencia: verde = conexión viva, gris = desconectado. */
function PresenceDot({
  online,
  size = 10,
  className,
}: {
  online: boolean;
  size?: 8 | 10;
  className?: string;
}) {
  return (
    <span
      aria-label={online ? "En línea" : "Desconectado"}
      title={online ? "En línea" : "Desconectado"}
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === 8 ? "h-2 w-2 ring-1" : "h-2.5 w-2.5 ring-2",
        online ? "bg-emerald-500" : "bg-zinc-300",
        className
      )}
    />
  );
}

/** Avatar con iniciales (o ícono de grupo) y punto de presencia opcional. */
function Avatar({
  name,
  online,
  group = false,
  size = "md",
}: {
  name: string;
  online?: boolean;
  group?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "sm"
      ? "h-8 w-8 text-[11px]"
      : size === "lg"
        ? "h-11 w-11 text-[14px]"
        : "h-9 w-9 text-[12px]";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "flex items-center justify-center rounded-full",
          box,
          group
            ? "bg-brand-soft text-brand-text"
            : "border bg-subtle text-text-2",
          "font-bold"
        )}
      >
        {group ? (
          <Users className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={1.8} />
        ) : (
          initials(name)
        )}
      </span>
      {online !== undefined && (
        <PresenceDot
          online={online}
          size={size === "lg" ? 10 : 8}
          className={cn(
            "absolute -bottom-0.5 -right-0.5",
            size === "sm" && "bottom-0 right-0"
          )}
        />
      )}
    </span>
  );
}

/** Pila de avatares de los otros miembros, cada uno con su punto. */
function MemberStack({
  members,
  meId,
  isOnline,
  max = 4,
}: {
  members: { userId: string; name: string }[];
  meId: string;
  isOnline: (userId: string) => boolean;
  max?: number;
}) {
  const others = members.filter((m) => m.userId !== meId);
  const shown = others.slice(0, max);
  const rest = others.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((m) => {
        const on = isOnline(m.userId);
        return (
          <span
            key={m.userId}
            className="relative inline-flex"
            title={`${m.name} · ${on ? "en línea" : "desconectado"}`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border bg-background text-[8.5px] font-bold text-text-2">
              {initials(m.name)}
            </span>
            <PresenceDot
              online={on}
              size={8}
              className="absolute -bottom-px -right-px"
            />
          </span>
        );
      })}
      {rest > 0 && (
        <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full border bg-subtle text-[8.5px] font-bold text-text-3">
          +{rest}
        </span>
      )}
    </span>
  );
}


function isContactPayload(payload: ChatMessagePayloadDto): payload is ChatContactShareDto {
  return "source" in payload;
}

function isAlertPayload(payload: ChatMessagePayloadDto): payload is ChatAlertShareDto {
  return "urgencyLabel" in payload || "urgenciaLabel" in payload;
}

/** 025 — par base/interface del backoffice (el mismo que usa client-card). */
const AIRTABLE_BASE = "appuhslj3GFf60Tea";
const AIRTABLE_INTERFACE_CLIENTES = "pagloDiKehe3EMnT4";

/**
 * 025 — Tarjeta del contacto compartido: se dibuja dentro del mensaje, con el
 * snapshot (nombre, teléfono, canal/pólizas) y los botones para EJECUTAR algo
 * con ese cliente — abrir su ficha (CRM / interface del sistema) y abrir la
 * conversación en la Bandeja (crea/reusa/reabre el hilo).
 */
function ContactShareCard({ payload }: { payload: ChatContactShareDto }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isCrm = payload.source === "crm";
  const channelLabel =
    payload.channel && isChannel(payload.channel)
      ? CHANNEL_LABEL[payload.channel]
      : payload.channel;
  const sub = [
    payload.phone ?? "sin teléfono",
    isCrm
      ? channelLabel
      : payload.policies != null
        ? `Pólizas: ${payload.policies}`
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function abrirConversacion() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (isCrm) {
        if (!payload.contactId) {
          setErr("Falta el identificador del contacto");
          return;
        }
        const channel = payload.channel === "telegram" ? "telegram" : "whatsapp";
        const res = await fetch("/api/conversations/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contactId: payload.contactId, channel }),
        }).catch(() => null);
        const data = (await res?.json().catch(() => null)) as
          | { conversationId?: string; error?: { message?: string } }
          | null;
        if (!res?.ok || !data?.conversationId) {
          setErr(data?.error?.message ?? "No se pudo abrir la conversación");
          return;
        }
        window.location.assign(
          `/inbox?contact=${encodeURIComponent(payload.contactId)}`
        );
        return;
      }
      if (!payload.recordId) {
        setErr("Falta el identificador del cliente");
        return;
      }
      if (!payload.phone) {
        setErr("El cliente no tiene teléfono en el sistema");
        return;
      }
      const res = await fetch("/api/clients/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: payload.recordId,
          name: payload.name,
          phone: payload.phone,
        }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | { contactId?: string; error?: { message?: string } }
        | null;
      if (!res?.ok || !data?.contactId) {
        setErr(data?.error?.message ?? "No se pudo abrir la conversación");
        return;
      }
      window.location.assign(
        `/inbox?contact=${encodeURIComponent(data.contactId)}`
      );
    } finally {
      setBusy(false);
    }
  }

  const ContactIcon = isCrm ? Users : Briefcase;

  return (
    <div className="mt-1.5 rounded-md border border-brand/25 bg-background/90 px-2.5 py-2 text-text shadow-sm">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-text">
        <ContactIcon className="h-3.5 w-3.5" strokeWidth={1.9} />
        {isCrm ? "Contacto del CRM" : "Cliente del sistema"}
      </p>
      <p className="mt-0.5 text-[13.5px] font-semibold leading-tight">
        {payload.name}
      </p>
      {sub && <p className="mt-0.5 text-[11.5px] text-text-3">{sub}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {isCrm ? (
          payload.contactId ? (
            <a
              href={`/contacts?contact=${encodeURIComponent(payload.contactId)}`}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-brand/20 bg-background px-2 text-[12px] font-medium text-text hover:bg-subtle"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
              Abrir ficha
            </a>
          ) : null
        ) : payload.recordId ? (
          <a
            href={`https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_INTERFACE_CLIENTES}/${payload.recordId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-brand/20 bg-background px-2 text-[12px] font-medium text-text hover:bg-subtle"
            title="Abrir el registro en la interface del sistema"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
            Interface
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => void abrirConversacion()}
          disabled={busy}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-brand/20 bg-background px-2 text-[12px] font-medium text-text hover:bg-subtle disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.8} />
          )}
          {isCrm ? "Abrir conversación" : "Abrir chat"}
        </button>
      </div>
      {err && (
        <p className="mt-1 text-[11px] font-semibold text-red-600">{err}</p>
      )}
    </div>
  );
}

/** 027c — Tarjeta de alerta compartida dentro del chat interno local. */
function AlertShareCard({ payload }: { payload: ChatAlertShareDto }) {
  const title = payload.title || payload.titulo || "Alerta";
  const body = payload.body || payload.cuerpo;
  const type = payload.type || payload.tipo;
  const urgency = payload.urgencyLabel || payload.urgenciaLabel;
  const url = payload.recordUrl || payload.linkRegistro;

  return (
    <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-amber-950">
      <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-700">
        <BellRing className="h-3.5 w-3.5" strokeWidth={1.9} />
        Alerta compartida
      </p>
      <p className="mt-0.5 text-[13.5px] font-semibold leading-tight">
        {title}
      </p>
      <p className="mt-0.5 text-[11.5px] text-amber-800">
        {[type, urgency, payload.estado, payload.fecha].filter(Boolean).join(" · ")}
      </p>
      {body && (
        <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-text-2">
          {body}
        </p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-background px-2 text-[12px] font-medium hover:bg-amber-100"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
          Abrir registro
        </a>
      )}
    </div>
  );
}

export function InternalChat({ meId, role }: { meId: string; role: string }) {
  const canGroup = role === "owner" || role === "admin";

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  /** 026 — ver activas o archivadas (mi bandeja personal). */
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomMeta, setRoomMeta] = useState<ChatRoom | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [modal, setModal] = useState<null | "dm" | "group">(null);
  // 022c — ficha de la conversación (un clic en el header).
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [pausedBusy, setPausedBusy] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  /** 022c — salir del grupo (eliminarse a sí mismo): dueño/administrador. */
  const [leaving, setLeaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [dmQuery, setDmQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  /** 025 — diálogo «compartir un contacto» abierto. */
  const [shareOpen, setShareOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isOnline = useCallback(
    (userId: string) => onlineIds.has(userId),
    [onlineIds]
  );

  const mergeOnline = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setOnlineIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/internal/rooms").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { rooms: ChatRoom[] };
    setRooms(sortRooms(data.rooms));
    mergeOnline(
      data.rooms.flatMap((r) =>
        r.members.filter((m) => m.online).map((m) => m.userId)
      )
    );
    setLoading(false);
  }, [mergeOnline]);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/internal/staff").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { staff: StaffMember[] };
    setStaff(data.staff);
    mergeOnline(data.staff.filter((s) => s.online).map((s) => s.userId));
  }, [mergeOnline]);

  const openRoom = useCallback(
    async (roomId: string) => {
      activeIdRef.current = roomId;
      setActiveId(roomId);
      setFormError(null);
      setMembersOpen(false);
      nearBottomRef.current = true;
      const res = await fetch(`/api/internal/rooms/${roomId}/messages`).catch(
        () => null
      );
      if (!res?.ok) return;
      const data = (await res.json()) as { room: ChatRoom; messages: ChatMessage[] };
      setRoomMeta(data.room);
      setMessages(data.messages);
      mergeOnline(
        data.room.members.filter((m) => m.online).map((m) => m.userId)
      );
      setRooms((prev) =>
        sortRooms(prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)))
      );
      void fetch(`/api/internal/rooms/${roomId}/read`, { method: "POST" }).catch(
        () => null
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [mergeOnline]
  );

  const backToList = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setRoomMeta(null);
    setMembersOpen(false);
    setMessages([]);
  }, []);

  useEffect(() => {
    void loadRooms();
    void loadStaff();
  }, [loadRooms, loadStaff]);

  useEvents({
    onInternalMessage: (data) => {
      const msg = data.message as ChatMessage;
      if (!msg?.id) return;
      // Lista: último mensaje + no leído si no es mía ni la sala abierta.
      setRooms((prev) =>
        sortRooms(
          prev.map((r) =>
            r.id === data.roomId
              ? {
                  ...r,
                  lastMessage: { ...msg },
                  unreadCount:
                    msg.senderId !== meId && data.roomId !== activeIdRef.current
                      ? r.unreadCount + 1
                      : r.unreadCount,
                }
              : r
          )
        )
      );
      if (data.roomId === activeIdRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
        );
        void fetch(`/api/internal/rooms/${data.roomId}/read`, {
          method: "POST",
        }).catch(() => null);
        setRooms((prev) =>
          prev.map((r) => (r.id === data.roomId ? { ...r, unreadCount: 0 } : r))
        );
      }
    },
    onInternalRoom: () => {
      void loadRooms();
      // 022c — la sala abierta se refresca sola (pausas, altas y bajas se
      // reflejan sin recargar la página).
      if (activeIdRef.current) void openRoom(activeIdRef.current);
    },
    onPresenceUpdated: (data) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (data.online) next.add(data.userId);
        else next.delete(data.userId);
        return next;
      });
    },
    onReconnect: () => {
      void loadRooms();
      void loadStaff();
      if (activeIdRef.current) void openRoom(activeIdRef.current);
    },
  });

  // Auto-scroll: siempre si el mensaje es mío; si llegó uno ajeno, solo si
  // ya estaba abajo (leer historial no te tira al final).
  useEffect(() => {
    const last = messages.length > 0 ? messages[messages.length - 1] : null;
    if (!last) return;
    if (last.senderId === meId || nearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  function onListScroll() {
    const el = listRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }

  async function sendMessage() {
    const body = text.trim();
    if (!body || !activeIdRef.current || sending) return;
    setSending(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/internal/rooms/${activeIdRef.current}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setFormError(data?.error?.message ?? "No se pudo enviar el mensaje");
        return;
      }
      const data = (await res.json()) as { message: ChatMessage };
      setMessages((prev) =>
        prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]
      );
      setRooms((prev) =>
        sortRooms(
          prev.map((r) =>
            r.id === data.message.roomId
              ? { ...r, lastMessage: { ...data.message }, unreadCount: 0 }
              : r
          )
        )
      );
      setText("");
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  }

  /**
   * 025 — Comparte un contacto (CRM o sistema) en la sala activa. La tarjeta
   * viaja como `kind: "contact"` + `payload`; la nota es opcional (si viene
   * vacía, el servidor pone el texto por defecto).
   */
  async function shareContact(
    payload: ChatContactShareDto,
    note: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!activeIdRef.current) {
      return { ok: false, error: "Elegí una conversación primero" };
    }
    try {
      const res = await fetch(
        `/api/internal/rooms/${activeIdRef.current}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: note, contact: payload }),
        }
      );
      const data = (await res.json().catch(() => null)) as
        | { message?: ChatMessage; error?: { message?: string } }
        | null;
      if (!res.ok || !data?.message) {
        return {
          ok: false,
          error: data?.error?.message ?? "No se pudo compartir el contacto",
        };
      }
      const msg = data.message;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
      );
      setRooms((prev) =>
        sortRooms(
          prev.map((r) =>
            r.id === msg.roomId
              ? { ...r, lastMessage: { ...msg }, unreadCount: 0 }
              : r
          )
        )
      );
      return { ok: true };
    } catch {
      return { ok: false, error: "No se pudo compartir el contacto" };
    }
  }

  async function createRoom(payload: unknown): Promise<ChatRoom | null> {
    setFormError(null);
    const res = await fetch("/api/internal/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) {
      setFormError("Sin conexión con el servidor");
      return null;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setFormError(data?.error?.message ?? "No se pudo crear la conversación");
      return null;
    }
    const data = (await res.json()) as { room: ChatRoom };
    setRooms((prev) => sortRooms([data.room, ...prev.filter((r) => r.id !== data.room.id)]));
    return data.room;
  }

  async function startDm(userId: string) {
    const room = await createRoom({ kind: "dm", userId });
    if (room) {
      setModal(null);
      setMembersOpen(false);
      setDmQuery("");
      void openRoom(room.id);
    }
  }

  async function createGroup() {
    const name = groupName.trim();
    if (!name) {
      setFormError("Poné un nombre para el grupo");
      return;
    }
    if (groupSel.size === 0) {
      setFormError("Elegí al menos un compañero");
      return;
    }
    const room = await createRoom({
      kind: "group",
      name,
      memberIds: Array.from(groupSel),
    });
    if (room) {
      setModal(null);
      setGroupName("");
      setGroupSel(new Set());
      void openRoom(room.id);
    }
  }

  // 022c — Ficha de la conversación: un clic en el header del hilo.
  function openProfile() {
    if (!roomMeta) return;
    setFormError(null);
    setMembersOpen(false);
    setNameDraft(roomMeta.name ?? roomMeta.displayName);
    setConfirmDelete(false);
    setConfirmRemoveId(null);
    setAddOpen(false);
    setProfileOpen(true);
  }

  /** PATCH al grupo + refresco de lista e hilo (la ficha queda viva). */
  async function patchRoom(patch: Record<string, unknown>): Promise<boolean> {
    if (!roomMeta) return false;
    setFormError(null);
    const res = await fetch(`/api/internal/rooms/${roomMeta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (!res) {
      setFormError("Sin conexión con el servidor");
      return false;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setFormError(data?.error?.message ?? "No se pudo guardar el grupo");
      return false;
    }
    await loadRooms();
    if (activeIdRef.current) await openRoom(activeIdRef.current);
    return true;
  }

  async function saveName() {
    if (!roomMeta || savingName) return;
    const name = nameDraft.trim();
    if (!name) {
      setFormError("Poné un nombre para el grupo");
      return;
    }
    if (name === (roomMeta.name ?? "")) return;
    setSavingName(true);
    try {
      await patchRoom({ name });
    } finally {
      setSavingName(false);
    }
  }

  async function togglePause(userId: string, paused: boolean) {
    if (pausedBusy) return;
    setPausedBusy(userId);
    try {
      await patchRoom(
        paused ? { unpauseUserIds: [userId] } : { pauseUserIds: [userId] }
      );
    } finally {
      setPausedBusy(null);
    }
  }

  async function removeMember(userId: string) {
    // Dos toques: el primero pide confirmación ("¿Sacar?"), el segundo saca.
    if (confirmRemoveId !== userId) {
      setConfirmRemoveId(userId);
      return;
    }
    setConfirmRemoveId(null);
    await patchRoom({ removeUserIds: [userId] });
  }

  // 022c — "Salir del grupo": el dueño/administrador también puede eliminarse
  // a sí mismo del grupo (permanente, con doble toque de confirmación).
  async function leaveGroup() {
    if (!roomMeta || leaving) return;
    if (confirmRemoveId !== meId) {
      setConfirmRemoveId(meId);
      return;
    }
    setConfirmRemoveId(null);
    setLeaving(true);
    try {
      const res = await fetch(`/api/internal/rooms/${roomMeta.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeUserIds: [meId] }),
      }).catch(() => null);
      if (!res || !res.ok) {
        const data = res
          ? ((await res.json().catch(() => null)) as {
              error?: { message?: string };
            } | null)
          : null;
        setFormError(data?.error?.message ?? "No se pudo salir del grupo");
        return;
      }
      setProfileOpen(false);
      backToList();
      await loadRooms();
    } finally {
      setLeaving(false);
    }
  }

  async function addMember(userId: string) {
    await patchRoom({ addUserIds: [userId] });
  }

  async function deleteGroup() {
    if (!roomMeta || deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/internal/rooms/${roomMeta.id}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!res || !res.ok) {
        const data = res
          ? ((await res.json().catch(() => null)) as
              | { error?: { message?: string } }
              | null)
          : null;
        setFormError(data?.error?.message ?? "No se pudo eliminar el grupo");
        return;
      }
      setProfileOpen(false);
      backToList();
      await loadRooms();
    } finally {
      setDeleting(false);
    }
  }

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.lastMessage?.body ?? "").toLowerCase().includes(q) ||
        r.members.some(
          (m) => m.userId !== meId && m.name.toLowerCase().includes(q)
        )
    );
  }, [rooms, query, meId]);

  // 026 — activas vs archivadas: la sala archivada sale de MI lista (a los
  // demás no los toca) y se recupera desde la pestaña «Archivadas».
  const visibleRooms = useMemo(
    () => filteredRooms.filter((r) => (showArchived ? r.archived : !r.archived)),
    [filteredRooms, showArchived]
  );
  const archivedCount = useMemo(
    () => rooms.filter((r) => r.archived).length,
    [rooms]
  );

  /**
   * 026 — Archiva/desarchiva la sala SOLO para mí (pedido Diego: «los chat
   * individual también se tiene que poder archivar de la bandeja de entrada»).
   */
  const archiveRoom = useCallback(async (roomId: string, archived: boolean) => {
    const res = await fetch(`/api/internal/rooms/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as
      | { ok?: boolean; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.ok) {
      setFormError(
        data?.error?.message ?? "No se pudo archivar la conversación"
      );
      return;
    }
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, archived } : r))
    );
  }, []);

  // Selectores: todos menos yo; primero los que están en línea, y por nombre.
  const staffForPicker = useMemo(() => {
    return staff
      .filter((s) => s.userId !== meId)
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name, "es");
      });
  }, [staff, meId]);

  const dmStaff = useMemo(() => {
    const q = dmQuery.trim().toLowerCase();
    if (!q) return staffForPicker;
    return staffForPicker.filter((s) => s.name.toLowerCase().includes(q));
  }, [staffForPicker, dmQuery]);

  /** 022c — quiénes se pueden sumar al grupo abierto (fuera de él). */
  const staffAddable = useMemo(() => {
    if (!roomMeta || roomMeta.kind !== "group") return [];
    const current = new Set(roomMeta.members.map((m) => m.userId));
    return staffForPicker.filter((s) => !current.has(s.userId));
  }, [staffForPicker, roomMeta]);

  const teamOnline = useMemo(
    () => staffForPicker.filter((s) => isOnline(s.userId)).length,
    [staffForPicker, isOnline]
  );

  const groupSelOnline = useMemo(
    () => [...groupSel].filter((id) => isOnline(id)).length,
    [groupSel, isOnline]
  );

  // Encabezado del hilo: presencia del otro (DM) o del grupo.
  const peer =
    roomMeta?.kind === "dm"
      ? roomMeta.members.find((m) => m.userId !== meId) ?? null
      : null;
  const peerOnline = peer ? isOnline(peer.userId) : false;
  const peerStaff = peer
    ? staff.find((s) => s.userId === peer.userId) ?? null
    : null;
  // Sucursal del día de un integrante (header del DM y filas de miembros).
  const officeOf = useCallback(
    (userId: string) => staff.find((x) => x.userId === userId)?.officeName ?? null,
    [staff]
  );
  const groupOnline = roomMeta?.kind === "group"
    ? roomMeta.members.filter(
        (m) => !m.paused && m.userId !== meId && isOnline(m.userId)
      ).length
    : 0;

  return (
    <div className="flex h-full">
      {/* Columna de salas */}
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r lg:w-[19.5rem] lg:shrink-0",
          activeId && "hidden lg:flex"
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3"
              strokeWidth={1.8}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en el chat interno"
              className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-1 rounded-md bg-brand px-2.5 py-2 text-[13px] font-semibold text-brand-fg hover:opacity-90"
              aria-label="Nueva conversación"
            >
              <Plus className="h-4 w-4" strokeWidth={2.2} />
              Nuevo
            </button>
            {menuOpen && (
              <>
                <button
                  aria-label="Cerrar menú"
                  tabIndex={-1}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 z-50 mt-1 w-48 rounded-md border bg-background py-1 shadow-pop">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-accent"
                    onClick={() => {
                      setMenuOpen(false);
                      setFormError(null);
                      setModal("dm");
                    }}
                  >
                    <MessageSquareText className="h-4 w-4 text-text-3" strokeWidth={1.8} />
                    Mensaje directo
                  </button>
                  {canGroup && (
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-accent"
                      onClick={() => {
                        setMenuOpen(false);
                        setFormError(null);
                        setModal("group");
                      }}
                    >
                      <Users className="h-4 w-4 text-text-3" strokeWidth={1.8} />
                      Nuevo grupo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 026 — pestañas de MI bandeja: activas / archivadas (persistente) */}
        <div className="flex items-center gap-1 border-b px-3 py-2">
          <button
            onClick={() => setShowArchived(false)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
              !showArchived
                ? "bg-brand-tint text-text-1"
                : "text-text-3 hover:bg-accent"
            )}
          >
            Activas
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors",
              showArchived
                ? "bg-brand-tint text-text-1"
                : "text-text-3 hover:bg-accent"
            )}
            title="Conversaciones que archivaste (solo para vos)"
          >
            <Archive className="h-3.5 w-3.5" strokeWidth={1.8} />
            Archivadas
            {archivedCount > 0 && (
              <span className="text-[11px] font-bold text-text-2">
                {archivedCount}
              </span>
            )}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <p className="px-4 py-6 text-[13px] text-text-3">Cargando…</p>
          )}
          {!loading && visibleRooms.length === 0 && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle">
                {query ? (
                  <Search className="h-5 w-5 text-text-3" strokeWidth={1.6} />
                ) : showArchived ? (
                  <Archive className="h-5 w-5 text-text-3" strokeWidth={1.6} />
                ) : (
                  <MessageSquareText className="h-5 w-5 text-text-3" strokeWidth={1.6} />
                )}
              </span>
              <p className="mt-2.5 text-[13.5px] font-semibold">
                {query
                  ? "Nada coincide con la búsqueda"
                  : showArchived
                    ? "No tenés conversaciones archivadas"
                    : "No hay conversaciones"}
              </p>
              {!query && (
                <p className="mt-1 text-[12.5px] text-text-3">
                  {showArchived
                    ? "Las que archives van a quedar acá, solo para vos"
                    : canGroup
                      ? "Empezá un mensaje directo o creá un grupo"
                      : "Empezá un mensaje directo con un compañero"}
                </p>
              )}
            </div>
          )}
          {visibleRooms.map((room) => {
            const active = room.id === activeId;
            const last = room.lastMessage;
            const peerRow =
              room.kind === "dm"
                ? room.members.find((m) => m.userId !== meId) ?? null
                : null;
            const onlineCount = room.members.filter(
              (m) => !m.paused && m.userId !== meId && isOnline(m.userId)
            ).length;
            return (
              <button
                key={room.id}
                onClick={() => void openRoom(room.id)}
                className={cn(
                  "group/row flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors",
                  active ? "bg-brand-tint" : "hover:bg-accent"
                )}
              >
                <span className="mt-0.5">
                  <Avatar
                    name={room.displayName}
                    group={room.kind === "group"}
                    online={
                      room.kind === "dm" && peerRow
                        ? isOnline(peerRow.userId)
                        : undefined
                    }
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">
                      {room.displayName}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {last && (
                        <span className="text-[11px] text-text-3">
                          {fmtListTime(last.createdAt)}
                        </span>
                      )}
                      {/* 026 — archivar/desarchivar SOLO para mí */}
                      <span
                        role="button"
                        tabIndex={0}
                        title={room.archived ? "Desarchivar" : "Archivar"}
                        aria-label={room.archived ? "Desarchivar" : "Archivar"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void archiveRoom(room.id, !room.archived);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            void archiveRoom(room.id, !room.archived);
                          }
                        }}
                        className="rounded p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-accent hover:text-text-1 focus:opacity-100 group-hover/row:opacity-100"
                      >
                        {room.archived ? (
                          <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={1.8} />
                        ) : (
                          <Archive className="h-3.5 w-3.5" strokeWidth={1.8} />
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[12.5px] text-text-2">
                      {last
                        ? `${last.senderId === meId ? "Yo: " : ""}${last.body}`
                        : "Sin mensajes todavía"}
                    </span>
                    {room.unreadCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold text-brand-fg">
                        {room.unreadCount}
                      </span>
                    )}
                  </span>
                  {room.kind === "group" && (
                    <span className="mt-1 flex items-center gap-2">
                      <MemberStack
                        members={room.members.filter((m) => !m.paused)}
                        meId={meId}
                        isOnline={isOnline}
                      />
                      <span
                        className={cn(
                          "text-[11px]",
                          onlineCount > 0
                            ? "font-semibold text-emerald-600"
                            : "text-text-3"
                        )}
                      >
                        {onlineCount > 0
                          ? `${onlineCount} en línea`
                          : "Nadie en línea"}
                      </span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 border-t px-3 py-1.5 text-[11.5px]">
          {teamOnline > 0 ? (
            <>
              <PresenceDot online size={8} />
              <span className="font-semibold text-emerald-600">
                {teamOnline} del equipo en línea
              </span>
            </>
          ) : (
            <span className="text-text-3">Nadie más en línea ahora</span>
          )}
        </div>
      </aside>

      {/* Hilo */}
      <section
        className={cn(
          "relative min-w-0 flex-1 flex-col",
          activeId ? "flex" : "hidden lg:flex"
        )}
      >
        {!activeId && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle">
              <MessageSquareText className="h-6 w-6 text-text-3" strokeWidth={1.6} />
            </span>
            <p className="mt-1 text-[14px] font-semibold">
              Chat interno del equipo
            </p>
            <p className="max-w-sm text-[13px] text-text-3">
              Elegí una conversación de la izquierda, abrí un mensaje directo o
              {canGroup ? " creá un grupo." : " escribile a un compañero."}
            </p>
          </div>
        )}

        {activeId && (
          <>
            <header className="flex items-center gap-2.5 border-b px-3 py-2.5">
              <button
                onClick={backToList}
                className="rounded-md p-1.5 text-text-2 hover:bg-accent lg:hidden"
                aria-label="Volver a la lista"
              >
                <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
              {/* 022c — la ficha se abre con UN clic en el perfil (grupo:
                  tarjeta con gestión; empleado: datos y estado). */}
              <button
                type="button"
                onClick={openProfile}
                className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent"
                title={
                  roomMeta?.kind === "group"
                    ? "Ver la tarjeta del grupo"
                    : "Ver la ficha del empleado"
                }
              >
                <Avatar
                  name={roomMeta?.displayName ?? ""}
                  group={roomMeta?.kind === "group"}
                  online={roomMeta?.kind === "dm" ? peerOnline : undefined}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold">
                    {roomMeta?.displayName ?? ""}
                  </p>
                  <p className="text-[11.5px]">
                    {roomMeta?.kind === "group" ? (
                      <>
                        <span className="text-text-3">
                          {roomMeta.membersCount} miembros
                        </span>
                        {roomMeta.pausedCount > 0 && (
                          <>
                            <span className="text-text-3"> · </span>
                            <span className="text-amber-700">
                              {roomMeta.pausedCount} en pausa
                            </span>
                          </>
                        )}
                        <span className="text-text-3"> · </span>
                        <span
                          className={cn(
                            groupOnline > 0
                              ? "font-semibold text-emerald-600"
                              : "text-text-3"
                          )}
                        >
                          {groupOnline > 0
                            ? `${groupOnline} en línea`
                            : "nadie en línea"}
                        </span>
                      </>
                    ) : (
                      <span>
                        {peerOnline ? (
                          <span className="font-semibold text-emerald-600">
                            En línea
                          </span>
                        ) : (
                          <span className="text-text-3">Desconectado</span>
                        )}
                        <span className="text-text-3">
                          {" · "}
                          {peerStaff?.officeName
                            ? `Sucursal: ${peerStaff.officeName}`
                            : "Sin sucursal marcada"}
                        </span>
                      </span>
                    )}
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-text-2"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
              {roomMeta?.kind === "group" && (
                <div className="relative">
                  <button
                    onClick={() => setMembersOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-accent"
                    aria-label="Miembros del grupo"
                  >
                    <Users className="h-4 w-4" strokeWidth={1.8} />
                    {roomMeta.membersCount}
                  </button>
                </div>
              )}
            </header>

            {/* Tarjeta de miembros: quién está online DENTRO del grupo */}
            {membersOpen && roomMeta?.kind === "group" && (
              <>
                <button
                  aria-label="Cerrar miembros"
                  tabIndex={-1}
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setMembersOpen(false)}
                />
                <div className="absolute right-3 top-[52px] z-50 w-72 overflow-hidden rounded-md border bg-background shadow-pop">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <p className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                      Miembros ({roomMeta.membersCount})
                    </p>
                    {canGroup && (
                      <button
                        onClick={openProfile}
                        className="flex items-center gap-1 text-[12px] font-semibold text-brand-text hover:underline"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={2} />
                        Editar grupo
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {roomMeta.members.map((mem) => {
                      const on = !mem.paused && isOnline(mem.userId);
                      const me = mem.userId === meId;
                      return (
                        <button
                          key={mem.userId}
                          disabled={me}
                          onClick={() => {
                            if (!me) void startDm(mem.userId);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-1.5 text-left",
                            me ? "cursor-default" : "hover:bg-accent"
                          )}
                        >
                          <Avatar name={mem.name} online={on} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">
                              {mem.name}
                              {me ? " (vos)" : ""}
                            </span>
                            <span
                              className={cn(
                                "block text-[11px]",
                                mem.paused
                                  ? "text-amber-700"
                                  : on
                                    ? "font-semibold text-emerald-600"
                                    : "text-text-3"
                              )}
                            >
                              {mem.paused
                                ? "Pausado"
                                : on
                                  ? "En línea"
                                  : "Desconectado"}
                              <span className="text-text-3">
                                {" · "}
                                {officeOf(mem.userId)
                                  ? `Sucursal: ${officeOf(mem.userId)}`
                                  : "Sin sucursal"}
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div
              ref={listRef}
              onScroll={onListScroll}
              className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5"
            >
              {messages.length === 0 && (
                <p className="py-10 text-center text-[13px] text-text-3">
                  Todavía no hay mensajes — escribí el primero.
                </p>
              )}
              {messages.map((m, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const newDay =
                  !prev ||
                  new Date(prev.createdAt).toDateString() !==
                    new Date(m.createdAt).toDateString();
                const mine = m.senderId === meId;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <p className="my-3 text-center text-[11px] font-semibold uppercase tracking-wide text-text-3">
                        {dayLabel(m.createdAt)}
                      </p>
                    )}
                    <div
                      className={cn(
                        "mb-2 flex",
                        mine ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-md border px-3 py-2 sm:max-w-[70%]",
                          mine ? "border-brand bg-brand-tint" : "bg-subtle"
                        )}
                      >
                        {!mine && roomMeta?.kind === "group" && (
                          <p className="mb-0.5 text-[11.5px] font-bold text-brand-text">
                            {m.senderName}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug">
                          {m.body}
                        </p>
                        {m.kind === "contact" && m.payload && isContactPayload(m.payload) && (
                          <ContactShareCard payload={m.payload} />
                        )}
                        {m.kind === "alert" && m.payload && isAlertPayload(m.payload) && (
                          <AlertShareCard payload={m.payload} />
                        )}
                        <p
                          className={cn(
                            "mt-0.5 text-right text-[10.5px]",
                            mine ? "text-brand-text" : "text-text-3"
                          )}
                        >
                          {fmtTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="border-t px-3 py-2.5 sm:px-5">
              {formError && (
                <p className="mb-1.5 text-[12px] font-semibold text-red-600">
                  {formError}
                </p>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
              >
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md border text-text-2 hover:bg-subtle"
                  aria-label="Compartir un contacto"
                  title="Compartir un contacto"
                >
                  <Share2 className="h-4 w-4" strokeWidth={1.8} />
                </button>
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                  }}
                  rows={1}
                  placeholder="Escribí un mensaje…"
                  className="max-h-32 min-h-[38px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-md bg-brand text-brand-fg hover:opacity-90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* Modal: mensaje directo */}
      {modal === "dm" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-md border bg-background shadow-pop">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-[15px] font-bold">Nuevo mensaje directo</h3>
              <button
                onClick={() => setModal(null)}
                className="rounded-md p-1 text-text-3 hover:bg-accent"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </header>
            <div className="border-b px-4 py-2.5">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3"
                  strokeWidth={1.8}
                />
                <input
                  value={dmQuery}
                  onChange={(e) => setDmQuery(e.target.value)}
                  placeholder="Buscar compañero"
                  autoFocus
                  className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
                />
              </div>
            </div>
            {formError && (
              <p className="px-4 pt-2 text-[12px] font-semibold text-red-600">
                {formError}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {dmStaff.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-text-3">
                  Sin resultados
                </p>
              )}
              {dmStaff.map((s) => {
                const on = isOnline(s.userId);
                return (
                  <button
                    key={s.userId}
                    onClick={() => void startDm(s.userId)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-accent"
                  >
                    <Avatar name={s.name} online={on} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {s.name}
                      </span>
                      <span className="block text-[11.5px] text-text-3">
                        {roleLabel(s.role)}
                      </span>
                    </span>
                    {on && (
                      <span className="shrink-0 text-[11px] font-semibold text-emerald-600">
                        En línea
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: nuevo grupo */}
      {modal === "group" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-md border bg-background shadow-pop">
            <header className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-[15px] font-bold">Nuevo grupo</h3>
              <button
                onClick={() => setModal(null)}
                className="rounded-md p-1 text-text-3 hover:bg-accent"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </header>
            <div className="border-b px-4 py-3">
              <label className="mb-1 block text-[12.5px] font-semibold text-text-2">
                Nombre del grupo
              </label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ej: Equipo de ventas"
                autoFocus
                maxLength={80}
                className="w-full rounded-md border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
              />
            </div>
            <p className="flex items-center gap-1.5 px-4 pt-3 text-[12.5px] font-semibold text-text-2">
              Integrantes ({groupSel.size + 1})
              {groupSelOnline > 0 && (
                <span className="inline-flex items-center gap-1 font-normal text-emerald-600">
                  · {groupSelOnline} en línea
                </span>
              )}
            </p>
            {formError && (
              <p className="px-4 pt-1 text-[12px] font-semibold text-red-600">
                {formError}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {staffForPicker.map((s) => {
                const checked = groupSel.has(s.userId);
                const on = isOnline(s.userId);
                return (
                  <button
                    key={s.userId}
                    onClick={() =>
                      setGroupSel((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.userId)) next.delete(s.userId);
                        else next.add(s.userId);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-accent"
                  >
                    <span
                      className={cn(
                        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-brand bg-brand text-brand-fg"
                          : "bg-background"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <Avatar name={s.name} online={on} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {s.name}
                      </span>
                      <span className="block text-[11.5px] text-text-3">
                        {roleLabel(s.role)}
                      </span>
                    </span>
                    {on && (
                      <span className="shrink-0 text-[11px] font-semibold text-emerald-600">
                        En línea
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <footer className="flex justify-end gap-2 border-t px-4 py-3">
              <button
                onClick={() => setModal(null)}
                className="rounded-md border px-3 py-2 text-[13px] font-semibold text-text-2 hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                onClick={() => void createGroup()}
                disabled={!groupName.trim() || groupSel.size === 0}
                className="rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg hover:opacity-90 disabled:opacity-40"
              >
                Crear grupo
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* 022c — Ficha de la conversación: un clic en el header del hilo.
          Grupo → tarjeta con datos y gestión (nombre, miembros, pausas,
          eliminar). Empleado (DM) → datos, estado en línea y ficha. */}
      {profileOpen && roomMeta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-md border bg-background shadow-pop">
            {roomMeta.kind === "group" ? (
              <>
                <header className="flex items-center justify-between border-b px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[15px] font-bold">
                      {roomMeta.name ?? roomMeta.displayName}
                    </h3>
                    <p className="mt-0.5 text-[11.5px] text-text-3">
                      Creado el {fmtProfileDate(roomMeta.createdAt)}
                      {roomMeta.createdByName
                        ? ` por ${roomMeta.createdByName}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="rounded-md p-1 text-text-3 hover:bg-accent"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </header>

                {canGroup && (
                  <div className="border-b px-4 py-3">
                    <label className="mb-1 block text-[12.5px] font-semibold text-text-2">
                      Nombre del grupo
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
                      />
                      <button
                        onClick={() => void saveName()}
                        disabled={
                          savingName ||
                          !nameDraft.trim() ||
                          nameDraft.trim() === (roomMeta.name ?? "")
                        }
                        className="rounded-md border px-2.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-accent disabled:opacity-40"
                      >
                        {savingName ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                )}

                <p className="flex items-center gap-2 px-4 pt-3 text-[12.5px] font-semibold text-text-2">
                  Integrantes ({roomMeta.membersCount})
                  {roomMeta.pausedCount > 0 && (
                    <span className="font-normal text-amber-700">
                      · {roomMeta.pausedCount} en pausa
                    </span>
                  )}
                </p>
                {formError && (
                  <p className="px-4 pt-1 text-[12px] font-semibold text-red-600">
                    {formError}
                  </p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto py-1">
                  {[...roomMeta.members]
                    .sort((a, b) => {
                      if (a.paused !== b.paused) return a.paused ? 1 : -1;
                      const aOn = !a.paused && isOnline(a.userId);
                      const bOn = !b.paused && isOnline(b.userId);
                      if (aOn !== bOn) return aOn ? -1 : 1;
                      return a.name.localeCompare(b.name, "es");
                    })
                    .map((mem) => {
                      const on = !mem.paused && isOnline(mem.userId);
                      const me = mem.userId === meId;
                      const busy = pausedBusy === mem.userId;
                      const confirming = confirmRemoveId === mem.userId;
                      return (
                        <div
                          key={mem.userId}
                          className="flex items-center gap-2.5 px-4 py-2"
                        >
                          <Avatar name={mem.name} online={on} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold">
                              {mem.name}
                              {me ? " (vos)" : ""}
                            </span>
                            <span
                              className={cn(
                                "block text-[11.5px]",
                                mem.paused
                                  ? "text-amber-700"
                                  : on
                                    ? "font-semibold text-emerald-600"
                                    : "text-text-3"
                              )}
                            >
                              {roleLabel(
                                staff.find((s) => s.userId === mem.userId)
                                  ?.role ?? "member"
                              )}
                              {" · "}
                              {mem.paused
                                ? "Pausado"
                                : on
                                  ? "En línea"
                                  : "Desconectado"}
                              {" · "}
                              {officeOf(mem.userId)
                                ? `Sucursal: ${officeOf(mem.userId)}`
                                : "Sin sucursal"}
                            </span>
                          </span>
                          {canGroup && !me && (
                            <span className="flex shrink-0 items-center gap-1">
                              {mem.paused ? (
                                <button
                                  onClick={() => void togglePause(mem.userId, true)}
                                  disabled={busy}
                                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold text-emerald-700 hover:bg-accent disabled:opacity-40"
                                  title="Reactivar en el grupo"
                                >
                                  <PlayCircle
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                  />
                                  {busy ? "…" : "Reactivar"}
                                </button>
                              ) : (
                                <button
                                  onClick={() => void togglePause(mem.userId, false)}
                                  disabled={busy}
                                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold text-text-2 hover:bg-accent disabled:opacity-40"
                                  title="Pausar en el grupo (reversible)"
                                >
                                  <PauseCircle
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.8}
                                  />
                                  {busy ? "…" : "Pausar"}
                                </button>
                              )}
                              <button
                                onClick={() => void removeMember(mem.userId)}
                                className={cn(
                                  "flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold",
                                  confirming
                                    ? "border-red-300 bg-red-50 text-red-700"
                                    : "text-text-2 hover:bg-accent"
                                )}
                                title="Sacar del grupo (permanente)"
                              >
                                <UserMinus
                                  className="h-3.5 w-3.5"
                                  strokeWidth={1.8}
                                />
                                {confirming ? "¿Sacar?" : "Sacar"}
                              </button>
                            </span>
                          )}
                          {canGroup && me && (
                            <button
                              onClick={() => void leaveGroup()}
                              disabled={leaving}
                              className={cn(
                                "flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold",
                                confirmRemoveId === mem.userId
                                  ? "border-red-300 bg-red-50 text-red-700"
                                  : "text-text-2 hover:bg-accent"
                              )}
                              title="Salir del grupo (te elimina permanentemente)"
                            >
                              <LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />
                              {leaving
                                ? "…"
                                : confirmRemoveId === mem.userId
                                  ? "¿Salir?"
                                  : "Salir"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  {canGroup && (
                    <div className="mt-1 border-t px-4 pb-1 pt-2">
                      <button
                        onClick={() => setAddOpen((v) => !v)}
                        className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-text hover:underline"
                      >
                        <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                        {addOpen ? "Ocultar" : "Agregar integrantes"}
                      </button>
                      {addOpen && (
                        <div className="mt-1.5 overflow-hidden rounded-md border">
                          {staffAddable.length === 0 && (
                            <p className="px-3 py-2 text-[12.5px] text-text-3">
                              No queda nadie para agregar
                            </p>
                          )}
                          {staffAddable.map((s) => (
                            <button
                              key={s.userId}
                              onClick={() => void addMember(s.userId)}
                              className="flex w-full items-center gap-2.5 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-accent"
                            >
                              <Avatar
                                name={s.name}
                                online={isOnline(s.userId)}
                                size="sm"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold">
                                  {s.name}
                                </span>
                                <span className="block text-[11px] text-text-3">
                                  {roleLabel(s.role)}
                                </span>
                              </span>
                              <Plus
                                className="h-3.5 w-3.5 shrink-0 text-text-3"
                                strokeWidth={2}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
                  {canGroup ? (
                    confirmDelete ? (
                      <span className="flex items-center gap-2">
                        <button
                          onClick={() => setConfirmDelete(false)}
                          className="rounded-md border px-2.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-accent"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => void deleteGroup()}
                          disabled={deleting}
                          className="rounded-md bg-red-600 px-2.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                        >
                          {deleting ? "Eliminando…" : "Eliminar para todos"}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        Eliminar grupo
                      </button>
                    )
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg hover:opacity-90"
                  >
                    Listo
                  </button>
                </footer>
              </>
            ) : (
              <>
                <header className="flex items-center justify-between border-b px-4 py-3">
                  <h3 className="text-[15px] font-bold">Ficha del empleado</h3>
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="rounded-md p-1 text-text-3 hover:bg-accent"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </header>
                <div className="flex flex-col items-center gap-1.5 px-4 pb-2 pt-4">
                  <Avatar
                    name={roomMeta.displayName}
                    online={peerOnline}
                    size="md"
                  />
                  <p className="text-[15.5px] font-bold">
                    {roomMeta.displayName}
                  </p>
                  <p className="text-[12px] text-text-2">
                    {peerStaff ? roleLabel(peerStaff.role) : "Empleado"}
                  </p>
                  <span
                    className={cn(
                      "mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold",
                      peerOnline
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "text-text-3"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        peerOnline ? "bg-emerald-500" : "bg-text-3"
                      )}
                    />
                    {peerOnline ? "En línea ahora" : "Desconectado"}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                  {!peerStaff && (
                    <p className="py-2 text-[12.5px] text-text-3">
                      Sin ficha de empleado (la cuenta no está en el equipo
                      activo).
                    </p>
                  )}
                  {peerStaff?.email && (
                    <p className="flex items-center gap-2 border-b py-2 text-[13px] last:border-b-0">
                      <Mail
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.7}
                      />
                      <span className="truncate">{peerStaff.email}</span>
                    </p>
                  )}
                  {peerStaff?.operationalRole && (
                    <p className="flex items-center gap-2 border-b py-2 text-[13px] last:border-b-0">
                      <Briefcase
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.7}
                      />
                      {peerStaff.operationalRole}
                    </p>
                  )}
                  {peerStaff?.locality && (
                    <p className="flex items-center gap-2 border-b py-2 text-[13px] last:border-b-0">
                      <MapPin
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.7}
                      />
                      {peerStaff.locality}
                    </p>
                  )}
                  {peerStaff && (
                    <p className="flex items-center gap-2 py-2 text-[13px]">
                      <Building2
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.7}
                      />
                      {peerStaff.officeName ? (
                        <>
                          Sucursal hoy: {peerStaff.officeName}
                          {peerStaff.officeSince
                            ? ` · desde ${fmtTime(peerStaff.officeSince)}`
                            : ""}
                        </>
                      ) : (
                        <span className="text-text-3">
                          Sin sucursal elegida hoy
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <footer className="flex justify-end border-t px-4 py-3">
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="rounded-md bg-brand px-3 py-2 text-[13px] font-semibold text-brand-fg hover:opacity-90"
                  >
                    Cerrar
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      )}
      {shareOpen && (
        <ShareContactDialog
          onClose={() => setShareOpen(false)}
          onShare={shareContact}
        />
      )}
    </div>
  );
}
