"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ReviewEstado } from "@/lib/reviews";
import { cn } from "@/lib/utils";

/**
 * 033 — Tablero del flujo de siniestros (revisión de envío SGSA): qué se
 * revisó, quién decidió y cómo terminó el envío. Mismo alcance que el estado
 * general de alertas (administrador, propietario y gerente). Los números
 * salen de las tarjetas del chat interno (`review_request`).
 */

type Stats = {
  dias: number;
  generatedAt: string;
  total: number;
  pendientesAhora: number;
  aprobacionPct: number | null;
  tiempoMedioDecisionSeg: number | null;
  porEstado: { estado: ReviewEstado; value: number }[];
  porVia: { via: "chat" | "telegram"; value: number }[];
  decisores: { nombre: string; value: number }[];
  porDia: { fecha: string; total: number; porEstado: Record<ReviewEstado, number> }[];
};

const ESTADO_LABEL: Record<ReviewEstado, string> = {
  pendiente: "Pendiente",
  aprobado: "Aprobado (en curso)",
  detenido: "Detenido",
  enviado: "Despachado",
  trabado: "Trabado",
};

const ESTADO_COLOR: Record<ReviewEstado, string> = {
  pendiente: "var(--warning-text)",
  aprobado: "var(--accent)",
  enviado: "var(--success-text)",
  trabado: "var(--danger-text)",
  detenido: "var(--text-3)",
};

const ESTADO_ORDER: ReviewEstado[] = [
  "pendiente",
  "aprobado",
  "detenido",
  "enviado",
  "trabado",
];

/** Orden de apilado de las barras (de abajo hacia arriba). */
const STACK_BOTTOM_UP: ReviewEstado[] = [
  "pendiente",
  "aprobado",
  "enviado",
  "detenido",
  "trabado",
];

function conicGradient(slices: { value: number; color: string }[]): string {
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

function fmtDur(seg: number | null): string {
  if (seg === null) return "—";
  if (seg < 60) return `${seg} s`;
  if (seg < 3600) return `${Math.max(1, Math.round(seg / 60))} min`;
  const h = Math.floor(seg / 3600);
  const m = Math.round((seg % 3600) / 60);
  return `${h} h ${m} min`;
}

function fmtDia(fecha: string): string {
  const [, m, d] = fecha.split("-");
  return d && m ? `${d}/${m}` : fecha;
}

function hora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3.5">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-3">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-text-3">{hint}</p> : null}
    </div>
  );
}

export function ReviewStatsPanel() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [dias, setDias] = useState("30");

  const cargar = useCallback(async (periodo: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reviews/stats?dias=${encodeURIComponent(periodo)}`
      );
      if (!res.ok) throw new Error("bad");
      setData((await res.json()) as Stats);
    } catch {
      setError("No se pudieron leer las estadísticas del flujo de siniestros.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(dias);
  }, [cargar, dias]);

  const slices = useMemo(
    () =>
      (data?.porEstado ?? [])
        .filter((s) => s.value > 0)
        .map((s) => ({ ...s, color: ESTADO_COLOR[s.estado] })),
    [data]
  );
  const maxDia = Math.max(1, ...(data?.porDia ?? []).map((d) => d.total));
  const maxDecisor = Math.max(1, ...(data?.decisores ?? []).map((d) => d.value));
  const maxVia = Math.max(1, ...(data?.porVia ?? []).map((v) => v.value));
  const diasConDatos = (data?.porDia ?? []).filter((d) => d.total > 0).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-[14px] font-bold">
            Siniestros — Revisión de envío SGSA
          </h2>
          <p className="text-[11.5px] text-text-3">
            Tarjetas de aprobación del chat interno: qué se revisó, quién
            decidió y cómo terminó el envío.
          </p>
        </div>
        <label className="text-[12px] font-semibold text-text-2">Período:</label>
        <select
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
        >
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
          <option value="todo">Todo</option>
        </select>
        {data && (
          <span className="text-[11.5px] text-text-3">
            {diasConDatos} día{diasConDatos === 1 ? "" : "s"} con revisiones
            {data.generatedAt ? ` · actualizado ${hora(data.generatedAt)}` : ""}
          </span>
        )}
        <button
          onClick={() => void cargar(dias)}
          disabled={cargando}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} />{" "}
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </p>
      )}

      {!data ? (
        <p className="py-8 text-center text-[12.5px] text-text-3">
          {cargando ? "Cargando flujo de siniestros…" : "Sin datos."}
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Revisiones"
              value={data.total}
              hint={`creadas en el período${data.dias > 0 ? ` (${data.dias} d)` : ""}`}
            />
            <Kpi
              label="Pendientes ahora"
              value={data.pendientesAhora}
              hint="esperando decisión"
            />
            <Kpi
              label="Aprobación"
              value={
                data.aprobacionPct === null ? "—" : `${data.aprobacionPct}%`
              }
              hint="de las decididas"
            />
            <Kpi
              label="Decisión media"
              value={fmtDur(data.tiempoMedioDecisionSeg)}
              hint="desde que llega a la tarjeta"
            />
          </div>

          {/* Distribución por estado (actual) */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Estado actual de las revisiones</h3>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <div
                className="relative h-36 w-36 shrink-0 rounded-full"
                style={{ background: conicGradient(slices) }}
              >
                <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
                  <span className="text-lg font-bold tabular-nums">{data.total}</span>
                  <span className="text-[10.5px] text-text-3">revisiones</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {(data.porEstado ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      ESTADO_ORDER.indexOf(a.estado) -
                      ESTADO_ORDER.indexOf(b.estado)
                  )
                  .map((s) => (
                    <li key={s.estado} className="flex items-center gap-2 text-[12.5px]">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: ESTADO_COLOR[s.estado] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-text-2">
                        {ESTADO_LABEL[s.estado]}
                      </span>
                      <span className="font-semibold tabular-nums">{s.value}</span>
                      <span className="w-12 text-right tabular-nums text-text-3">
                        {data.total
                          ? Math.round((s.value / data.total) * 100)
                          : 0}
                        %
                      </span>
                    </li>
                  ))}
                {slices.length === 0 && (
                  <li className="text-[12.5px] text-text-3">
                    Todavía no hay revisiones en el período.
                  </li>
                )}
              </ul>
            </div>
          </section>

          {/* Ingresos por día */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Ingresos por día</h3>
            <p className="mt-1 text-[11.5px] text-text-3">
              Cada barra: revisiones que entraron ese día, pintadas por su estado actual.
            </p>
            <div className="mt-3 flex h-40 items-end gap-[3px]">
              {(data.porDia ?? []).map((d) => (
                <div
                  key={d.fecha}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                  title={`${fmtDia(d.fecha)} — ${d.total} revisión${d.total === 1 ? "" : "es"}`}
                >
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-sm"
                    style={{ height: `${Math.max((d.total / maxDia) * 100, 1.5)}%` }}
                  >
                    {d.total > 0 &&
                      STACK_BOTTOM_UP.map((e) =>
                        d.porEstado[e] ? (
                          <div
                            key={e}
                            style={{
                              height: `${(d.porEstado[e] / d.total) * 100}%`,
                              background: ESTADO_COLOR[e],
                            }}
                          />
                        ) : null
                      )}
                  </div>
                </div>
              ))}
            </div>
            {(data.porDia ?? []).length > 0 && (
              <div className="mt-1 flex items-center justify-between text-[10px] text-text-3">
                <span>{fmtDia(data.porDia[0]!.fecha)}</span>
                <span>{fmtDia(data.porDia[data.porDia.length - 1]!.fecha)}</span>
              </div>
            )}
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {ESTADO_ORDER.map((e) => (
                <li key={e} className="flex items-center gap-1.5 text-[11px] text-text-3">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: ESTADO_COLOR[e] }}
                  />
                  {ESTADO_LABEL[e]}
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Quién decidió */}
            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Quién decidió</h3>
              <p className="mt-1 text-[11.5px] text-text-3">
                Aprobaciones y detenciones por decisor (chat interno y Telegram).
              </p>
              <div className="mt-3 space-y-1.5">
                {data.decisores.map((d) => (
                  <div key={d.nombre} className="flex items-center gap-2">
                    <span
                      className="w-40 truncate text-[12px] text-text-2"
                      title={d.nombre}
                    >
                      {d.nombre}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(d.value / maxDecisor) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                      {d.value}
                    </span>
                  </div>
                ))}
                {data.decisores.length === 0 && (
                  <p className="text-[12.5px] text-text-3">Sin decisiones todavía.</p>
                )}
              </div>
            </section>

            {/* Vía de decisión */}
            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Vía de decisión</h3>
              <p className="mt-1 text-[11.5px] text-text-3">
                El mismo circuito, decidido desde el chat interno o desde Telegram.
              </p>
              <div className="mt-3 space-y-2">
                {data.porVia.map((v) => (
                  <div key={v.via} className="flex items-center gap-2">
                    <span className="w-28 text-[12px] text-text-2">
                      {v.via === "chat" ? "Chat interno" : "Telegram"}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(v.value / maxVia) * 100}%`,
                          background:
                            v.via === "chat" ? "var(--accent)" : "var(--warning-text)",
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                      {v.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
