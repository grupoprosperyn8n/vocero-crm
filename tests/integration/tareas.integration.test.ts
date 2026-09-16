import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 037 — Integración REAL de las TAREAS contra la copia local de producción
 * (INTEGRATION_DATABASE_URL). Verifica lo que el pedido de Diego fijó:
 *   - la tarea vive en su propio tablero (board 'tareas');
 *   - un contacto puede tener VARIAS tareas (su checklist) y convivir con su
 *     tarjeta de ventas (el índice único dejó de cubrir a las tareas);
 *   - vencimiento, nota y prioridad viajan en la tarjeta;
 *   - el alcance es el del tablero (member: solo lo suyo).
 *
 * Crea datos sintéticos identificables (e2e037_*) y los BORRA en la misma
 * corrida: cero residuo.
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("037 — tareas (tablero propio, varias por contacto)", () => {
  let sql: import("postgres").Sql;
  let cards: typeof import("@/server/pipeline/cards");
  let board: typeof import("@/server/pipeline/board");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e037_${tag}`;
  const uids = { empA: `${P}_ua`, empB: `${P}_ub` };
  const cid = `${P}_c`;
  const sids = { t1: `${P}_st1`, t2: `${P}_st2`, v1: `${P}_sv1` };
  let orgId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL =
      process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";

    cards = await import("@/server/pipeline/cards");
    board = await import("@/server/pipeline/board");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;

    for (const [u, name] of [
      [uids.empA, `E2E Tareas A ${tag}`],
      [uids.empB, `E2E Tareas B ${tag}`],
    ] as [string, string][]) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${`${u}@e2e.test`}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, 'member')`;
    }

    await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
      VALUES (${cid}, ${orgId}, 'whatsapp', ${`e2e037:${cid}`}, ${`E2E Contacto Tareas ${tag}`}, 'manual', false)`;

    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.t1}, ${orgId}, ${`E2E Pendientes ${tag}`}, 93, 'open', 'tareas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.t2}, ${orgId}, ${`E2E Terminadas ${tag}`}, 94, 'won', 'tareas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.v1}, ${orgId}, ${`E2E Nueva ${tag}`}, 93, 'open', 'ventas')`;
  });

  afterAll(async () => {
    // Limpieza EXACTA de lo sintético de esta corrida.
    await sql`DELETE FROM lead_stage_event WHERE lead_id IN (
      SELECT id FROM lead WHERE owner_user_id IN ${sql([uids.empA, uids.empB])})`;
    await sql`DELETE FROM lead WHERE owner_user_id IN ${sql([uids.empA, uids.empB])}`;
    await sql`DELETE FROM pipeline_stage WHERE id IN ${sql([sids.t1, sids.t2, sids.v1])}`;
    await sql`DELETE FROM contact WHERE id = ${cid}`;
    await sql`DELETE FROM member WHERE user_id IN ${sql([uids.empA, uids.empB])}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql([uids.empA, uids.empB])}`;
    await sql.end();
  });

  it("una tarea nace en el tablero de tareas, con vencimiento, nota y prioridad", async () => {
    const r = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "tareas",
      sourceKind: "task",
      contactId: cid,
      label: `E2E Llamar ${tag}`,
      dueAt: new Date("2026-09-18T11:30:00.000Z"),
      notes: "Nota de la tarea",
      priority: "alta",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const b = await board.listBoardCards({
      organizationId: orgId,
      viewerUserId: uids.empA,
      viewerRole: "member",
      board: "tareas",
    });
    const card = b.cards.find((c2) => c2.id === r.id);
    expect(card?.label).toBe(`E2E Llamar ${tag}`);
    expect(card?.dueAt).not.toBeNull();
    expect(card?.dueAt?.startsWith("2026-09-18")).toBe(true);
    expect(card?.notes).toBe("Nota de la tarea");
    expect(card?.priority).toBe("alta");
    expect(card?.completedAt).toBeNull();
    expect(card?.contact?.id).toBe(cid);
  });

  it("un contacto puede tener VARIAS tareas (el checklist) y su tarjeta de ventas", async () => {
    const r2 = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "tareas",
      sourceKind: "task",
      contactId: cid,
      label: `E2E Segunda tarea ${tag}`,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.created).toBe(true); // las tareas NO son idempotentes

    // ...y la tarjeta de ventas del MISMO contacto sigue naciendo aparte.
    const v = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "ventas",
      sourceKind: "contact",
      contactId: cid,
    });
    expect(v.ok).toBe(true);

    const rows = await sql`
      SELECT board FROM lead WHERE owner_user_id = ${uids.empA} AND contact_id = ${cid}
      ORDER BY board`;
    expect(rows.map((r3) => r3.board)).toEqual(["tareas", "tareas", "ventas"]);
  });

  it("el alcance es el del tablero: un member no ve las tareas del otro", async () => {
    const rB = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empB,
      board: "tareas",
      sourceKind: "task",
      label: `E2E Tarea de B ${tag}`,
    });
    expect(rB.ok).toBe(true);
    if (!rB.ok) return;

    const b = await board.listBoardCards({
      organizationId: orgId,
      viewerUserId: uids.empA,
      viewerRole: "member",
      board: "tareas",
    });
    expect(b.cards.some((c2) => c2.id === rB.id)).toBe(false);
    expect(b.cards.every((c2) => c2.ownerUserId === uids.empA)).toBe(true);
  });
});
