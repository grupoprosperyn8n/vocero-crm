import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 029 — Integración REAL del pipeline personal contra la copia local de
 * producción (INTEGRATION_DATABASE_URL). Verifica el pedido de Diego:
 *   - la sección tiene dos tableros: ventas (contactos del CRM o del sistema)
 *     y gestiones (alertas y cosas para gestionar);
 *   - el pipeline es PERSONAL: un miembro ve solo sus tarjetas; gerente /
 *     administrador / propietario ven TODAS y filtran por empleado;
 *   - dos usuarios pueden seguir al MISMO contacto sin pisarse;
 *   - agregar es idempotente: repetir devuelve la tarjeta, no duplica;
 *   - nada se autocarga: las tarjetas solo nacen de createPipelineCard().
 *
 * Crea datos sintéticos identificables (e2e029_*) y los BORRA en la misma
 * corrida: cero residuo.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/pipeline-personal.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("029 — pipeline personal (dos tableros, sin autocarga)", () => {
  let sql: import("postgres").Sql;
  let cards: typeof import("@/server/pipeline/cards");
  let board: typeof import("@/server/pipeline/board");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e029_${tag}`;
  const uids = { empA: `${P}_ua`, empB: `${P}_ub`, mgr: `${P}_um` };
  const cids = { a: `${P}_ca`, b: `${P}_cb` };
  const sids = { v1: `${P}_sv1`, v2: `${P}_sv2`, g1: `${P}_sg1`, g2: `${P}_sg2` };
  let orgId = "";

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar el módulo (getEnv es lazy).
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

    // Tres cuentas sintéticas: dos empleadas y un gerente.
    const staff: [string, string, string][] = [
      [uids.empA, `E2E Empleada A ${tag}`, "member"],
      [uids.empB, `E2E Empleado B ${tag}`, "member"],
      [uids.mgr, `E2E Gerente ${tag}`, "manager"],
    ];
    for (const [u, name, role] of staff) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${`${u}@e2e.test`}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, ${role})`;
    }

    // Dos contactos sintéticos del CRM.
    const contacts: [string, string][] = [
      [cids.a, `E2E Contacto A ${tag}`],
      [cids.b, `E2E Contacto B ${tag}`],
    ];
    for (const [c, name] of contacts) {
      await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
        VALUES (${c}, ${orgId}, 'whatsapp', ${`e2e029:${c}`}, ${name}, 'manual', false)`;
    }

    // Etapas de AMBOS tableros (posiciones altas: no chocan con las reales).
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.v1}, ${orgId}, ${`E2E Nueva ${tag}`}, 91, 'open', 'ventas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.v2}, ${orgId}, ${`E2E Ganada ${tag}`}, 92, 'won', 'ventas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.g1}, ${orgId}, ${`E2E En curso ${tag}`}, 91, 'open', 'gestiones')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sids.g2}, ${orgId}, ${`E2E Resuelta ${tag}`}, 92, 'won', 'gestiones')`;
  });

  afterAll(async () => {
    // Limpieza EXACTA de lo sintético de esta corrida.
    await sql`DELETE FROM lead_stage_event WHERE lead_id IN (
      SELECT id FROM lead WHERE owner_user_id IN ${sql([
        uids.empA,
        uids.empB,
        uids.mgr,
      ])})`;
    await sql`DELETE FROM lead WHERE owner_user_id IN ${sql([
      uids.empA,
      uids.empB,
      uids.mgr,
    ])}`;
    await sql`DELETE FROM pipeline_stage WHERE id IN ${sql([
      sids.v1,
      sids.v2,
      sids.g1,
      sids.g2,
    ])}`;
    await sql`DELETE FROM contact WHERE id IN ${sql([cids.a, cids.b])}`;
    await sql`DELETE FROM member WHERE user_id IN ${sql([
      uids.empA,
      uids.empB,
      uids.mgr,
    ])}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql([
      uids.empA,
      uids.empB,
      uids.mgr,
    ])}`;
    await sql.end();
  });

  const viewerA = { viewerUserId: uids.empA, viewerRole: "member" };
  const viewerB = { viewerUserId: uids.empB, viewerRole: "member" };
  const viewerM = { viewerUserId: uids.mgr, viewerRole: "manager" };

  /**
   * La primera etapa abierta del tablero (menor posición): es donde nace una
   * tarjeta nueva cuando no se pide etapa. Se calcula contra la copia (que
   * trae datos reales de prod) — no se asume una DB limpia.
   */
  async function primeraEtapaAbierta(board: "ventas" | "gestiones") {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM pipeline_stage
      WHERE organization_id = ${orgId} AND board = ${board} AND kind = 'open'
      ORDER BY position ASC, id ASC LIMIT 1`;
    return rows[0]!.id;
  }

  it("la tarjeta de un contacto nace en la primera etapa abierta del tablero", async () => {
    const r = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "ventas",
      sourceKind: "contact",
      contactId: cids.a,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(r.stageId).toBe(await primeraEtapaAbierta("ventas"));
  });

  it("agregar es idempotente: repetir devuelve la misma tarjeta sin duplicar", async () => {
    const again = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "ventas",
      sourceKind: "contact",
      contactId: cids.a,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.created).toBe(false);
    const rows = await sql`
      SELECT id FROM lead WHERE organization_id = ${orgId} AND contact_id = ${cids.a}
      AND owner_user_id = ${uids.empA}`;
    expect(rows.length).toBe(1);
  });

  it("dos usuarios siguen al MISMO contacto sin pisarse", async () => {
    const r = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empB,
      board: "ventas",
      sourceKind: "contact",
      contactId: cids.a,
    });
    expect(r.ok).toBe(true);
    const rows = await sql`
      SELECT owner_user_id FROM lead WHERE organization_id = ${orgId}
      AND contact_id = ${cids.a} ORDER BY owner_user_id`;
    expect(rows.map((r2) => r2.owner_user_id)).toEqual([uids.empA, uids.empB]);
    // ...y cada uno la ve en SU tablero.
    const bCards = await board.listBoardCards({
      organizationId: orgId,
      ...viewerB,
      board: "ventas",
    });
    expect(bCards.cards.some((c) => c.ownerUserId === uids.empB)).toBe(true);
  });

  it("una alerta entra SOLO al tablero de gestiones y sin ficha de contacto", async () => {
    const r = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empA,
      board: "gestiones",
      sourceKind: "alert",
      sgsaRef: `recE2E029${tag}000000`,
      label: `E2E Alerta ${tag}`,
      meta: { tipo: "GESTION_ESTANCADA", urgencia: "alta" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stageId).toBe(await primeraEtapaAbierta("gestiones"));

    const g = await board.listBoardCards({
      organizationId: orgId,
      ...viewerA,
      board: "gestiones",
    });
    const card = g.cards.find((c) => c.id === r.id);
    expect(card?.contact).toBeNull();
    expect(card?.label).toBe(`E2E Alerta ${tag}`);
    expect(card?.sourceKind).toBe("alert");

    // ...y NO está en ventas.
    const v = await board.listBoardCards({
      organizationId: orgId,
      ...viewerA,
      board: "ventas",
    });
    expect(v.cards.map((c) => c.id)).not.toContain(r.id);
  });

  it("miembro ve SOLO lo suyo; gerente ve todo y filtra por empleado", async () => {
    const a = await board.listBoardCards({
      organizationId: orgId,
      ...viewerA,
      board: "ventas",
    });
    expect(a.cards.every((c) => c.ownerUserId === uids.empA)).toBe(true);
    expect(a.cards.some((c) => c.ownerUserId === uids.empB)).toBe(false);

    const m = await board.listBoardCards({
      organizationId: orgId,
      ...viewerM,
      board: "ventas",
    });
    const owners = new Set(m.cards.map((c) => c.ownerUserId));
    expect(owners.has(uids.empA)).toBe(true);
    expect(owners.has(uids.empB)).toBe(true);
    // El nombre del dueño viaja para pintar la tarjeta en vista de equipo
    // (se mira solo lo sintético: la copia trae tarjetas reales sin dueño).
    const e2e = m.cards.filter(
      (c) => c.ownerUserId === uids.empA || c.ownerUserId === uids.empB
    );
    expect(e2e.length).toBeGreaterThan(0);
    expect(e2e.every((c) => typeof c.ownerName === "string" && c.ownerName.length > 0)).toBe(
      true
    );

    const onlyB = await board.listBoardCards({
      organizationId: orgId,
      ...viewerM,
      board: "ventas",
      assignee: uids.empB,
    });
    expect(onlyB.cards.every((c) => c.ownerUserId === uids.empB)).toBe(true);
    expect(onlyB.cards.length).toBeGreaterThan(0);

    const onlyMe = await board.listBoardCards({
      organizationId: orgId,
      ...viewerM,
      board: "ventas",
      assignee: "me",
    });
    expect(onlyMe.cards.length).toBe(0); // el gerente no puso nada suyo
  });

  it("borrar la tarjeta se la lleva con su bitácora (cascade)", async () => {
    const r = await cards.createPipelineCard({
      organizationId: orgId,
      ownerUserId: uids.empB,
      board: "ventas",
      sourceKind: "contact",
      contactId: cids.b,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const evBefore = await sql`
      SELECT id FROM lead_stage_event WHERE lead_id = ${r.id}`;
    expect(evBefore.length).toBeGreaterThan(0);

    await sql`DELETE FROM lead WHERE id = ${r.id}`;
    const evAfter = await sql`
      SELECT id FROM lead_stage_event WHERE lead_id = ${r.id}`;
    expect(evAfter.length).toBe(0);

    const m = await board.listBoardCards({
      organizationId: orgId,
      viewerUserId: uids.mgr,
      viewerRole: "manager",
      board: "ventas",
    });
    expect(m.cards.map((c) => c.id)).not.toContain(r.id);
  });
});
