import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 037b — Integración REAL del pedido de tarea contra la copia local de
 * producción (INTEGRATION_DATABASE_URL). Verifica el circuito completo:
 *   - el gerente manda el pedido y viaja como tarjeta del chat (kind task);
 *   - SOLO la persona destinataria puede responderlo;
 *   - al ACEPTAR, la tarea se crea sola en SU tablero (dueño = él, Pendientes,
 *     con vencimiento/nota/prioridad y el pedido como origen);
 *   - al RECHAZAR, queda el motivo y NO se crea ninguna tarea;
 *   - un pedido ya respondido no se puede responder de nuevo.
 *
 * Datos sintéticos e2e037b_* creados y borrados en la misma corrida.
 */
/**
 * La app está pensada con el proceso en UTC (así corre el contenedor de
 * producción): el driver escribe el reloj UTC y lo vuelve a leer en la zona
 * del proceso, así que con TZ local (ART) el vencimiento se correría +3 h.
 * Fijamos UTC acá para que el test replique la semántica REAL de prod.
 */
process.env.TZ = "UTC";

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("037b — pedidos de tarea (aceptar suma al tablero / rechazar con motivo)", () => {
  let sql: import("postgres").Sql;
  let chat: typeof import("@/server/internal/chat");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e037b_${tag}`;
  const mgrId = `${P}_mgr`;
  const empId = `${P}_emp`;
  const emp2Id = `${P}_emp2`;
  let orgId = "";
  let roomId = "";

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

    chat = await import("@/server/internal/chat");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;

    for (const [u, name, role] of [
      [mgrId, `E2E Gerente ${tag}`, "manager"],
      [empId, `E2E Empleado ${tag}`, "member"],
      [emp2Id, `E2E Otro ${tag}`, "member"],
    ] as [string, string, string][]) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${`${u}@e2e.test`}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, ${role})`;
    }

    const room = await chat.createDmRoom(orgId, mgrId, empId);
    roomId = room.id;
  });

  afterAll(async () => {
    await sql`DELETE FROM chat_message WHERE room_id = ${roomId}`;
    await sql`DELETE FROM chat_room_member WHERE room_id = ${roomId}`;
    await sql`DELETE FROM chat_room WHERE id = ${roomId}`;
    await sql`DELETE FROM lead_stage_event WHERE lead_id IN (
      SELECT id FROM lead WHERE owner_user_id IN ${sql([mgrId, empId, emp2Id])})`;
    await sql`DELETE FROM lead WHERE owner_user_id IN ${sql([mgrId, empId, emp2Id])}`;
    await sql`DELETE FROM member WHERE user_id IN ${sql([mgrId, empId, emp2Id])}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql([mgrId, empId, emp2Id])}`;
    await sql.end();
  });

  async function pedido(title: string) {
    return chat.postChatMessage({
      organizationId: orgId,
      roomId,
      senderId: mgrId,
      body: "",
      task: {
        title,
        notes: "nota del pedido",
        dueAt: "2026-09-18T11:30:00.000Z",
        priority: "alta",
        assigneeId: empId,
        assigneeName: `E2E Empleado ${tag}`,
      },
    });
  }

  let aceptadoId = "";

  it("el pedido viaja como tarjeta del chat, pendiente y con destinatario", async () => {
    const m = await pedido(`E2E Pedido ${tag}`);
    aceptadoId = m.id;
    expect(m.kind).toBe("task");
    expect(m.body).toContain("Pedido de tarea");
    const pl = chat.sanitizeTaskShare(m.payload);
    expect(pl?.status).toBe("pending");
    expect(pl?.assigneeId).toBe(empId);
    expect(pl?.dueAt).toBe("2026-09-18T11:30:00.000Z");
    expect(pl?.priority).toBe("alta");
    expect(pl?.taskId).toBeNull();
  });

  it("otro empleado NO puede responderlo (403)", async () => {
    await expect(
      chat.respondTaskRequest({
        organizationId: orgId,
        messageId: aceptadoId,
        userId: emp2Id,
        decision: "accept",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("al ACEPTAR se crea sola la tarea en su tablero, con origen y estado", async () => {
    const ok = await chat.respondTaskRequest({
      organizationId: orgId,
      messageId: aceptadoId,
      userId: empId,
      decision: "accept",
    });
    const pl = chat.sanitizeTaskShare(ok.payload);
    expect(pl?.status).toBe("accepted");
    expect(pl?.taskId).toBeTruthy();
    expect(ok.body).toContain("aceptó la tarea");

    const rows = await sql<{
      board: string;
      owner_user_id: string;
      label: string;
      notes: string | null;
      priority: string | null;
      due_at: Date | null;
      stage_kind: string;
      origin_ref: string | null;
      source_kind: string;
    }[]>`
      SELECT l.board, l.owner_user_id, l.label, l.notes, l.priority, l.due_at,
             s.kind AS stage_kind, l.meta->>'originRef' AS origin_ref,
             l.source_kind
      FROM lead l
      LEFT JOIN pipeline_stage s ON s.id = l.stage_id
      WHERE l.id = ${pl!.taskId!}`;
    const t = rows[0]!;
    expect(t.board).toBe("tareas");
    expect(t.owner_user_id).toBe(empId);
    expect(t.label).toBe(`E2E Pedido ${tag}`);
    expect(t.notes).toBe("nota del pedido");
    expect(t.priority).toBe("alta");
    expect(t.due_at?.toISOString()).toBe("2026-09-18T11:30:00.000Z");
    expect(t.stage_kind).toBe("open");
    expect(t.origin_ref).toBe(aceptadoId);
    expect(t.source_kind).toBe("task");
  });

  it("un pedido ya respondido no se responde de nuevo (409)", async () => {
    await expect(
      chat.respondTaskRequest({
        organizationId: orgId,
        messageId: aceptadoId,
        userId: empId,
        decision: "reject",
        reason: "tarde",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("al RECHAZAR queda el motivo y no se crea ninguna tarea", async () => {
    const m = await pedido(`E2E Pedido rechazado ${tag}`);
    const no = await chat.respondTaskRequest({
      organizationId: orgId,
      messageId: m.id,
      userId: empId,
      decision: "reject",
      reason: "Estoy de licencia",
    });
    const pl = chat.sanitizeTaskShare(no.payload);
    expect(pl?.status).toBe("rejected");
    expect(pl?.reason).toBe("Estoy de licencia");
    expect(pl?.taskId).toBeNull();
    expect(no.body).toContain("rechazó la tarea");

    const count = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM lead WHERE owner_user_id = ${empId}`;
    expect(count[0]!.n).toBe(1);
  });
});
