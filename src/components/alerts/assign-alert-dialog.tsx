"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, GitBranch, Hash, Loader2, Search, Send, X } from "lucide-react";
import type { SgsaAlertDto } from "@/lib/types";
import { cn } from "@/lib/utils";

type Targets = {
  employees: { airtableId: string; nombre: string; online: boolean }[];
  groups: { id: string; nombre: string }[];
};

type ApiErrorBody = { error?: string | { message?: string } };

function apiErrorMessage(data: ApiErrorBody | null | undefined, fallback: string): string {
  const error = data?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function AssignAlertDialog({
  alert,
  onClose,
  onAssigned,
}: {
  alert: SgsaAlertDto;
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"one" | "type">("one");
  const [note, setNote] = useState("");
  const [selEmps, setSelEmps] = useState<Set<string>>(new Set());
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/alerts/share-targets").catch(() => null);
      const data = (await res?.json().catch(() => null)) as (Targets & { ok?: boolean }) | null;
      if (cancelled) return;
      if (!res?.ok || !data?.ok) {
        setLoadError("No se pudieron cargar los destinatarios.");
        setTargets({ employees: [], groups: [] });
        return;
      }
      setTargets({ employees: data.employees ?? [], groups: data.groups ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEmps = useMemo(() => {
    if (!targets) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return targets.employees;
    return targets.employees.filter((e) => e.nombre.toLowerCase().includes(needle));
  }, [targets, q]);

  const total = selEmps.size + selGroups.size;
  const toggleEmp = (id: string) =>
    setSelEmps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (id: string) =>
    setSelGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit() {
    if (!total || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          alertType: alert.tipo,
          empleados: [...selEmps],
          grupos: [...selGroups],
          note: note.trim() || undefined,
        }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | ({ ok?: boolean; assigned?: number; errores?: string[] } & ApiErrorBody)
        | null;
      if (!res?.ok || !data?.ok) {
        setError(apiErrorMessage(data, "No se pudo derivar la alerta."));
        return;
      }
      setDone(
        scope === "type"
          ? `Derivadas ${data.assigned ?? 0} alertas tipo ${alert.tipo}.`
          : "Alerta derivada con trazabilidad."
      );
      onAssigned?.();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4" role="dialog" aria-label="Derivar alerta">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border bg-background shadow-pop">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.9} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold">Derivar alerta</p>
              <p className="truncate text-[11.5px] text-text-3">{alert.titulo}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </header>

        {done ? (
          <div className="space-y-3 px-4 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success-text" strokeWidth={1.6} />
            <p className="text-[13px] font-semibold">{done}</p>
            <button onClick={onClose} className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg hover:opacity-90">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3 border-b px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                {(["one", "type"] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-left text-[12px] font-semibold",
                      scope === value ? "border-brand bg-brand-tint text-brand-text" : "hover:bg-accent"
                    )}
                  >
                    {value === "one" ? "Solo esta alerta" : `Todas tipo ${alert.tipo}`}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar empleado..."
                  className="h-9 w-full rounded-md border bg-card py-1.5 pl-8 pr-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {targets === null ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-text-3">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando destinatarios...
                </div>
              ) : (
                <>
                  {loadError && <p className="mb-2 rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12px] text-danger-text">{loadError}</p>}
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-3">Empleados</p>
                  <div className="space-y-1.5">
                    {filteredEmps.map((e) => (
                      <button
                        key={e.airtableId}
                        type="button"
                        onClick={() => toggleEmp(e.airtableId)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                          selEmps.has(e.airtableId) ? "border-brand bg-brand-tint" : "hover:bg-accent"
                        )}
                      >
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold", selEmps.has(e.airtableId) ? "border-brand bg-brand text-brand-fg" : "border-border-strong")}>{selEmps.has(e.airtableId) ? "✓" : ""}</span>
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", e.online ? "bg-success" : "bg-border-strong")} />
                        <span className="truncate">{e.nombre}</span>
                      </button>
                    ))}
                    {filteredEmps.length === 0 && <p className="px-1 pb-1 text-[12px] text-text-3">Sin empleados disponibles.</p>}
                  </div>

                  <p className="mb-1.5 mt-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-text-3">Grupos del chat interno</p>
                  <div className="space-y-1.5">
                    {targets.groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => toggleGroup(g.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                          selGroups.has(g.id) ? "border-brand bg-brand-tint" : "hover:bg-accent"
                        )}
                      >
                        <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold", selGroups.has(g.id) ? "border-brand bg-brand text-brand-fg" : "border-border-strong")}>{selGroups.has(g.id) ? "✓" : ""}</span>
                        <Hash className="h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.9} />
                        <span className="truncate">{g.nombre}</span>
                      </button>
                    ))}
                    {targets.groups.length === 0 && <p className="px-1 text-[12px] text-text-3">No hay grupos disponibles.</p>}
                  </div>

                  <label className="mt-4 block text-[12px] font-semibold text-text-2">Nota para el chat (opcional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Ej.: Revisar y avisar al cliente."
                    className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-text-3 focus:border-brand"
                  />
                </>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t px-4 py-3">
              {error ? <p className="mr-auto text-[12px] text-danger-text">{error}</p> : <p className="mr-auto text-[12px] text-text-3">{total ? `${total} destino${total === 1 ? "" : "s"}` : "Elegí al menos un destino"}</p>}
              <button onClick={() => void submit()} disabled={!total || sending} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg hover:opacity-90 disabled:opacity-40">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" strokeWidth={1.9} />}
                Derivar
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
