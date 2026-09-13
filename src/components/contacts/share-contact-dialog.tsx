"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { CHANNEL_LABEL, isChannel } from "@/lib/channels";
import { systemClientName } from "@/lib/utils";
import type {
  ChatContactShareDto,
  ContactDto,
  SystemClientSearchResultDto,
} from "@/lib/types";

/**
 * 025 — Compartir un contacto dentro del chat interno.
 *
 * Dos segmentos con búsqueda propia, igual que el diálogo de «Nueva
 * conversación»: Contactos del CRM (los prospectos; la lista ya excluye a los
 * clientes del sistema) y Clientes del sistema (2+ letras, Airtable solo
 * lectura). Al elegir una persona se escribe una nota opcional y se comparte:
 * el mensaje queda en el hilo con su tarjeta y los botones para que el otro
 * empleado ejecute algo (abrir la ficha / abrir la conversación).
 */

type Picked =
  | { kind: "crm"; contact: ContactDto }
  | { kind: "system"; result: SystemClientSearchResultDto };

function systemName(r: SystemClientSearchResultDto): string {
  return systemClientName(r.client);
}

export function ShareContactDialog({
  onClose,
  onShare,
}: {
  onClose: () => void;
  onShare: (
    payload: ChatContactShareDto,
    note: string
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [crmQuery, setCrmQuery] = useState("");
  const [crmResults, setCrmResults] = useState<ContactDto[] | null>(null);
  const [crmSearching, setCrmSearching] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);

  const [sysQuery, setSysQuery] = useState("");
  const [sysResults, setSysResults] = useState<
    SystemClientSearchResultDto[] | null
  >(null);
  const [sysSearching, setSysSearching] = useState(false);
  const [sysError, setSysError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Segmento CRM: los recientes al abrir + búsqueda con respiro (300 ms).
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
            q.length >= 2
              ? `/api/contacts?q=${encodeURIComponent(q)}`
              : "/api/contacts";
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

  // Segmento sistema: 2+ caracteres (nombre, DNI o teléfono).
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
        const res = await fetch(
          `/api/clients/search?q=${encodeURIComponent(q)}`
        ).catch(() => null);
        if (cancelled) return;
        setSysSearching(false);
        const data = (await res?.json().catch(() => null)) as
          | { results?: SystemClientSearchResultDto[]; error?: { message?: string } }
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

  async function share() {
    if (!picked || sending) return;
    const payload: ChatContactShareDto =
      picked.kind === "crm"
        ? {
            source: "crm",
            contactId: picked.contact.id,
            name: picked.contact.name,
            phone: picked.contact.phone ?? null,
            channel: picked.contact.channel ?? null,
          }
        : {
            source: "system",
            recordId: picked.result.client.recordId,
            name: systemName(picked.result),
            phone: picked.result.client.telefono,
            policies: picked.result.client.polizas?.total ?? null,
          };
    setSending(true);
    setError(null);
    const res = await onShare(payload, note.trim());
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo compartir el contacto");
      return;
    }
    onClose();
  }

  const pickedSub = picked
    ? picked.kind === "crm"
      ? [
          picked.contact.phone ?? "sin teléfono",
          picked.contact.channel && isChannel(picked.contact.channel)
            ? CHANNEL_LABEL[picked.contact.channel]
            : picked.contact.channel,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          picked.result.client.telefono ?? "sin teléfono",
          picked.result.client.polizas?.total != null
            ? `Pólizas: ${picked.result.client.polizas.total}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
    : "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-label="Compartir un contacto"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border bg-background shadow-pop">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {picked && (
              <button
                onClick={() => {
                  setPicked(null);
                  setError(null);
                }}
                className="rounded-md p-1 text-text-3 hover:bg-accent"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
            <h3 className="truncate text-[15px] font-bold">
              {picked ? "Compartir contacto" : "¿Qué contacto querés compartir?"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-3 hover:bg-accent"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </header>

        {picked ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="rounded-md border bg-subtle px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-3">
                {picked.kind === "crm" ? "Contacto del CRM" : "Cliente del sistema"}
              </p>
              <p className="mt-0.5 text-[14px] font-semibold">
                {picked.kind === "crm" ? picked.contact.name : systemName(picked.result)}
              </p>
              {pickedSub && (
                <p className="text-[12px] text-text-3">{pickedSub}</p>
              )}
            </div>
            <label className="mt-3 block text-[12px] font-semibold text-text-2">
              Mensaje (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ej.: Llamalo por la renovación del auto."
              className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
            />
            {error && (
              <p className="mt-2 text-[12px] font-semibold text-red-600">{error}</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setPicked(null);
                  setError(null);
                }}
                className="rounded-md border px-3 py-1.5 text-[13px] hover:bg-subtle"
              >
                Volver
              </button>
              <button
                onClick={() => void share()}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg hover:opacity-90 disabled:opacity-40"
              >
                {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Compartir
              </button>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <section aria-label="Contactos del CRM">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-3">
                Contactos del CRM{" "}
                <span className="font-normal normal-case">— los prospectos</span>
              </p>
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3"
                  strokeWidth={1.8}
                />
                <input
                  value={crmQuery}
                  onChange={(e) => setCrmQuery(e.target.value)}
                  placeholder="Buscar por nombre o teléfono"
                  aria-label="Buscar contacto del CRM"
                  className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
                />
              </div>
              {crmError && (
                <p className="mt-1.5 text-[12px] font-semibold text-red-600">
                  {crmError}
                </p>
              )}
              <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
                {crmSearching && !crmResults && (
                  <li className="py-2 text-center text-[12.5px] text-text-3">
                    Buscando…
                  </li>
                )}
                {(crmResults ?? []).map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setPicked({ kind: "crm", contact: c })}
                      className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold">
                          {c.name}
                        </span>
                        <span className="block text-[11.5px] text-text-3">
                          {[
                            c.phone ?? "sin teléfono",
                            c.channel && isChannel(c.channel)
                              ? CHANNEL_LABEL[c.channel]
                              : c.channel,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.8}
                      />
                    </button>
                  </li>
                ))}
                {!crmSearching && crmResults && crmResults.length === 0 && (
                  <li className="py-2 text-center text-[12.5px] text-text-3">
                    Sin resultados
                  </li>
                )}
              </ul>
            </section>

            <section aria-label="Clientes del sistema">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-3">
                Clientes del sistema{" "}
                <span className="font-normal normal-case">
                  — los del backoffice
                </span>
              </p>
              <div className="relative mt-1.5">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3"
                  strokeWidth={1.8}
                />
                <input
                  value={sysQuery}
                  onChange={(e) => setSysQuery(e.target.value)}
                  placeholder="Nombre, DNI o teléfono (2+ letras)"
                  aria-label="Buscar cliente del sistema"
                  className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-[13.5px] outline-none placeholder:text-text-3 focus:border-brand"
                />
              </div>
              {sysError && (
                <p className="mt-1.5 text-[12px] font-semibold text-red-600">
                  {sysError}
                </p>
              )}
              <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
                {sysQuery.trim().length < 2 && (
                  <li className="py-2 text-center text-[12.5px] text-text-3">
                    Escribí al menos 2 letras para buscar en el sistema.
                  </li>
                )}
                {sysSearching && (
                  <li className="py-2 text-center text-[12.5px] text-text-3">
                    Buscando…
                  </li>
                )}
                {(sysResults ?? []).map((r) => (
                  <li key={r.client.recordId}>
                    <button
                      onClick={() => setPicked({ kind: "system", result: r })}
                      className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold">
                          {systemName(r)}
                        </span>
                        <span className="block text-[11.5px] text-text-3">
                          {[
                            r.client.telefono ?? "sin teléfono",
                            r.client.polizas?.total != null
                              ? `Pólizas: ${r.client.polizas.total}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-text-3"
                        strokeWidth={1.8}
                      />
                    </button>
                  </li>
                ))}
                {!sysSearching &&
                  sysQuery.trim().length >= 2 &&
                  sysResults &&
                  sysResults.length === 0 && (
                    <li className="py-2 text-center text-[12.5px] text-text-3">
                      Sin resultados
                    </li>
                  )}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
