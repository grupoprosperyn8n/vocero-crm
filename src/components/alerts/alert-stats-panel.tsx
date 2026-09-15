"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { SgsaAlertDto } from "@/lib/types";
import { ALERT_ESTADO_LABEL, isLiveAssignmentStatus } from "@/lib/alerts";
import { cn } from "@/lib/utils";

/**
 * 030 — Estado general de las alertas (para admin, propietario y gerente).
 *
 * Los tres roles ven el MISMO estado general —todas las alertas del
 * sistema— cada uno desde su usuario, con un filtro por empleado. Sin
 * recortes por rol: es un tablero de situación, no una bandeja.
 *
 * Gráficas sin dependencias: barras y un anillo hechos con CSS del tema
 * (las variables cambian con data-theme, así que esto funciona igual en
 * claro y en oscuro).
 */

/** Color por estado (variables del tema). */
const ESTADO_COLOR: Record<string, string> = {
  EN_PROGRESO: "var(--accent)",
  ASSIGNED: "var(--accent)",
  TURNO_CONFIRMADO: "var(--warning-text)",
  CONCLUIDA: "var(--success-text)",
  ANULADA: "var(--text-3)",
  PENDIENTE: "var(--border-strong)",
};

const URGENCIA_LABEL: Record<number, string> = {
  3: "Urgentes",
  2: "Altas",
  1: "Medias",
  0: "Bajas",
};

const URGENCIA_COLOR: Record<number, string> = {
  3: "var(--danger-text)",
  2: "var(--warning-text)",
  1: "var(--accent)",
  0: "var(--text-3)",
};

type Slice = { key: string; label: string; value: number; color: string };

/** Anillo de estado: `conic-gradient` armado con los conteos reales. */
function conicGradient(slices: Slice[]): string {
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

export function AlertStatsPanel() {
  const [pend, setPend] = useState<SgsaAlertDto[] | null>(null);
  const [hist, setHist] = useState<SgsaAlertDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filtro, setFiltro] = useState("all");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/alerts?leidas=false"),
        fetch("/api/alerts?leidas=true"),
      ]);
      if (!r1.ok || !r2.ok) throw new Error("backend");
      const d1 = (await r1.json()) as { alerts?: SgsaAlertDto[] };
      const d2 = (await r2.json()) as { alerts?: SgsaAlertDto[] };
      setPend(d1.alerts ?? []);
      setHist(d2.alerts ?? []);
    } catch {
      setError("No se pudo cargar el estado general de las alertas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const datos = useMemo(() => {
    if (!pend || !hist) return null;

    /** Ejecutor visible de una alerta: la derivación viva, o la última que tuvo. */
    const ejecutorDe = (a: SgsaAlertDto): string => {
      const list = a.asignaciones ?? [];
      const viva = list.find((x) => isLiveAssignmentStatus(x.status));
      const elegida = viva ?? list[list.length - 1];
      return elegida?.targetName ?? "Sin derivar";
    };
    const match = (a: SgsaAlertDto) => filtro === "all" || ejecutorDe(a) === filtro;

    const P = pend.filter(match);
    const H = hist.filter(match);

    const estadoCuenta = new Map<string, number>();
    for (const a of [...P, ...H]) {
      const key = (a.estado || "PENDIENTE").toUpperCase();
      estadoCuenta.set(key, (estadoCuenta.get(key) ?? 0) + 1);
    }
    const slices: Slice[] = [...estadoCuenta.entries()]
      .map(([key, value]) => ({
        key,
        label: ALERT_ESTADO_LABEL[key] ?? key,
        value,
        color: ESTADO_COLOR[key] ?? "var(--border-strong)",
      }))
      .sort((a, b) => b.value - a.value);

    const porTipo = new Map<string, number>();
    for (const a of P) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1);
    const tipos = [...porTipo.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const porUrg = new Map<number, number>();
    for (const a of P) porUrg.set(a.urgencia, (porUrg.get(a.urgencia) ?? 0) + 1);

    const porEjec = new Map<string, { activas: number; concluidas: number }>();
    const touch = (name: string) => {
      const cur = porEjec.get(name) ?? { activas: 0, concluidas: 0 };
      porEjec.set(name, cur);
      return cur;
    };
    for (const a of P) touch(ejecutorDe(a)).activas++;
    for (const a of H) touch(ejecutorDe(a)).concluidas++;
    const ejecutores = [...porEjec.entries()].sort(
      (a, b) =>
        b[1].activas + b[1].concluidas - (a[1].activas + a[1].concluidas)
    );

    const totalAlertas = slices.reduce((s, x) => s + x.value, 0);
    return {
      slices,
      tipos,
      porUrg,
      ejecutores,
      totalP: P.length,
      totalH: H.length,
      totalAlertas,
      enProgreso: estadoCuenta.get("EN_PROGRESO") ?? 0,
      turno: estadoCuenta.get("TURNO_CONFIRMADO") ?? 0,
      concluidas: estadoCuenta.get("CONCLUIDA") ?? 0,
      anuladas: estadoCuenta.get("ANULADA") ?? 0,
      maxTipo: Math.max(1, ...tipos.map(([, v]) => v)),
      maxEjec: Math.max(1, ...ejecutores.map(([, v]) => v.activas)),
      opciones: ["all", ...new Set([...pend, ...hist].map(ejecutorDe))],
    };
  }, [pend, hist, filtro]);

  return (
    <div className="space-y-4">
      {/* El filtro no esconde nada por rol: los tres ven el mismo estado
          general; esto solo lo mira «desde» un empleado. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] font-semibold text-text-2" htmlFor="stats-empleado">
          Empleado:
        </label>
        <select
          id="stats-empleado"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-8 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
        >
          {(datos?.opciones ?? ["all"]).map((o) => (
            <option key={o} value={o}>
              {o === "all" ? "Todos" : o}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} strokeWidth={1.8} />
          Actualizar
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </p>
      )}

      {!datos ? (
        <p className="py-10 text-center text-[12.5px] text-text-3">
          {cargando ? "Cargando estado general…" : "Sin datos."}
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "Activas", value: datos.totalP, strong: true },
              { label: "En progreso", value: datos.enProgreso, strong: false },
              { label: "Turno confirmado", value: datos.turno, strong: false },
              { label: "Concluidas", value: datos.concluidas, strong: true },
              { label: "Anuladas", value: datos.anuladas, strong: false },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border bg-card px-3 py-2.5">
                <p className={cn("text-xl font-bold tabular-nums", !k.strong && "text-text-2")}>
                  {k.value}
                </p>
                <p className="text-[11.5px] text-text-3">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Estado general: anillo + leyenda */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Distribución por estado</h3>
            <div className="mt-3 flex flex-wrap items-center gap-6">
              <div
                className="relative h-36 w-36 shrink-0 rounded-full"
                style={{ background: conicGradient(datos.slices) }}
                aria-label="Distribución por estado"
              >
                <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-card">
                  <span className="text-lg font-bold tabular-nums">{datos.totalAlertas}</span>
                  <span className="text-[10.5px] text-text-3">alertas</span>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5">
                {datos.slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-[12.5px]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: s.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-text-2">{s.label}</span>
                    <span className="font-semibold tabular-nums">{s.value}</span>
                    <span className="w-11 text-right tabular-nums text-text-3">
                      {Math.round((s.value / Math.max(1, datos.totalAlertas)) * 100)}%
                    </span>
                  </li>
                ))}
                {datos.slices.length === 0 && (
                  <li className="text-[12.5px] text-text-3">Sin alertas.</li>
                )}
              </ul>
            </div>
          </section>

          {/* Activas por tipo */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Activas por tipo</h3>
            <div className="mt-3 space-y-1.5">
              {datos.tipos.map(([tipo, n]) => (
                <div key={tipo} className="flex items-center gap-2">
                  <span className="w-44 truncate text-[12px] text-text-2" title={tipo}>
                    {tipo}
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(n / datos.maxTipo) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                    {n}
                  </span>
                </div>
              ))}
              {datos.tipos.length === 0 && (
                <p className="text-[12.5px] text-text-3">Sin alertas activas.</p>
              )}
            </div>
          </section>

          {/* Activas por urgencia */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Activas por urgencia</h3>
            <div className="mt-3 space-y-1.5">
              {[3, 2, 1, 0].map((nivel) => {
                const n = datos.porUrg.get(nivel) ?? 0;
                const max = Math.max(
                  1,
                  ...[3, 2, 1, 0].map((x) => datos.porUrg.get(x) ?? 0)
                );
                return (
                  <div key={nivel} className="flex items-center gap-2">
                    <span className="w-24 text-[12px] text-text-2">
                      {URGENCIA_LABEL[nivel]}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(n / max) * 100}%`,
                          background: URGENCIA_COLOR[nivel],
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-[12px] font-semibold tabular-nums">
                      {n}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Por ejecutor */}
          <section className="rounded-lg border bg-card p-4">
            <h3 className="text-[13px] font-bold">Por ejecutor</h3>
            <p className="mt-0.5 text-[11.5px] text-text-3">
              Activas en barra; concluidas al costado.
            </p>
            <div className="mt-3 space-y-1.5">
              {datos.ejecutores.slice(0, 10).map(([name, v]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="w-36 truncate text-[12px] text-text-2" title={name}>
                    {name}
                  </span>
                  <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-subtle">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(v.activas / datos.maxEjec) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 text-right text-[11.5px] tabular-nums text-text-2">
                    <span className="font-semibold">{v.activas}</span> act ·{" "}
                    {v.concluidas} conc
                  </span>
                </div>
              ))}
              {datos.ejecutores.length === 0 && (
                <p className="text-[12.5px] text-text-3">Sin datos de ejecutores.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
