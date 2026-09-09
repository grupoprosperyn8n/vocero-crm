"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, ChevronLeft, PanelRight, RotateCcw } from "lucide-react";
import { cn, formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import type { ConversationDto, MessageDto } from "@/lib/types";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { ChannelBadge } from "@/components/channel-badge";
import { useEvents } from "@/components/use-events";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { Composer } from "./composer";
import { ContactPanel } from "./contact-panel";
import { formatTime } from "./helpers";
import { TOPIC_LIST, topicDot } from "@/lib/topics";

/**
 * Texto que ya salió del compositor pero cuyo POST todavía viaja. Existe solo
 * en el cliente: se pinta como burbuja "enviando" para que escribir el
 * siguiente renglón no espere a Meta (~1,5 s de ida y vuelta).
 */
type PendingOut = {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
};

/**
 * `xl` es el umbral donde caben las tres columnas (lista + hilo + detalles).
 * Debajo, el panel de detalles flota sobre el hilo. Debe coincidir con el
 * breakpoint `xl:` que usan las clases de la sección de detalles.
 */
const PANEL_MEDIA_QUERY = "(min-width: 1280px)";
const isWideEnoughForPanel = () =>
  typeof window !== "undefined" && window.matchMedia(PANEL_MEDIA_QUERY).matches;

export function InboxClient({ channels }: { channels: readonly Channel[] }) {
  const multiChannel = channels.length > 1;
  // 2A: qué lista muestra la bandeja: la cola viva (En curso) o el archivo
  // (Cerradas, con su resumen de gestión).
  const [view, setView] = useState<"open" | "closed">("open");
  const [conversations, setConversations] = useState<ConversationDto[] | null>(
    null
  );
  // 2A: contadores de las dos pestañas (los devuelve el mismo GET).
  const [openTotal, setOpenTotal] = useState(0);
  const [closedTotal, setClosedTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [pending, setPending] = useState<PendingOut[]>([]);
  // Arranca cerrado: en pantallas angostas el panel de detalles es un cajón
  // ENCIMA del hilo, así que abrirlo por defecto taparía la conversación. El
  // efecto de abajo lo abre solo si de veras hay tres columnas de ancho.
  const [panelOpen, setPanelOpen] = useState(false);
  // Se incrementa con cada evento SSE que puede cambiar la etapa/lead o el
  // estado del agente: el panel de detalles lo observa y refetch en vivo.
  const [detailRev, setDetailRev] = useState(0);
  // 1F: aviso del cierre (resultado del webhook saliente hacia el backend).
  const [closureNotice, setClosureNotice] = useState<{
    kind: "sent" | "skipped" | "failed";
    text: string;
  } | null>(null);
  useEffect(() => {
    if (!closureNotice) return;
    const t = setTimeout(() => setClosureNotice(null), 8_000);
    return () => clearTimeout(t);
  }, [closureNotice]);

  useEffect(() => {
    if (!isWideEnoughForPanel()) return;
    setPanelOpen(localStorage.getItem("vocero.panelOpen") !== "false");
  }, []);
  const togglePanel = useCallback((open: boolean) => {
    setPanelOpen(open);
    // La preferencia es de escritorio: abrir el cajón en el teléfono no debe
    // reescribir cómo queda la Bandeja en la computadora.
    if (isWideEnoughForPanel()) {
      localStorage.setItem("vocero.panelOpen", String(open));
    }
  }, []);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const lastFetchRef = useRef<string | null>(null);
  const tmpSeq = useRef(0);
  // Los envíos salen en fila: el compositor ya no espera, pero WhatsApp debe
  // recibir "hola" antes que el renglón siguiente. Sin esta cadena, dos POST
  // simultáneos pueden llegar a Meta en desorden.
  const sendQueue = useRef<Promise<unknown>>(Promise.resolve());

  const refetchConversations = useCallback(
    async (status?: "open" | "closed") => {
      const st = status ?? view;
      const res = await fetch(
        `/api/conversations${st === "closed" ? "?status=closed" : ""}`
      ).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as {
        conversations: ConversationDto[];
        openTotal: number;
        closedTotal: number;
      };
      setConversations(data.conversations);
      setOpenTotal(data.openTotal);
      setClosedTotal(data.closedTotal);
      lastFetchRef.current = new Date().toISOString();
    },
    [view]
  );

  /** 2A: cambiar de pestaña (cola viva ↔ archivo) con selección limpia. */
  const changeView = useCallback(
    (v: "open" | "closed") => {
      setView(v);
      setSelectedId(null);
      setMessages([]);
      setClosureNotice(null);
      void refetchConversations(v);
    },
    [refetchConversations]
  );

  const refetchMessages = useCallback(async (conversationId: string) => {
    const res = await fetch(
      `/api/conversations/${conversationId}/messages`
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { messages: MessageDto[] };
    if (selectedIdRef.current === conversationId) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void refetchConversations();
  }, [refetchConversations]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setMessages([]);
      void refetchMessages(id);
      void fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      });
    },
    [refetchMessages]
  );

  // Enlace directo desde Contactos/Pipeline: /inbox?contact=<id>
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");
  useEffect(() => {
    if (!contactParam || selectedIdRef.current) return;
    const match = conversations?.find((c) => c.contact.id === contactParam);
    if (match) select(match.id);
  }, [contactParam, conversations, select]);

  useEvents({
    onMessageNew: ({ conversationId, message }) => {
      if (selectedIdRef.current === conversationId) {
        const m = message as MessageDto;
        setMessages((prev) =>
          prev.some((x) => x.id === m.id) ? prev : [...prev, m]
        );
        void fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ markRead: true }),
        });
      }
      void refetchConversations();
      // Un entrante nuevo puede crear/mover el lead: refresca el panel.
      setDetailRev((v) => v + 1);
    },
    onMessageStatus: ({ conversationId, messageId, status, error }) => {
      if (selectedIdRef.current !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                status: status as MessageDto["status"],
                error: error ?? null,
              }
            : m
        )
      );
    },
    onConversationUpdated: () => {
      void refetchConversations();
      // El agente movió de etapa o cambió el handoff: refresca el panel en vivo.
      setDetailRev((v) => v + 1);
    },
    onReconnect: () => {
      // Catch-up tras reconexión (contrato sse.md): refetch completo.
      void refetchConversations();
      if (selectedIdRef.current) void refetchMessages(selectedIdRef.current);
      setDetailRev((v) => v + 1);
    },
  });

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;

  /**
   * Hilo visible = lo confirmado + lo que aún viaja. El mensaje real puede
   * llegar por refetch o por SSE antes de que retiremos el provisional, así
   * que cada pendiente se empareja con UN mensaje real (no por texto suelto:
   * mandar "hola" dos veces seguidas no debe borrar la segunda burbuja).
   */
  const thread = useMemo(() => {
    const propios = pending.filter((p) => p.conversationId === selectedId);
    if (propios.length === 0) return messages;
    const emparejados = new Set<string>();
    const visibles = propios.filter((p) => {
      const real = messages.find(
        (m) =>
          !emparejados.has(m.id) &&
          m.direction === "out" &&
          m.text === p.text &&
          Date.parse(m.createdAt) >= Date.parse(p.createdAt) - 60_000
      );
      if (real) emparejados.add(real.id);
      return !real;
    });
    if (visibles.length === 0) return messages;
    return [
      ...messages,
      ...visibles.map<MessageDto>((p) => ({
        id: p.id,
        conversationId: p.conversationId,
        direction: "out",
        type: "text",
        text: p.text,
        status: "pending",
        error: null,
        aiGenerated: false,
        origin: "operator",
        media: null,
        createdAt: p.createdAt,
      })),
    ];
  }, [messages, pending, selectedId]);

  /**
   * El compositor NO espera a que esto termine: limpia su campo al instante y
   * aquí se pinta la burbuja "enviando". Si el envío falla, la burbuja se
   * retira y el error vuelve al compositor, que devuelve el texto — un mensaje
   * jamás se pierde en silencio.
   */
  const sendText = useCallback(
    async (text: string): Promise<string | null> => {
      const conversationId = selectedIdRef.current;
      if (!conversationId) return "Sin conversación seleccionada";

      const tmpId = `tmp_${++tmpSeq.current}`;
      setPending((prev) => [
        ...prev,
        {
          id: tmpId,
          conversationId,
          text,
          createdAt: new Date().toISOString(),
        },
      ]);
      const drop = () => setPending((prev) => prev.filter((p) => p.id !== tmpId));

      const run = async (): Promise<string | null> => {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        }).catch(() => null);
        if (!res) {
          drop();
          return "Sin conexión con el servidor";
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          drop();
          return data?.error?.message ?? "No se pudo enviar el mensaje";
        }
        // Primero traer el mensaje real, después quitar el provisional: al
        // revés, la burbuja parpadearía.
        await refetchMessages(conversationId);
        drop();
        void refetchConversations();
        return null;
      };

      const queued = sendQueue.current.then(run, run);
      sendQueue.current = queued.catch(() => null);
      return queued;
    },
    [refetchMessages, refetchConversations]
  );

  const patchConversation = useCallback(
    async (patch: {
      aiEnabled?: boolean;
      reactivate?: boolean;
      topic?: string | null;
    }) => {
      if (!selectedIdRef.current) return;
      await fetch(`/api/conversations/${selectedIdRef.current}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      void refetchConversations();
    },
    [refetchConversations]
  );

  /**
   * 1F/2A — Cerrar: archiva la conversación (sale de la cola viva; el
   * historial completo y el resumen quedan en el CRM, pestaña Cerradas).
   * El servidor cura la gestión (resumen IA + datos) y, si hubiera un
   * destino configurado (conectores), la envía — hoy en este CRM no hay
   * ninguno, así que el resultado es "skipped": archivada nomás.
   */
  const closeSelected = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    if (
      !window.confirm(
        "¿Cerrar la conversación?\n\nSe archiva en el CRM: el historial y el resumen quedan en la pestaña Cerradas."
      )
    )
      return;
    setClosureNotice(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ close: true }),
      });
      const data = (await res.json().catch(() => null)) as {
        closure?: { webhook: "sent" | "skipped" | "failed"; webhookError: string | null };
      } | null;
      const c = data?.closure;
      if (c?.webhook === "failed") {
        setClosureNotice({
          kind: "failed",
          text: `Cerrada, pero el envío a la integración falló: ${c.webhookError ?? "error desconocido"}. El historial y el resumen quedaron en el CRM.`,
        });
      } else if (c?.webhook === "skipped") {
        setClosureNotice({
          kind: "skipped",
          text: "Conversación cerrada. Quedó archivada en el CRM con su resumen.",
        });
      } else {
        setClosureNotice({
          kind: "sent",
          text: "Cerrada. Resumen archivado en el CRM.",
        });
      }
      // 2A: el cierre se ve en el archivo: pasamos a Cerradas con la
      // conversación recién archivada seleccionada (con su resumen).
      setView("closed");
      void refetchConversations("closed");
    } catch {
      setClosureNotice({
        kind: "failed",
        text: "No se pudo cerrar la conversación. Intentalo de nuevo.",
      });
    }
  }, [refetchConversations]);

  /**
   * 2A — Reabrir: una conversación archivada vuelve a la cola viva (el
   * historial queda intacto y se puede seguir respondiendo). El cierre
   * anterior no se re-emite: reabrir es una acción nueva del operador.
   */
  const reopenSelected = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) return;
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    }).catch(() => null);
    setClosureNotice(null);
    if (view === "closed") setView("open");
    void refetchConversations("open");
  }, [view, refetchConversations]);

  return (
    <div className="flex h-full">
      {/* Móvil: una columna a la vez. La lista cede la pantalla completa al
          hilo en cuanto hay conversación elegida (patrón maestro-detalle). */}
      <section
        className={cn(
          "w-full shrink-0 overflow-hidden border-r md:w-[300px] lg:w-[360px]",
          selected && "max-md:hidden"
        )}
      >
        <ConversationList
          conversations={conversations}
          channels={channels}
          selectedId={selectedId}
          onSelect={select}
          onSeeded={() => void refetchConversations("open")}
          view={view}
          onViewChange={changeView}
          openTotal={openTotal}
          closedTotal={closedTotal}
        />
      </section>

      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !selected && "max-md:hidden"
        )}
      >
        {selected ? (
          <>
            <header className="flex items-center justify-between gap-1 border-b bg-background px-2 py-2.5 md:px-4">
              {/* Volver a la lista: en móvil el hilo ocupa toda la pantalla. */}
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Volver a las conversaciones"
                className="shrink-0 rounded-md p-1.5 text-text-2 hover:bg-accent hover:text-foreground md:hidden"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
                <ContactAvatar
                  name={selected.contact.name}
                  seed={selected.contact.id}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-bold leading-tight tracking-tight">
                    {multiChannel && <ChannelBadge channel={selected.channel} />}
                    <span className="truncate">{selected.contact.name}</span>
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 font-mono text-[10.5px] tracking-[0.04em]",
                      selected.closedAt
                        ? "font-medium text-text-3"
                        : selected.windowOpen
                          ? "font-medium text-success-text"
                          : "text-text-3"
                    )}
                  >
                    {selected.closedAt
                      ? `Cerrada ${selected.closedByName ? `por ${selected.closedByName} · ` : ""}${formatTime(selected.closedAt)}`
                      : selected.windowOpen
                        ? "ventana abierta"
                        : selected.contact.phone
                          ? formatPhone(selected.contact.phone)
                          : // Instagram no tiene teléfono: decir "Sin teléfono"
                            // sería contestar una pregunta que nadie hizo.
                            CHANNEL_LABEL[selected.channel]}
                  </p>
                  {/*
                    1B — Clasificador de topic. Aparece cuando la conversación
                    derivó a humano, ya tiene topic (para corregirlo) o es del
                    canal web: los hilos que el negocio quiere etiquetar para
                    el router y el curado. En WhatsApp común sin derivar no
                    molesta.
                  */}
                  {/* 2A: una archivada también se puede (re)etiquetar: el
                      clasificador queda disponible para el archivo. */}
                  {(selected.handoffAt ||
                    selected.topic ||
                    selected.channel === "web" ||
                    selected.closedAt) && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{
                          background: selected.topic
                            ? topicDot(selected.topic)
                            : "#8391aa",
                        }}
                      />
                      <select
                        value={selected.topic ?? ""}
                        onChange={(e) =>
                          void patchConversation({
                            topic: e.target.value || null,
                          })
                        }
                        aria-label="Clasificar el tema de la consulta"
                        className={cn(
                          "truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                          selected.topic
                            ? "border-brand bg-brand-veil text-foreground"
                            : "border-border-strong text-text-3 hover:border-text-3"
                        )}
                      >
                        <option value="">
                          {selected.topic ? "Sin clasificar" : "Clasificar…"}
                        </option>
                        {TOPIC_LIST.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              {!panelOpen && (
                <button
                  onClick={() => togglePanel(true)}
                  aria-label="Mostrar detalles"
                  className="shrink-0 rounded-full border border-border-strong p-1.5 text-text-3 transition-colors hover:border-text-3 hover:text-foreground"
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1.7} />
                </button>
              )}
              {/* 1F/2A: cerrar archiva la conversación; si ya está cerrada,
                  el botón pasa a ser Reabrir (vuelve a la cola viva). */}
              {selected.closedAt ? (
                <button
                  onClick={() => void reopenSelected()}
                  aria-label="Reabrir la conversación"
                  title="Reabrir (vuelve a En curso)"
                  className="shrink-0 rounded-full border border-border-strong p-1.5 text-text-3 transition-colors hover:border-brand hover:text-brand"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={1.9} />
                </button>
              ) : (
                <button
                  onClick={() => void closeSelected()}
                  aria-label="Cerrar la conversación y archivarla"
                  title="Cerrar y archivar"
                  className="shrink-0 rounded-full border border-border-strong p-1.5 text-text-3 transition-colors hover:border-success-text hover:text-success-text"
                >
                  <CheckCheck className="h-4 w-4" strokeWidth={1.9} />
                </button>
              )}
            </header>
            {closureNotice && (
              <div
                role="status"
                className={cn(
                  "border-b px-3 py-1.5 text-[12px] font-medium",
                  closureNotice.kind === "sent" &&
                    "border-success-soft bg-success-tint text-success-text",
                  closureNotice.kind === "skipped" &&
                    "border-border-strong bg-accent text-text-2",
                  closureNotice.kind === "failed" &&
                    "border-danger-soft bg-danger-tint text-danger-text"
                )}
              >
                {closureNotice.text}
              </div>
            )}
            <MessageThread messages={thread} />
            {selected.closedAt ? (
              /* 2A: una archivada no se responde: el compositor se reemplaza
                 por la barra de estado con la acción Reabrir. */
              <div className="flex items-center justify-between gap-3 border-t bg-secondary/50 px-4 py-2.5">
                <p className="min-w-0 truncate text-[12px] font-medium text-text-2">
                  Conversación cerrada: el historial y el resumen quedaron
                  guardados en el CRM.
                </p>
                <button
                  onClick={() => void reopenSelected()}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-soft bg-brand-veil px-3 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:border-brand"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.9} />
                  Reabrir
                </button>
              </div>
            ) : (
              <Composer
                conversation={selected}
                onSend={sendText}
                onSent={() => {
                  if (selectedIdRef.current)
                    void refetchMessages(selectedIdRef.current);
                  void refetchConversations();
                }}
              />
            )}
          </>
        ) : (
          <div className="thread-bg flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-serif text-[24px] italic leading-tight text-text-2">
              Elige una conversación para ver el hilo
            </p>
            <p className="kicker">Bandeja · tiempo real</p>
          </div>
        )}
      </section>

      {/* Velo del cajón de detalles (solo donde no caben tres columnas). */}
      {panelOpen && selected && (
        <button
          aria-label="Cerrar los detalles"
          tabIndex={-1}
          onClick={() => togglePanel(false)}
          className="fixed inset-0 z-30 bg-overlay xl:hidden"
        />
      )}

      <section
        className={cn(
          "shrink-0 overflow-hidden border-l transition-[width] duration-200",
          // Debajo de xl no hay ancho para una tercera columna: el panel se
          // vuelve un cajón que entra desde la derecha, encima del hilo.
          "max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:z-40 max-xl:w-auto max-xl:bg-background max-xl:transition-transform",
          panelOpen && selected
            ? "w-[320px] max-xl:translate-x-0 max-xl:shadow-pop"
            : "w-0 border-l-0 max-xl:translate-x-full"
        )}
      >
        {selected && (
          <div className="h-full w-[320px] max-xl:w-[min(320px,88vw)]">
            <ContactPanel
              conversation={selected}
              refreshKey={detailRev}
              onPatchConversation={patchConversation}
              onClose={() => togglePanel(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
