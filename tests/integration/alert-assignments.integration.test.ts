import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 028 — Derivación de alertas: integración REAL contra la copia local de
 * producción (INTEGRATION_DATABASE_URL). Verifica el pedido de Diego:
 *   - reglas por tipo de alerta → empleado/grupo (las define owner/admin/manager);
 *   - un miembro ve SOLO lo derivado a él (directo o por su grupo);
 *   - manager/administrador/propietario ven todo y pueden limitar a «para mí»;
 *   - la derivación manual avisa UNA vez por destino nuevo (sin duplicar);
 *   - la trazabilidad queda en la DB (estado de gestión por alerta).
 *
 * Crea datos sintéticos identificables (e2e028_*) y los BORRA en la misma
 * corrida: cero residuo.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/alert-assignments.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("028 — derivación de alertas (reglas, visibilidad, trazabilidad)", () => {
  let sql: import("postgres").Sql;
  let assignments: typeof import("@/server/alerts/assignments");
  let service: typeof import("@/server/alerts/service");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e028_${tag}`;
  const uids = { empA: `${P}_ua`, empB: `${P}_ub`, mgr: `${P}_um` };
  const groupId = `${P}_g1`;
  const TIPO = "E2E_TIPO_028";
  const OTRO = "E2E_TIPO_028_OTRO";
  let orgId = "";
  let ownerId = "";

  // Alertas sintéticas con la misma forma que devuelve el backend SGSA.
  const rec = (n: number) => `recE2E028${tag}${n}`;
  function mkAlert(n: number, tipo: string) {
    return service.normalizeAlert({
      id: 95000 + n,
      airtable_record_id: rec(n),
      tipo_alerta: tipo,
      prioridad: "🟠 Media",
      titulo: `Alerta E2E ${n}`,
      cuerpo: `Cuerpo E2E ${n}`,
      detalle: `Cliente: E2E ${n}`,
      link_registro: "",
      estado: "PENDIENTE",
      leida: false,
      fecha: "2026-09-15",
      fecha_visto: null,
      cliente_nombre: `E2E ${n}`,
      empleado_que_marco_leido: null,
    });
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

    assignments = await import("@/server/alerts/assignments");
    service = await import("@/server/alerts/service");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

    const staff: [string, string, string][] = [
      [uids.empA, `E2E Empleada A ${tag}`, "member"],
      [uids.empB, `E2E Empleado B ${tag}`, "member"],
      [uids.mgr, `E2E Gerente ${tag}`, "manager"],
    ];
    for (const [u, name, role] of staff) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${u + "@e2e.test"}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, ${role})`;
    }

    // Grupo del chat interno con las tres cuentas adentro.
    await sql`INSERT INTO chat_room (id, organization_id, kind, name, created_by, created_at, updated_at)
      VALUES (${groupId}, ${orgId}, 'group', ${`Grupo E2E ${tag}`}, ${ownerId}, now(), now())`;
    for (const u of [uids.empA, uids.empB, uids.mgr]) {
      await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id)
        VALUES (${`${u}_gm`}, ${orgId}, ${groupId}, ${u})`;
    }
  });

  afterAll(async () => {
    // Mensajes y salas de la corrida (el grupo + los DMs creados), luego
    // asignaciones/reglas y por último las cuentas sintéticas.
    const myRoomRows = await sql<{ room_id: string }[]>`
      SELECT DISTINCT room_id FROM chat_room_member
      WHERE user_id IN ${sql([uids.empA, uids.empB, uids.mgr])}`;
    const myRooms = myRoomRows.map((r) => r.room_id);
    if (myRooms.length) {
      await sql`DELETE FROM chat_message WHERE room_id IN ${sql(myRooms)}`;
      await sql`DELETE FROM chat_room_member WHERE room_id IN ${sql(myRooms)}`;
      await sql`DELETE FROM chat_room WHERE id IN ${sql(myRooms)}`;
    }
    await sql`DELETE FROM alert_assignment
      WHERE organization_id = ${orgId} AND alert_type IN ${sql([TIPO, OTRO])}`;
    await sql`DELETE FROM alert_assignment_rule
      WHERE organization_id = ${orgId} AND alert_type = ${TIPO}`;
    await sql`DELETE FROM member WHERE user_id IN ${sql([uids.empA, uids.empB, uids.mgr])}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql([uids.empA, uids.empB, uids.mgr])}`;

    // Cero residuo verificable de esta corrida.
    const resid = await sql<{ a: number; r: number; m: number; u: number }[]>`
      SELECT
        (SELECT count(*)::int FROM alert_assignment
          WHERE organization_id = ${orgId} AND alert_type IN ${sql([TIPO, OTRO])}) AS a,
        (SELECT count(*)::int FROM alert_assignment_rule
          WHERE organization_id = ${orgId} AND alert_type = ${TIPO}) AS r,
        (SELECT count(*)::int FROM member
          WHERE user_id IN ${sql([uids.empA, uids.empB, uids.mgr])}) AS m,
        (SELECT count(*)::int FROM "user"
          WHERE id IN ${sql([uids.empA, uids.empB, uids.mgr])}) AS u`;
    expect(resid[0]).toEqual({ a: 0, r: 0, m: 0, u: 0 });
    await sql.end();
  });

  const mgrSession = () => ({ userId: uids.mgr, organizationId: orgId, role: "manager" });
  const empASession = () => ({ userId: uids.empA, organizationId: orgId, role: "member" });
  const empBSession = () => ({ userId: uids.empB, organizationId: orgId, role: "member" });

  const a1 = () => mkAlert(1, TIPO);
  const a2 = () => mkAlert(2, OTRO);
  const a3 = () => mkAlert(3, TIPO);
  const allAlerts = () => [a1(), a2(), a3()];

  it("reglas por tipo: guardar reemplaza, listar trae solo las activas", async () => {
    await assignments.replaceAlertRules({
      session: mgrSession(),
      alertType: TIPO,
      targets: { empleados: [uids.empA], grupos: [groupId] },
    });
    let mine = (await assignments.listAlertRules(orgId)).filter((r) => r.alertType === TIPO);
    expect(mine.map((r) => r.targetKind).sort()).toEqual(["employee", "group"]);
    expect(mine.find((r) => r.targetKind === "employee")!.targetName).toContain("Empleada A");

    // Reemplazo total del tipo: queda solo empB.
    await assignments.replaceAlertRules({
      session: mgrSession(),
      alertType: TIPO,
      targets: { empleados: [uids.empB], grupos: [] },
    });
    mine = (await assignments.listAlertRules(orgId)).filter((r) => r.alertType === TIPO);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.targetId).toBe(uids.empB);

    // Y se vuelve al estado que usan los tests siguientes.
    await assignments.replaceAlertRules({
      session: mgrSession(),
      alertType: TIPO,
      targets: { empleados: [uids.empA], grupos: [groupId] },
    });
  });

  it("visibilidad: el miembro ve lo suyo (regla directa o por grupo); el manager ve todo", async () => {
    const alerts = allAlerts();

    // EmpA: recibe el tipo por REGLA directa → ve a1 y a3; a2 no.
    const forA = await assignments.decorateAlertsForSession(empASession(), alerts, false);
    expect(forA.map((a) => a.id).sort()).toEqual([a1().id, a3().id].sort());
    expect(forA.every((a) => a.asignadaParaMi === true)).toBe(true);
    expect(forA[0]!.asignaciones?.some((x) => x.source === "rule")).toBe(true);

    // EmpB: no tiene regla directa pero SÍ el grupo → también ve a1 y a3.
    const forB = await assignments.decorateAlertsForSession(empBSession(), alerts, false);
    expect(forB.map((a) => a.id).sort()).toEqual([a1().id, a3().id].sort());
    expect(forB.every((a) => a.asignadaParaMi === true)).toBe(true);

    // Manager: ve las tres (a2 incluida, sin derivar).
    const forM = await assignments.decorateAlertsForSession(mgrSession(), alerts, false);
    expect(forM).toHaveLength(3);

    // Manager en modo «para mí»: solo donde es responsable (por su grupo).
    const forMMine = await assignments.decorateAlertsForSession(mgrSession(), alerts, true);
    expect(forMMine.map((a) => a.id).sort()).toEqual([a1().id, a3().id].sort());

    // Backfill idempotente: decorar de nuevo no duplica filas.
    const countBefore = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM alert_assignment
      WHERE organization_id = ${orgId} AND alert_ref IN ${sql([rec(1), rec(3)])}`;
    await assignments.decorateAlertsForSession(mgrSession(), allAlerts(), false);
    const countAfter = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM alert_assignment
      WHERE organization_id = ${orgId} AND alert_ref IN ${sql([rec(1), rec(3)])}`;
    expect(countAfter[0]!.n).toBe(countBefore[0]!.n);
  });

  it("asignación manual: avisa UNA vez por destino nuevo y queda trazable", async () => {
    // Alerta a2 (tipo sin regla) → se deriva a mano a empB.
    const first = await assignments.assignAlerts({
      session: mgrSession(),
      alerts: [a2()],
      targets: { empleados: [uids.empB], grupos: [] },
      source: "manual",
      note: "E2E: gestioná esta alerta",
    });
    expect(first.creadas).toBe(1);
    expect(first.compartidaCon).toEqual([`E2E Empleado B ${tag}`]);
    expect(first.errores).toEqual([]);

    const dmCount = () =>
      sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_message
        WHERE organization_id = ${orgId}
          AND room_id IN (SELECT room_id FROM chat_room_member WHERE user_id = ${uids.mgr})
          AND kind = 'alert'`;
    expect((await dmCount())[0]!.n).toBe(1);

    // Re-derivar a los mismos destinos: sin filas nuevas y sin aviso duplicado.
    const again = await assignments.assignAlerts({
      session: mgrSession(),
      alerts: [a2()],
      targets: { empleados: [uids.empB], grupos: [] },
      source: "manual",
      note: "E2E: gestioná esta alerta",
    });
    expect(again.creadas).toBe(0);
    expect(again.compartidaCon).toEqual([]);
    expect((await dmCount())[0]!.n).toBe(1);

    // EmpB ve la alerta derivada; empA no.
    const forB = await assignments.decorateAlertsForSession(empBSession(), allAlerts(), false);
    expect(forB.map((a) => a.id)).toContain(a2().id);
    const forA = await assignments.decorateAlertsForSession(empASession(), allAlerts(), false);
    expect(forA.map((a) => a.id)).not.toContain(a2().id);

    // La tarjeta del aviso lleva el snapshot de la alerta (kind=alert ya visto)
    // y la nota de gestión del que derivó.
    const msg = await sql<{ body: string; payload: { title?: string } | null }[]>`
      SELECT body, payload FROM chat_message
      WHERE organization_id = ${orgId} AND kind = 'alert'
      ORDER BY created_at DESC LIMIT 1`;
    expect(msg[0]!.body).toContain("E2E: gestioná esta alerta");
    expect(msg[0]!.payload?.title).toBe(a2().titulo);
  });

  it("gestión: el avance de la alerta actualiza el estado de sus derivaciones", async () => {
    await assignments.markAlertAssignmentsStatus({
      organizationId: orgId,
      alertStoreId: a2().id,
      airtableRecordId: a2().airtableRecordId,
      status: "EN_PROGRESO",
    });
    let rows = await sql<{ status: string }[]>`
      SELECT status FROM alert_assignment
      WHERE organization_id = ${orgId} AND alert_ref = ${rec(2)}`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "EN_PROGRESO")).toBe(true);

    // traceAssignmentStatus toca SOLO Airtable (sin PAT configurado: no-op seguro).
    await expect(
      assignments.traceAssignmentStatus({
        organizationId: orgId,
        alertStoreId: a2().id,
        status: "CONCLUIDA",
      })
    ).resolves.toBeUndefined();
    rows = await sql<{ status: string }[]>`
      SELECT status FROM alert_assignment
      WHERE organization_id = ${orgId} AND alert_ref = ${rec(2)}`;
    expect(rows.every((r) => r.status === "EN_PROGRESO")).toBe(true);
  });
});
