import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REVIEW_ENVIO_ALERT_TYPE } from "@/lib/reviews";

/**
 * 033 — Revisión de envío SGSA hacia el chat interno (integración REAL).
 *
 * Verifica el pedido de Diego: el flujo publica en el chat interno la MISMA
 * revisión que manda al grupo de Telegram (demo del mensaje al cliente, con
 * audio y análisis IA como adjuntos servidos aparte), se decide desde el chat
 * con los mismos dos caminos (✅/🛑) pegándole al MISMO webhook del flujo, la
 * tarjeta registra quién decidió y por dónde, y muestra en qué condición
 * quedó el envío (despachado / trabado / detenido). Todo ADITIVO: Telegram
 * no cambia.
 *
 * 033c — el flujo vive en el grupo del chat interno «Alerta de Siniestro»:
 * TODAS las tarjetas, avisos y cambios de estado caen ahí. La gestión
 * (dueño/administrador/gerente) siempre participa; los EMPLEADOS designados
 * en Reglas entran como miembros (decisión grupal, sin copias individuales) y
 * los GRUPOS elegidos en Reglas reciben además su propia copia.
 *
 * Crea datos sintéticos identificables (e2e033_*) y los BORRA en la misma
 * corrida: cero residuo (incluido el grupo del flujo, si lo creó la suite).
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/reviews.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("033 — revisión de envío SGSA (tarjeta y decisión en el chat interno)", () => {
  let sql: import("postgres").Sql;
  let service: typeof import("@/server/reviews/service");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e033_${tag}`;
  const uids = { emp: `${P}_ue`, due: `${P}_ud` };
  const groupId = `${P}_g1`;
  const ruleId = `${P}_rule`;
  let orgId = "";
  let ownerId = "";
  let systemUserId = "";
  let systemExistedBefore = false;

  // rec + EXACTAMENTE 14 alfanuméricos.
  const recReview = (n: number) => `recE2E033${tag}x${n}`;
  const mkReview = (n: number, cliente: string) => ({
    recordId: recReview(n),
    cliente,
    titulo: "SGSA | Pendiente de aprobación",
    canales: "WhatsApp + Email",
    asuntoEmail: "Resolución de su Siniestro - Vehículo",
    emailTo: "grupoprospery@gmail.com",
    whatsappTo: "+549****4300",
    reintento: false,
    mensaje: `Hola ${cliente} 👋\nLa determinación del caso es no culpable.\n\n🎧 Audio al final.`,
    estado: "pendiente",
    detalle: null,
    decididoPor: null,
    decididoEl: null,
    via: null,
  });

  /** El grupo del flujo (lo crea el servicio en el primer aviso/entrega). */
  const macroRoom = async (): Promise<string | null> => {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM chat_room
      WHERE organization_id = ${orgId} AND kind = 'group' AND name = 'Alerta de Siniestro'
      ORDER BY created_at LIMIT 1`;
    return rows[0]?.id ?? null;
  };

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
    process.env.REVIEWS_INBOUND_KEY = "e2e033-key";
    process.env.SGSA_APPROVAL_WEBHOOK_KEY = "e2e-hook-key";
    process.env.SGSA_APPROVAL_WEBHOOK_URL = "https://flow.stub";

    service = await import("@/server/reviews/service");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
    process.env.REVIEWS_ORG_ID = orgId;
    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

    // La suite asume «sin regla» al arrancar (test A: cae al grupo del flujo).
    await sql`DELETE FROM alert_assignment_rule
      WHERE organization_id = ${orgId} AND alert_type = ${REVIEW_ENVIO_ALERT_TYPE}`;

    // ¿Ya existía el usuario de sistema? (si lo crea la suite, se limpia).
    const sysRows = await sql<{ id: string }[]>`
      SELECT id FROM "user" WHERE email = 'sistema-sgsa@vocero.local' LIMIT 1`;
    systemExistedBefore = sysRows.length > 0;

    const staff: [string, string][] = [
      [uids.emp, `Empleado 033 ${tag}`],
      [uids.due, `Ajeno 033 ${tag}`],
    ];
    for (const [u, name] of staff) {
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${u + "@e2e.test"}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, 'member')`;
    }

    // Grupo del chat interno (destino de la regla en el test C).
    await sql`INSERT INTO chat_room (id, organization_id, kind, name, created_by, created_at, updated_at)
      VALUES (${groupId}, ${orgId}, 'group', ${`Grupo E2E 033 ${tag}`}, ${ownerId}, now(), now())`;
    await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id)
      VALUES (${`${uids.emp}_gm`}, ${orgId}, ${groupId}, ${uids.emp})`;
  });

  afterAll(async () => {
    // Orden: revisiones → mensajes → membresías → salas → regla → cuentas.
    const macro = await macroRoom();
    const rooms = [...new Set([groupId, ...(macro ? [macro] : [])])];
    await sql`DELETE FROM review_request
      WHERE organization_id = ${orgId} AND record_id LIKE ${"recE2E033" + tag + "%"}`;
    await sql`DELETE FROM chat_message WHERE room_id IN ${sql(rooms)}`;
    await sql`DELETE FROM chat_room_member WHERE room_id IN ${sql(rooms)}`;
    await sql`DELETE FROM chat_room WHERE id IN ${sql(rooms)}`;
    await sql`DELETE FROM alert_assignment_rule WHERE id IN ${sql([ruleId, `${ruleId}_2`])}`;
    const gone = [uids.emp, uids.due];
    await sql`DELETE FROM member WHERE user_id IN ${sql(gone)}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql(gone)}`;
    if (!systemExistedBefore && systemUserId) {
      await sql`DELETE FROM chat_room_member WHERE user_id = ${systemUserId}`;
      await sql`DELETE FROM member WHERE user_id = ${systemUserId}`;
      await sql`DELETE FROM "user" WHERE id = ${systemUserId}`;
    }

    // Cero residuo verificable de esta corrida.
    const resid = await sql<
      { r: number; m: number; u: number; rooms: number; rule: number; macro: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM review_request
          WHERE organization_id = ${orgId}
            AND record_id LIKE ${"recE2E033" + tag + "%"}) AS r,
        (SELECT count(*)::int FROM member
          WHERE user_id IN ${sql(gone)}) AS m,
        (SELECT count(*)::int FROM "user"
          WHERE id IN ${sql(gone)}) AS u,
        (SELECT count(*)::int FROM chat_room
          WHERE id IN ${sql(rooms)}) AS rooms,
        (SELECT count(*)::int FROM alert_assignment_rule
          WHERE id IN ${sql([ruleId, `${ruleId}_2`])}) AS rule,
        (SELECT count(*)::int FROM chat_room
          WHERE organization_id = ${orgId} AND kind = 'group'
            AND name = 'Alerta de Siniestro') AS macro`;
    expect(resid[0]).toEqual({ r: 0, m: 0, u: 0, rooms: 0, rule: 0, macro: 0 });
    await sql.end();
  });

  it("A — sin regla: la revisión cae al grupo «Alerta de Siniestro» (con la gestión adentro)", async () => {
    const res = await service.ingestReviewRequest({
      organizationId: orgId,
      review: mkReview(1, "TEST IA"),
    });
    expect(res.duplicate).toBe(false);

    const macro = (await macroRoom())!;
    expect(macro).toBeTruthy();
    expect(res.roomId).toBe(macro);

    const rooms = await sql<{ kind: string; name: string }[]>`
      SELECT kind, name FROM chat_room WHERE id = ${res.roomId}`;
    expect(rooms[0]!.kind).toBe("group");
    expect(rooms[0]!.name).toBe("Alerta de Siniestro");

    systemUserId = (await sql<{ id: string }[]>`
      SELECT id FROM "user" WHERE email = 'sistema-sgsa@vocero.local' LIMIT 1`)[0]!.id;
    const members = await sql<{ user_id: string }[]>`
      SELECT user_id FROM chat_room_member WHERE room_id = ${res.roomId}`;
    const memberIds = members.map((m) => m.user_id);
    expect(memberIds).toContain(ownerId); // grupo macro: la gestión siempre ve
    expect(memberIds).toContain(systemUserId); // quien firma las tarjetas

    // Una sola entrega: el propio grupo del flujo.
    const rr = await sql<{ deliveries: { roomId: string }[] | null }[]>`
      SELECT deliveries FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(1)}`;
    expect(rr[0]!.deliveries ?? []).toHaveLength(1);

    const rows = await sql<
      {
        id: string;
        status: string;
        message_id: string;
        cliente: string;
        message_kind: string;
        sender_id: string;
        payload: { mensaje: string; estado: string } | null;
        body: string;
      }[]
    >`
      SELECT rr.id, rr.status, rr.message_id, rr.cliente,
             cm.kind AS message_kind, cm.sender_id, cm.payload, cm.body
      FROM review_request rr
      JOIN chat_message cm ON cm.id = rr.message_id
      WHERE rr.organization_id = ${orgId} AND rr.record_id = ${recReview(1)}`;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.status).toBe("pendiente");
    expect(row.cliente).toBe("TEST IA");
    expect(row.message_kind).toBe("review");
    expect(row.sender_id).toBe(systemUserId);
    expect(row.body).toContain("Pendiente de aprobación");
    expect(row.payload?.estado).toBe("pendiente");
    expect(row.payload?.mensaje).toContain("no culpable");
    expect(row.payload?.mensaje.includes("\n")).toBe(true);
  });

  it("B — idempotente: reavisar el mismo registro refresca la tarjeta, no la duplica", async () => {
    const macro = (await macroRoom())!;
    const res = await service.ingestReviewRequest({
      organizationId: orgId,
      review: {
        ...mkReview(1, "TEST IA"),
        mensaje: "Hola TEST IA 👋\n\nSEGUNDA VERSIÓN del texto al cliente.",
      },
    });
    expect(res.duplicate).toBe(true);
    expect(res.roomId).toBe(macro);
    const count = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM chat_message
      WHERE room_id = ${res.roomId} AND kind = 'review'`;
    expect(count[0]!.n).toBe(1);
    const refreshed = await sql<{ payload: { mensaje: string } }[]>`
      SELECT payload FROM chat_message WHERE id = ${res.messageId}`;
    expect(refreshed[0]!.payload.mensaje).toContain("SEGUNDA VERSIÓN");
  });

  it("C — con regla de grupo: el grupo del flujo recibe su copia Y el grupo elegido también", async () => {
    await sql`INSERT INTO alert_assignment_rule
      (id, organization_id, alert_type, target_kind, target_id, target_name, active, created_by, created_at, updated_at)
      VALUES (${ruleId}, ${orgId}, ${REVIEW_ENVIO_ALERT_TYPE}, 'group', ${groupId},
              ${`Grupo E2E 033 ${tag}`}, true, ${ownerId}, now(), now())`;
    const res = await service.ingestReviewRequest({
      organizationId: orgId,
      review: mkReview(2, "CLIENTE GRUPO"),
    });
    const macro = (await macroRoom())!;
    // La casa del flujo primero; el grupo elegido recibe SU copia.
    expect(res.roomId).toBe(macro);
    const rr = await sql<{ deliveries: { roomId: string }[] | null }[]>`
      SELECT deliveries FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(2)}`;
    const rooms = (rr[0]!.deliveries ?? []).map((d) => d.roomId);
    expect(rooms).toHaveLength(2);
    expect(new Set(rooms)).toEqual(new Set([macro, groupId]));

    for (const room of [macro, groupId]) {
      const msg = await sql<{ kind: string; payload: { cliente: string } }[]>`
        SELECT kind, payload FROM chat_message
        WHERE room_id = ${room} AND kind = 'review'
          AND payload->>'cliente' = 'CLIENTE GRUPO'`;
      expect(msg).toHaveLength(1);
      expect(msg[0]!.kind).toBe("review");
      expect(msg[0]!.payload.cliente).toBe("CLIENTE GRUPO");
    }
  });

  it("D — decidir desde el chat: MISMO webhook del flujo + quién y por dónde", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await service.decideReview({
      session: { userId: uids.emp, organizationId: orgId },
      recordId: recReview(2),
      decision: "approve",
    });
    expect(res).toEqual({ status: "aprobado", via: "chat" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("https://flow.stub/webhook/sgsa-aprobacion-envio");
    expect(url).toContain("decision=approve");
    expect(url).toContain(`record_id=${recReview(2)}`);
    expect(url).toContain("k=e2e-hook-key");
    expect(url).toContain("via=chat");
    vi.unstubAllGlobals();

    const rows = await sql<
      {
        status: string;
        decided_by: string;
        decided_via: string;
        message_id: string;
      }[]
    >`
      SELECT status, decided_by, decided_via, message_id FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(2)}`;
    expect(rows[0]!.status).toBe("aprobado");
    expect(rows[0]!.decided_by).toBe(uids.emp);
    expect(rows[0]!.decided_via).toBe("chat");

    const msg = await sql<{ payload: { estado: string; decididoPor: string; via: string } }[]>`
      SELECT payload FROM chat_message WHERE id = ${rows[0]!.message_id}`;
    expect(msg[0]!.payload.estado).toBe("aprobado");
    expect(msg[0]!.payload.decididoPor).toContain("Empleado 033");
    expect(msg[0]!.payload.via).toBe("chat");

    // El aviso corto en la sala (queda en el hilo) — y también en el grupo del flujo.
    const macro = (await macroRoom())!;
    for (const room of [groupId, macro]) {
      const conf = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_message
        WHERE room_id = ${room} AND kind = 'text'
          AND body LIKE '%aprobó%' AND body LIKE ${"%Empleado 033 " + tag + "%"}`;
      expect(conf[0]!.n).toBe(1);
    }
  });

  it("E — ajeno no decide (403); flujo caído → 502 y la revisión vuelve a pendiente", async () => {
    await service.ingestReviewRequest({
      organizationId: orgId,
      review: mkReview(3, "CLIENTE TRES"),
    });
    await expect(
      service.decideReview({
        session: { userId: uids.due, organizationId: orgId },
        recordId: recReview(3),
        decision: "approve",
      })
    ).rejects.toMatchObject({ status: 403 });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 }))
    );
    await expect(
      service.decideReview({
        session: { userId: uids.emp, organizationId: orgId },
        recordId: recReview(3),
        decision: "hold",
      })
    ).rejects.toMatchObject({ status: 502 });
    vi.unstubAllGlobals();

    const rows = await sql<{ status: string }[]>`
      SELECT status FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(3)}`;
    expect(rows[0]!.status).toBe("pendiente");

    // Y una revisión ya decidida no se vuelve a disparar.
    await expect(
      service.decideReview({
        session: { userId: uids.emp, organizationId: orgId },
        recordId: recReview(2),
        decision: "hold",
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("F — condición final del envío: despachado con detalle / detenido por Telegram", async () => {
    // r2 quedó aprobado por el chat: el flujo confirma el despacho.
    const ok = await service.markReviewStatus({
      organizationId: orgId,
      recordId: recReview(2),
      update: {
        estado: "enviado",
        detalle:
          "Se enviaron resumen, dictamen IA, audio por WhatsApp y el email completo al cliente.",
        via: "flow",
      },
    });
    expect(ok.updated).toBe(true);
    const msg = await sql<
      {
        payload: {
          estado: string;
          detalle: string;
          via: string | null;
          decididoPor: string | null;
        };
        body: string;
      }[]
    >`
      SELECT payload, body FROM chat_message
      WHERE room_id = ${groupId} AND kind = 'review'
        AND payload->>'cliente' = 'CLIENTE GRUPO'`;
    expect(msg[0]!.payload.estado).toBe("enviado");
    expect(msg[0]!.payload.detalle).toContain("audio por WhatsApp");
    expect(msg[0]!.body).toContain("Envío despachado");
    // El hito del flujo NO pisa quién decidió ni por dónde: sigue «chat».
    expect(msg[0]!.payload.via).toBe("chat");
    expect(msg[0]!.payload.decididoPor).toContain("Empleado 033");

    // r3 seguía pendiente: la decisión llegó por TELEGRAM → la tarjeta lo refleja.
    const byTg = await service.markReviewStatus({
      organizationId: orgId,
      recordId: recReview(3),
      update: { estado: "detenido", via: "telegram" },
    });
    expect(byTg.updated).toBe(true);
    const r3 = await sql<{ status: string; decided_via: string }[]>`
      SELECT status, decided_via FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(3)}`;
    expect(r3[0]!.status).toBe("detenido");
    expect(r3[0]!.decided_via).toBe("telegram");
    const msgTg = await sql<{ payload: { decididoEl: string | null } }[]>`
      SELECT payload FROM chat_message
      WHERE room_id = ${groupId} AND kind = 'review'
        AND payload->>'cliente' = 'CLIENTE TRES'`;
    expect(msgTg[0]!.payload.decididoEl).toBeTruthy();

    // Un hito posterior (trabado) conserva la via de la decisión por Telegram:
    // el payload se persiste también en la FILA al decidir.
    const post = await service.markReviewStatus({
      organizationId: orgId,
      recordId: recReview(3),
      update: {
        estado: "trabado",
        detalle: "WhatsApp bloqueado por ventana de 24 horas.",
      },
    });
    expect(post.updated).toBe(true);
    const msgTg2 = await sql<{ payload: { estado: string; via: string | null } }[]>`
      SELECT payload FROM chat_message
      WHERE room_id = ${groupId} AND kind = 'review'
        AND payload->>'cliente' = 'CLIENTE TRES'`;
    expect(msgTg2[0]!.payload.estado).toBe("trabado");
    expect(msgTg2[0]!.payload.via).toBe("telegram");
  });

  it("G — avisos del monitoreo (error de envío / ya procesado): espejo fiel en el chat", async () => {
    const aviso = await service.postReviewAviso({
      organizationId: orgId,
      texto: `⚠️ SGSA | Caso enviado a ERROR DE ENVIO en la previa\nRegistro: ${recReview(4)}\nEstado actual: PENDIENTE APROBACION\nMotivo: El caso ya estaba procesado y no debía volver a entrar en la cola.`,
      recordId: recReview(4),
    });
    const macro = (await macroRoom())!;
    const msg = await sql<{ body: string; sender_id: string; room_id: string }[]>`
      SELECT body, sender_id, room_id FROM chat_message WHERE id = ${aviso.messageId}`;
    expect(msg[0]!.room_id).toBe(macro); // la casa del flujo recibe primero
    expect(msg[0]!.sender_id).toBe(systemUserId);
    expect(msg[0]!.body).toContain("ERROR DE ENVIO");
    expect(msg[0]!.body.includes("\n")).toBe(true);

    // Y el grupo elegido en Reglas también tiene su copia del aviso.
    const copy = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM chat_message
      WHERE room_id = ${groupId} AND sender_id = ${systemUserId}
        AND body LIKE '%ERROR DE ENVIO%'`;
    expect(copy[0]!.n).toBe(1);
  });

  it("C2 — regla de empleado: entra al grupo «Alerta de Siniestro» como miembro (sin copias individuales)", async () => {
    await sql`UPDATE alert_assignment_rule
      SET target_kind = 'employee', target_id = ${uids.emp}, target_name = ${`Empleado 033 ${tag}`}, updated_at = now()
      WHERE id = ${ruleId}`;
    const res = await service.ingestReviewRequest({
      organizationId: orgId,
      review: mkReview(5, "CLIENTE EMPLEADO"),
    });
    expect(res.duplicate).toBe(false);
    const macro = (await macroRoom())!;
    expect(res.roomId).toBe(macro);

    // Una sola entrega (el grupo del flujo): nada de DM individual.
    const rr = await sql<{ deliveries: { roomId: string }[] | null }[]>`
      SELECT deliveries FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(5)}`;
    expect(rr[0]!.deliveries ?? []).toHaveLength(1);
    expect((rr[0]!.deliveries ?? [])[0]!.roomId).toBe(macro);

    // El empleado designado quedó como MIEMBRO del grupo (decide ahí).
    const memb = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM chat_room_member
      WHERE room_id = ${macro} AND user_id = ${uids.emp}`;
    expect(memb[0]!.n).toBe(1);

    // Y no se abrió ninguna conversación privada sistema ↔ empleado.
    const dm = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM chat_room r
      WHERE r.organization_id = ${orgId} AND r.kind = 'dm'
        AND EXISTS (SELECT 1 FROM chat_room_member m
          WHERE m.room_id = r.id AND m.user_id = ${uids.emp})
        AND EXISTS (SELECT 1 FROM chat_room_member m2
          WHERE m2.room_id = r.id AND m2.user_id = ${systemUserId})`;
    expect(dm[0]!.n).toBe(0);

    // Restaurar la regla de grupo (los tests siguientes esperan el grupo).
    await sql`UPDATE alert_assignment_rule
      SET target_kind = 'group', target_id = ${groupId}, target_name = ${`Grupo E2E 033 ${tag}`}, updated_at = now()
      WHERE id = ${ruleId}`;
  });

  it("C3 — MULTI-destino: cada destino recibe SU copia y una decisión actualiza todas", async () => {
    // Dos reglas activas: empleado + grupo elegido. El grupo del flujo va
    // SIEMPRE, así que la revisión termina en dos salas.
    await sql`UPDATE alert_assignment_rule
      SET target_kind = 'employee', target_id = ${uids.emp}, target_name = ${`Empleado 033 ${tag}`}, updated_at = now()
      WHERE id = ${ruleId}`;
    await sql`INSERT INTO alert_assignment_rule
      (id, organization_id, alert_type, target_kind, target_id, target_name, active, created_by, created_at, updated_at)
      VALUES (${`${ruleId}_2`}, ${orgId}, ${REVIEW_ENVIO_ALERT_TYPE}, 'group', ${groupId},
              ${`Grupo E2E 033 ${tag}`}, true, ${ownerId}, now() + interval '1 second', now())`;
    // «Ajeno» participa SOLO del grupo elegido: puede decidir porque está en
    // una de las salas que recibieron la tarjeta (decisión compartida).
    await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id)
      VALUES (${`${uids.due}_gm`}, ${orgId}, ${groupId}, ${uids.due})`;

    const res = await service.ingestReviewRequest({
      organizationId: orgId,
      review: mkReview(6, "CLIENTE MULTI"),
    });
    expect(res.duplicate).toBe(false);
    const macro = (await macroRoom())!;
    expect(res.roomId).toBe(macro);

    // La fila guarda las DOS entregas (grupo del flujo + grupo elegido) y hay
    // una tarjeta en cada sala.
    const rows = await sql<{ deliveries: { roomId: string; messageId: string }[] | null }[]>`
      SELECT deliveries FROM review_request
      WHERE organization_id = ${orgId} AND record_id = ${recReview(6)}`;
    const deliveries = rows[0]!.deliveries ?? [];
    expect(deliveries).toHaveLength(2);
    expect(new Set(deliveries.map((d) => d.roomId))).toEqual(
      new Set([macro, groupId])
    );
    for (const room of [macro, groupId]) {
      const msgs = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_message
        WHERE room_id = ${room} AND kind = 'review' AND payload->>'cliente' = 'CLIENTE MULTI'`;
      expect(msgs[0]!.n).toBe(1);
    }

    // Decide quien NO está en la entrega principal: está en el grupo copia.
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const decision = await service.decideReview({
      session: { userId: uids.due, organizationId: orgId },
      recordId: recReview(6),
      decision: "approve",
    });
    expect(decision).toEqual({ status: "aprobado", via: "chat" });
    vi.unstubAllGlobals();

    // TODAS las copias quedaron actualizadas…
    for (const room of [macro, groupId]) {
      const msgs = await sql<{ payload: { estado: string; decididoPor: string } }[]>`
        SELECT payload FROM chat_message
        WHERE room_id = ${room} AND kind = 'review' AND payload->>'cliente' = 'CLIENTE MULTI'`;
      expect(msgs[0]!.payload.estado).toBe("aprobado");
      expect(msgs[0]!.payload.decididoPor).toContain("Ajeno 033");
    }
    // …y el aviso de quién decidió también llegó a las dos salas (el filtro
    // por el nombre del decisor aísla este test de avisos de otros tests).
    for (const room of [macro, groupId]) {
      const conf = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_message
        WHERE room_id = ${room} AND kind = 'text'
          AND body LIKE '%aprobó%' AND body LIKE ${"%Ajeno 033 " + tag + "%"}`;
      expect(conf[0]!.n).toBe(1);
    }
    // El primero que decide cierra para todos: el segundo intento no dispara.
    await expect(
      service.decideReview({
        session: { userId: uids.emp, organizationId: orgId },
        recordId: recReview(6),
        decision: "hold",
      })
    ).rejects.toMatchObject({ status: 409 });

    // Los AVISOS del flujo también respetan el multi-destino (espejo fiel en
    // cada sala configurada; la casa del flujo queda como entrega principal).
    const aviso = await service.postReviewAviso({
      organizationId: orgId,
      texto: `🚨 SGSA | Prueba multi-destino — Registro ${recReview(6)}`,
      recordId: recReview(6),
    });
    const avisoRoom = await sql<{ room_id: string }[]>`
      SELECT room_id FROM chat_message WHERE id = ${aviso.messageId}`;
    expect(avisoRoom[0]!.room_id).toBe(macro);
    for (const room of [macro, groupId]) {
      const n = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM chat_message
        WHERE room_id = ${room} AND sender_id = ${systemUserId}
          AND body LIKE ${"%Prueba multi-destino%"} AND body LIKE ${"%recE2E033" + tag + "%"}`;
      expect(n[0]!.n).toBe(1);
    }

    // Restaurar: queda solo la regla del grupo (como estaba antes de C3).
    await sql`DELETE FROM alert_assignment_rule WHERE id = ${`${ruleId}_2`}`;
  });

  it("H — registro desconocido: el estado del flujo no inventa filas", async () => {
    const res = await service.markReviewStatus({
      organizationId: orgId,
      recordId: recReview(9),
      update: { estado: "enviado" },
    });
    expect(res.updated).toBe(false);
  });
});
