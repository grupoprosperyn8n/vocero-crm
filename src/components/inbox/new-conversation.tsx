"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/avatar";
import { ChannelBadge } from "@/components/channel-badge";
import {
  ContactDetails,
  SystemClientDetails,
} from "@/components/contacts/client-card";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import type {
  ClientConversationDto,
  ContactDto,
  SystemClientSearchResultDto,
} from "@/lib/types";
import { cn, formatPhone, systemClientName } from "@/lib/utils";

type Picked =
  | { kind: "crm"; contact: ContactDto }
  | { kind: "system"; result: SystemClientSearchResultDto };

const labelOf = (c: string) => CHANNEL_LABEL[c as Channel] ?? c;

/**
 * "Nueva conversación" (pedido Diego, 2026-09-13): abrir un chat desde el CRM
 * eligiendo entre los contactos del CRM (los prospectos) y los clientes del
 * sistema de seguros. Los dos segmentos se ven a la vez, cada uno con su
 * propia búsqueda; al elegir una persona se abre su tarjeta (con el enlace a
 * la interface si viene del sistema) y se elige la plataforma — WhatsApp o
 * Telegram — por la que se va a escribir. Al abrir, la Bandeja selecciona el
 * hilo.
 */
export function NewConversationDialog({
  channels,
  onClose,
  onOpened,
}: {
  /** Canales encendidos en esta instancia (ADR-001). */
  channels: readonly Channel[];
  onClose: () => void;
  onOpened: (contactId: string) => void;
}) {
  const [crmQuery, setCrmQuery] = useState("");
  const [crmResults, setCrmResults] = useState<ContactDto[] | null>(null);
  const [crmSearching, setCrmSearching] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [sysQuery, setSysQuery] = useState("");
  const [sysResults, setSysResults] = useState<SystemClientSearchResultDto[] | null>(
    null
  );
  const [sysSearching, setSysSearching] = useState(false);
  const [sysError, setSysError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [pickedConvs, setPickedConvs] = useState<ClientConversationDto[] | null>(
    null
  );
  const [busy, setBusy] = useState<"whatsapp" | "telegram" | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Segmento CRM: los más recientes al abrir, y búsqueda con respiro
  // (300 ms tras la última tecla; con menos de 2 letras se vuelve a la lista).
  useEffect(() => {
    if (picked) return;
    const q = crmQuery.trim();
    let cancelled = false;
    const t = setTimeout(
      () => {
        void (async () => {
          setCrmSearching(true);
          setCrmError(null);
          const url =
            q.length >= 2 ? `/api/contacts?q=${encodeURIComponent(q)}` : "/api/contacts";
          const res = await fetch(url).catch(() => null);
          if (cancelled) return;
          setCrmSearching(false);
          if (!res?.ok) {
            setCrmError("No se pudieron cargar los contactos del CRM.");
            return;
          }
          const data = (await res.json().catch(() => null)) as
            | { contacts?: ContactDto[] }
            | null;
          setCrmResults((data?.contacts ?? []).slice(0, 60));
        })();
      },
      q ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [crmQuery, picked]);

  // Segmento sistema: 2+ caracteres (igual que el buscador de backoffice).
  useEffect(() => {
    if (picked) return;
    const q = sysQuery.trim();
    if (q.length < 2) {
      setSysResults(null);
      setSysError(null);
      setSysSearching(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSysSearching(true);
        setSysError(null);
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}`).catch(
          () => null
        );
        if (cancelled) return;
        setSysSearching(false);
        const data = (await res?.json().catch(() => null)) as
          | {
              results?: SystemClientSearchResultDto[];
              error?: { message?: string };
            }
          | null;
        if (!res?.ok) {
          setSysError(data?.error?.message ?? "No se pudo buscar en el sistema");
          return;
        }
        setSysResults(data?.results ?? []);
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [sysQuery, picked]);

  // Conversaciones del contacto elegido: la tarjeta del CRM las muestra.
  useEffect(() => {
    if (picked?.kind !== "crm") return;
    let alive = true;
    setPickedConvs(null);
    void (async () => {
      const res = await fetch(`/api/contacts/${picked.contact.id}`).catch(
        () => null
      );
      if (!alive) return;
      if (!res?.ok) {
        setPickedConvs([]);
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { conversations?: ClientConversationDto[] }
        | null;
      setPickedConvs(data?.conversations ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [picked]);

  /** Abre el hilo de un contacto del CRM por la plataforma pedida. */
  async function openContact(contactId: string, channel: "whatsapp" | "telegram") {
    setBusy(channel);
    setOpenError(null);
    const res = await fetch("/api/conversations/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, channel }),
    }).catch(() => null);
    setBusy(null);
    const data = (await res?.json().catch(() => null)) as
      | { conversationId?: string; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.conversationId) {
      setOpenError(data?.error?.message ?? "No se pudo abrir la conversación");
      return;
    }
    onOpened(contactId);
  }

  async function openWhatsApp() {
    if (!picked || busy) return;
    if (picked.kind === "crm") {
      await openContact(picked.contact.id, "whatsapp");
      return;
    }
    // Cliente del sistema: mismo camino que su tarjeta del buscador —
    // crea o reusa el hilo en la Bandeja (el contacto queda del lado del
    // sistema: no aparece en la lista de contactos del CRM).
    const { client } = picked.result;
    if (!client.telefono) {
      setOpenError("El cliente no tiene teléfono en el sistema");
      return;
    }
    setBusy("whatsapp");
    setOpenError(null);
    const nombre = systemClientName(client);
    const res = await fetch("/api/clients/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recordId: client.recordId,
        name: nombre,
        phone: client.telefono,
      }),
    }).catch(() => null);
    setBusy(null);
    const data = (await res?.json().catch(() => null)) as
      | { contactId?: string; error?: { message?: string } }
      | null;
    if (!res?.ok || !data?.contactId) {
      setOpenError(data?.error?.message ?? "No se pudo abrir la conversación");
      return;
    }
    onOpened(data.contactId);
  }

  async function openTelegram() {
    if (!picked || busy) return;
    if (picked.kind === "crm") {
      await openContact(picked.contact.id, "telegram");
      return;
    }
    // Telegram no permite iniciar: solo hay hilo si el cliente ya escribió
    // al bot y su contacto vinculado lo tiene.
    const crm = picked.result.crm;
    const tgConv = crm?.conversations.find((c) => c.channel === "telegram");
    if (!crm || !tgConv) {
      setOpenError("Sin Telegram: solo si ya escribió al bot");
      return;
    }
    await openContact(crm.contactId, "telegram");
  }

  const channelOn = (c: Channel) => channels.includes(c);

  /**
   * Estado de cada plataforma para la persona elegida: si se puede abrir y,
   * si no, por qué — el operador ve las dos opciones y entiende la realidad
   * en vez de que el botón no haga nada.
   */
  function platformState(): {
    whatsapp: { ok: boolean; hint: string | null };
    telegram: { ok: boolean; hint: string | null };
  } {
    const off = "Canal desactivado en esta instancia";
    if (!picked) {
      return {
        whatsapp: { ok: false, hint: null },
        telegram: { ok: false, hint: null },
      };
    }
    if (picked.kind === "crm") {
      const ch = (picked.contact.channel ?? "whatsapp") as string;
      const wa = channelOn("whatsapp") && ch === "whatsapp";
      const tg = channelOn("telegram") && ch === "telegram";
      return {
        whatsapp: {
          ok: wa,
          hint: !channelOn("whatsapp")
            ? off
            : wa
              ? null
              : ch === "telegram"
                ? "No tiene WhatsApp: te escribió por Telegram"
                : `No tiene WhatsApp (vive en ${labelOf(ch)})`,
        },
        telegram: {
          ok: tg,
          hint: !channelOn("telegram")
            ? off
            : tg
              ? null
              : ch === "whatsapp"
                ? "No tiene Telegram: te escribió por WhatsApp"
                : `No tiene Telegram (vive en ${labelOf(ch)})`,
        },
      };
    }
    const { client, crm } = picked.result;
    const tgConv =
      crm?.conversations.some((c) => c.channel === "telegram") ?? false;
    return {
      whatsapp: {
        ok: channelOn("whatsapp") && Boolean(client.telefono),
        hint: !channelOn("whatsapp")
          ? off
          : client.telefono
            ? null
            : "El cliente no tiene teléfono en el sistema",
      },
      telegram: {
        ok: channelOn("telegram") && tgConv,
        hint: !channelOn("telegram")
          ? off
          : tgConv
            ? null
            : "Solo si ya escribió al bot de Telegram",
      },
    };
  }

  const platforms = platformState();

  function PlatformButton({ channel }: { channel: "whatsapp" | "telegram" }) {
    const state = platforms[channel];
    const isBusy = busy === channel;
    return (
      <button
        type="button"
        disabled={!state.ok || busy !== null}
        onClick={() => void (channel === "whatsapp" ? openWhatsApp() : openTelegram())}
        className={cn(
          "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
          state.ok
            ? "border-border-strong bg-background hover:border-brand hover:bg-accent"
            : "cursor-not-allowed border-border-strong bg-secondary/40 opacity-60"
        )}
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChannelBadge channel={channel} className="h-4 w-4 rounded" />
          )}
          {isBusy ? "Abriendo…" : `Abrir en ${CHANNEL_LABEL[channel]}`}
        </span>
        {!state.ok && state.hint && (
          <span className="text-[11px] leading-snug text-text-3">
            {state.hint}
          </span>
        )}
      </button>
    );
  }

  function crmRow(c: ContactDto) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpenError(null);
          setPicked({ kind: "crm", contact: c });
        }}
        className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-accent"
      >
        <ContactAvatar name={c.name} seed={c.id} size="sm" src={c.avatarUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{c.name}</span>
            {c.channel && <Badge variant="outline">{labelOf(c.channel)}</Badge>}
            {c.isTest && <Badge variant="secondary">Prueba</Badge>}
            {c.stageName && <Badge variant="outline">{c.stageName}</Badge>}
          </span>
          <span className="block truncate text-[11.5px] text-text-3">
            {formatPhone(c.phone) || "Sin teléfono"}
            {c.notes ? ` · ${c.notes.slice(0, 50)}` : ""}
          </span>
        </span>
      </button>
    );
  }

  function sysRow(r: SystemClientSearchResultDto) {
    const nombre = systemClientName(r.client);
    const p = r.client.polizas;
    return (
      <button
        type="button"
        onClick={() => {
          setOpenError(null);
          setPicked({ kind: "system", result: r });
        }}
        className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand hover:bg-accent"
      >
        <ContactAvatar name={nombre} seed={r.client.recordId} size="sm" src={r.client.fotoUrl} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{nombre}</span>
            {r.client.estado && (
              <Badge variant="outline">{r.client.estado}</Badge>
            )}
            {r.crm &&
              (r.crm.conversations.some((c) => !c.closed && !c.isTest) ? (
                <Badge variant="secondary">Hilo abierto</Badge>
              ) : r.crm.conversations.length > 0 ? (
                <Badge variant="secondary">Con historial</Badge>
              ) : null)}
          </span>
          <span className="block truncate text-[11.5px] text-text-3">
            {formatPhone(r.client.telefono) || "Sin teléfono"}
            {p.total !== null ? ` · Pólizas: ${p.total}` : ""}
          </span>
        </span>
      </button>
    );
  }

  /** Lista scrolleable de un segmento (CRM o sistema). */
  function segmentList(
    loading: boolean,
    error: string | null,
    empty: React.ReactNode,
    rows: { key: string; node: React.ReactNode }[]
  ) {
    if (loading) {
      return (
        <p className="flex items-center gap-2 px-1 py-3 text-xs text-text-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
        </p>
      );
    }
    if (error) {
      return <p className="px-1 py-3 text-xs text-danger-text">{error}</p>;
    }
    if (rows.length === 0) return <>{empty}</>;
    return (
      <ul className="space-y-1.5 pr-0.5">
        {rows.map((r) => (
          <li key={r.key}>{r.node}</li>
        ))}
      </ul>
    );
  }

  const crmRows = (crmResults ?? []).map((c) => ({ key: c.id, node: crmRow(c) }));
  const sysRows = (sysResults ?? []).map((r) => ({
    key: r.client.recordId,
    node: sysRow(r),
  }));

  const pickedName =
    picked?.kind === "crm"
      ? picked.contact.name
      : picked
        ? systemClientName(picked.result.client)
        : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nueva conversación"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Nueva conversación</h3>
            <p className="mt-0.5 text-xs text-text-3">
              {picked
                ? "Mirá su tarjeta y elegí por dónde escribirle."
                : "Elegí a quién escribirle: buscá en tu CRM o en el sistema de seguros."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {picked ? (
          <div className="mt-4">
            <div className="flex items-center gap-2.5 rounded-lg border bg-subtle p-3">
              <ContactAvatar
                name={pickedName}
                seed={
                  picked.kind === "crm"
                    ? picked.contact.id
                    : picked.result.client.recordId
                }
                size="sm"
                src={
                  picked.kind === "crm"
                    ? picked.contact.avatarUrl
                    : picked.result.client.fotoUrl
                }
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{pickedName}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-text-3">
                  {picked.kind === "crm" ? (
                    <>
                      <span>
                        {labelOf((picked.contact.channel ?? "whatsapp") as string)} ·{" "}
                        {formatPhone(picked.contact.phone) || "sin teléfono"}
                      </span>
                      {picked.contact.isTest && (
                        <Badge variant="secondary">Prueba</Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <span>Cliente del sistema de seguros</span>
                      {picked.result.client.estado && (
                        <Badge variant="outline">
                          {picked.result.client.estado}
                        </Badge>
                      )}
                    </>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => {
                  setOpenError(null);
                  setPicked(null);
                  setPickedConvs(null);
                }}
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Cambiar
              </Button>
            </div>

            {picked.kind === "crm" ? (
              <ContactDetails
                contact={picked.contact}
                convs={pickedConvs}
                onOpenConversation={(contactId, channel) =>
                  void openContact(contactId, channel as "whatsapp" | "telegram")
                }
              />
            ) : (
              <SystemClientDetails
                result={picked.result}
                onOpenConversation={(contactId, channel) =>
                  void openContact(contactId, channel as "whatsapp" | "telegram")
                }
              />
            )}

            <p className="mt-4 text-[12.5px] font-semibold">
              ¿Por dónde escribirle?
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PlatformButton channel="whatsapp" />
              <PlatformButton channel="telegram" />
            </div>
            {openError && (
              <p className="mt-2 text-xs text-danger-text">{openError}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Segmento 1: contactos del CRM (los prospectos). */}
            <section
              aria-label="Contactos del CRM"
              className="flex min-h-0 flex-col rounded-lg border border-border-strong/70 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h4 className="text-[13px] font-semibold">Contactos del CRM</h4>
                <span className="text-[11px] text-text-3">
                  tus prospectos y contactos del chat
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-full border border-border-strong bg-background px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
                <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
                <input
                  autoFocus
                  value={crmQuery}
                  onChange={(e) => setCrmQuery(e.target.value)}
                  placeholder="Nombre o teléfono…"
                  aria-label="Buscar contacto del CRM"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
                />
                {crmQuery && (
                  <button
                    type="button"
                    onClick={() => setCrmQuery("")}
                    aria-label="Limpiar búsqueda del CRM"
                    className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              <div className="mt-2 max-h-[46vh] min-h-[120px] overflow-y-auto">
                {segmentList(
                  crmSearching && crmResults === null,
                  crmError,
                  crmQuery.trim().length >= 2 ? (
                    <p className="px-1 py-3 text-xs text-text-3">
                      Nadie coincide con esa búsqueda en el CRM.
                    </p>
                  ) : (
                    <p className="px-1 py-3 text-xs text-text-3">
                      Todavía no hay contactos en el CRM.
                    </p>
                  ),
                  crmRows
                )}
                {crmSearching && crmResults !== null && crmRows.length === 0 && (
                  <p className="flex items-center gap-2 px-1 py-2 text-xs text-text-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
                  </p>
                )}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-text-3">
                Al elegir un contacto se abre su tarjeta con sus conversaciones.
              </p>
            </section>

            {/* Segmento 2: clientes del sistema de seguros (backoffice). */}
            <section
              aria-label="Clientes del sistema"
              className="flex min-h-0 flex-col rounded-lg border border-border-strong/70 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h4 className="text-[13px] font-semibold">Clientes del sistema</h4>
                <span className="text-[11px] text-text-3">solo lectura</span>
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-full border border-border-strong bg-background px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
                {sysSearching ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-text-3"
                    strokeWidth={1.7}
                  />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-text-3" strokeWidth={1.7} />
                )}
                <input
                  value={sysQuery}
                  onChange={(e) => setSysQuery(e.target.value)}
                  placeholder="Nombre, DNI o teléfono…"
                  aria-label="Buscar cliente del sistema"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
                />
                {sysQuery && (
                  <button
                    type="button"
                    onClick={() => setSysQuery("")}
                    aria-label="Limpiar búsqueda del sistema"
                    className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
              <div className="mt-2 max-h-[46vh] min-h-[120px] overflow-y-auto">
                {sysQuery.trim().length < 2 ? (
                  <p className="px-1 py-3 text-xs text-text-3">
                    Escribí al menos 2 letras (por nombre, DNI o teléfono). Al elegir
                    un cliente se abre su tarjeta con el enlace a la interface.
                  </p>
                ) : (
                  segmentList(
                    sysSearching,
                    sysError,
                    <p className="px-1 py-3 text-xs text-text-3">
                      Sin resultados en el sistema para «{sysQuery.trim()}».
                    </p>,
                    sysRows
                  )
                )}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-text-3">
                Los clientes del sistema viven en el backoffice: no se mezclan con
                los contactos del CRM. Al abrir el chat, la conversación queda en la
                Bandeja.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
