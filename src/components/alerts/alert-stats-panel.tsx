"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ALERT_ESTADO_LABEL } from "@/lib/alerts";
import { cn } from "@/lib/utils";

/**
 * 030 — Estado general de las alertas (administrador, propietario y gerente):
 * el MISMO tablero de situación para los tres, con un filtro por empleado que
 * mira ese mismo tablero desde un ejecutor. Los números salen de la tabla
 * ALERTAS completa (incluidas concluidas y anuladas) + las derivaciones del
 * CRM, así que no dependen de las listas del día.
 */
const ESTADO_COLOR: Record<string, string> = {
  EN_PROGRESO: "var(--accent)",
  TURNO_CONFIRMADO: "var(--warning-text)",
  CONCLUIDA: "var(--success-text)",
  ANULADA: "var(--text-3)",
  PENDIENTE: "var(--border-strong)",
  DESACTIVADA: "var(--border-strong)",
  REVISADA: "var(--border-strong)",
};

type Serie = { label: string; value: number };
type Empleado = { name: string; activas: number; concluidas: number };
type Stats = {
  total: number;
  totalGeneral: number;
  porEstado: Serie[];
  porTipo: Serie[];
  porPrioridad: Serie[];
  empleados: Empleado[];
  empleado: string | null;
  generatedAt: string;
};

function conicGradient(slices: { label: string; value: number; color: string }[]): string {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  const parts = slices.map((s) => {
    const from = (acc / total) * 100;
    acc += s.value;
    const to = (acc / total) * 100;
    return `${s.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

function etiquetaEstado(estado: string): string {
  return ALERT_ESTADO_LABEL[estado] ?? estado;
}

function hora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AlertStatsPanel() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("all");

  const cargar = useCallback(async (empleado: string) => {
    setCargando(true);
    setError(null);
    try {
      const qs = empleado !== "all" ? `?empleado=${encodeURIComponent(empleado)}` : "";
      const res = await fetch(`/api/alerts/stats${qs}`);
      if (!res.ok) throw new Error("bad");
      setData((await res.json()) as Stats);
    } catch {
      setError("No se pudo leer el estado de las alertas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(filtro);
  }, [cargar, filtro]);

  const slices = useMemo(
    () =>
      (data?.porEstado ?? []).map((s) => ({
        ...s,
        color: ESTADO_COLOR[s.label] ?? "var(--border-strong)",
      })),
    [data]
  );
  const maxTipo = Math.max(1, ...(data?.porTipo ?? []).map((s) => s.value));
  const maxPrioridad = Math.max(1, ...(data?.porPrioridad ?? []).map((s) => s.value));
  const maxEmpleado = Math.max(
    1,
    ...(data?.empleados ?? []).map((e) => e.activas + e.concluidas)
  );

  return (
    <div className="space-y-4">
      {/* Filtro por empleado: el mismo estado general, mirado desde cada uno. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] font-semibold text-text-2">Empleado:</label>
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
        >
          <option value="all">Todos</option>
          {(data?.empleados ?? []).map((e) => (
            <option key={e.name} value={e.name}>
              {e.name}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-[11.5px] text-text-3">
            {filtro === "all"
              ? `${data.totalGeneral} alertas en el sistema`
              : `${data.total} alertas con este ejecutor`}
            {data.generatedAt ? ` · actualizado ${hora(data.generatedAt)}` : ""}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => void cargar(filtro)}
          disabled={cargando}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} /> Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </p>
      )}

      {!data ? (
        <p className="py-10 text-center text-[12.5px] text-text-3">
          {cargando ? "Cargando estado general…" : "Sin datos."}
        </p>
      ) : (
        <>
          {/* Distribución por estado */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Distribución por estado</h3>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <div
                className="relative h-36 w-36 shrink-0 rounded-full"
                style={{ background: conicGradient(slices) }}
              >
                <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
                  <span className="text-lg font-bold tabular-nums">{data.total}</span>
                  <span className="text-[10.5px] text-text-3">alertas</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {slices.map((s) => (
                  <li key={s.label} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-text-2">
                      {etiquetaEstado(s.label)}
                    </span>
                    <span className="font-semibold tabular-nums">{s.value}</span>
                    <span className="w-12 text-right tabular-nums text-text-3">
                      {data.total ? Math.round((s.value / data.total) * 100) : 0}%
                    </span>
                  </li>
                ))}
                {slices.length === 0 && (
                  <li className="text-[12.5px] text-text-3">Sin alertas para este filtro.</li>
                )}
              </ul>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Por tipo */}
            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Por tipo de alerta</h3>
              <div className="mt-3 space-y-1.5">
                {data.porTipo.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-40 truncate text-[12px] text-text-2" title={s.label}>
                      {s.label}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(s.value / maxTipo) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                      {s.value}
                    </span>
                  </div>
                ))}
                {data.porTipo.length === 0 && (
                  <p className="text-[12.5px] text-text-3">Sin datos.</p>
                )}
              </div>
            </section>

            {/* Por prioridad */}
            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Por prioridad</h3>
              <div className="mt-3 space-y-1.5">
                {data.porPrioridad.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="w-32 truncate text-[12px] text-text-2" title={s.label}>
                      {s.label}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(s.value / maxPrioridad) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                      {s.value}
                    </span>
                  </div>
                ))}
                {data.porPrioridad.length === 0 && (
                  <p className="text-[12.5px] text-text-3">Sin datos.</p>
                )}
              </div>
            </section>
          </div>

          {/* Por empleado */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Por empleado</h3>
            <p className="mt-1 text-[11.5px] text-text-3">
              Derivaciones del CRM: activas = todavía a su cargo · concluidas = alertas que trabajó.
            </p>
            <div className="mt-3 space-y-1.5">
              {data.empleados.map((e) => (
                <div key={e.name} className="flex items-center gap-2">
                  <span className="w-40 truncate text-[12px] text-text-2" title={e.name}>
                    {e.name}
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className={cn("h-full rounded-full", e.activas > 0 ? "bg-brand" : "bg-success-text")}
                      style={{ width: `${((e.activas + e.concluidas) / maxEmpleado) * 100}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-[11.5px] tabular-nums text-text-2">
                    <span className="font-semibold">{e.activas}</span> activas ·{" "}
                    {e.concluidas} concl.
                  </span>
                </div>
              ))}
              {data.empleados.length === 0 && (
                <p className="text-[12.5px] text-text-3">Todavía no hay derivaciones.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
