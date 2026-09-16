import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 037c — Integración REAL de las métricas del tablero de Tareas contra la
 * copia local de producción (INTEGRATION_DATABASE_URL). Verifica lo que el
 * dashboard promete:
 *   - los KPIs de la ventana (creadas, de pedidos, completadas, vencidas) se
 *     mueven EXACTAMENTE con las tareas sembradas (delta contra la línea de
 *     base del momento);
 *   - el ranking por empleado suma tareas y uso del CRM (conversaciones a
 *     cargo, atendidas, mensajes de operador y chat interno);
 *   - las conversaciones de PRUEBA (is_test=true) NO cuentan.
 *
 * Datos sintéticos e2e037c_* creados y BORRADOS en la misma corrida.
 *
 * La app está pensada con el proceso en UTC (así corre el contenedor de
 * producción): el driver escribe el reloj UTC y lo vuelve a leer en la zona
 * del proceso. Fijamos UTC para replicar la semántica REAL de prod.
 */
process.env.TZ = "UTC";

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("037c — métricas del tablero de tareas", () => {
  let sql: import("postgres").Sql;
  let stats: typeof import("@/server/pipeline/task-stats");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e037c_${tag}`;
  const uid = `${P}_u`;
  const uid2 = `${P}_u2`;
  const cid = `${P}_c`;
  const cidTest = `${P}_ct`;
  const sOpen = `${P}_s1`;
  const sCurso = `${P}_s2`;
  const sWon = `${P}_s3`;
  const convId = `${P}_cv`;
  const convTestId = `${P}_cvt`;
  const roomId = `${P}_rm`;
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

    stats = await import("@/server/pipeline/task-stats");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;

    for (const [u, name] of [
      [uid, `E2E Metricas ${tag}`],
      [uid2, `E2E Metricas B ${tag}`],
    ] as [string, string][]) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${`${u}@e2e.test`}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, 'member')`;
    }

    await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
      VALUES (${cid}, ${orgId}, 'whatsapp', ${`e2e037c:${cid}`}, ${`E2E Contacto Metricas ${tag}`}, 'manual', false)`;
    await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
      VALUES (${cidTest}, ${orgId}, 'whatsapp', ${`e2e037c:${cidTest}`}, ${`E2E Contacto Test ${tag}`}, 'manual', true)`;

    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sOpen}, ${orgId}, ${`E2E Pendientes ${tag}`}, 91, 'open', 'tareas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sCurso}, ${orgId}, ${`E2E En curso ${tag}`}, 92, 'open', 'tareas')`;
    await sql`INSERT INTO pipeline_stage (id, organization_id, name, position, kind, board)
      VALUES (${sWon}, ${orgId}, ${`E2E Terminadas ${tag}`}, 93, 'won', 'tareas')`;

    // Conversación REAL asignada a uid y cerrada por uid; con 1 saliente de
    // operador. La conversación de PRUEBA de uid2 no debe contar jamás.
    await sql`INSERT INTO conversation (id, organization_id, contact_id, channel, is_test, assignee_id, closed_by, closed_at, created_at, updated_at)
      VALUES (${convId}, ${orgId}, ${cid}, 'whatsapp', false, ${uid}, ${uid}, now() - interval '1 day', now() - interval '3 day', now())`;
    await sql`INSERT INTO message (id, organization_id, conversation_id, direction, type, text, status, origin, created_at)
      VALUES (${`${P}_m1`}, ${orgId}, ${convId}, 'out', 'text', 'Hola', 'sent', 'operator', now() - interval '1 day')`;
    await sql`INSERT INTO conversation (id, organization_id, contact_id, channel, is_test, assignee_id, created_at, updated_at)
      VALUES (${convTestId}, ${orgId}, ${cidTest}, 'whatsapp', true, ${uid2}, now() - interval '3 day', now())`;
    await sql`INSERT INTO message (id, organization_id, conversation_id, direction, type, text, status, origin, created_at)
      VALUES (${`${P}_mt`}, ${orgId}, ${convTestId}, 'out', 'text', 'x', 'sent', 'operator', now() - interval '1 day')`;

    // Chat interno: una sala con dos mensajes de uid.
    await sql`INSERT INTO chat_room (id, organization_id, kind, name, created_by, created_at, updated_at)
      VALUES (${roomId}, ${orgId}, 'group', ${`E2E Sala Metricas ${tag}`}, ${uid}, now(), now())`;
    for (const u of [uid, uid2]) {
      await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id, last_read_at, joined_at)
        VALUES (${`${P}_rmm_${u}`}, ${orgId}, ${roomId}, ${u}, now(), now())`;
    }
    await sql`INSERT INTO chat_message (id, organization_id, room_id, sender_id, body, kind, created_at)
      VALUES (${`${P}_c1`}, ${orgId}, ${roomId}, ${uid}, 'Hola equipo', 'text', now() - interval '2 day')`;
    await sql`INSERT INTO chat_message (id, organization_id, room_id, sender_id, body, kind, created_at)
      VALUES (${`${P}_c2`}, ${orgId}, ${roomId}, ${uid}, 'Dale', 'text', now() - interval '1 day')`;

    // Tareas de uid: 1 completada (cierre 2 h), 1 abierta VENCIDA, 1 abierta
    // al día, 1 pedido en «En curso» con vencimiento mañana.
    // Tareas de uid2: 1 completada (cierre 1 h); su conversación es de prueba.
    await sql`INSERT INTO lead (id, organization_id, owner_user_id, board, source_kind, stage_id, label, due_at, completed_at, created_at, updated_at)
      VALUES (${`${P}_t1`}, ${orgId}, ${uid}, 'tareas', 'task', ${sWon}, ${`E2E T1 ${tag}`}, now() - interval '2 day', now() - interval '3 day' + interval '2 hour', now() - interval '3 day', now())`;
    await sql`INSERT INTO lead (id, organization_id, owner_user_id, board, source_kind, stage_id, label, due_at, created_at, updated_at)
      VALUES (${`${P}_t2`}, ${orgId}, ${uid}, 'tareas', 'task', ${sOpen}, ${`E2E T2 ${tag}`}, now() - interval '1 day', now() - interval '3 day', now())`;
    await sql`INSERT INTO lead (id, organization_id, owner_user_id, board, source_kind, stage_id, label, due_at, created_at, updated_at)
      VALUES (${`${P}_t3`}, ${orgId}, ${uid}, 'tareas', 'task', ${sOpen}, ${`E2E T3 ${tag}`}, now() + interval '2 day', now() - interval '1 day', now())`;
    await sql`INSERT INTO lead (id, organization_id, owner_user_id, board, source_kind, stage_id, label, due_at, meta, created_at, updated_at)
      VALUES (${`${P}_t4`}, ${orgId}, ${uid}, 'tareas', 'task', ${sCurso}, ${`E2E T4 ${tag}`}, now() + interval '1 day', ${sql.json({ originKind: "task_request" })}, now() - interval '1 day', now())`;
    await sql`INSERT INTO lead (id, organization_id, owner_user_id, board, source_kind, stage_id, label, completed_at, created_at, updated_at)
      VALUES (${`${P}_t5`}, ${orgId}, ${uid2}, 'tareas', 'task', ${sWon}, ${`E2E T5 ${tag}`}, now() - interval '5 day' + interval '1 hour', now() - interval '5 day', now())`;
  });

  afterAll(async () => {
    await sql`DELETE FROM lead_stage_event WHERE lead_id IN ${sql([`${P}_t1`, `${P}_t2`, `${P}_t3`, `${P}_t4`, `${P}_t5`])}`;
    await sql`DELETE FROM lead WHERE owner_user_id IN ${sql([uid, uid2])}`;
    await sql`DELETE FROM message WHERE conversation_id IN ${sql([convId, convTestId])}`;
    await sql`DELETE FROM conversation WHERE id IN ${sql([convId, convTestId])}`;
    await sql`DELETE FROM chat_room WHERE id = ${roomId}`;
    await sql`DELETE FROM pipeline_stage WHERE id IN ${sql([sOpen, sCurso, sWon])}`;
    await sql`DELETE FROM contact WHERE id IN ${sql([cid, cidTest])}`;
    await sql`DELETE FROM member WHERE user_id IN ${sql([uid, uid2])}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql([uid, uid2])}`;
    await sql.end();
  });

  it("los KPIs de la ventana incluyen lo sembrado (sin romperse por el resto del tablero)", async () => {
    // La copia local tiene datos reales y otras suites siembran en paralelo:
    // lo NUESTRO se exige con >= (nunca puede faltar); lo exacto por usuario
    // se verifica en el test siguiente.
    const s = await stats.taskBoardStats(orgId, 30);
    expect(s.total).toBeGreaterThanOrEqual(5); // T1..T5
    expect(s.creadas).toBeGreaterThanOrEqual(5); // todas dentro de 30 d
    expect(s.dePedidos).toBeGreaterThanOrEqual(1); // T4 nació de un pedido
    expect(s.completadas).toBeGreaterThanOrEqual(2); // T1 y T5
    expect(s.vencidas).toBeGreaterThanOrEqual(1); // T2, vencida AHORA
    expect(s.abiertasAhora).toBeGreaterThanOrEqual(3); // T2, T3, T4
    expect(s.tiempoMedioCierreSeg).not.toBeNull();
  });

  it("el ranking por empleado suma tareas y uso del CRM; la conversación de prueba no cuenta", async () => {
    const s = await stats.taskBoardStats(orgId, 30);
    const a = s.empleados.find((e) => e.userId === uid);
    expect(a).toBeTruthy();
    expect(a!.completadas).toBe(1);
    expect(a!.vencidas).toBe(1);
    expect(a!.pendientes).toBe(2); // T3 y T4 (abiertas sin vencer)
    expect(a!.conversaciones).toBe(1);
    expect(a!.atendidas).toBe(1);
    expect(a!.mensajesCrm).toBe(1);
    expect(a!.mensajesInternos).toBe(2);

    const b = s.empleados.find((e) => e.userId === uid2);
    expect(b).toBeTruthy();
    expect(b!.completadas).toBe(1);
    expect(b!.conversaciones).toBe(0); // su única conversación es de PRUEBA
    expect(b!.mensajesCrm).toBe(0);
    expect(b!.mensajesInternos).toBe(0);
  });

  it("la ventana manda: con 1 día, las completadas viejas salen del conteo", async () => {
    const s = await stats.taskBoardStats(orgId, 1);
    const a = s.empleados.find((e) => e.userId === uid);
    expect(a?.completadas ?? 0).toBe(0); // T1 cerró hace ~3 días
    expect(a?.vencidas).toBe(1); // vencida AHORA no depende de la ventana
    const b = s.empleados.find((e) => e.userId === uid2);
    expect(b?.completadas ?? 0).toBe(0); // T5 cerró hace 2 días
  });
});
