"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";

import type { InsightRecordDto } from "@/lib/dashboard-management/types";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

/**
 * 044b-B15 — BAÚL de análisis de IA del Dashboard Management.
 *
 * Lista todos los informes guardados (módulos y clientes) con fecha, modo y
 * modelo; permite verlos, reformularlos (regenera y guarda la versión nueva),
 * borrarlos de a uno y limpiar los viejos en bloque.
 */

function stampFull(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Secciones del informe guardado, listas para mostrar. */
function payloadSections(
  item: InsightRecordDto
): { label: string; items: string[] }[] {
  const payload = item.payload as Record<string, unknown>;

  if (item.scope === "module") {
    const out: { label: string; items: string[] }[] = [];

    if (payload.resumen) {
      out.push({ label: "Resumen", items: [String(payload.resumen)] });
    }
    const focos = Array.isArray(payload.focos)
      ? payload.focos.map((f) => String(f)).filter(Boolean)
      : [];
    if (focos.length > 0) out.push({ label: "Qué mirar", items: focos });
    const acciones = Array.isArray(payload.acciones)
      ? payload.acciones
          .map((a) =>
            typeof a === "string"
              ? a
              : String((a as { texto?: string })?.texto ?? "")
          )
          .filter(Boolean)
      : [];
    if (acciones.length > 0) out.push({ label: "Qué hacer", items: acciones });
    if (payload.mensaje) {
      out.push({ label: "Mensaje sugerido", items: [String(payload.mensaje)] });
    }

    return out;
  }

  const out: { label: string; items: string[] }[] = [];

  if (payload.accion) {
    out.push({ label: "Acción", items: [String(payload.accion)] });
  }
  if (payload.porQue) {
    out.push({ label: "Por qué", items: [String(payload.porQue)] });
  }
  const pasos = Array.isArray(payload.pasos)
    ? payload.pasos.map((p) => String(p)).filter(Boolean)
    : [];
  if (pasos.length > 0) out.push({ label: "Pasos", items: pasos });
  if (payload.mensajeWhatsapp) {
    out.push({
      label: "Mensaje sugerido",
      items: [String(payload.mensajeWhatsapp)],
    });
  }

  return out;
}

export function InsightVault({
  open,
  onClose,
  onReforward,
}: {
  open: boolean;
  onClose: () => void;
  /** Reformular: el padre regenera el informe con su contexto guardado. */
  onReforward: (item: InsightRecordDto) => void;
}) {
  const [items, setItems] = useState<InsightRecordDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "module" | "client">("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [olderDays, setOlderDays] = useState(30);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard-management/insights?limit=80");
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        insights?: InsightRecordDto[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo abrir el baúl.");
      }
      setItems(Array.isArray(data.insights) ? data.insights : []);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "No se pudo abrir el baúl."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setNotice(null);
      setExpandedId(null);
      void load();
    }
  }, [open, load]);

  if (!open) return null;

  const filtered =
    filter === "todos" ? items : items.filter((item) => item.scope === filter);

  async function removeOne(item: InsightRecordDto) {
    if (
      !window.confirm(
        `¿Eliminar el análisis «${item.title}» del ${stampFull(item.generatedAt)}?`
      )
    ) {
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(
        `/api/dashboard-management/insights?id=${encodeURIComponent(item.id)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setItems((prev) => prev.filter((row) => row.id !== item.id));
        setNotice("Análisis eliminado.");
      } else {
        setError("No se pudo eliminar. Probá de nuevo.");
      }
    } catch {
      setError("No se pudo eliminar. Probá de nuevo.");
    } finally {
      setBusyId(null);
    }
  }

  async function cleanOld() {
    if (
      !window.confirm(
        `¿Eliminar todos los análisis de más de ${olderDays} días? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setCleaning(true);
    try {
      const res = await fetch(
        `/api/dashboard-management/insights?olderThanDays=${olderDays}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as { deleted?: number };
      if (res.ok) {
        setNotice(
          data?.deleted && data.deleted > 0
            ? `${data.deleted} análisis viejos eliminados.`
            : "No había análisis tan viejos."
        );
        await load();
      } else {
        setError("No se pudo limpiar. Probá de nuevo.");
      }
    } catch {
      setError("No se pudo limpiar. Probá de nuevo.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 p-4 pt-[5vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <span className="flex items-center gap-1.5 text-[13px] font-bold">
            <Archive size={14} />
            Baúl de análisis
          </span>
          <span className="rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-semibold text-text-3">
            {items.length} guardado{items.length === 1 ? "" : "s"}
          </span>
          <span className="flex-1" />
          <button
            className="rounded-md border bg-card p-1.5 text-text-2 transition-colors hover:bg-accent"
            title="Cerrar"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* Filtros + limpieza */}
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
          {(
            [
              { id: "todos", label: "Todos" },
              { id: "module", label: "Módulos" },
              { id: "client", label: "Clientes" },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                filter === option.id
                  ? "border-brand bg-brand text-white"
                  : "bg-card text-text-2 hover:bg-subtle"
              )}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
          <span className="flex-1" />
          <span className="text-[11px] text-text-3">Eliminar viejos:</span>
          <Select
            value={String(olderDays)}
            onChange={(v) => setOlderDays(Number(v))}
            ariaLabel="Antigüedad"
            className="rounded-md border bg-card px-1.5 py-1 text-[11px]"
            options={[
              { value: "30", label: "+30 días" },
              { value: "60", label: "+60 días" },
              { value: "90", label: "+90 días" },
            ]}
          />
          <button
            className="inline-flex items-center gap-1 rounded-md border border-danger-soft bg-card px-2 py-1 text-[11px] font-semibold text-danger-text transition-colors hover:bg-danger-tint disabled:opacity-60"
            disabled={cleaning}
            onClick={() => void cleanOld()}
          >
            <Trash2 size={11} />
            {cleaning ? "Limpiando…" : "Limpiar"}
          </button>
        </div>

        {/* Notices */}
        {notice && (
          <p className="border-b bg-success-tint px-4 py-1.5 text-[11.5px] font-semibold text-success-text">
            {notice}
          </p>
        )}
        {error && (
          <p className="border-b bg-danger-tint px-4 py-1.5 text-[11.5px] font-semibold text-danger-text">
            {error}
          </p>
        )}

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-[12.5px] text-text-3">
              Abriendo el baúl…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-text-3">
              {items.length === 0
                ? "Todavía no hay análisis guardados. Generá uno con IA y va a quedar acá, con fecha."
                : "No hay análisis de ese tipo."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const expanded = expandedId === item.id;
                const sections = expanded ? payloadSections(item) : [];
                return (
                  <li key={item.id} className="rounded-lg border bg-card">
                    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-[12.5px]">
                          {item.title}
                        </strong>
                        <span className="text-[10.5px] text-text-3">
                          {stampFull(item.generatedAt)} ·{" "}
                          {item.scope === "client" ? "Cliente" : "Módulo"} ·{" "}
                          {item.mode === "ia" ? "Solo IA" : "Dual"}
                          {item.model ? ` · ${item.model}` : ""}
                        </span>
                      </span>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                      >
                        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        {expanded ? "Ocultar" : "Ver"}
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-card px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                        title="Genera de nuevo el análisis (queda la versión nueva guardada)"
                        onClick={() => onReforward(item)}
                      >
                        <RefreshCcw size={11} />
                        Reformular
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-md border border-danger-soft bg-card px-2 py-0.5 text-[11px] font-semibold text-danger-text transition-colors hover:bg-danger-tint disabled:opacity-60"
                        disabled={busyId === item.id}
                        onClick={() => void removeOne(item)}
                      >
                        <Trash2 size={11} />
                        Eliminar
                      </button>
                    </div>

                    {expanded && (
                      <div className="space-y-2 border-t px-3 py-2">
                        {sections.length === 0 ? (
                          <p className="text-[11.5px] text-text-3">
                            Este análisis no tiene contenido para mostrar.
                          </p>
                        ) : (
                          sections.map((section) => (
                            <div key={section.label}>
                              <span className="text-[10.5px] font-bold uppercase tracking-wide text-text-3">
                                {section.label}
                              </span>
                              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px] text-text-2">
                                {section.items.map((line, index) => (
                                  <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
                                ))}
                              </ul>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t px-4 py-2 text-[10.5px] text-text-3">
          Cada informe de IA del tablero (módulos y clientes) se guarda acá con
          fecha, modo y modelo. Reformular genera una versión nueva con los datos
          de ahora.
        </div>
      </div>
    </div>
  );
}
