"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/avatar";
import { ChannelBadge } from "@/components/channel-badge";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import type { ContactDto, SystemClientSearchResultDto } from "@/lib/types";
import { cn, formatPhone } from "@/lib/utils";

const AIRTABLE_BASE = "appuhslj3GFf60Tea";
const AIRTABLE_TABLE = "tblVAcMxNTLYXbLfT";

type Source = "crm" | "system";

type Picked =
  | { kind: "crm"; contact: ContactDto }
  | { kind: "system"; result: SystemClientSearchResultDto };

const labelOf = (c: string) => CHANNEL_LABEL[c as Channel] ?? c;

/**
 * "Nueva conversación" (pedido Diego, 2026-09-13): abrir un chat desde el CRM
 * eligiendo entre los contactos del CRM (los prospectos) y los clientes del
 * sistema de seguros, y eligiendo la plataforma — WhatsApp o Telegram — por
 * la que se va a escribir. Al abrir, la Bandeja selecciona el hilo.
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
  const [source, setSource] = useState<Source>("crm");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [crmResults, setCrmResults] = useState<ContactDto[]>([]);
  const [sysResults, setSysResults] = useState<SystemClientSearchResultDto[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState<"whatsapp" | "telegram" | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  // Búsqueda con respiro: 300 ms tras la última tecla. Menos de 2 letras no
  // busca (el buscador del sistema tampoco acepta menos y sería una consulta
  // por tecla al aire).
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setSearched(false);
      setSearchError(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setSearching(true);
        setSearchError(null);
        const url =
          source === "crm"
            ? `/api/contacts?q=${encodeURIComponent(q)}`
            : `/api/clients/search?q=${encodeURIComponent(q)}`;
        const res = await fetch(url).catch(() => null);
        if (cancelled) return;
        setSearching(false);
        setSearched(true);
        if (!res) {
          setSearchError("No se pudo buscar. Probá de nuevo.");
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | {
              contacts?: ContactDto[];
              results?: SystemClientSearchResultDto[];
              error?: { message?: string };
            }
          | null;
        if (!res.ok) {
          setSearchError(data?.error?.message ?? "No se pudo buscar");
          return;
        }
        if (source === "crm") setCrmResults(data?.contacts ?? []);
        else setSysResults(data?.results ?? []);
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, source, picked]);

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
    // vincula por teléfono (o reusa el contacto) y devuelve el hilo.
    const { client } = picked.result;
    if (!client.telefono) {
      setOpenError("El cliente no tiene teléfono en el sistema");
      return;
    }
    setBusy("whatsapp");
    setOpenError(null);
    const nombre = `${client.nombre} ${client.apellido}`.trim() || "Cliente";
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

  function PlatformButton({
    channel,
  }: {
    channel: "whatsapp" | "telegram";
  }) {
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

  const results: React.ReactNode = (() => {
    if (searching) {
      return (
        <p className="flex items-center gap-2 px-1 py-3 text-xs text-text-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
        </p>
      );
    }
    if (searchError) {
      return <p className="px-1 py-3 text-xs text-danger-text">{searchError}</p>;
    }
    if (query.trim().length < 2) {
      return (
        <p className="px-1 py-3 text-xs text-text-3">
          Escribí al menos 2 letras para buscar.
        </p>
      );
    }
    if (!searched) return null;
    const rows =
      source === "crm"
        ? crmResults.map((c) => ({ key: c.id, node: crmRow(c) }))
        : sysResults.map((r) => ({
            key: r.client.recordId,
            node: sysRow(r),
          }));
    if (rows.length === 0) {
      return (
        <p className="px-1 py-3 text-xs text-text-3">
          Nadie coincide con esa búsqueda
          {source === "system" ? " en el sistema de seguros" : ""}.
        </p>
      );
    }
    return (
      <ul className="max-h-[42vh] space-y-1.5 overflow-y-auto pr-0.5">
        {rows.map((r) => (
          <li key={r.key}>{r.node}</li>
        ))}
      </ul>
    );
  })();

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
        <ContactAvatar name={c.name} seed={c.id} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{c.name}</span>
            {c.channel && (
              <Badge variant="outline">{labelOf(c.channel)}</Badge>
            )}
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
    const nombre = `${r.client.nombre} ${r.client.apellido}`.trim() || "Cliente";
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
        <ContactAvatar name={nombre} seed={r.client.recordId} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{nombre}</span>
            {r.client.estado && (
              <Badge variant="outline">{r.client.estado}</Badge>
            )}
            {r.crm && <Badge variant="secondary">Ya en el CRM</Badge>}
          </span>
          <span className="block truncate text-[11.5px] text-text-3">
            {formatPhone(r.client.telefono) || "Sin teléfono"}
            {p.total !== null ? ` · Pólizas: ${p.total}` : ""}
          </span>
        </span>
      </button>
    );
  }

  const pickedName =
    picked?.kind === "crm"
      ? picked.contact.name
      : picked
        ? `${picked.result.client.nombre} ${picked.result.client.apellido}`.trim() ||
          "Cliente"
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
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">Nueva conversación</h3>
            <p className="mt-0.5 text-xs text-text-3">
              Elegí a quién escribirle y por dónde.
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
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{pickedName}</p>
                <p className="truncate text-[11.5px] text-text-3">
                  {picked.kind === "crm"
                    ? `${labelOf((picked.contact.channel ?? "whatsapp") as string)} · ${formatPhone(picked.contact.phone) || "sin teléfono"}`
                    : `Cliente del sistema de seguros${
                        picked.result.crm
                          ? ` · En el CRM: ${picked.result.crm.name}`
                          : " · Todavía no está en el CRM"
                      }`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => {
                  setOpenError(null);
                  setPicked(null);
                }}
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Cambiar
              </Button>
            </div>

            <p className="mt-3 text-[12.5px] font-semibold">
              ¿Por dónde escribirle?
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PlatformButton channel="whatsapp" />
              <PlatformButton channel="telegram" />
            </div>
            {openError && (
              <p className="mt-2 text-xs text-danger-text">{openError}</p>
            )}
            {picked.kind === "system" && (
              <a
                className="mt-3 inline-flex items-center gap-1 text-xs text-text-3 underline-offset-2 hover:underline"
                href={`https://airtable.com/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${picked.result.client.recordId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver ficha completa en el
                sistema
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-full border border-border-strong bg-secondary/70 p-1">
              <button
                type="button"
                onClick={() => {
                  setSource("crm");
                  setSearched(false);
                  setSearchError(null);
                }}
                aria-pressed={source === "crm"}
                className={cn(
                  "rounded-full py-[6px] text-[12.5px] font-semibold transition-colors",
                  source === "crm"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-text-3 hover:text-foreground"
                )}
              >
                Contactos del CRM
              </button>
              <button
                type="button"
                onClick={() => {
                  setSource("system");
                  setSearched(false);
                  setSearchError(null);
                }}
                aria-pressed={source === "system"}
                className={cn(
                  "rounded-full py-[6px] text-[12.5px] font-semibold transition-colors",
                  source === "system"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-text-3 hover:text-foreground"
                )}
              >
                Clientes del sistema
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-full border border-border-strong bg-background px-3.5 py-[7px] shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand-soft">
              <Search
                className="h-4 w-4 shrink-0 text-text-3"
                strokeWidth={1.7}
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  source === "crm"
                    ? "Buscar prospecto por nombre o teléfono…"
                    : "Buscar cliente por nombre, teléfono o DNI…"
                }
                aria-label={
                  source === "crm"
                    ? "Buscar contacto del CRM"
                    : "Buscar cliente del sistema"
                }
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-text-3"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="shrink-0 rounded-full p-0.5 text-text-3 hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>

            <p className="mt-1.5 px-1 text-[11px] text-text-3">
              {source === "crm"
                ? "Los contactos del CRM son tus prospectos: los que ya te escribieron o los que capturaste a mano."
                : "Los clientes del sistema son los del backoffice de seguros; al abrir el chat se vinculan solos por teléfono."}
            </p>

            <div className="mt-3">{results}</div>
          </>
        )}
      </div>
    </div>
  );
}
