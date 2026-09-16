"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 037c — Métricas del tablero de Tareas (gerente, administrador y
 * propietario): qué se creó, qué se completó, qué venció y cómo viene el uso
 * del CRM por empleado. Gráficos CSS puros (sin librería), mismo lenguaje
 * visual que el estado general de Alertas.
 */

const ESTADO_COLOR: Record<string, string> = {
  Pendientes: "var(--border-strong)",
  "En curso": "var(--accent)",
  Vencidas: "var(--danger-text)",
  Terminadas: "var(--success-text)",
};

type EmpleadoRow = {
  userId: string;
  name: string;
  pendientes: number;
  vencidas: number;
  completadas: number;
  conversaciones: number;
  atendidas: number;
  mensajesCrm: number;
  mensajesInternos: number;
};

type Stats = {
  total: number;
  creadas: number;
  dePedidos: number;
  completadas: number;
  vencidas: number;
  abiertasAhora: number;
  tiempoMedioCierreSeg: number | null;
  porEstado: { label: string; value: number }[];
  porDia: { fecha: string; creadas: number; completadas: number }[];
  empleados: EmpleadoRow[];
  dias: number;
  generatedAt: string;
};

const PERIODOS: { value: string; label: string }[] = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "todo", label: "Todo" },
];

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

/** Segundos → texto humano corto (min / h / días). */
function fmtDur(seg: number | null): string {
  if (seg === null) return "—";
  if (seg < 90 * 60) return `${Math.max(1, Math.round(seg / 60))} min`;
  if (seg < 48 * 3600) return `${(seg / 3600).toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
  return `${(seg / 86400).toLocaleString("es-AR", { maximumFractionDigits: 1 })} días`;
}

function hora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function diaCorto(fecha: string): string {
  // "2026-09-16" → "16/9"
  const [, m, d] = fecha.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function TaskStatsPanel() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [periodo, setPeriodo] = useState("30");

  const cargar = useCallback(async (p: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/tareas/stats?dias=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error("bad");
      setData((await res.json()) as Stats);
    } catch {
      setError("No se pudieron leer las métricas de tareas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(periodo);
  }, [cargar, periodo]);

  const slices = useMemo(
    () =>
      (data?.porEstado ?? []).map((s) => ({
        ...s,
        color: ESTADO_COLOR[s.label] ?? "var(--border-strong)",
      })),
    [data]
  );

  const maxDia = Math.max(
    1,
    ...(data?.porDia ?? []).map((d) => Math.max(d.creadas, d.completadas))
  );
  const maxEmpBar = Math.max(
    1,
    ...(data?.empleados ?? []).map(
      (e) => e.completadas + e.pendientes + e.vencidas
    )
  );
  const maxUso = Math.max(
    1,
    ...(data?.empleados ?? []).map(
      (e) => e.conversaciones + e.atendidas + e.mensajesCrm + e.mensajesInternos
    )
  );

  const kpis = data
    ? [
        { label: "Creadas", value: String(data.creadas), hint: "en el período" },
        { label: "De pedidos", value: String(data.dePedidos), hint: "aceptados" },
        { label: "Completadas", value: String(data.completadas), hint: "en el período" },
        {
          label: "Vencidas ahora",
          value: String(data.vencidas),
          hint: "sin terminar",
          alerta: data.vencidas > 0,
        },
        {
          label: "Tiempo medio de cierre",
          value: fmtDur(data.tiempoMedioCierreSeg),
          hint: "de las completadas",
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* Período + actualizar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-text-2">Período:</span>
        <div className="flex rounded-md border border-border-strong bg-subtle p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              aria-pressed={periodo === p.value}
              className={cn(
                "rounded px-2.5 py-1 text-[12px] font-semibold transition-colors",
                periodo === p.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {data && (
          <span className="text-[11.5px] text-text-3">
            {data.total} tarea{data.total === 1 ? "" : "s"} en el tablero ·{" "}
            {data.abiertasAhora} abierta{data.abiertasAhora === 1 ? "" : "s"}
            {data.generatedAt ? ` · actualizado ${hora(data.generatedAt)}` : ""}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => void cargar(periodo)}
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
          {cargando ? "Calculando métricas…" : "Sin datos."}
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <section
                key={k.label}
                className={cn(
                  "rounded-lg border bg-card p-3.5",
                  k.alerta && "border-danger-soft"
                )}
              >
                <p className="text-[11.5px] font-semibold text-text-2">{k.label}</p>
                <p
                  className={cn(
                    "mt-1 text-xl font-bold tabular-nums",
                    k.alerta && "text-danger-text"
                  )}
                >
                  {k.value}
                </p>
                <p className="text-[10.5px] text-text-3">{k.hint}</p>
              </section>
            ))}
          </div>

          {/* Estado del tablero + por día */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Estado del tablero</h3>
              <div className="mt-3 flex flex-wrap items-center gap-6">
                <div
                  className="relative h-36 w-36 shrink-0 rounded-full"
                  style={{ background: conicGradient(slices) }}
                >
                  <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
                    <span className="text-lg font-bold tabular-nums">{data.total}</span>
                    <span className="text-[10.5px] text-text-3">tareas</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {slices.map((s) => (
                    <li key={s.label} className="flex items-center gap-2 text-[12.5px]">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-text-2">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.value}</span>
                      <span className="w-12 text-right tabular-nums text-text-3">
                        {data.total ? Math.round((s.value / data.total) * 100) : 0}%
                      </span>
                    </li>
                  ))}
                  {data.total === 0 && (
                    <li className="text-[12.5px] text-text-3">Todavía no hay tareas.</li>
                  )}
                </ul>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h3 className="text-[13px] font-bold">Por día</h3>
              <p className="mt-1 text-[11.5px] text-text-3">
                <span className="mr-3">
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand" /> creadas
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-success-text" />{" "}
                  completadas
                </span>
              </p>
              <div className="mt-3 flex h-28 items-end gap-[3px] overflow-hidden">
                {data.porDia.map((d) => (
                  <div
                    key={d.fecha}
                    className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]"
                    title={`${diaCorto(d.fecha)}: ${d.creadas} creadas · ${d.completadas} completadas`}
                  >
                    <div
                      className="w-1/2 max-w-[7px] rounded-t-sm bg-brand"
                      style={{ height: `${(d.creadas / maxDia) * 100}%` }}
                    />
                    <div
                      className="w-1/2 max-w-[7px] rounded-t-sm bg-success-text"
                      style={{ height: `${(d.completadas / maxDia) * 100}%` }}
                    />
                  </div>
                ))}
                {data.porDia.length === 0 && (
                  <p className="text-[12.5px] text-text-3">Sin datos en el período.</p>
                )}
              </div>
              <div className="mt-1 flex justify-between text-[10.5px] text-text-3">
                <span>{data.porDia[0] ? diaCorto(data.porDia[0]!.fecha) : ""}</span>
                <span>
                  {data.porDia[data.porDia.length - 1]
                    ? diaCorto(data.porDia[data.porDia.length - 1]!.fecha)
                    : ""}
                </span>
              </div>
            </section>
          </div>

          {/* Por empleado — ranking de gestión */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Por empleado — gestión de tareas</h3>
            <p className="mt-1 text-[11.5px] text-text-3">
              Ranking por completadas del período · pendientes y vencidas de ahora.
            </p>
            <div className="mt-3 space-y-1.5">
              {data.empleados.map((e, i) => (
                <div key={e.userId} className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-[11.5px] font-bold tabular-nums text-text-3">
                    {e.completadas > 0 ? `${i + 1}º` : "—"}
                  </span>
                  <span className="w-36 truncate text-[12px] text-text-2" title={e.name}>
                    {e.name}
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div className="flex h-full">
                      <div
                        className="h-full bg-success-text"
                        style={{ width: `${(e.completadas / maxEmpBar) * 100}%` }}
                        title={`${e.completadas} completadas`}
                      />
                      <div
                        className="h-full bg-brand"
                        style={{ width: `${(e.pendientes / maxEmpBar) * 100}%` }}
                        title={`${e.pendientes} pendientes`}
                      />
                      <div
                        className="h-full bg-danger-text"
                        style={{ width: `${(e.vencidas / maxEmpBar) * 100}%` }}
                        title={`${e.vencidas} vencidas`}
                      />
                    </div>
                  </div>
                  <span className="w-40 shrink-0 text-right text-[11.5px] tabular-nums text-text-2">
                    <span className="font-semibold text-success-text">{e.completadas}</span> compl ·{" "}
                    <span className="font-semibold">{e.pendientes}</span> pend ·{" "}
                    <span className={cn("font-semibold", e.vencidas > 0 && "text-danger-text")}>
                      {e.vencidas}
                    </span>{" "}
                    venc
                  </span>
                </div>
              ))}
              {data.empleados.length === 0 && (
                <p className="text-[12.5px] text-text-3">Sin movimiento en el período.</p>
              )}
            </div>
          </section>

          {/* Uso del CRM */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Uso del CRM por empleado</h3>
            <p className="mt-1 text-[11.5px] text-text-3">
              Conversaciones a cargo (ahora) · atendidas (cerradas por él en el período) ·
              mensajes enviados (salientes en sus conversaciones) · chat interno.
            </p>
            <div className="mt-3 space-y-1.5">
              {data.empleados
                .slice()
                .sort(
                  (a, b) =>
                    b.conversaciones +
                      b.atendidas +
                      b.mensajesCrm +
                      b.mensajesInternos -
                    (a.conversaciones + a.atendidas + a.mensajesCrm + a.mensajesInternos)
                )
                .map((e) => (
                  <div key={e.userId} className="flex items-center gap-2">
                    <span className="w-36 truncate text-[12px] text-text-2" title={e.name}>
                      {e.name}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${
                            ((e.conversaciones + e.atendidas + e.mensajesCrm + e.mensajesInternos) /
                              maxUso) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <span className="w-56 shrink-0 text-right text-[11.5px] tabular-nums text-text-2">
                      <span className="font-semibold">{e.conversaciones}</span> a cargo ·{" "}
                      <span className="font-semibold">{e.atendidas}</span> atendidas ·{" "}
                      <span className="font-semibold">{e.mensajesCrm}</span> msj ·{" "}
                      <span className="font-semibold">{e.mensajesInternos}</span> chat
                    </span>
                  </div>
                ))}
              {data.empleados.length === 0 && (
                <p className="text-[12.5px] text-text-3">Sin movimiento en el período.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
