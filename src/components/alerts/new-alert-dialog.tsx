"use client";

import { useEffect, useMemo, useState } from "react";
import { BellPlus, CheckCircle2, Loader2, Search, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemClientSearchResultDto } from "@/lib/types";
import { Select } from "@/components/ui/select";

/**
 * 30Sep — «Nueva alerta»: crear una alerta desde el CRM (pedido Diego:
 * «cómo desde el CRM puedo crear alertas nuevas matcheadas al backend de
 * Airtable o al backend de clientes del CRM»).
 *
 * La alerta viaja al backend SGSA (el mismo push que usa n8n) y queda
 * persistida en Airtable (tabla ALERTAS) con origen «CRM»; si se elige un
 * cliente, se vincula por rec id (campo CLIENTE) para que «Abrir cliente» y
 * el match contra los clientes del sistema funcionen igual que en las
 * alertas automáticas.
 *
 * Solo dueño / propietario / gerente: el botón lo gatea la página y el
 * servidor (POST /api/alerts) re-valida el rol.
 */

const PRIORIDADES = [
  { label: "🔴 Alta", key: "alta" },
  { label: "🟠 Media", key: "media" },
  { label: "🟡 Baja", key: "baja" },
] as const;
type Prioridad = (typeof PRIORIDADES)[number]["label"];

const TIPO_OTRO = "__otro__";

type ClienteElegido = {
  recordId: string;
  nombre: string;
  dni: string | null;
};

function nombreCliente(c: SystemClientSearchResultDto): string {
  return [c.client.nombre, c.client.apellido].filter(Boolean).join(" ").trim() ||
    c.client.nombre;
}

export function NewAlertDialog({
  alertTypes,
  onClose,
  onCreated,
}: {
  alertTypes: string[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [tipoLibre, setTipoLibre] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("🟠 Media");
  const [detalle, setDetalle] = useState("");
  const [cliente, setCliente] = useState<ClienteElegido | null>(null);
  const [clientQ, setClientQ] = useState("");
  const [clientResults, setClientResults] = useState<SystemClientSearchResultDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Tipos de alerta: los que ya circulan por el CRM + los genéricos.
  const tipos = useMemo(() => {
    const base = new Set<string>(alertTypes.filter(Boolean));
    base.add("SEGUIMIENTO_MANUAL");
    base.add("GENERICA");
    return Array.from(base).sort();
  }, [alertTypes]);

  // Buscador de clientes del sistema (mismo endpoint que el Dashboard).
  useEffect(() => {
    if (cliente) return;
    const q = clientQ.trim();
    if (q.length < 3) {
      setClientResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/clients/search?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        ).catch(() => null);
        const data = (await res?.json().catch(() => null)) as {
          results?: SystemClientSearchResultDto[];
        } | null;
        if (cancelled) return;
        setClientResults(res?.ok ? (data?.results ?? []) : []);
      } catch {
        if (!cancelled) setClientResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setSearching(false);
    };
  }, [clientQ, cliente]);

  const tipoElegido = tipoSel === TIPO_OTRO ? tipoLibre.trim() : tipoSel.trim();
  const canSubmit =
    !sending && titulo.trim().length >= 3 && tipoElegido.length >= 2;

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: titulo.trim(),
          tipo: tipoElegido,
          prioridad,
          detalle: detalle.trim(),
          clienteRecordId: cliente?.recordId ?? null,
          clienteNombre: cliente?.nombre ?? null,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string | { message?: string };
      } | null;
      if (!res.ok || !data?.ok) {
        const msg =
          typeof data?.error === "string"
            ? data.error
            : data?.error?.message;
        setError(
          typeof msg === "string" && msg.trim()
            ? msg
            : "No se pudo crear la alerta. Reintentá en un momento."
        );
        return;
      }
      setDone("Alerta creada y publicada en el sistema.");
      onCreated?.();
    } catch {
      setError("Sin conexión con el sistema de alertas.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-label="Nueva alerta"
      onClick={done ? onClose : undefined}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border bg-background shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <BellPlus className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.9} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold">Nueva alerta</p>
              <p className="truncate text-[11.5px] text-text-3">
                Se publica en el sistema de alertas (Airtable) con origen «CRM»
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </header>

        {done ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <CheckCircle2
              className="mx-auto h-8 w-8 text-success-text"
              strokeWidth={1.6}
            />
            <p className="text-[13px] font-semibold">{done}</p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                  Título
                </span>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej.: Cliente pidió renovación urgente"
                  maxLength={160}
                  data-new-alert="titulo"
                  className="h-9 w-full rounded-md border bg-card px-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </label>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                    Tipo de alerta
                  </span>
                  <Select
                    value={tipoSel}
                    onChange={setTipoSel}
                    buttonProps={{ "data-new-alert": "tipo" }}
                    ariaLabel="Tipo de alerta"
                    className="h-9 w-full rounded-md border bg-card px-2 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    options={[
                      { value: "", label: "Elegí un tipo…" },
                      ...tipos.map((t) => ({ value: t, label: t })),
                      { value: TIPO_OTRO, label: "➕ Otro tipo…" },
                    ]}
                  />
                  {tipoSel === TIPO_OTRO && (
                    <input
                      value={tipoLibre}
                      onChange={(e) => setTipoLibre(e.target.value)}
                      placeholder="Escribí el tipo nuevo"
                      maxLength={60}
                      data-new-alert="tipo-libre"
                      className="mt-1.5 h-9 w-full rounded-md border bg-card px-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  )}
                </label>

                <div>
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                    Prioridad
                  </span>
                  <div className="flex items-center gap-1.5">
                    {PRIORIDADES.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPrioridad(p.label)}
                        data-new-alert={`prioridad-${p.key}`}
                        className={cn(
                          "flex-1 rounded-full border px-2 py-1.5 text-[11.5px] font-semibold transition-colors",
                          prioridad === p.label
                            ? "border-brand bg-brand-tint text-brand-text"
                            : "text-text-2 hover:bg-accent"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                  Detalle
                </span>
                <textarea
                  value={detalle}
                  onChange={(e) => setDetalle(e.target.value)}
                  placeholder="Qué pasó, qué hay que hacer…"
                  rows={3}
                  maxLength={2000}
                  data-new-alert="detalle"
                  className="w-full resize-y rounded-md border bg-card px-2.5 py-2 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </label>

              <div>
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-3">
                  Cliente vinculado (opcional)
                </span>
                {cliente ? (
                  <div className="flex items-center gap-2 rounded-md border border-brand bg-brand-tint px-2.5 py-2">
                    <UserRound className="h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={1.9} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold">{cliente.nombre}</p>
                      <p className="truncate text-[11px] text-text-3">
                        {cliente.dni ? `DNI ${cliente.dni} · ` : ""}
                        {cliente.recordId}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCliente(null);
                        setClientQ("");
                      }}
                      aria-label="Quitar cliente"
                      data-new-alert="quitar-cliente"
                      className="rounded-md p-1 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
                      <input
                        value={clientQ}
                        onChange={(e) => setClientQ(e.target.value)}
                        placeholder="Buscar por nombre, DNI o teléfono (mín. 3 letras)…"
                        data-new-alert="buscar-cliente"
                        className="h-9 w-full rounded-md border bg-card py-1.5 pl-8 pr-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      {searching && (
                        <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-text-3" />
                      )}
                    </div>
                    {clientResults.length > 0 && (
                      <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border bg-card">
                        {clientResults.map((r) => (
                          <button
                            key={r.client.recordId}
                            type="button"
                            data-new-alert="resultado-cliente"
                            onClick={() =>
                              setCliente({
                                recordId: r.client.recordId,
                                nombre: nombreCliente(r),
                                dni: r.client.dni ?? null,
                              })
                            }
                            className="flex w-full items-center gap-2 border-b px-2.5 py-2 text-left last:border-b-0 hover:bg-accent"
                          >
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.9} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-medium">
                                {nombreCliente(r)}
                              </span>
                              <span className="block truncate text-[11px] text-text-3">
                                {r.client.dni ? `DNI ${r.client.dni}` : "sin DNI"}
                                {r.crm ? " · ya está en el CRM" : ""}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {!searching && clientQ.trim().length >= 3 && clientResults.length === 0 && (
                      <p className="mt-1 text-[11.5px] text-text-3">
                        Sin coincidencias en los clientes del sistema.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <footer className="flex items-center gap-2 border-t px-4 py-3">
              {error ? (
                <p className="mr-auto text-[12px] text-danger-text">{error}</p>
              ) : (
                <p className="mr-auto text-[12px] text-text-3">
                  Queda visible para todo el sistema de alertas.
                </p>
              )}
              <button
                onClick={() => void submit()}
                disabled={!canSubmit}
                data-new-alert="crear"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BellPlus className="h-3.5 w-3.5" strokeWidth={1.9} />
                )}
                Crear alerta
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
