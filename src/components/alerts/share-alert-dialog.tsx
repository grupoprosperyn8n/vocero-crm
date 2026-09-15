"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Hash, Loader2, Search, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SgsaAlertDto } from "@/lib/types";

/**
 * 027b — Compartir una alerta (espejo del share de la PWA).
 *
 * Destinatarios: empleados del sistema (lo ven en su panel «Compartidas») y/o
 * grupos del chat interno a los que PERTENECE el usuario — el aviso también
 * se postea DENTRO del chat de cada grupo elegido.
 */

type Targets = {
  empleadoRef: string | null;
  employees: { airtableId: string; nombre: string; online: boolean }[];
  groups: { id: string; nombre: string; member?: boolean }[];
};

type ApiErrorBody = { error?: string | { message?: string } };

function apiErrorMessage(
  data: ApiErrorBody | null | undefined,
  fallback: string
): string {
  const error = data?.error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function ShareAlertDialog({
  alert,
  onClose,
  onShared,
}: {
  alert: SgsaAlertDto;
  onClose: () => void;
  onShared?: () => void;
}) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selEmps, setSelEmps] = useState<Set<string>>(new Set());
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/alerts/share-targets").catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | (Targets & { ok?: boolean })
        | null;
      if (cancelled) return;
      if (!res?.ok || !data?.ok) {
        setLoadError("No se pudieron cargar los destinatarios.");
        setTargets({ empleadoRef: null, employees: [], groups: [] });
        return;
      }
      setTargets({
        empleadoRef: data.empleadoRef ?? null,
        employees: data.employees ?? [],
        // 028 — de los grupos de un manager solo se comparte donde escribe.
        groups: (data.groups ?? []).filter((g) => g.member !== false),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEmps = useMemo(() => {
    if (!targets) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return targets.employees;
    return targets.employees.filter((e) =>
      e.nombre.toLowerCase().includes(needle)
    );
  }, [targets, q]);

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

  const total = selEmps.size + selGroups.size;

  async function submit() {
    if (!total || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/alerts/${encodeURIComponent(alert.id)}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            empleados: [...selEmps],
            grupos: [...selGroups],
            alert: {
              id: alert.id,
              airtableRecordId: alert.airtableRecordId,
              title: alert.titulo,
              titulo: alert.titulo,
              body: alert.cuerpo || alert.detalle,
              cuerpo: alert.cuerpo || alert.detalle,
              type: alert.tipo,
              tipo: alert.tipo,
              urgencyLabel: alert.urgenciaLabel,
              urgenciaLabel: alert.urgenciaLabel,
              recordUrl: alert.linkRegistro,
              linkRegistro: alert.linkRegistro,
              clienteRecordId: alert.clienteRecordId ?? null,
              estado: alert.estado,
              fecha: alert.fecha,
            },
          }),
        }
      ).catch(() => null);
      const data = (await res?.json().catch(() => null)) as
        | ({
            ok?: boolean;
            compartidaCon?: string[];
            grupos?: string[];
            chatGrupos?: string[];
            errores?: string[];
          } & ApiErrorBody)
        | null;
      if (!res?.ok || !data?.ok) {
        setError(apiErrorMessage(data, "No se pudo compartir la alerta."));
        return;
      }
      const partes: string[] = [];
      if (data.compartidaCon?.length) {
        partes.push(
          `${data.compartidaCon.length} empleado${data.compartidaCon.length === 1 ? "" : "s"}`
        );
      }
      if (data.grupos?.length) {
        partes.push(
          `${data.grupos.length} grupo${data.grupos.length === 1 ? "" : "s"}`
        );
      }
      if (data.chatGrupos?.length) {
        partes.push("aviso publicado en el chat del grupo");
      }
      if (data.errores?.length) {
        partes.push(
          `${data.errores.length} aviso${
            data.errores.length === 1 ? "" : "s"
          } con observación`
        );
      }
      setDone(
        partes.length
          ? `Compartida con ${partes.join(" · ")}.`
          : "Alerta compartida."
      );
      onShared?.();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
      role="dialog"
      aria-label="Compartir una alerta"
      onClick={done ? onClose : undefined}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border bg-background shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Share2 className="h-4 w-4 shrink-0 text-brand" strokeWidth={1.9} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold">Compartir alerta</p>
              <p className="truncate text-[11.5px] text-text-3">{alert.titulo}</p>
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
            <div className="border-b px-4 py-2.5">
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando destinatarios...
                </div>
              ) : (
                <>
                  {loadError && (
                    <p className="mb-2 rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12px] text-danger-text">
                      {loadError}
                    </p>
                  )}

                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-3">
                    Empleados
                  </p>
                  <div className="space-y-1.5">
                    {filteredEmps.length === 0 ? (
                      <p className="px-1 pb-1 text-[12px] text-text-3">
                        {q.trim()
                          ? "Sin resultados para la búsqueda."
                          : "Sin empleados disponibles."}
                      </p>
                    ) : (
                      filteredEmps.map((e) => (
                        <button
                          key={e.airtableId}
                          type="button"
                          data-share-emp={e.airtableId}
                          onClick={() => toggleEmp(e.airtableId)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                            selEmps.has(e.airtableId)
                              ? "border-brand bg-brand-tint"
                              : "hover:bg-accent"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                              selEmps.has(e.airtableId)
                                ? "border-brand bg-brand text-brand-fg"
                                : "border-border-strong"
                            )}
                          >
                            {selEmps.has(e.airtableId) ? "✓" : ""}
                          </span>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              e.online ? "bg-success" : "bg-border-strong"
                            )}
                            title={e.online ? "En línea" : "Desconectado"}
                          />
                          <span className="truncate">{e.nombre}</span>
                        </button>
                      ))
                    )}
                  </div>

                  <p className="mb-1.5 mt-4 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-text-3">
                    Grupos del chat interno
                    <span className="font-medium normal-case tracking-normal">
                      (tus grupos)
                    </span>
                  </p>
                  <div className="space-y-1.5">
                    {targets.groups.length === 0 ? (
                      <p className="px-1 text-[12px] text-text-3">
No pertenecés a grupos del chat interno.
                      </p>
                    ) : (
                      targets.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          data-share-group={g.id}
                          onClick={() => toggleGroup(g.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[12.5px] transition-colors",
                            selGroups.has(g.id)
                              ? "border-brand bg-brand-tint"
                              : "hover:bg-accent"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                              selGroups.has(g.id)
                                ? "border-brand bg-brand text-brand-fg"
                                : "border-border-strong"
                            )}
                          >
                            {selGroups.has(g.id) ? "✓" : ""}
                          </span>
                          <Hash className="h-3.5 w-3.5 shrink-0 text-text-3" strokeWidth={1.9} />
                          <span className="truncate">{g.nombre}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <footer className="flex items-center gap-2 border-t px-4 py-3">
              {error ? (
                <p className="mr-auto text-[12px] text-danger-text">{error}</p>
              ) : (
                <p className="mr-auto text-[12px] text-text-3">
                  {total === 0
                    ? "Elegí al menos un destinatario"
                    : `${total} seleccionado${total === 1 ? "" : "s"}`}
                </p>
              )}
              <button
                onClick={() => void submit()}
                disabled={!total || sending}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" strokeWidth={1.9} />
                )}
                Compartir
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
