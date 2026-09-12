import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integración REAL del chat interno contra una copia local de producción
 * (Postgres descartable con el dump restaurado + migración 0020 aplicada).
 * No corre en `pnpm test` normal: se salta salvo que INTEGRATION_DATABASE_URL
 * apunte a esa copia.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/internal-chat.integration.test.ts
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type ChatModule = typeof import("@/server/internal/chat");

suite("chat interno — integración con copia de la BD real", () => {
  let chat: ChatModule;
  // Cliente crudo para sembrar/verificar datos de prueba.
  let sql: import("postgres").Sql;

  let orgId: string;
  let ownerId: string;
  let memberId: string;
  let memberName: string;
  let outsiderId: string;
  let outsiderName: string;
  let adminId: string;
  let groupId: string;

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar el módulo (getEnv es lazy).
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
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

    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

    const memberRows = await sql<{ user_id: string; name: string }[]>`
      SELECT m.user_id, u.name FROM member m
      JOIN "user" u ON u.id = m.user_id
      WHERE m.organization_id = ${orgId} AND m.role = 'member'
      ORDER BY u.name LIMIT 1`;
    memberId = memberRows[0]!.user_id;
    memberName = memberRows[0]!.name;

    // Dos usuarios descartables SOLO en esta copia local.
    const stamp = Date.now().toString(36);
    const mkUser = async (slug: string, name: string) => {
      const id = `it_${slug}_${stamp}`;
      const email = `${id}@test.local`;
      await sql`INSERT INTO "user" (id, name, email, email_verified)
                VALUES (${id}, ${name}, ${email}, false)`;
      return id;
    };
    outsiderId = await mkUser("outsider", "Integración Externo");
    outsiderName = "Integración Externo";
    const adminUserId = await mkUser("admin", "Integración Admin");
    adminId = adminUserId;
    for (const [uid, role] of [
      [adminUserId, "admin"],
      [outsiderId, "member"],
    ] as const) {
      await sql`INSERT INTO member (id, organization_id, user_id, role)
                VALUES (${"itm_" + uid}, ${orgId}, ${uid}, ${role})`;
    }
  }, 30_000);

  it("un miembro NO puede crear grupos (403) y un admin SÍ", async () => {
    await expect(
      chat.createGroupRoom({
        organizationId: orgId,
        creatorId: memberId,
        creatorRole: "member",
        name: "No debería existir",
        memberIds: [outsiderId],
      })
    ).rejects.toMatchObject({ status: 403 });

    const room = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: adminId,
      creatorRole: "admin",
      name: "Equipo de prueba",
      memberIds: [memberId, ownerId],
    });
    expect(room.kind).toBe("group");
    expect(room.displayName).toBe("Equipo de prueba");
    expect(room.membersCount).toBe(3);
    expect(room.unreadCount).toBe(0);
    groupId = room.id;
  });

  it("mensaje + no leídos + marcar leído (el ciclo real del chat)", async () => {
    const msg = await chat.postChatMessage({
      organizationId: orgId,
      roomId: groupId,
      senderId: ownerId,
      body: "  Hola equipo, mensaje de integración  ",
    });
    expect(msg.body).toBe("Hola equipo, mensaje de integración");

    let mine = (await chat.listRoomsForUser(orgId, memberId)).find(
      (r) => r.id === groupId
    );
    expect(mine?.unreadCount).toBe(1);
    expect(mine?.lastMessage?.body).toBe("Hola equipo, mensaje de integración");

    await chat.markRoomRead(orgId, groupId, memberId);
    mine = (await chat.listRoomsForUser(orgId, memberId)).find(
      (r) => r.id === groupId
    );
    expect(mine?.unreadCount).toBe(0);

    // El que escribió no se cuenta sus propios mensajes como no leídos.
    const forOwner = (await chat.listRoomsForUser(orgId, ownerId)).find(
      (r) => r.id === groupId
    );
    expect(forOwner?.unreadCount).toBe(0);

    const { messages } = await chat.listChatMessages({
      organizationId: orgId,
      roomId: groupId,
      meId: memberId,
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.at(-1)?.body).toBe("Hola equipo, mensaje de integración");
  });

  it("quien no es del grupo no puede escribir (403) ni un mensaje vacío pasa (422)", async () => {
    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: groupId,
        senderId: outsiderId,
        body: "no soy del grupo",
      })
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: groupId,
        senderId: ownerId,
        body: "   ",
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("gestión del grupo: solo dueño/administrador; agregar y quitar integrantes", async () => {
    await expect(
      chat.updateGroupRoom({
        organizationId: orgId,
        roomId: groupId,
        actorRole: "member",
        name: "Renombrado por miembro",
      })
    ).rejects.toMatchObject({ status: 403 });

    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: groupId,
      actorRole: "owner",
      name: "Equipo renombrado",
      addUserIds: [outsiderId],
    });
    let mine = (await chat.listRoomsForUser(orgId, memberId)).find(
      (r) => r.id === groupId
    );
    expect(mine?.displayName).toBe("Equipo renombrado");
    expect(mine?.membersCount).toBe(4);

    // El nuevo integrante ya puede escribir…
    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: groupId,
        senderId: outsiderId,
        body: "ya estoy dentro",
      })
    ).resolves.toMatchObject({ senderId: outsiderId });

    // …y al quitarlo, deja de poder.
    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: groupId,
      actorRole: "owner",
      removeUserIds: [outsiderId],
    });
    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: groupId,
        senderId: outsiderId,
        body: "me sacaron",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("mensajes directos: se crean una sola vez y muestran el nombre del otro", async () => {
    const dm1 = await chat.createDmRoom(orgId, ownerId, memberId);
    expect(dm1.kind).toBe("dm");
    expect(dm1.displayName).toBe(memberName);

    const dm2 = await chat.createDmRoom(orgId, ownerId, memberId);
    expect(dm2.id).toBe(dm1.id); // idempotente: mismo par, misma sala

    // Desde el lado del miembro, el nombre visible es el del dueño.
    const forMember = (await chat.listRoomsForUser(orgId, memberId)).find(
      (r) => r.id === dm1.id
    );
    expect(forMember?.displayName).not.toBe(memberName);
    expect(forMember?.kind).toBe("dm");

    await expect(chat.createDmRoom(orgId, ownerId, ownerId)).rejects.toMatchObject(
      { status: 422 }
    );

    await expect(
      chat.createDmRoom(orgId, ownerId, "usuario_que_no_existe")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("staff activo para los selectores (sin bajas fuera de línea)", async () => {
    const staff = await chat.listStaff(orgId);
    expect(staff.some((s) => s.userId === ownerId)).toBe(true);
    expect(staff.some((s) => s.name === outsiderName)).toBe(true);
  });
});
