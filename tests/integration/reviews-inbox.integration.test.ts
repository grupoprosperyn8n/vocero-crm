import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REVIEW_ENVIO_ALERT_TYPE } from "@/lib/reviews";

/**
 * 033c — La revisión de envío PENDIENTE también aparece en la sección ALERTAS
 * (pedido de Diego): la tarjeta vive en el chat interno (grupo «Alerta de
 * Siniestro»), pero la cola la muestra como una alerta con «Abrir
 * conversación». Verifica la VISIBILIDAD: la gestión ve todo; un empleado ve
 * lo que cayó en salas donde participa; un ajeno no lo ve; una revisión ya
 * decidida sale de la cola.
 *
 * Arma el escenario con filas sintéticas propias (e2e033c_*) — sin tocar el
 * grupo real del flujo — y las BORRA en la misma corrida.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/reviews-inbox.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("033c — las revisiones de envío aparecen en la sección Alertas", () => {
  let sql: import("postgres").Sql;
  let inbox: typeof import("@/server/reviews/inbox");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e033c_${tag}`;
  const uids = { emp: `${P}_emp`, mgr: `${P}_mgr`, oth: `${P}_oth` };
  const roomId = `${P}_room`;
  const msgId = `${P}_msg`;
  let orgId = "";
  let ownerId = "";

  // rec + EXACTAMENTE 14 alfanuméricos.
  const recInbox = (n: number) => `recE2E33c${tag}x${n}`;

  const mkPayload = (n: number, cliente: string) => ({
    recordId: recInbox(n),
    cliente,
    titulo: "SGSA | Pendiente de aprobación",
    canales: "WhatsApp + Email",
    asuntoEmail: "Resolución de su Siniestro - Vehículo",
    emailTo: "grupoprospery@gmail.com",
    whatsappTo: "+549****4300",
    reintento: false,
    mensaje: `Hola ${cliente} 👋\nLa determinación del caso es no culpable.`,
    estado: "pendiente",
    detalle: null,
    decididoPor: null,
    decididoEl: null,
    via: null,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";
    process.env.REVIEWS_INBOUND_KEY = "e2e033c-key";

    inbox = await import("@/server/reviews/inbox");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

    const staff: [string, string][] = [
      [uids.emp, `Empleado 033c ${tag}`],
      [uids.mgr, `Gerente 033c ${tag}`],
      [uids.oth, `Ajeno 033c ${tag}`],
    ];
    for (const [u, name] of staff) {
      const role = u === uids.mgr ? "manager" : "member";
      await sql`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
        VALUES (${u}, ${name}, ${u + "@e2e.test"}, false, now(), now())`;
      await sql`INSERT INTO member (id, organization_id, user_id, role)
        VALUES (${`${u}_m`}, ${orgId}, ${u}, ${role})`;
    }

    // Sala propia del escenario: el «empleado designado» participa; el ajeno no.
    await sql`INSERT INTO chat_room (id, organization_id, kind, name, created_by, created_at, updated_at)
      VALUES (${roomId}, ${orgId}, 'group', ${`Sala Inbox E2E ${tag}`}, ${ownerId}, now(), now())`;
    await sql`INSERT INTO chat_room_member (id, organization_id, room_id, user_id)
      VALUES (${`${uids.emp}_rm`}, ${orgId}, ${roomId}, ${uids.emp})`;

    // La tarjeta (mensaje) y las dos revisiones: una viva, una ya decidida.
    await sql`INSERT INTO chat_message (id, organization_id, room_id, sender_id, body, kind, payload, created_at)
      VALUES (${msgId}, ${orgId}, ${roomId}, ${ownerId}, ${`SGSA | Pendiente de aprobación — Registro ${recInbox(1)}`}, 'review', ${sql.json(mkPayload(1, "TEST INBOX"))}, now())`;
    const deliveries = [
      { roomId, messageId: msgId, kind: "group", targetId: roomId, name: "Alerta de Siniestro" },
    ];
    await sql`INSERT INTO review_request
      (id, organization_id, record_id, cliente, room_id, message_id, deliveries, status, payload, created_at, updated_at)
      VALUES (${`${P}_r1`}, ${orgId}, ${recInbox(1)}, 'TEST INBOX', ${roomId}, ${msgId},
              ${sql.json(deliveries)}, 'pendiente', ${sql.json(mkPayload(1, "TEST INBOX"))}, now(), now())`;
    await sql`INSERT INTO review_request
      (id, organization_id, record_id, cliente, room_id, message_id, deliveries, status, payload, created_at, updated_at)
      VALUES (${`${P}_r2`}, ${orgId}, ${recInbox(2)}, 'TEST INBOX DOS', ${roomId}, ${msgId},
              ${sql.json(deliveries)}, 'aprobado', ${sql.json(mkPayload(2, "TEST INBOX DOS"))}, now(), now())`;
  });

  afterAll(async () => {
    await sql`DELETE FROM review_request
      WHERE organization_id = ${orgId} AND record_id LIKE ${"recE2E33c" + tag + "%"}`;
    await sql`DELETE FROM chat_message WHERE room_id = ${roomId}`;
    await sql`DELETE FROM chat_room_member WHERE room_id = ${roomId}`;
    await sql`DELETE FROM chat_room WHERE id = ${roomId}`;
    const gone = [uids.emp, uids.mgr, uids.oth];
    await sql`DELETE FROM member WHERE user_id IN ${sql(gone)}`;
    await sql`DELETE FROM "user" WHERE id IN ${sql(gone)}`;

    const resid = await sql<{ r: number; rooms: number; u: number }[]>`
      SELECT
        (SELECT count(*)::int FROM review_request
          WHERE organization_id = ${orgId}
            AND record_id LIKE ${"recE2E33c" + tag + "%"}) AS r,
        (SELECT count(*)::int FROM chat_room WHERE id = ${roomId}) AS rooms,
        (SELECT count(*)::int FROM "user" WHERE id IN ${sql(gone)}) AS u`;
    expect(resid[0]).toEqual({ r: 0, rooms: 0, u: 0 });
    await sql.end();
  });

  it("la gestión (dueño y gerente) ve la revisión pendiente con los datos del flujo", async () => {
    const asOwner = await inbox.listPendingReviewAlerts({
      organizationId: orgId,
      userId: ownerId,
      role: "owner",
    });
    const item = asOwner.find((a) => a.review.recordId === recInbox(1));
    expect(item).toBeTruthy();
    expect(item!.tipo).toBe(REVIEW_ENVIO_ALERT_TYPE);
    expect(item!.estado).toBe("PENDIENTE");
    expect(item!.urgencia).toBe(1);
    expect(item!.clienteNombre).toBe("TEST INBOX");
    expect(item!.titulo).toContain("Pendiente de aprobación");
    expect(item!.detalle).toContain(`Registro: ${recInbox(1)}`);
    expect(item!.review.roomId).toBe(roomId);
    expect(item!.review.deliveries).toBe(1);
    expect(item!.review.recipients).toEqual(["Alerta de Siniestro"]);

    const asManager = await inbox.listPendingReviewAlerts({
      organizationId: orgId,
      userId: uids.mgr,
      role: "manager",
    });
    expect(asManager.some((a) => a.review.recordId === recInbox(1))).toBe(true);
  });

  it("el empleado designado la ve (participa de la sala); el ajeno no", async () => {
    const asEmp = await inbox.listPendingReviewAlerts({
      organizationId: orgId,
      userId: uids.emp,
      role: "member",
    });
    expect(asEmp.some((a) => a.review.recordId === recInbox(1))).toBe(true);

    const asOther = await inbox.listPendingReviewAlerts({
      organizationId: orgId,
      userId: uids.oth,
      role: "member",
    });
    expect(asOther.some((a) => a.review.recordId === recInbox(1))).toBe(false);
  });

  it("una revisión ya decidida sale de la cola (solo las pendientes son alerta)", async () => {
    const asOwner = await inbox.listPendingReviewAlerts({
      organizationId: orgId,
      userId: ownerId,
      role: "owner",
    });
    expect(asOwner.some((a) => a.review.recordId === recInbox(2))).toBe(false);
  });
});
