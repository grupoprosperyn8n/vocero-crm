/**
 * 033 — Tests unitarios de la agregación del flujo de siniestros
 * (`@/lib/reviews-stats`, pura: sin DB).
 */
import { describe, expect, it } from "vitest";
import {
  aggregateReviewStats,
  dayKeyAR,
  MAX_DIAS_GRAFICO,
  type ReviewStatRow,
} from "@/lib/reviews-stats";
import type { ChatReviewShareDto } from "@/lib/types";

const NOW = new Date("2026-09-16T12:00:00.000Z"); // 09:00 en Argentina
const DAY = 86_400_000;

function mkRow(over: {
  status: string;
  estado?: string;
  via?: string | null;
  createdOffsetDays: number;
  decidedOffsetDays?: number | null;
  decididoPor?: string | null;
}): ReviewStatRow {
  const createdAt = new Date(NOW.getTime() + over.createdOffsetDays * DAY);
  const decidedAt =
    over.decidedOffsetDays === null || over.decidedOffsetDays === undefined
      ? null
      : new Date(NOW.getTime() + over.decidedOffsetDays * DAY);
  return {
    status: over.status,
    decidedVia: over.via ?? null,
    decidedAt,
    createdAt,
    payload: {
      estado: over.estado,
      decididoPor: over.decididoPor ?? undefined,
    } as ChatReviewShareDto,
  };
}

describe("flujo de siniestros — agregación de estadísticas", () => {
  it("dayKeyAR usa hora argentina (UTC-3)", () => {
    expect(dayKeyAR(new Date("2026-09-16T02:00:00.000Z"))).toBe("2026-09-15");
    expect(dayKeyAR(new Date("2026-09-16T12:00:00.000Z"))).toBe("2026-09-16");
  });

  it("cuenta por estado actual, filtra la ventana y calcula KPIs", () => {
    const rows: ReviewStatRow[] = [
      mkRow({ status: "aprobado", estado: "enviado", via: "chat", createdOffsetDays: -1, decidedOffsetDays: -1 + 600 / 86400, decididoPor: "Diego López" }),
      mkRow({ status: "aprobado", estado: "trabado", via: "telegram", createdOffsetDays: -2, decidedOffsetDays: -2 + 6 / 86400 }),
      mkRow({ status: "pendiente", estado: "pendiente", createdOffsetDays: -3 }),
      // Fuera de la ventana de 30 días: no entra en totales ni en el gráfico…
      mkRow({ status: "pendiente", estado: "pendiente", createdOffsetDays: -40 }),
    ];
    const s = aggregateReviewStats(rows, { dias: 30, now: NOW });

    expect(s.total).toBe(3);
    // …pero sí en «pendientes ahora» (global).
    expect(s.pendientesAhora).toBe(2);
    const byEstado = (e: string) => s.porEstado.find((x) => x.estado === e)!.value;
    expect(byEstado("enviado")).toBe(1);
    expect(byEstado("trabado")).toBe(1);
    expect(byEstado("pendiente")).toBe(1);
    expect(byEstado("aprobado")).toBe(0);
    expect(byEstado("detenido")).toBe(0);
    expect(s.aprobacionPct).toBe(100); // las 2 decididas fueron aprobadas
    expect(s.tiempoMedioDecisionSeg).toBe(303); // (600 + 6) / 2
  });

  it("aprobación con detenidas y tiempo nulo sin decisiones", () => {
    const rows: ReviewStatRow[] = [
      mkRow({ status: "aprobado", estado: "enviado", via: "chat", createdOffsetDays: -1, decidedOffsetDays: -1 + 60 / 86400 }),
      mkRow({ status: "detenido", estado: "detenido", via: "chat", createdOffsetDays: -1, decidedOffsetDays: -1 + 120 / 86400 }),
    ];
    const s = aggregateReviewStats(rows, { dias: 30, now: NOW });
    expect(s.aprobacionPct).toBe(50);
    expect(s.tiempoMedioDecisionSeg).toBe(90);
    expect(aggregateReviewStats([], { dias: 30, now: NOW }).aprobacionPct).toBeNull();
    expect(aggregateReviewStats([], { dias: 30, now: NOW }).tiempoMedioDecisionSeg).toBeNull();
  });

  it("decisores: nombres del chat + bucket Telegram, ordenados y tope 8", () => {
    const rows: ReviewStatRow[] = [
      ...Array.from({ length: 3 }, () =>
        mkRow({ status: "aprobado", estado: "enviado", via: "chat", createdOffsetDays: -1, decidedOffsetDays: -1 + 10 / 86400, decididoPor: "Diego López" })
      ),
      ...Array.from({ length: 2 }, () =>
        mkRow({ status: "detenido", estado: "detenido", via: "telegram", createdOffsetDays: -2, decidedOffsetDays: -2 + 10 / 86400 })
      ),
      ...Array.from({ length: 9 }, (_, i) =>
        mkRow({ status: "aprobado", estado: "enviado", via: "chat", createdOffsetDays: -3, decidedOffsetDays: -3 + 10 / 86400, decididoPor: `Empleado ${i}` })
      ),
    ];
    const s = aggregateReviewStats(rows, { dias: 30, now: NOW });
    expect(s.decisores).toHaveLength(8);
    expect(s.decisores[0]).toEqual({ nombre: "Diego López", value: 3 });
    const tg = s.decisores.find((d) => d.nombre === "Telegram (grupo SGSA)");
    expect(tg?.value).toBe(2);
    const porVia = (v: string) => s.porVia.find((x) => x.via === v)!.value;
    expect(porVia("chat")).toBe(12);
    expect(porVia("telegram")).toBe(2);
  });

  it("porDia: llena días vacíos y apila por estado actual", () => {
    const rows: ReviewStatRow[] = [
      mkRow({ status: "aprobado", estado: "enviado", createdOffsetDays: 0 }),
      mkRow({ status: "pendiente", estado: "pendiente", createdOffsetDays: 0 }),
      mkRow({ status: "aprobado", estado: "trabado", createdOffsetDays: -2 }),
    ];
    const s = aggregateReviewStats(rows, { dias: 3, now: NOW });
    expect(s.porDia.map((d) => d.fecha)).toEqual([
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
    const d13 = s.porDia[0]!;
    expect(d13.total).toBe(0);
    const d14 = s.porDia[1]!;
    expect(d14.total).toBe(1);
    expect(d14.porEstado.trabado).toBe(1);
    const d15 = s.porDia[2]!;
    expect(d15.total).toBe(0);
    const d16 = s.porDia[3]!;
    expect(d16.total).toBe(2);
    expect(d16.porEstado.enviado).toBe(1);
    expect(d16.porEstado.pendiente).toBe(1);
  });

  it("período «todo» (dias=0) acota el gráfico al tope y muestra un día mínimo", () => {
    const s = aggregateReviewStats([], { dias: 0, now: NOW });
    expect(s.total).toBe(0);
    expect(s.porDia).toHaveLength(1); // solo hoy
    const viejo = aggregateReviewStats(
      [mkRow({ status: "aprobado", estado: "enviado", createdOffsetDays: -400 })],
      { dias: 0, now: NOW }
    );
    expect(viejo.total).toBe(1); // el KPI lo cuenta…
    expect(viejo.porDia).toHaveLength(MAX_DIAS_GRAFICO + 1); // …pero el gráfico se acota
  });
});
