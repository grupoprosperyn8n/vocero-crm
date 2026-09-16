import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 026 — Integración REAL de la bandeja por usuario contra la copia local de
 * producción (INTEGRATION_DATABASE_URL). Verifica el pedido de Diego:
 *   - un miembro ve SOLO sus comunicaciones (asignadas a él); gerente/
 *     administrador/propietario ven TODAS y filtran por cualquier empleado;
 *   - archivar una conversación es PERSONAL (sale de mi bandeja, no de la de
 *     los demás) y persistente; la pestaña «Archivadas» la trae de vuelta;
 *   - el chat interno: archivar la sala SOLO para mí, sin tocar al otro
 *     integrante;
 *   - 034: pinear/despinear (fijar arriba) es TAMBIÉN personal y aparte del
 *     archivo, en la bandeja del CRM y en las salas del chat interno.
 *
 * Crea datos sintéticos identificables (e2e026_*) y los BORRA en la misma
 * corrida: cero residuo.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/inbox-visibility.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("026/034 — bandeja por usuario (alcance, archivo y pin personal, chat)", () => {
  let sql: import("postgres").Sql;
  let queries: typeof import("@/server/inbox/queries");
  let chat: typeof import("@/server/internal/chat");

  const tag = Math.random().toString(36).slice(2, 8);
  const P = `e2e026_${tag}`;
  const uids = { empA: `${P}_ua`, empB: `${P}_ub`, mgr: `${P}_um` };
  const cids = { a: `${P}_ca`, a2: `${P}_ca2`, b: `${P}_cb`, pool: `${P}_cp` };
  const conv = { a: `${P}_cva`, a2: `${P}_cva2`, b: `${P}_cvb`, pool: `${P}_cvpool` };
  let orgId = "";
  let ownerId = "";
  let roomId: string | null = null;

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

    queries = await import("@/server/inbox/queries");
    chat = await import("@/server/internal/chat");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

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

    // Contactos y conversaciones sintéticas (reales a efectos de la bandeja).
    const contacts: [string, string][] = [
      [cids.a, `E2E Contacto A ${tag}`],
      [cids.a2, `E2E Contacto A2 ${tag}`],
      [cids.b, `E2E Contacto B ${tag}`],
      [cids.pool, `E2E Contacto Pool ${tag}`],
    ];
    for (const [c, name] of contacts) {
      await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
        VALUES (${c}, ${orgId}, 'whatsapp', ${`e2e026:${c}`}, ${name}, 'manual', false)`;
    }

    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, assignee_id, assigned_at, last_message_at)
      VALUES (${conv.a}, ${orgId}, ${cids.a}, false, 'whatsapp', ${uids.empA}, now(), now())`;
    // 034 — segunda conversación de A, más vieja: sirve para ver que la fijada
    // sube arriba de MI lista.
    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, assignee_id, assigned_at, last_message_at)
      VALUES (${conv.a2}, ${orgId}, ${cids.a2}, false, 'whatsapp', ${uids.empA}, now(), now() - interval '2 hours')`;
    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, assignee_id, assigned_at, last_message_at)
      VALUES (${conv.b}, ${orgId}, ${cids.b}, false, 'whatsapp', ${uids.empB}, now(), now())`;
    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, last_message_at)
      VALUES (${conv.pool}, ${orgId}, ${cids.pool}, false, 'whatsapp', now())`;
  });

  afterAll(async () => {
    // Limpieza EXACTA de lo sintético de esta corrida.
    if (roomId) {
      await sql`DELETE FROM chat_message WHERE room_id = ${roomId}`;
      await sql`DELETE FROM chat_room_member WHERE room_id = ${roomId}`;
      await sql`DELETE FROM chat_room WHERE id = ${roomId}`;
    }
    await sql`DELETE FROM conversation_archive WHERE user_id IN ${sql([
      uids.empA,
      uids.empB,
      uids.mgr,
    ])}`;
    await sql`DELETE FROM conversation_pin WHERE user_id IN ${sql([
      uids.empA,
      uids.empB,
      uids.mgr,
    ])}`;
    await sql`DELETE FROM conversation WHERE id IN ${sql([
      conv.a,
      conv.a2,
      conv.b,
      conv.pool,
    ])}`;
    await sql`DELETE FROM contact WHERE id IN ${sql([
      cids.a,
      cids.a2,
      cids.b,
      cids.pool,
    ])}`;
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

  const viewerA = () => ({ userId: uids.empA, role: "member" });
  const viewerB = () => ({ userId: uids.empB, role: "member" });
  const viewerM = () => ({ userId: uids.mgr, role: "manager" });
  const viewerO = () => ({ userId: ownerId, role: "owner" });

  it("cola viva: el miembro ve SOLO lo suyo; gerente y propietario ven todo", async () => {
    const a = await queries.listConversations(orgId, undefined, "open", viewerA());
    const idsA = a.map((c) => c.id);
    expect(idsA).toContain(conv.a);
    expect(idsA).not.toContain(conv.b);
    expect(idsA).not.toContain(conv.pool);

    const b = await queries.listConversations(orgId, undefined, "open", viewerB());
    const idsB = b.map((c) => c.id);
    expect(idsB).toContain(conv.b);
    expect(idsB).not.toContain(conv.a);
    expect(idsB).not.toContain(conv.pool);

    const m = await queries.listConversations(orgId, undefined, "open", viewerM());
    expect(m.map((c) => c.id)).toEqual(
      expect.arrayContaining([conv.a, conv.b, conv.pool])
    );

    const o = await queries.listConversations(orgId, undefined, "open", viewerO());
    expect(o.map((c) => c.id)).toEqual(
      expect.arrayContaining([conv.a, conv.b, conv.pool])
    );
  });

  it("filtro por empleado (gerente): suyas, de otro y sin asignar", async () => {
    const mine = await queries.listConversations(
      orgId,
      undefined,
      "open",
      viewerM(),
      uids.empA
    );
    // 034 — la A2 también es de A: sin fijar, el orden es por fecha (A es más
    // nueva que A2).
    expect(mine.map((c) => c.id)).toEqual([conv.a, conv.a2]);

    const none = await queries.listConversations(
      orgId,
      undefined,
      "open",
      viewerM(),
      "none"
    );
    const idsNone = none.map((c) => c.id);
    expect(idsNone).toContain(conv.pool);
    expect(idsNone).not.toContain(conv.a);
  });

  it("archivo personal: sale de MI cola, no de la de los demás; «Archivadas» la trae", async () => {
    const r = await queries.setConversationArchived({
      organizationId: orgId,
      conversationId: conv.a,
      userId: uids.empA,
      archived: true,
    });
    expect(r).toEqual({ archived: true });

    const a = await queries.listConversations(orgId, undefined, "open", viewerA());
    expect(a.map((c) => c.id)).not.toContain(conv.a);

    const archivedA = await queries.listConversations(
      orgId,
      undefined,
      "archived",
      viewerA()
    );
    expect(archivedA.map((c) => c.id)).toEqual([conv.a]);

    // El gerente sigue viéndola en su cola: el archivo es de cada uno.
    const m = await queries.listConversations(orgId, undefined, "open", viewerM());
    expect(m.map((c) => c.id)).toContain(conv.a);

    const openCount = await queries.countConversations(orgId, "open", viewerA());
    const archCount = await queries.countConversations(
      orgId,
      "archived",
      viewerA()
    );
    expect(openCount).toBe(1); // 034: le queda la A2 (la A está archivada)
    expect(archCount).toBe(1);

    const back = await queries.setConversationArchived({
      organizationId: orgId,
      conversationId: conv.a,
      userId: uids.empA,
      archived: false,
    });
    expect(back).toEqual({ archived: false });
    const a2 = await queries.listConversations(orgId, undefined, "open", viewerA());
    expect(a2.map((c) => c.id)).toContain(conv.a);

    // Conversación inexistente → null (la ruta responde 404).
    const missing = await queries.setConversationArchived({
      organizationId: orgId,
      conversationId: "conv_no_existe_e2e",
      userId: uids.empA,
      archived: true,
    });
    expect(missing).toBeNull();
  });

  it("chat interno: archivar la sala solo para mí (el otro no la pierde) y desarchivar", async () => {
    const created = await chat.createDmRoom(orgId, uids.empA, uids.empB);
    roomId = created.id;

    await chat.setRoomArchivedForUser({
      organizationId: orgId,
      roomId,
      userId: uids.empA,
      archived: true,
    });
    const mine = await chat.listRoomsForUser(orgId, uids.empA);
    expect(mine.find((r) => r.id === roomId)?.archived).toBe(true);
    const other = await chat.listRoomsForUser(orgId, uids.empB);
    expect(other.find((r) => r.id === roomId)?.archived).toBe(false);

    // Alguien que no participa de la sala no puede tocar la membresía.
    await expect(
      chat.setRoomArchivedForUser({
        organizationId: orgId,
        roomId,
        userId: uids.mgr,
        archived: true,
      })
    ).rejects.toMatchObject({ code: "not_found" });

    await chat.setRoomArchivedForUser({
      organizationId: orgId,
      roomId,
      userId: uids.empA,
      archived: false,
    });
    const back = await chat.listRoomsForUser(orgId, uids.empA);
    expect(back.find((r) => r.id === roomId)?.archived).toBe(false);
  });

  it("034 — pin personal: la fijada sube arriba de MI lista y no toca a los demás", async () => {
    // Sin pin: A (nueva) va antes que A2 (más vieja).
    const before = await queries.listConversations(orgId, undefined, "open", viewerA());
    const idsBefore = before.map((c) => c.id);
    expect(idsBefore.indexOf(conv.a)).toBeLessThan(idsBefore.indexOf(conv.a2));

    // Fijo A2 para A: va primera y el DTO lo dice; A sigue sin fijar.
    const r = await queries.setConversationPinned({
      organizationId: orgId,
      conversationId: conv.a2,
      userId: uids.empA,
      pinned: true,
    });
    expect(r).toEqual({ pinned: true });

    const mine = await queries.listConversations(orgId, undefined, "open", viewerA());
    expect(mine[0]?.id).toBe(conv.a2);
    expect(mine.find((c) => c.id === conv.a2)?.pinned).toBe(true);
    expect(mine.find((c) => c.id === conv.a)?.pinned).toBe(false);

    // Es de cada uno: al gerente le aparece SIN fijar.
    const m = await queries.listConversations(orgId, undefined, "open", viewerM());
    expect(m.find((c) => c.id === conv.a2)?.pinned).toBe(false);

    // Fijar es independiente de archivar: fijada + archivada queda fijada en MI
    // archivo y sigue fuera de mi cola.
    await queries.setConversationArchived({
      organizationId: orgId,
      conversationId: conv.a2,
      userId: uids.empA,
      archived: true,
    });
    const arch = await queries.listConversations(orgId, undefined, "archived", viewerA());
    expect(arch.map((c) => c.id)).toEqual([conv.a2]);
    expect(arch[0]?.pinned).toBe(true);
    await queries.setConversationArchived({
      organizationId: orgId,
      conversationId: conv.a2,
      userId: uids.empA,
      archived: false,
    });

    // Desfijar: vuelve el orden normal.
    const off = await queries.setConversationPinned({
      organizationId: orgId,
      conversationId: conv.a2,
      userId: uids.empA,
      pinned: false,
    });
    expect(off).toEqual({ pinned: false });
    const after = await queries.listConversations(orgId, undefined, "open", viewerA());
    expect(after.map((c) => c.id)).toEqual(idsBefore);

    // Conversación inexistente → null (la ruta responde 404).
    const missing = await queries.setConversationPinned({
      organizationId: orgId,
      conversationId: "conv_no_existe_e2e",
      userId: uids.empA,
      pinned: true,
    });
    expect(missing).toBeNull();
  });

  it("034 — chat interno: fijo la sala solo para mí (el otro no la ve fijada)", async () => {
    const dmId = roomId!;
    await chat.setRoomPinnedForUser({
      organizationId: orgId,
      roomId: dmId,
      userId: uids.empA,
      pinned: true,
    });
    const mine = await chat.listRoomsForUser(orgId, uids.empA);
    expect(mine.find((r) => r.id === dmId)?.pinned).toBe(true);
    const other = await chat.listRoomsForUser(orgId, uids.empB);
    expect(other.find((r) => r.id === dmId)?.pinned).toBe(false);

    // Quien no participa de la sala no puede fijarla.
    await expect(
      chat.setRoomPinnedForUser({
        organizationId: orgId,
        roomId: dmId,
        userId: uids.mgr,
        pinned: true,
      })
    ).rejects.toMatchObject({ code: "not_found" });

    await chat.setRoomPinnedForUser({
      organizationId: orgId,
      roomId: dmId,
      userId: uids.empA,
      pinned: false,
    });
    const back = await chat.listRoomsForUser(orgId, uids.empA);
    expect(back.find((r) => r.id === dmId)?.pinned).toBe(false);
  });
});
