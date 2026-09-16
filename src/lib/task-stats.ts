/**
 * 037c — Agregación PURA de las métricas del tablero de TAREAS. Sin imports
 * de servidor: la usa `taskBoardStats` (server) y los tests la ejercitan sin
 * base de datos.
 *
 * Definiciones (plan 037):
 * - «creadas»: tareas con createdAt en la ventana (un pedido aceptado también
 *   nace así).
 * - «de pedidos»: creadas con originKind="task_request" (pedidos aceptados).
 * - «completadas»: completedAt dentro de la ventana.
 * - «vencidas AHORA»: sin completar, con dueAt < ahora y etapa abierta.
 * - «tiempo medio de cierre»: promedio (completedAt − createdAt) de las
 *   completadas en la ventana.
 */

import { dayKeyAR } from "@/lib/reviews-stats";

/** ownerUserId puede venir NULL (usuario borrado: la tarea queda huérfana). */
export type TaskStatRow = {
  ownerUserId: string | null;
  createdAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  /** meta.originKind === "task_request" (nació de un pedido aceptado). */
  fromRequest: boolean;
  /** kind de la etapa: open | won | lost. */
  stageKind: string;
  /** posición de la etapa (0 = primera columna abierta = Pendientes). */
  stagePosition: number;
};

/** Uso del CRM por persona en la ventana (precomputado por el server). */
export type PersonActivity = {
  userId: string;
  /** Conversaciones reales asignadas AHORA. */
  conversaciones: number;
  /** Conversaciones que CERRÓ en la ventana. */
  atendidas: number;
  /** Salientes de operador en la ventana (en sus conversaciones a cargo). */
  mensajesCrm: number;
  /** Mensajes que escribió en el chat interno en la ventana. */
  mensajesInternos: number;
};

export type TaskBoardStats = {
  total: number;
  creadas: number;
  dePedidos: number;
  completadas: number;
  vencidas: number;
  abiertasAhora: number;
  tiempoMedioCierreSeg: number | null;
  porEstado: { label: string; value: number }[];
  porDia: { fecha: string; creadas: number; completadas: number }[];
  empleados: {
    userId: string;
    name: string;
    pendientes: number;
    vencidas: number;
    completadas: number;
    conversaciones: number;
    atendidas: number;
    mensajesCrm: number;
    mensajesInternos: number;
  }[];
};

const DAY_MS = 86_400_000;
/** Tope de columnas del gráfico por día (aunque el período pedido sea mayor). */
export const TASK_MAX_DIAS_GRAFICO = 60;
export const TASK_ESTADOS = ["Pendientes", "En curso", "Vencidas", "Terminadas"] as const;
export type TaskEstado = (typeof TASK_ESTADOS)[number];

export function isTaskDone(row: TaskStatRow): boolean {
  return row.completedAt !== null || row.stageKind === "won";
}

export function isTaskOverdue(row: TaskStatRow, now: Date): boolean {
  return (
    !isTaskDone(row) &&
    row.stageKind === "open" &&
    row.dueAt !== null &&
    row.dueAt.getTime() < now.getTime()
  );
}

/** Estado «de tablero» de una tarea (el donut los muestra a todos juntos). */
export function taskEstadoOf(row: TaskStatRow, now: Date): TaskEstado {
  if (isTaskDone(row)) return "Terminadas";
  if (isTaskOverdue(row, now)) return "Vencidas";
  return row.stagePosition >= 1 ? "En curso" : "Pendientes";
}

export function aggregateTaskStats(input: {
  rows: TaskStatRow[];
  people: { userId: string; name: string }[];
  activity: PersonActivity[];
  dias: number;
  now: Date;
}): TaskBoardStats {
  const { rows, people, activity, dias, now } = input;
  const startMs = dias > 0 ? now.getTime() - dias * DAY_MS : Number.NEGATIVE_INFINITY;

  const creadas = rows.filter((r) => r.createdAt.getTime() >= startMs);
  const completadasRows = rows.filter(
    (r) => r.completedAt !== null && r.completedAt.getTime() >= startMs
  );
  const vencidas = rows.filter((r) => isTaskOverdue(r, now)).length;
  const abiertasAhora = rows.filter(
    (r) => !isTaskDone(r) && r.stageKind === "open"
  ).length;

  const tiempos = completadasRows
    .filter((r) => r.completedAt!.getTime() >= r.createdAt.getTime())
    .map((r) => (r.completedAt!.getTime() - r.createdAt.getTime()) / 1000);
  const tiempoMedioCierreSeg = tiempos.length
    ? Math.round(tiempos.reduce((s, x) => s + x, 0) / tiempos.length)
    : null;

  const porEstado = TASK_ESTADOS.map((label) => ({
    label,
    value: rows.filter((r) => taskEstadoOf(r, now) === label).length,
  }));

  // Serie por día (ventana con tope), con días vacíos en cero.
  const capMs = now.getTime() - TASK_MAX_DIAS_GRAFICO * DAY_MS;
  const graphStartMs = Math.max(dias > 0 ? startMs : Math.min(...[now.getTime(), ...rows.map((r) => r.createdAt.getTime())]), capMs, 0);
  const firstKey = dayKeyAR(new Date(graphStartMs));
  const todayKey = dayKeyAR(now);
  const dayMap = new Map<string, { creadas: number; completadas: number }>();
  const startT = Date.parse(`${firstKey}T12:00:00Z`);
  const endT = Date.parse(`${todayKey}T12:00:00Z`);
  for (let t = startT; t <= endT; t += DAY_MS) {
    dayMap.set(dayKeyAR(new Date(t)), { creadas: 0, completadas: 0 });
  }
  for (const r of creadas) {
    const cell = dayMap.get(dayKeyAR(r.createdAt));
    if (cell) cell.creadas += 1;
  }
  for (const r of completadasRows) {
    const cell = dayMap.get(dayKeyAR(r.completedAt!));
    if (cell) cell.completadas += 1;
  }
  const porDia = [...dayMap.entries()].map(([fecha, c]) => ({ fecha, ...c }));

  // Por empleado: tareas + uso del CRM, ordenado por ranking (completadas).
  const actMap = new Map(activity.map((a) => [a.userId, a]));
  const empleados = people
    .map((p) => {
      const mine = rows.filter((r) => r.ownerUserId === p.userId);
      const act = actMap.get(p.userId);
      return {
        userId: p.userId,
        name: p.name,
        pendientes: mine.filter(
          (r) => !isTaskDone(r) && r.stageKind === "open" && !isTaskOverdue(r, now)
        ).length,
        vencidas: mine.filter((r) => isTaskOverdue(r, now)).length,
        completadas: mine.filter(
          (r) => r.completedAt !== null && r.completedAt.getTime() >= startMs
        ).length,
        conversaciones: act?.conversaciones ?? 0,
        atendidas: act?.atendidas ?? 0,
        mensajesCrm: act?.mensajesCrm ?? 0,
        mensajesInternos: act?.mensajesInternos ?? 0,
      };
    })
    .filter(
      (e) =>
        e.pendientes + e.vencidas + e.completadas > 0 ||
        e.conversaciones + e.atendidas + e.mensajesCrm + e.mensajesInternos > 0
    )
    .sort(
      (a, b) =>
        b.completadas - a.completadas ||
        b.mensajesCrm - a.mensajesCrm ||
        a.name.localeCompare(b.name, "es")
    );

  return {
    total: rows.length,
    creadas: creadas.length,
    dePedidos: creadas.filter((r) => r.fromRequest).length,
    completadas: completadasRows.length,
    vencidas,
    abiertasAhora,
    tiempoMedioCierreSeg,
    porEstado,
    porDia,
    empleados,
  };
}
