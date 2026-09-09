"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck, Search, Sparkles, UserRound, X } from "lucide-react";
import type { ConversationDto } from "@/lib/types";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { matchesQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { formatTime, previewText } from "./helpers";
import { topicDot, topicLabel } from "@/lib/topics";

/* Puntos de etapa con la paleta de la landing: azul, ámbar, verde WhatsApp. */
const STAGE_DOT: Record<string, string> = {
  Nuevo: "#8391aa",
  "En conversación": "#0d5bff",
  Interesado: "#f2a71b",
  Cliente: "#1fb35b",
  Perdido: "#d94a4a",
};
const STAGE_DOT_FALLBACK = "#8391aa";

function EmptyState({ onSeeded }: { onSeeded: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const [failed, setFailed] = useState(false);

  async function seed() {
    setSeeding(true);
    const res = await fetch("/api/seed/demo", { method: "POST" }).catch(
      () => null
    );
    setSeeding(false);
    if (res?.ok) onSeeded();
    else setFailed(true);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-serif text-[21px] italic leading-tight text-foreground">
        Sin conversaciones todavía
      </p>
      <p className="text-xs text-text-3">
        Cuando alguien escriba a tu número de WhatsApp, su conversación
        aparecerá aquí en tiempo real.
      </p>
      {!failed && (
        <Button
          size="sm"
          variant="outline"
          disabled={seeding}
          onClick={() => void seed()}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.7} />
          {seeding ? "Cargando demo…" : "Cargar datos de demostración"}
        </Button>
      )}
    </div>
  );
}

export function ConversationList({
  conversations: conversationsProp,
  channels,
  selectedId,
  onSelect,
  onSeeded,
  view,
  onViewChange,
  openTotal,
  closedTotal,
}: {
  conversations: ConversationDto[] | null;
  /** Canales encendidos en esta instancia (ADR-001). */
  channels: readonly Channel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeeded: () => void;
  /** 2A: qué lista se muestra: la cola viva (En curso) o el archivo (Cerradas). */
  view: "open" | "closed";
  onViewChange: (view: "open" | "closed") => void;
  openTotal: number;
  closedTotal: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [stage, setStage] = useState<string>("all");
  const [inbox, setInbox] = useState<Channel | "all">("all");
  // 1B: filtro por topic de negocio. "all" = todas, "untagged" = sin
  // clasificar (las que el operador debe catalogar), resto = topic concreto.
  const [topic, setTopic] = useState<string>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Rescate de lo tecleado ANTES de que hidratara el JS. La caja se pinta en
   * el HTML del servidor, así que se puede escribir en ella mientras carga la
   * página; al montar, React la dejaba vacía y esas pulsaciones se perdían en
   * silencio (el usuario veía la lista entera "sin filtrar"). Por eso el input
   * es NO controlado: el DOM manda y aquí solo adoptamos su valor.
   */
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed) setQuery(typed);
  }, []);

  const loading = conversationsProp === null;
  const conversations = conversationsProp ?? [];
  // 2A: en el archivo (Cerradas) no aplican los filtros de cola — ni
  // "Todas/No leídas" ni etapa del embudo: quedan la búsqueda y los chips
  // de cada tarjeta. En la cola viva, todo como antes.
  const closed = view === "closed";
  // Solo NOMBRE y TELÉFONO, como cualquier filtro de contactos. Antes también
  // miraba el preview, y como el agente nombra al dueño en sus propios
  // mensajes, buscar ese nombre devolvía media bandeja. Encima era una
  // búsqueda de mensajes a medias: solo el último de cada hilo, no el historial.
  const searched = conversations.filter(
    (c) =>
      matchesQuery(query, {
        text: [c.contact.name],
        phone: c.contact.phone,
      }) &&
      (stage === "all" || c.stageName === stage) &&
      (topic === "all" ||
        (topic === "untagged" ? !c.topic : c.topic === topic))
  );
  // La bandeja elegida es el filtro de AFUERA: "Todas" y "No leídas" cuentan
  // dentro de ella, no sobre la suma de los dos canales.
  const inInbox =
    inbox === "all" ? searched : searched.filter((c) => c.channel === inbox);
  const inboxCount = (ch: Channel) =>
    searched.filter((c) => c.channel === ch).length;
  const unreadCount = inInbox.filter((c) => c.unreadCount > 0).length;
  // 2A: el filtro "No leídas" es de la cola viva; en el archivo no aplica.
  const visible =
    !closed && filter === "unread"
      ? inInbox.filter((c) => c.unreadCount > 0)
      : inInbox;
  // Con un solo canal encendido no hay bandejas que distinguir: ni marca en
  // los renglones ni filtro. La pantalla queda exactamente como antes de 014.
  const multiChannel = channels.length > 1;

  // Etapas presentes en la bandeja, en el orden en que llegan del pipeline.
  const stages: string[] = [];
  for (const c of conversations) {
    if (c.stageName && !stages.includes(c.stageName)) stages.push(c.stageName);
  }

  // 1B: topics presentes (los del catálogo y los desconocidos, raw) y
  // cuántas conversaciones esperan clasificación del operador.
  const topicIds: string[] = [];
  for (const c of conversations) {
    if (c.topic && !topicIds.includes(c.topic)) topicIds.push(c.topic);
  }
  const untaggedCount = conversations.filter((c) => !c.topic).length;
  const hasTopicFilter = topicIds.length > 0 || untaggedCount > 0;

  function clearQuery() {
    if (inputRef.current) inputRef.current.value = "";
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-4 pb-3 pt-3">
        {/* 2A: estado de la lista — cola viva vs archivadas. */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-full border border-border-strong bg-secondary/70 p-1">
          <button
            type="button"
            onClick={() => onViewChange("open")}
            aria-pressed={view === "open"}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full py-[6px] text-[12.5px] font-semibold transition-colors",
              view === "open"
                ? "bg-background text-foreground shadow-sm"
                : "text-text-3 hover:text-foreground"
            )}
          >
            En curso
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[10.5px]",
                view === "open" ? "bg-brand-veil text-brand" : "bg-secondary"
              )}
            >
              {openTotal}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onViewChange("closed")}
            aria-pressed={view === "closed"}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full py-[6px] text-[12.5px] font-semibold transition-colors",
              view === "closed"
                ? "bg-background text-foreground shadow-sm"
                : "text-text-3 hover:text-foreground"
            )}
          >
            Cerradas
            <span
              className={cn(
                "rounded-full px-1.5 font-mono text-[10.5px]",
                view === "closed" ? "bg-brand-veil text-brand" : "bg-secondary"
              )}
            >
              {closedTotal}
            </span>
          </button>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">
            {closed ? "Archivo" : "Bandeja"}
          </h2>
          <span className="font-mono text-[12px] text-text-3">{conversations.length}</span>
          {multiChannel && !closed && (
            <div className="ml-auto flex items-center gap-1">
              {channels.map((ch) => {
                const on = inbox === ch;
                return (
                  <button
                    key={ch}
                    onClick={() => setInbox(on ? "all" : ch)}
                    aria-pressed={on}
                    title={
                      on
                        ? "Ver todas las bandejas"
                        : `Ver solo ${CHANNEL_LABEL[ch]}`
                    }
                    className={cn(
                      "flex items-center gap-1 rounded-full border py-[3px] pl-[5px] pr-2 text-[11.5px] font-medium transition-colors",
                      on
                        ? "border-brand bg-brand-veil text-foreground"
                        : "text-text-3 hover:bg-accent",
                      inbox !== "all" && !on && "opacity-45"
                    )}
                  >
                    <ChannelBadge
                      channel={ch}
                      className="h-[13px] w-[13px] rounded-[4px]"
                    />
                    {inboxCount(ch)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-strong bg-background px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
          <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
          <input
            ref={inputRef}
            placeholder="Buscar por nombre o teléfono…"
            aria-label="Buscar conversación"
            defaultValue=""
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
          />
          {query && (
            <button
              onClick={clearQuery}
              aria-label="Limpiar búsqueda"
              className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </header>

      {!closed && (
        <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
        {(
          [
            { id: "all", label: "Todas", count: inInbox.length },
            { id: "unread", label: "No leídas", count: unreadCount },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12.5px] font-semibold transition-colors",
              filter === f.id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border-strong bg-background text-text-2 hover:border-text-3"
            )}
          >
            {f.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px]",
                filter === f.id ? "bg-brand-veil" : "bg-secondary text-text-3"
              )}
            >
              {f.count}
            </span>
          </button>
        ))}

        {(stages.length > 0 || hasTopicFilter) && (
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {stages.length > 0 && (
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                aria-label="Filtrar por etapa del embudo"
                className={cn(
                  "min-w-0 flex-1 truncate rounded-full border px-2 py-[5px] text-[12.5px] font-semibold transition-colors",
                  stage === "all"
                    ? "border-border-strong bg-background text-text-2 hover:border-text-3"
                    : "border-brand bg-brand text-brand-fg"
                )}
              >
                <option value="all">Toda etapa</option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            {hasTopicFilter && (
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                aria-label="Filtrar por tema de la consulta"
                className={cn(
                  "min-w-0 flex-1 truncate rounded-full border px-2 py-[5px] text-[12.5px] font-semibold transition-colors",
                  topic === "all"
                    ? "border-border-strong bg-background text-text-2 hover:border-text-3"
                    : "border-brand bg-brand text-brand-fg"
                )}
              >
                <option value="all">Toda clasificación</option>
                {untaggedCount > 0 && (
                  <option value="untagged">Sin topic ({untaggedCount})</option>
                )}
                {topicIds.map((t) => (
                  <option key={t} value={t}>
                    {topicLabel(t)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-text-3">Cargando…</p>
        ) : conversations.length === 0 ? (
          closed ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <p className="font-serif text-[20px] italic leading-tight text-foreground">
                  Sin conversaciones cerradas
                </p>
                <p className="mt-1 text-xs text-text-3">
                  Cuando cierres una conversación, queda archivada acá con su
                  resumen y su etiqueta.
                </p>
              </div>
            </div>
          ) : (
            <EmptyState onSeeded={onSeeded} />
          )
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">
            Sin resultados para este filtro.
          </p>
        ) : (
          <ul>
            {visible.map((c) => {
              // 2A: en el archivo no hay no-leídas ni ventana: la tarjeta
              // muestra la fecha de cierre y el resumen de la gestión.
              const unread = !closed && c.unreadCount > 0;
              const active = selectedId === c.id;
              return (
                <li key={c.id} className="relative border-b border-border">
                  {active && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    className={cn(
                      "flex w-full items-start gap-[11px] px-4 py-[var(--row-py)] text-left transition-colors",
                      active ? "bg-[var(--bg-active)]" : "hover:bg-subtle"
                    )}
                  >
                    <span className="relative shrink-0">
                      <ContactAvatar name={c.contact.name} seed={c.contact.id} size="lg" />
                      {c.windowOpen && (
                        <span className="absolute bottom-0 right-0 h-[11px] w-[11px] rounded-full border-[2.5px] border-background bg-success" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {multiChannel && <ChannelBadge channel={c.channel} />}
                          <span
                            className={cn(
                              "truncate text-sm",
                              unread ? "font-[680]" : "font-semibold"
                            )}
                          >
                            {c.contact.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-[10.5px] tracking-[0.02em]",
                            unread
                              ? "font-semibold text-brand"
                              : closed
                                ? "font-semibold text-text-2"
                                : "text-text-3"
                          )}
                        >
                          {closed
                            ? `Cerrada ${formatTime(c.closedAt)}`
                            : formatTime(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            closed
                              ? "line-clamp-2 whitespace-normal text-[12.5px] leading-snug text-text-2"
                              : "truncate text-[13px]",
                            unread ? "font-medium text-text-2" : closed ? "" : "text-text-3"
                          )}
                        >
                          {/* 2A: en el archivo, el preview es el resumen curado
                              de la gestión (o el último mensaje si no hay). */}
                          {previewText(
                            closed
                              ? (c.closureSummary ?? c.preview)
                              : c.preview
                          )}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-semibold text-brand-fg">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {c.topic && (
                          <span
                            className="inline-flex max-w-[45%] items-center gap-1.5 truncate rounded-full border border-border-strong bg-background px-2 py-0.5 text-[11px] font-medium text-text-2"
                            title={topicLabel(c.topic) ?? c.topic}
                          >
                            <span
                              className="h-[7px] w-[7px] shrink-0 rounded-full"
                              style={{ background: topicDot(c.topic) }}
                            />
                            <span className="truncate">
                              {topicLabel(c.topic)}
                            </span>
                          </span>
                        )}
                        {closed ? (
                          <>
                            {c.closedByName && (
                              <span
                                className="inline-flex max-w-[55%] items-center gap-1.5 truncate rounded-full border border-border-strong bg-background px-2 py-0.5 text-[11px] font-medium text-text-2"
                                title={`Cerrada por ${c.closedByName}`}
                              >
                                <CheckCheck
                                  className="h-3 w-3 shrink-0"
                                  strokeWidth={1.9}
                                />
                                <span className="truncate">
                                  {c.closedByName}
                                </span>
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {c.stageName && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-background px-2 py-0.5 text-[11px] font-medium text-text-2">
                            <span
                              className="h-[7px] w-[7px] rounded-full"
                              style={{
                                background: STAGE_DOT[c.stageName] ?? STAGE_DOT_FALLBACK,
                              }}
                            />
                            {c.stageName}
                          </span>
                        )}
                        {c.assignee && (
                          <span
                            className="inline-flex max-w-[55%] items-center gap-1.5 truncate rounded-full border border-brand-soft bg-brand-veil px-2 py-0.5 text-[11px] font-medium text-brand"
                            title={`A cargo de ${c.assignee.name} (atención humana)`}
                          >
                            <UserRound
                              className="h-3 w-3 shrink-0"
                              strokeWidth={1.7}
                            />
                            <span className="truncate">
                              A cargo: {c.assignee.name}
                            </span>
                          </span>
                        )}
                        {c.handoffAt && !c.assignee && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning-soft bg-warning-tint px-2 py-0.5 text-[11px] text-warning-text">
                            <UserRound className="h-3 w-3" strokeWidth={1.7} />
                            Atención humana
                          </span>
                        )}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
