import { beforeAll, describe, expect, it } from "vitest";
import { dropPresence, touchPresence } from "@/server/events/presence";

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
        actorId: memberId,
        actorRole: "member",
        name: "Renombrado por miembro",
      })
    ).rejects.toMatchObject({ status: 403 });

    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: groupId,
      actorId: ownerId,
      actorRole: "owner",
      name: "Equipo renombrado",
      addUserIds: [outsiderId],
    });
    const mine = (await chat.listRoomsForUser(orgId, memberId)).find(
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
      actorId: ownerId,
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
    // 022c — la ficha del empleado viaja con el perfil (email + staff_profile).
    const ownerRow = staff.find((s) => s.userId === ownerId)!;
    expect(typeof ownerRow.email).toBe("string");
    expect("employeeCode" in ownerRow).toBe(true);
    expect("operationalRole" in ownerRow).toBe(true);
    expect("locality" in ownerRow).toBe(true);
  });

  it("presencia: onlineCount y flags de 'en línea' salen de las conexiones SSE", async () => {
    const room = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: ownerId,
      creatorRole: "owner",
      name: "Presencia QA",
      memberIds: [adminId],
    });

    // Nadie conectado: el miembro figura desconectado.
    let rooms = await chat.listRoomsForUser(orgId, ownerId);
    let found = rooms.find((r) => r.id === room.id);
    expect(found?.onlineCount).toBe(0);
    expect(found?.members.find((m) => m.userId === adminId)?.online).toBe(false);

    // El admin abre su SSE → en línea; sala y staff lo reflejan.
    touchPresence(orgId, adminId);
    rooms = await chat.listRoomsForUser(orgId, ownerId);
    found = rooms.find((r) => r.id === room.id);
    expect(found?.onlineCount).toBe(1);
    expect(found?.members.find((m) => m.userId === adminId)?.online).toBe(true);
    const staff = await chat.listStaff(orgId);
    expect(staff.find((s) => s.userId === adminId)?.online).toBe(true);

    // Y al cerrar la última conexión vuelve a desconectado.
    dropPresence(orgId, adminId);
    rooms = await chat.listRoomsForUser(orgId, ownerId);
    found = rooms.find((r) => r.id === room.id);
    expect(found?.onlineCount).toBe(0);
    expect(found?.members.find((m) => m.userId === adminId)?.online).toBe(false);
  });

  it("022c — pausar a un integrante: sale de su lista, no escribe, se reactiva", async () => {
    const room = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: ownerId,
      creatorRole: "owner",
      name: "Pausas QA",
      memberIds: [memberId, adminId],
    });

    // Pausar al miembro (lo hace el dueño).
    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: room.id,
      actorId: ownerId,
      actorRole: "owner",
      pauseUserIds: [memberId],
    });

    // Para el miembro pausado la sala desaparece…
    const mine = await chat.listRoomsForUser(orgId, memberId);
    expect(mine.find((r) => r.id === room.id)).toBeUndefined();

    // …y no puede escribir.
    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: room.id,
        senderId: memberId,
        body: "estoy pausado",
      })
    ).rejects.toMatchObject({ status: 403 });

    // Para los demás sigue visible: la pausa se marca y no cuenta como activo.
    const forOwner = (await chat.listRoomsForUser(orgId, ownerId)).find(
      (r) => r.id === room.id
    );
    expect(forOwner?.membersCount).toBe(2);
    expect(forOwner?.pausedCount).toBe(1);
    expect(forOwner?.members.find((m) => m.userId === memberId)?.paused).toBe(
      true
    );

    // No te podés pausar a vos mismo.
    await expect(
      chat.updateGroupRoom({
        organizationId: orgId,
        roomId: room.id,
        actorId: ownerId,
        actorRole: "owner",
        pauseUserIds: [ownerId],
      })
    ).rejects.toMatchObject({ status: 422 });

    // Reactivar: vuelve a verla y puede escribir.
    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: room.id,
      actorId: ownerId,
      actorRole: "owner",
      unpauseUserIds: [memberId],
    });
    const back = await chat.listRoomsForUser(orgId, memberId);
    expect(back.find((r) => r.id === room.id)).toBeDefined();
    await expect(
      chat.postChatMessage({
        organizationId: orgId,
        roomId: room.id,
        senderId: memberId,
        body: "volví",
      })
    ).resolves.toMatchObject({ senderId: memberId });
  });

  it("022c — eliminar grupo: solo dueño/admin, se lleva la historia, los DM no se tocan", async () => {
    const room = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: ownerId,
      creatorRole: "owner",
      name: "Para borrar",
      memberIds: [memberId],
    });
    await chat.postChatMessage({
      organizationId: orgId,
      roomId: room.id,
      senderId: ownerId,
      body: "mensaje que se va con el grupo",
    });

    // Un miembro no puede eliminarlo.
    await expect(
      chat.deleteGroupRoom({
        organizationId: orgId,
        roomId: room.id,
        actorRole: "member",
      })
    ).rejects.toMatchObject({ status: 403 });

    // El dueño sí: sala y mensajes desaparecen (cascade).
    await chat.deleteGroupRoom({
      organizationId: orgId,
      roomId: room.id,
      actorRole: "owner",
    });
    const rooms = await chat.listRoomsForUser(orgId, ownerId);
    expect(rooms.find((r) => r.id === room.id)).toBeUndefined();
    const orphan = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM chat_message WHERE room_id = ${room.id}`;
    expect(orphan[0]!.n).toBe(0);

    // Cordura: un DM no se elimina por esta vía.
    const dm = await chat.createDmRoom(orgId, ownerId, memberId);
    await expect(
      chat.deleteGroupRoom({
        organizationId: orgId,
        roomId: dm.id,
        actorRole: "owner",
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("022c — salir del grupo: el dueño/admin puede eliminarse a sí mismo (guard ≥2 activos)", async () => {
    // Con 3 integrantes: el dueño se va y el grupo sigue para los demás.
    const room = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: ownerId,
      creatorRole: "owner",
      name: "Salida QA",
      memberIds: [memberId, adminId],
    });
    await chat.updateGroupRoom({
      organizationId: orgId,
      roomId: room.id,
      actorId: ownerId,
      actorRole: "owner",
      removeUserIds: [ownerId],
    });
    const mineGone = await chat.listRoomsForUser(orgId, ownerId);
    expect(mineGone.find((r) => r.id === room.id)).toBeUndefined();
    const forMember = await chat.listRoomsForUser(orgId, memberId);
    expect(forMember.find((r) => r.id === room.id)).toBeDefined();

    // Con 2 integrantes: irse dejaría el grupo con 1 → bloqueado.
    const small = await chat.createGroupRoom({
      organizationId: orgId,
      creatorId: ownerId,
      creatorRole: "owner",
      name: "Salida QA chico",
      memberIds: [memberId],
    });
    await expect(
      chat.updateGroupRoom({
        organizationId: orgId,
        roomId: small.id,
        actorId: ownerId,
        actorRole: "owner",
        removeUserIds: [ownerId],
      })
    ).rejects.toMatchObject({ status: 422 });
  });
});
