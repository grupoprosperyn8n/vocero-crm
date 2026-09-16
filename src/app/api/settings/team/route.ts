import { and, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { SISTEMA_SGSA_EMAIL } from "@/lib/reviews";
import { teamGate } from "@/server/settings/access";
import { avatarUrlsForEmails } from "@/server/avatars";

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
  // 032 — foto de perfil (misma fuente que el chat: EMPLEADOS en Airtable).
  const avatares = await avatarUrlsForEmails(members.map((m) => m.email));
  return Response.json({
    // Quién mira: la UI decide qué controles mostrar (el server igual valida).
    viewer: { userId: session.userId, role: session.role },
    members: members.map((m) => ({
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
      avatarUrl: avatares.get(m.email.trim().toLowerCase()) ?? null,
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
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede crear cuentas");
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
  if (body.data.offline === undefined && body.data.role === undefined) {
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
