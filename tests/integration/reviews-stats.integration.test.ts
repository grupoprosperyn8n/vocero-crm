import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 033 — Estadísticas del flujo de siniestros (integración REAL).
 *
 * Usa una ORGANIZACIÓN DEDICADA (aislada del resto de la base) con 4 ciclos
 * de revisión sintéticos: aprobado→enviado, aprobado→trabado, pendiente viva
 * y un pendiente fuera de la ventana de 30 días. Verifica KPIs, distribución
 * por estado, vía (chat/telegram), decisores, serie por día y el tope del
 * gráfico. Todo se BORRA en la misma corrida: cero residuo.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/reviews-stats.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("033 — estadísticas del flujo de siniestros", () => {
  let sql: import("postgres").Sql;
  let stats: typeof import("@/server/reviews/stats");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2est033_${tag}`;
  const orgId = `${P}_org`;
  const uid = `${P}_u`;
  const roomId = `${P}_room`;
  const msgId = `${P}_msg`;

  async function mkRow(opts: {
    n: number;
    status: string;
    via?: string | null;
    daysAgo: number;
    decisionSeg?: number | null;
    estado: string;
    decididoPor?: string | null;
  }) {
    const id = `${P}_rr${opts.n}`;
    const recordId = `recE2EStats${tag}x${opts.n}`;
    const decidedExpr =
      opts.decisionSeg === null || opts.decisionSeg === undefined
        ? sql`null`
        : sql`(now() - make_interval(days => ${opts.daysAgo})) + make_interval(secs => ${opts.decisionSeg})`;
    await sql`INSERT INTO review_request
      (id, organization_id, record_id, cliente, room_id, message_id, status,
       decided_by, decided_at, decided_via, payload, created_at, updated_at)
      VALUES (
        ${id}, ${orgId}, ${recordId}, ${"TEST IA"}, ${roomId}, ${msgId}, ${opts.status},
        ${null}, ${decidedExpr}, ${opts.via ?? null},
        ${sql.json({ estado: opts.estado, decididoPor: opts.decididoPor ?? null })},
        now() - make_interval(days => ${opts.daysAgo}),
        now() - make_interval(days => ${opts.daysAgo})
      )`;
  }

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar los módulos (getEnv es lazy).
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";

    stats = await import("@/server/reviews/stats");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    await sql`INSERT INTO organization (id, name, slug, created_at)
      VALUES (${orgId}, ${`E2E Stats 033 ${tag}`}, ${P}, now())`;
    await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES (${uid}, ${"Usuario E2E Stats 033"}, ${uid + "@e2e.test"}, false, now(), now())`;
    await sql`INSERT INTO chat_room (id, organization_id, kind, name, created_by, created_at, updated_at)
      VALUES (${roomId}, ${orgId}, 'group', ${"Sala E2E Stats"}, ${uid}, now(), now())`;
    await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id)
      VALUES (${P + "_m"}, ${orgId}, ${roomId}, ${uid})`;
    await sql`INSERT INTO chat_message (id, organization_id, room_id, sender_id, body, kind, created_at)
      VALUES (${msgId}, ${orgId}, ${roomId}, ${uid}, ${"tarjeta E2E stats"}, 'review', now())`;

    await mkRow({ n: 1, status: "aprobado", via: "chat", daysAgo: 1, decisionSeg: 600, estado: "enviado", decididoPor: "Diego E2E" });
    await mkRow({ n: 2, status: "aprobado", via: "telegram", daysAgo: 2, decisionSeg: 6, estado: "trabado" });
    await mkRow({ n: 3, status: "pendiente", daysAgo: 3, estado: "pendiente" });
    // Fuera de la ventana de 30 días (pero viva: cuenta en pendientesAhora).
    await mkRow({ n: 4, status: "pendiente", daysAgo: 40, estado: "pendiente" });
  });

  afterAll(async () => {
    await sql`DELETE FROM review_request WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM chat_message WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM chat_room_member WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM chat_room WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM member WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM "user" WHERE id = ${uid}`;
    await sql`DELETE FROM organization WHERE id = ${orgId}`;
    const resid = await sql<{ o: number; r: number; u: number; rooms: number }[]>`
      SELECT
        (SELECT count(*)::int FROM organization WHERE id = ${orgId}) AS o,
        (SELECT count(*)::int FROM review_request WHERE organization_id = ${orgId}) AS r,
        (SELECT count(*)::int FROM "user" WHERE id = ${uid}) AS u,
        (SELECT count(*)::int FROM chat_room WHERE id = ${roomId}) AS rooms`;
    expect(resid[0]).toEqual({ o: 0, r: 0, u: 0, rooms: 0 });
    await sql.end();
  });

  it("KPIs, estados, vías y decisores de la ventana de 30 días", async () => {
    const s = await stats.reviewFlowStats(orgId, 30);

    expect(s.total).toBe(3); // sin el de 40 días
    expect(s.pendientesAhora).toBe(2); // global, incluye el viejo
    const by = (e: string) => s.porEstado.find((x) => x.estado === e)!.value;
    expect(by("enviado")).toBe(1);
    expect(by("trabado")).toBe(1);
    expect(by("pendiente")).toBe(1);
    expect(by("aprobado")).toBe(0);
    expect(by("detenido")).toBe(0);
    expect(s.aprobacionPct).toBe(100); // las 2 decididas fueron aprobadas
    expect(s.tiempoMedioDecisionSeg).toBe(303); // (600 + 6) / 2, exacto por now() único
    expect(s.porVia.find((v) => v.via === "chat")!.value).toBe(1);
    expect(s.porVia.find((v) => v.via === "telegram")!.value).toBe(1);
    expect(Object.fromEntries(s.decisores.map((d) => [d.nombre, d.value]))).toEqual({
      "Diego E2E": 1,
      "Telegram (grupo SGSA)": 1,
    });
  });

  it("serie por día: días vacíos en cero y el día de ayer con su estado", async () => {
    const s = await stats.reviewFlowStats(orgId, 30);
    expect(s.porDia.length).toBeGreaterThanOrEqual(30); // 31 días inclusivos
    const ayer = s.porDia.find((d) => d.porEstado.enviado === 1)!;
    expect(ayer.total).toBe(1);
    expect(ayer.porEstado.pendiente).toBe(0);
    const hoy = s.porDia[s.porDia.length - 1]!;
    expect(hoy.total).toBe(0);
    const vacio = s.porDia.filter((d) => d.total === 0);
    expect(vacio.length).toBeGreaterThan(20); // la mayoría de los días sin revisiones
  });

  it("período «todo» (dias=0) incluye el ciclo viejo y acota el gráfico", async () => {
    const all = await stats.reviewFlowStats(orgId, 0);
    expect(all.total).toBe(4);
    expect(all.porDia.length).toBe(41); // 40 días atrás → hoy, sin superar el tope de 60
  });

  it("tablero vacío: sin filas no inventa nada", async () => {
    const otra = `${P}_org2`;
    await sql`INSERT INTO organization (id, name, slug, created_at)
      VALUES (${otra}, ${`E2E Stats vacía ${tag}`}, ${otra}, now())`;
    const s = await stats.reviewFlowStats(otra, 30);
    expect(s.total).toBe(0);
    expect(s.pendientesAhora).toBe(0);
    expect(s.aprobacionPct).toBeNull();
    expect(s.tiempoMedioDecisionSeg).toBeNull();
    expect(s.decisores).toEqual([]);
    expect(s.porDia.every((d) => d.total === 0)).toBe(true);
    await sql`DELETE FROM organization WHERE id = ${otra}`;
  });
});
