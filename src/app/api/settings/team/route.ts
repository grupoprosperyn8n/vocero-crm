import { and, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { SISTEMA_SGSA_EMAIL } from "@/lib/reviews";
import { teamGate } from "@/server/settings/access";
import { avatarUrlsForPeople } from "@/server/avatars";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const db = getDb();
  // Alias para saber quién aplicó el "fuera de línea" (020).
  const offlineUser = alias(schema.user, "offline_user");
  const members = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
      // Ficha del empleado (sync LOGIN v2): presente solo si el sync la cargó.
      employeeCode: schema.staffProfile.employeeCode,
      operationalRole: schema.staffProfile.operationalRole,
      locality: schema.staffProfile.locality,
      sourceStatus: schema.staffProfile.sourceStatus,
      // 020 — Fuera de línea manual (Equipo).
      offlineAt: schema.member.offlineAt,
      offlineByName: offlineUser.name,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(offlineUser, eq(schema.member.offlineBy, offlineUser.id))
    .leftJoin(
      schema.staffProfile,
      and(
        eq(schema.staffProfile.userId, schema.member.userId),
        eq(schema.staffProfile.organizationId, schema.member.organizationId)
      )
    )
    .where(
      and(
        scoped(schema.member.organizationId, session.organizationId),
        // 033 — el usuario de sistema (SGSA · Avisos) no se lista en Equipo.
        ne(schema.user.email, SISTEMA_SGSA_EMAIL)
      )
    );
  // 032/035 — foto de perfil por email y, si la ficha no lo tiene, por nombre.
  const avatares = await avatarUrlsForPeople(
    members.map((m) => ({ email: m.email, name: m.name }))
  );
  return Response.json({
    // Quién mira: la UI decide qué controles mostrar (el server igual valida).
    viewer: { userId: session.userId, role: session.role },
    members: members.map((m, i) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      name: m.name,
      email: m.email,
      employeeCode: m.employeeCode,
      operationalRole: m.operationalRole,
      locality: m.locality,
      sourceStatus: m.sourceStatus,
      offlineAt: m.offlineAt ? m.offlineAt.toISOString() : null,
      offlineByName: m.offlineByName,
      createdAt: m.createdAt.toISOString(),
      avatarUrl: avatares[i] ?? null,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  // 6: misma política que el sync de LOGIN (hay contraseñas reales de 6-7).
  password: z.string().min(6).max(128),
});

/** Alta de cuenta de equipo (owner only): email + contraseña temporal (FR-061). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(
      403,
      "forbidden",
      "Solo el propietario o un administrador pueden crear cuentas"
    );
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: "member",
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});

const offlineSchema = z.object({
  memberId: z.string().trim().min(1),
  /** 020 — dejar fuera de línea / poner online. */
  offline: z.boolean().optional(),
  /** 026 — cambiar el rol: Gerente (ve toda la bandeja), Miembro o Admin. */
  role: z.enum(["admin", "manager", "member"]).optional(),
  /** 044b-B10 — editar una cuenta MANUAL del CRM: nombre, correo y/o clave. */
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  password: z.string().min(6).max(128).optional(),
});

/**
 * 020 — "Dejar offline" / "Poner online" desde la pestaña Equipo.
 * 026 — Cambiar el rol (Gerente ↔ Miembro; «Administrador» solo lo toca el
 * propietario).
 *
 * Reglas de quién maneja a quién (pedido de Diego, 2026-09-10 + 13):
 *   - el propietario maneja a miembros, gerentes y administradores;
 *   - un administrador maneja a miembros y gerentes (no a otros administradores);
 *   - nadie se cambia a sí mismo y al propietario no se lo toca.
 * La membresía QUEDA (ficha e historial intactos): el corte es de ACCESO —
 * se invalidan las sesiones del miembro y requireSession lo frena en cada
 * request. El sync del sistema no pisa este estado; solo su baja (ESTADO ≠
 * Activo) quita la membresía entera.
 */
export const PATCH = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(
      403,
      "forbidden",
      "Solo el propietario o un administrador pueden cambiar al equipo"
    );
  }
  const body = await parseBody(req, offlineSchema);
  if (!body.ok) return body.response;
  // 044b-B10 — editar una cuenta MANUAL del CRM (nombre, correo, contraseña).
  const editRequested =
    body.data.name !== undefined ||
    body.data.email !== undefined ||
    body.data.password !== undefined;
  if (
    body.data.offline === undefined &&
    body.data.role === undefined &&
    !editRequested
  ) {
    return apiError(422, "invalid", "No hay nada para cambiar");
  }

  const db = getDb();
  const rows = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
    })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.id, body.data.memberId),
        scoped(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);
  const target = rows[0];
  if (!target) return apiError(404, "not_found", "Ese miembro no existe");

  if (target.userId === session.userId) {
    return apiError(
      409,
      "self",
      body.data.role !== undefined
        ? "No podés cambiar tu propio rol"
        : editRequested
          ? "No podés editar tu propia cuenta desde acá"
          : "No podés cambiar tu propio estado"
    );
  }
  if (target.role === "owner") {
    return apiError(
      409,
      "owner",
      "Al propietario no se lo puede tocar desde acá"
    );
  }
  // 026 — un administrador no toca a administradores ni reparte ese rol.
  if (
    session.role === "admin" &&
    (target.role === "admin" || body.data.role === "admin")
  ) {
    return apiError(
      403,
      "forbidden",
      "Un administrador no puede tocar a un administrador"
    );
  }

  // 044b-B10 — cuentas MANUALES (creadas y cargadas desde el CRM): editar
  // nombre, correo o contraseña desde Ajustes → Equipo. Las cuentas con ficha
  // del sistema (staffProfile) no se tocan acá: las administra el sync.
  if (editRequested) {
    const staffRows = await db
      .select({ id: schema.staffProfile.id })
      .from(schema.staffProfile)
      .where(
        and(
          scoped(schema.staffProfile.organizationId, session.organizationId),
          eq(schema.staffProfile.userId, target.userId)
        )
      )
      .limit(1);
    if (staffRows[0]) {
      return apiError(
        409,
        "system_account",
        "Esta cuenta viene del sistema (ficha de empleado): se administra desde el sistema."
      );
    }
    const changes: string[] = [];
    if (body.data.name !== undefined) {
      await db
        .update(schema.user)
        .set({ name: body.data.name, updatedAt: new Date() })
        .where(eq(schema.user.id, target.userId));
      changes.push("name");
    }
    if (body.data.email !== undefined) {
      const dup = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, body.data.email))
        .limit(1);
      if (dup[0] && dup[0].id !== target.userId) {
        return apiError(409, "duplicate", "Ya existe otra cuenta con ese correo");
      }
      await db
        .update(schema.user)
        .set({ email: body.data.email, updatedAt: new Date() })
        .where(eq(schema.user.id, target.userId));
      changes.push("email");
    }
    if (body.data.password !== undefined) {
      const hash = await hashPassword(body.data.password);
      const accounts = await db
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(
          and(
            eq(schema.account.userId, target.userId),
            eq(schema.account.providerId, "credential")
          )
        )
        .limit(1);
      if (accounts[0]) {
        await db
          .update(schema.account)
          .set({ password: hash, updatedAt: new Date() })
          .where(eq(schema.account.id, accounts[0].id));
      } else {
        await db.insert(schema.account).values({
          id: `account_${randomBytes(16).toString("hex")}`,
          accountId: target.userId,
          providerId: "credential",
          userId: target.userId,
          password: hash,
        });
      }
      changes.push("password");
    }
    // Al cambiar clave o correo se cortan las sesiones vivas de esa cuenta:
    // vuelve a entrar con los datos nuevos.
    if (body.data.password !== undefined || body.data.email !== undefined) {
      await db
        .delete(schema.session)
        .where(eq(schema.session.userId, target.userId));
    }
    return Response.json({ ok: true, memberId: target.id, changes });
  }

  // 026 — cambio de rol (Gerente/Miembro/Administrador según quién manda).
  if (body.data.role !== undefined) {
    await db
      .update(schema.member)
      .set({ role: body.data.role })
      .where(eq(schema.member.id, target.id));
    return Response.json({ ok: true, memberId: target.id, role: body.data.role });
  }

  const offline = body.data.offline === true;
  await db
    .update(schema.member)
    .set({
      offlineAt: offline ? new Date() : null,
      offlineBy: offline ? session.userId : null,
    })
    .where(eq(schema.member.id, target.id));

  if (offline) {
    // Corte en caliente, mismo criterio que la baja del sync: sin sesiones,
    // aunque la cookie viva el acceso no vuelve hasta "Poner online".
    await db
      .delete(schema.session)
      .where(eq(schema.session.userId, target.userId));
  }

  return Response.json({ ok: true, memberId: target.id, offline });
});

const deleteSchema = z.object({ memberId: z.string().trim().min(1) });

/**
 * 044b-B10 — eliminar una cuenta MANUAL del CRM (pedido de Diego): las
 * cuentas que se crean y cargan desde el CRM se eliminan desde Ajustes →
 * Equipo. Las cuentas con ficha del sistema no se tocan (las administra el
 * sync). Mismas reglas de quién maneja a quién que el PATCH; se elimina la
 * cuenta COMPLETA (sesiones y membresías caen en cascada; el historial —chat,
 * conversaciones, gestiones— queda sin asignar) y no se puede deshacer.
 */
export const DELETE = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(
      403,
      "forbidden",
      "Solo el propietario o un administrador pueden eliminar cuentas"
    );
  }
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(
      and(
        eq(schema.member.id, body.data.memberId),
        scoped(schema.member.organizationId, session.organizationId)
      )
    )
    .limit(1);
  const target = rows[0];
  if (!target) return apiError(404, "not_found", "Ese miembro no existe");
  if (target.userId === session.userId) {
    return apiError(409, "self", "No podés eliminar tu propia cuenta");
  }
  if (target.role === "owner") {
    return apiError(409, "owner", "Al propietario no se lo puede eliminar");
  }
  if (session.role === "admin" && target.role === "admin") {
    return apiError(
      403,
      "forbidden",
      "Un administrador no puede eliminar a un administrador"
    );
  }
  if (target.email === SISTEMA_SGSA_EMAIL) {
    return apiError(409, "system_user", "Esa cuenta es del sistema y no se elimina");
  }
  const staffRows = await db
    .select({ id: schema.staffProfile.id })
    .from(schema.staffProfile)
    .where(
      and(
        scoped(schema.staffProfile.organizationId, session.organizationId),
        eq(schema.staffProfile.userId, target.userId)
      )
    )
    .limit(1);
  if (staffRows[0]) {
    return apiError(
      409,
      "system_account",
      "Esta cuenta viene del sistema (ficha de empleado): se administra desde el sistema."
    );
  }

  await db.delete(schema.user).where(eq(schema.user.id, target.userId));
  return Response.json({ ok: true, memberId: target.id, deleted: true });
});
