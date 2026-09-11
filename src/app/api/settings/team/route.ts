import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
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
    .where(scoped(schema.member.organizationId, session.organizationId));
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
  offline: z.boolean(),
});

/**
 * 020 — "Dejar offline" / "Poner online" desde la pestaña Equipo.
 *
 * Lo decide el propietario o un administrador (pedido de Diego, 2026-09-10):
 *   - el propietario maneja a miembros y administradores;
 *   - un administrador solo maneja miembros (no a otros administradores);
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
      "Solo el propietario o un administrador pueden dejar fuera de línea a un miembro"
    );
  }
  const body = await parseBody(req, offlineSchema);
  if (!body.ok) return body.response;

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
    return apiError(409, "self", "No podés cambiar tu propio estado");
  }
  if (target.role === "owner") {
    return apiError(
      409,
      "owner",
      "Al propietario no se lo puede dejar fuera de línea"
    );
  }
  if (session.role === "admin" && target.role !== "member") {
    return apiError(
      403,
      "forbidden",
      "Un administrador solo puede manejar a los miembros"
    );
  }

  const { offline } = body.data;
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
