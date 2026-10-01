import { describe, expect, it } from "vitest";
import { summarizeUsage } from "@/server/ai/usage";
import { lookupUnitCost } from "@/lib/ai/pricing";

type Row = Parameters<typeof summarizeUsage>[0][number];

function row(partial: Partial<Row>): Row {
  return {
    id: "u-test",
    organizationId: "org-test",
    connectionId: "c1",
    provider: "deepseek",
    model: "deepseek-chat",
    source: "agente",
    via: "org",
    tokensIn: 0,
    tokensOut: 0,
    createdAt: new Date("2026-09-30T12:00:00Z"),
    ...partial,
  } as Row;
}

/** 046 — Gestor de consumos: totales + cortes por modelo, módulo y día. */
describe("046 — resumen de consumos de tokens", () => {
  const rows: Row[] = [
    row({
      tokensIn: 1000,
      tokensOut: 500,
      createdAt: new Date("2026-09-29T10:00:00Z"),
    }),
    row({
      provider: "openai",
      model: "gpt-4o-mini",
      source: "paneles-clientes",
      tokensIn: 2000,
      tokensOut: 1000,
    }),
    row({
      provider: "custom",
      model: "modelo-raro",
      source: "agente",
      tokensIn: 10,
      tokensOut: 20,
    }),
  ];

  const summary = summarizeUsage(rows, (r) => lookupUnitCost(r.model), 30);

  it("totales: llamadas, tokens y costo estimado con el precio vigente", () => {
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.tokensIn).toBe(3010);
    expect(summary.totals.tokensOut).toBe(1520);
    // deepseek-chat: 1000*0.27/1M + 500*1.1/1M = 0.00082
    // gpt-4o-mini:   2000*0.15/1M + 1000*0.6/1M = 0.0009
    expect(summary.totals.costUsd).toBeCloseTo(0.00172, 8);
  });

  it("por modelo: buckets separados y sin precio → costo null (tokens igual contados)", () => {
    expect(summary.byModel).toHaveLength(3);
    const deepseek = summary.byModel.find((m) => m.model === "deepseek-chat");
    expect(deepseek?.calls).toBe(1);
    expect(deepseek?.unit).toEqual({ in: 0.27, out: 1.1 });
    const raro = summary.byModel.find((m) => m.model === "modelo-raro");
    expect(raro?.costUsd).toBeNull();
    expect(raro?.tokensIn).toBe(10);
    expect(raro?.tokensOut).toBe(20);
  });

  it("por módulo y por día", () => {
    const porModulo = Object.fromEntries(
      summary.bySource.map((s) => [s.source, s.tokensIn])
    );
    expect(porModulo["agente"]).toBe(1010);
    expect(porModulo["paneles-clientes"]).toBe(2000);
    expect(summary.byDay).toHaveLength(2);
  });
});
