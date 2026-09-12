"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useEvents } from "@/components/use-events";

/**
 * 022 — Chat interno del equipo.
 *
 * Dos columnas clásicas: la lista de salas (con buscador y no leídos) y el
 * hilo. Mensajes directos para cualquier empleado; los GRUPOS solo los crea
 * el dueño o un administrador (la UI esconde la opción y el servidor
 * revalida). Tiempo real por SSE (`internal.message`); el catch-up es por
 * refetch al reconectar.
 */

type ChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

type ChatRoom = {
  id: string;
  kind: "dm" | "group";
  name: string | null;
  displayName: string;
  membersCount: number;
  unreadCount: number;
  lastMessage: Omit<ChatMessage, "roomId"> | null;
  updatedAt: string;
  members: { userId: string; name: string }[];
};

type StaffMember = { userId: string; name: string; role: string };

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

export function InternalChat({ meId, role }: { meId: string; role: string }) {
  const canGroup = role === "owner" || role === "admin";

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomMeta, setRoomMeta] = useState<ChatRoom | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<null | "dm" | "group">(null);
  const [groupName, setGroupName] = useState("");
  const [groupSel, setGroupSel] = useState<Set<string>>(new Set());
  const [dmQuery, setDmQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadRooms = useCallback(async () => {
    const res = await fetch("/api/internal/rooms").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { rooms: ChatRoom[] };
    setRooms(sortRooms(data.rooms));
    setLoading(false);
  }, []);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/internal/staff").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { staff: StaffMember[] };
    setStaff(data.staff);
  }, []);

  const openRoom = useCallback(
    async (roomId: string) => {
      activeIdRef.current = roomId;
      setActiveId(roomId);
      setFormError(null);
      const res = await fetch(`/api/internal/rooms/${roomId}/messages`).catch(
        () => null
      );
      if (!res?.ok) return;
      const data = (await res.json()) as { room: ChatRoom; messages: ChatMessage[] };
      setRoomMeta(data.room);
      setMessages(data.messages);
      setRooms((prev) =>
        sortRooms(prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)))
      );
      void fetch(`/api/internal/rooms/${roomId}/read`, { method: "POST" }).catch(
        () => null
      );
    },
    []
  );

  const backToList = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
    setRoomMeta(null);
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
    },
    onReconnect: () => {
      void loadRooms();
      if (activeIdRef.current) void openRoom(activeIdRef.current);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

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
    } finally {
      setSending(false);
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

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        (r.lastMessage?.body ?? "").toLowerCase().includes(q)
    );
  }, [rooms, query]);

  const staffForPicker = useMemo(
    () => staff.filter((s) => s.userId !== meId),
    [staff, meId]
  );

  const dmStaff = useMemo(() => {
    const q = dmQuery.trim().toLowerCase();
    if (!q) return staffForPicker;
    return staffForPicker.filter((s) => s.name.toLowerCase().includes(q));
  }, [staffForPicker, dmQuery]);

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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <p className="px-4 py-6 text-[13px] text-text-3">Cargando…</p>
          )}
          {!loading && filteredRooms.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-[13.5px] font-semibold">No hay conversaciones</p>
              <p className="mt-1 text-[12.5px] text-text-3">
                {query
                  ? "Nada coincide con la búsqueda"
                  : canGroup
                    ? "Empezá un mensaje directo o creá un grupo"
                    : "Empezá un mensaje directo con un compañero"}
              </p>
            </div>
          )}
          {filteredRooms.map((room) => {
            const active = room.id === activeId;
            const last = room.lastMessage;
            return (
              <button
                key={room.id}
                onClick={() => void openRoom(room.id)}
                className={cn(
                  "flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors",
                  active ? "bg-brand-tint" : "hover:bg-accent"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                    room.kind === "group"
                      ? "bg-brand-soft text-brand-text"
                      : "bg-subtle text-text-2 border"
                  )}
                >
                  {room.kind === "group" ? (
                    <Users className="h-4 w-4" strokeWidth={1.8} />
                  ) : (
                    initials(room.displayName)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">
                      {room.displayName}
                    </span>
                    {last && (
                      <span className="shrink-0 text-[11px] text-text-3">
                        {fmtListTime(last.createdAt)}
                      </span>
                    )}
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
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Hilo */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          activeId ? "flex" : "hidden lg:flex"
        )}
      >
        {!activeId && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageSquareText className="h-8 w-8 text-text-3" strokeWidth={1.6} />
            <p className="text-[14px] font-semibold">Chat interno del equipo</p>
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
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold",
                  roomMeta?.kind === "group"
                    ? "bg-brand-soft text-brand-text"
                    : "border bg-subtle text-text-2"
                )}
              >
                {roomMeta?.kind === "group" ? (
                  <Users className="h-4 w-4" strokeWidth={1.8} />
                ) : (
                  initials(roomMeta?.displayName ?? "")
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">
                  {roomMeta?.displayName ?? ""}
                </p>
                <p className="text-[11.5px] text-text-3">
                  {roomMeta?.kind === "group"
                    ? `Grupo · ${roomMeta.membersCount} miembros`
                    : "Mensaje directo"}
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
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
                          mine
                            ? "border-brand bg-brand-tint"
                            : "bg-subtle"
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
                <textarea
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
              {dmStaff.map((s) => (
                <button
                  key={s.userId}
                  onClick={() => void startDm(s.userId)}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-accent"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-subtle text-[11.5px] font-bold text-text-2">
                    {initials(s.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">
                      {s.name}
                    </span>
                    <span className="block text-[11.5px] text-text-3">
                      {roleLabel(s.role)}
                    </span>
                  </span>
                </button>
              ))}
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
            <p className="px-4 pt-3 text-[12.5px] font-semibold text-text-2">
              Integrantes ({groupSel.size + 1})
            </p>
            {formError && (
              <p className="px-4 pt-1 text-[12px] font-semibold text-red-600">
                {formError}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {staffForPicker.map((s) => {
                const checked = groupSel.has(s.userId);
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
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">
                        {s.name}
                      </span>
                      <span className="block text-[11.5px] text-text-3">
                        {roleLabel(s.role)}
                      </span>
                    </span>
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
    </div>
  );
}
