import { describe, expect, it } from "vitest";
import {
  aggregateTaskStats,
  isTaskOverdue,
  taskEstadoOf,
  type PersonActivity,
  type TaskStatRow,
} from "@/lib/task-stats";

/** 037c — Agregación pura de las métricas del tablero de tareas. */

const NOW = new Date("2026-09-16T12:00:00.000Z");
const DIA = 86_400_000;

function row(over: Partial<TaskStatRow> = {}): TaskStatRow {
  return {
    ownerUserId: "u_a",
    createdAt: new Date(NOW.getTime() - 2 * DIA),
    dueAt: null,
    completedAt: null,
    fromRequest: false,
    stageKind: "open",
    stagePosition: 0,
    ...over,
  };
}

const PEOPLE = [
  { userId: "u_a", name: "Ana" },
  { userId: "u_b", name: "Beto" },
  { userId: "u_c", name: "Carla" },
];

describe("037c — estado de una tarea", () => {
  it("vencida = abierta + vencimiento pasado + sin cerrar; cerrar la salva", () => {
    const base = { dueAt: new Date(NOW.getTime() - 3600_000) };
    expect(isTaskOverdue(row(base), NOW)).toBe(true);
    expect(isTaskOverdue(row({ ...base, completedAt: NOW }), NOW)).toBe(false);
    expect(isTaskOverdue(row({ ...base, stageKind: "won" }), NOW)).toBe(false);
    expect(
      isTaskOverdue(row({ dueAt: new Date(NOW.getTime() + 3600_000) }), NOW)
    ).toBe(false);
  });

  it("estado de tablero: Pendientes (col. 0), En curso (col. 1+), Vencidas, Terminadas", () => {
    expect(taskEstadoOf(row(), NOW)).toBe("Pendientes");
    expect(taskEstadoOf(row({ stagePosition: 1 }), NOW)).toBe("En curso");
    expect(
      taskEstadoOf(row({ dueAt: new Date(NOW.getTime() - 1000) }), NOW)
    ).toBe("Vencidas");
    expect(taskEstadoOf(row({ completedAt: NOW }), NOW)).toBe("Terminadas");
  });
});

describe("037c — agregación de métricas", () => {
  const rows: TaskStatRow[] = [
    // Ana: 1 completada en ventana (cerró en 2 h), 1 vencida, 1 pendiente.
    row({
      ownerUserId: "u_a",
      createdAt: new Date(NOW.getTime() - 3 * DIA),
      completedAt: new Date(NOW.getTime() - 3 * DIA + 7200_000),
      stageKind: "won",
      fromRequest: true,
    }),
    row({
      ownerUserId: "u_a",
      createdAt: new Date(NOW.getTime() - 3 * DIA),
      dueAt: new Date(NOW.getTime() - 3600_000),
    }),
    row({ ownerUserId: "u_a", createdAt: new Date(NOW.getTime() - DIA) }),
    // Beto: 1 completada hace mucho (fuera de ventana de 7 pero dentro de 30).
    row({
      ownerUserId: "u_b",
      createdAt: new Date(NOW.getTime() - 20 * DIA),
      completedAt: new Date(NOW.getTime() - 20 * DIA + 3600_000),
      stageKind: "won",
    }),
    // Carla: 1 de pedido pendiente creada en ventana.
    row({ ownerUserId: "u_c", createdAt: new Date(NOW.getTime() - DIA), fromRequest: true }),
  ];

  const activity: PersonActivity[] = [
    {
      userId: "u_a",
      conversaciones: 4,
      atendidas: 2,
      mensajesCrm: 30,
      mensajesInternos: 10,
    },
    {
      userId: "u_b",
      conversaciones: 1,
      atendidas: 0,
      mensajesCrm: 5,
      mensajesInternos: 1,
    },
  ];

  it("KPIs de la ventana: creadas, de pedidos, completadas, vencidas y tiempo medio", () => {
    const s = aggregateTaskStats({ rows, people: PEOPLE, activity, dias: 7, now: NOW });
    expect(s.total).toBe(5);
    expect(s.creadas).toBe(4); // las 3 de Ana (≤3d) + Carla; la vieja de Beto no
    expect(s.dePedidos).toBe(2); // Ana completada + Carla
    expect(s.completadas).toBe(1); // solo la de Ana dentro de 7 días
    expect(s.vencidas).toBe(1);
    expect(s.abiertasAhora).toBe(3);
    expect(s.tiempoMedioCierreSeg).toBe(7200);
  });

  it("ventana de 30 días incluye la completada vieja de Beto y promedia distinto", () => {
    const s = aggregateTaskStats({ rows, people: PEOPLE, activity, dias: 30, now: NOW });
    expect(s.completadas).toBe(2);
    expect(s.tiempoMedioCierreSeg).toBe(
      Math.round((7200_000 + 3600_000) / 2 / 1000)
    );
  });

  it("donut por estado con el tablero completo", () => {
    const s = aggregateTaskStats({ rows, people: PEOPLE, activity, dias: 7, now: NOW });
    const get = (k: string) => s.porEstado.find((x) => x.label === k)!.value;
    expect(get("Terminadas")).toBe(2); // Ana + Beto (las de won)
    expect(get("Vencidas")).toBe(1);
    expect(get("Pendientes")).toBe(2);
    expect(get("En curso")).toBe(0);
  });

  it("por empleado: ranking por completadas y actividad del CRM pegada", () => {
    const s = aggregateTaskStats({ rows, people: PEOPLE, activity, dias: 30, now: NOW });
    expect(s.empleados[0]!.userId).toBe("u_a");
    expect(s.empleados[0]!.completadas).toBe(1);
    expect(s.empleados[0]!.pendientes).toBe(1);
    expect(s.empleados[0]!.vencidas).toBe(1);
    expect(s.empleados[0]!.conversaciones).toBe(4);
    expect(s.empleados[0]!.mensajesCrm).toBe(30);
    const beto = s.empleados.find((e) => e.userId === "u_b")!;
    expect(beto.completadas).toBe(1);
    expect(beto.conversaciones).toBe(1);
    const carla = s.empleados.find((e) => e.userId === "u_c")!;
    expect(carla.pendientes).toBe(1);
    expect(carla.mensajesCrm).toBe(0);
  });

  it("empleados sin tareas ni actividad quedan fuera de la tabla", () => {
    const s = aggregateTaskStats({
      rows: rows.filter((r) => r.ownerUserId === "u_a"),
      people: PEOPLE,
      activity: activity.filter((a) => a.userId === "u_a"),
      dias: 7,
      now: NOW,
    });
    expect(s.empleados.map((e) => e.userId)).toEqual(["u_a"]);
  });

  it("sin completadas en la ventana → tiempo medio null", () => {
    const s = aggregateTaskStats({
      rows: [row({ ownerUserId: "u_a" })],
      people: PEOPLE,
      activity: [],
      dias: 1,
      now: NOW,
    });
    expect(s.tiempoMedioCierreSeg).toBeNull();
    expect(s.completadas).toBe(0);
  });
});
