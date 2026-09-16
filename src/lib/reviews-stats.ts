/**
 * 033 — Agregación PURA de las estadísticas del flujo de siniestros
 * (revisión de envío SGSA). Sin imports de servidor: la usa el server
 * (`reviewFlowStats`) y los tests la ejercitan sin base de datos.
 *
 * Una fila de `review_request` = un ciclo de revisión. El estado «actual» es
 * `payload.estado` (pendiente → aprobado/detenido → enviado/trabado) y la
 * decisión vive en `status` + `decidedVia` + `decidedAt` + `payload.decididoPor`.
 */

import { REVIEW_ESTADOS, isReviewEstado, type ReviewEstado } from "@/lib/reviews";
import type { ChatReviewShareDto } from "@/lib/types";

export type ReviewStatRow = {
  status: string;
  decidedVia: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  payload: ChatReviewShareDto | null;
};

export type ReviewFlowStats = {
  total: number;
  pendientesAhora: number;
  aprobacionPct: number | null;
  tiempoMedioDecisionSeg: number | null;
  porEstado: { estado: ReviewEstado; value: number }[];
  porVia: { via: "chat" | "telegram"; value: number }[];
  decisores: { nombre: string; value: number }[];
  porDia: { fecha: string; total: number; porEstado: Record<ReviewEstado, number> }[];
};

const TZ_AR = "America/Argentina/Buenos_Aires";
const DAY_MS = 86_400_000;
/** Tope de columnas del gráfico por día (aunque el período pedido sea mayor). */
export const MAX_DIAS_GRAFICO = 60;

/** Clave YYYY-MM-DD en hora argentina (el CRM opera en AR). */
export function dayKeyAR(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function emptyCounts(): Record<ReviewEstado, number> {
  return { pendiente: 0, aprobado: 0, detenido: 0, enviado: 0, trabado: 0 };
}

/** Estado «actual» de la revisión: el hito del payload, o el status de la fila. */
export function estadoOf(row: ReviewStatRow): ReviewEstado {
  const p = row.payload?.estado;
  if (isReviewEstado(p)) return p;
  if (row.status === "aprobado" || row.status === "detenido") return row.status;
  return "pendiente";
}

export function aggregateReviewStats(
  rows: ReviewStatRow[],
  opts: { dias: number; now: Date }
): ReviewFlowStats {
  const { dias, now } = opts;
  const startMs = dias > 0 ? now.getTime() - dias * DAY_MS : Number.NEGATIVE_INFINITY;
  const inWindow = rows.filter((r) => r.createdAt.getTime() >= startMs);

  const porEstado = REVIEW_ESTADOS.map((estado) => ({
    estado,
    value: inWindow.filter((r) => estadoOf(r) === estado).length,
  }));

  const pendientesAhora = rows.filter((r) => r.status === "pendiente").length;

  const decided = inWindow.filter(
    (r) => r.status === "aprobado" || r.status === "detenido"
  );
  const aprobadas = decided.filter((r) => r.status === "aprobado").length;
  const aprobacionPct = decided.length
    ? Math.round((aprobadas / decided.length) * 100)
    : null;

  const tiempos = inWindow
    .filter((r) => r.decidedAt && r.decidedAt.getTime() >= r.createdAt.getTime())
    .map((r) => (r.decidedAt!.getTime() - r.createdAt.getTime()) / 1000);
  const tiempoMedioDecisionSeg = tiempos.length
    ? Math.round(tiempos.reduce((s, x) => s + x, 0) / tiempos.length)
    : null;

  const porVia = (["chat", "telegram"] as const).map((via) => ({
    via,
    value: inWindow.filter((r) => r.decidedVia === via).length,
  }));

  const decisoresMap = new Map<string, number>();
  for (const r of inWindow) {
    const nombre =
      (r.payload?.decididoPor && r.payload.decididoPor.trim()) ||
      (r.decidedVia === "telegram" ? "Telegram (grupo SGSA)" : null);
    if (!nombre) continue;
    decisoresMap.set(nombre, (decisoresMap.get(nombre) ?? 0) + 1);
  }
  const decisores = [...decisoresMap.entries()]
    .map(([nombre, value]) => ({ nombre, value }))
    .sort((a, b) => b.value - a.value || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 8);

  // Serie por día: ventana pedida (tope MAX_DIAS_GRAFICO), con días vacíos en
  // cero para que el gráfico no salte.
  const firstMs = inWindow.length
    ? Math.min(...inWindow.map((r) => r.createdAt.getTime()))
    : now.getTime();
  const capMs = now.getTime() - MAX_DIAS_GRAFICO * DAY_MS;
  const graphStartMs = Math.max(
    dias > 0 ? Math.max(startMs, capMs) : Math.max(firstMs, capMs),
    0
  );
  const firstKey = dayKeyAR(new Date(graphStartMs));
  const todayKey = dayKeyAR(now);
  const dayMap = new Map<string, { total: number; porEstado: Record<ReviewEstado, number> }>();
  // Anclamos a mediodía UTC para que el paso por día no cruce bordes de TZ.
  const startT = Date.parse(`${firstKey}T12:00:00Z`);
  const endT = Date.parse(`${todayKey}T12:00:00Z`);
  for (let t = startT; t <= endT; t += DAY_MS) {
    dayMap.set(dayKeyAR(new Date(t)), { total: 0, porEstado: emptyCounts() });
  }
  for (const r of inWindow) {
    const key = dayKeyAR(r.createdAt);
    const cell = dayMap.get(key);
    if (!cell) continue; // fuera del tope del gráfico
    cell.total += 1;
    cell.porEstado[estadoOf(r)] += 1;
  }
  const porDia = [...dayMap.entries()].map(([fecha, c]) => ({ fecha, ...c }));

  return {
    total: inWindow.length,
    pendientesAhora,
    aprobacionPct,
    tiempoMedioDecisionSeg,
    porEstado,
    porVia,
    decisores,
    porDia,
  };
}
