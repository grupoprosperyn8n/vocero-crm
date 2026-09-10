import { and, count, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { apiError, parseBody } from "@/lib/api";
import { withAdminKey } from "@/server/admin/auth";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { resolveInstanceOrg } from "@/server/bot/auth";

export const dynamic = "force-dynamic";

/**
 * 018 — Sync del equipo desde el sistema (tabla LOGIN de Airtable).
 *
 * El sistema (Airtable) es la fuente de verdad de QUIÉN trabaja en el negocio
 * y con qué rol; este endpoint es el brazo del CRM para esa sincronización.
 * Idempotente de a un registro: el productor (n8n) manda el estado completo
 * de una fila de LOGIN y acá se refleja:
 *
 *   - alta: email inexistente → cuenta + membresía con el rol pedido;
 *   - cambio: nombre, contraseña o rol que difieren → se actualizan;
 *   - baja: active=false (o DELETE) → se quita la membresía de la bandeja.
 *
 * Roles que entiende el CRM y su equivalente en LOGIN (Airtable):
 *   owner  ← Dueño      (autoridad máxima; crea cuentas de equipo)
 *   admin  ← Gerente    (hoy atiende igual que member; invita por plugin)
 *   member ← Empleado / Siniestros (atienden la bandeja)
 *   (Visitante no tiene cuenta CRM: el productor no lo sincroniza)
 *
 * La cuenta user jamás se borra: una baja quita la membresía (el acceso a la
 * bandeja se corta en el acto porque requireSession resuelve org+rol siempre
 * desde la BD) y conserva el historial de conversaciones del empleado. Si el
 * registro vuelve a estar activo, el alta reinserta la membresía.
 *
 * Regla de hierro: la instancia nunca puede quedarse sin su único propietario
 * (mismas garantías que FR-061 en el alta manual de equipo).
 */

const upsertSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120),
  /** Obligatoria en el alta; en un cambio se aplica solo si difiere del hash. */
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["owner", "admin", "member"]),
  /** false = baja: se quita la membresía (ver DELETE). */
  active: z.boolean().default(true),
});

async function findUserByEmail(email: string) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  return rows[0] ?? null;
}

async function countOwners(organizationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.role, "owner")
      )
    );
  return rows[0]?.n ?? 0;
}

/** Membresía del user en la org de la instancia, si existe. */
async function findMembership(organizationId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.member.id, role: schema.member.role })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        eq(schema.member.userId, userId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Baja: quita la membresía (nunca borra la cuenta ni su historial). */
async function removeMembership(
  organizationId: string,
  userId: string
): Promise<{ removed: boolean } | { removed: false; error: Response }> {
  const db = getDb();
  const member = await findMembership(organizationId, userId);
  if (!member) return { removed: false };
  if (member.role === "owner" && (await countOwners(organizationId)) <= 1) {
    return {
      removed: false,
      error: apiError(
        409,
        "last_owner",
        "No se puede dar de baja al único propietario de la instancia"
      ),
    };
  }
  await db.delete(schema.member).where(eq(schema.member.id, member.id));
  // Cortar el acceso en caliente: sin membresía la sesión seguiría entrando a
  // la bandeja (withAuth solo valida la cookie). La baja invalida sus sesiones.
  await db.delete(schema.session).where(eq(schema.session.userId, userId));
  return { removed: true };
}

/** Estado completo del equipo en la instancia (para consistencia/polling). */
export const GET = withAdminKey(async () => {
  const orgId = await resolveInstanceOrg();
  if (!orgId) return Response.json({ members: [] });
  const db = getDb();
  const rows = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.organizationId, orgId));
  return Response.json({
    members: rows.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

/** Alta/cambio/baja de UNA fila de LOGIN (idempotente). */
export const PUT = withAdminKey(async (req: Request) => {
  const body = await parseBody(req, upsertSchema);
  if (!body.ok) return body.response;
  const { email, name, password, role, active } = body.data;

  const orgId = await resolveInstanceOrg();
  if (!orgId) {
    return apiError(
      409,
      "no_organization",
      "La instancia todavía no tiene organización"
    );
  }

  const db = getDb();
  const existing = await findUserByEmail(email);

  // Baja declarada en el propio registro (ESTADO ≠ Activo en Airtable).
  if (!active) {
    if (existing) {
      const out = await removeMembership(orgId, existing.id);
      if ("error" in out) return out.error;
      return Response.json({ ok: true, email, active: false, removed: out.removed });
    }
    return Response.json({ ok: true, email, active: false, removed: false });
  }

  let user = existing;
  let created = false;
  if (!user) {
    if (!password) {
      return apiError(
        422,
        "invalid_body",
        "password es obligatoria para una cuenta nueva"
      );
    }
    try {
      const result = await runInternalSignup(() =>
        getAuth().api.signUpEmail({
          body: { name, email, password: password as string },
        })
      );
      user = { id: result.user.id, name: result.user.name };
      created = true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear la cuenta";
      // Carrera con otro sync que creó la misma cuenta: continuar como cambio.
      if (!/exist/i.test(message)) {
        return apiError(422, "invalid", message);
      }
      user = await findUserByEmail(email);
      if (!user) {
        return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
      }
    }
  }

  const changes: string[] = [];

  // Nombre.
  if (user.name !== name) {
    await db
      .update(schema.user)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.user.id, user.id));
    changes.push("name");
  }

  // Contraseña (mismo hasher que el registro: formato de better-auth).
  // Si ya coincide con el hash guardado no se toca: el sync manda la fila
  // completa de LOGIN en cada corrida y re-hashear siempre sería churn de
  // escrituras y "changes" falsos en cada polling.
  if (password) {
    const hash = await hashPassword(password);
    const accounts = await db
      .select({ id: schema.account.id, password: schema.account.password })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, user.id),
          eq(schema.account.providerId, "credential")
        )
      )
      .limit(1);
    const cred = accounts[0];
    const same =
      cred?.password != null &&
      (await verifyPassword({ hash: cred.password, password }));
    if (cred && same) {
      // ya está sincronizada — sin cambios
    } else if (cred) {
      await db
        .update(schema.account)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(schema.account.id, cred.id));
      changes.push("password");
    } else {
      // Las cuentas credential las crea better-auth con su propio formato de
      // id (account_…); este insert es solo para el caso raro de una cuenta
      // sin fila credential (p.ej. creada por otro proveedor antes del sync).
      const id = `account_${randomBytes(16).toString("hex")}`;
      await db.insert(schema.account).values({
        id,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hash,
      });
      changes.push("password");
    }
  }

  // Membresía (alta o cambio de rol; nunca dejar sin dueño a la instancia).
  const membership = await findMembership(orgId, user.id);
  if (!membership) {
    await db.insert(schema.member).values({
      id: newId("member"),
      organizationId: orgId,
      userId: user.id,
      role,
    });
    changes.push("member");
  } else if (membership.role !== role) {
    if (
      membership.role === "owner" &&
      role !== "owner" &&
      (await countOwners(orgId)) <= 1
    ) {
      return apiError(
        409,
        "last_owner",
        "No se puede quitar el rol de propietario al único dueño de la instancia"
      );
    }
    await db
      .update(schema.member)
      .set({ role })
      .where(eq(schema.member.id, membership.id));
    changes.push("role");
  }

  return Response.json(
    { ok: true, created, email, role, active: true, changes },
    { status: created ? 201 : 200 }
  );
});

/** Baja explícita: DELETE /api/admin/users?email=… (quita la membresía). */
export const DELETE = withAdminKey(async (req: Request) => {
  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email) return apiError(422, "invalid_query", "Falta ?email=…");

  const orgId = await resolveInstanceOrg();
  if (!orgId) {
    return apiError(
      409,
      "no_organization",
      "La instancia todavía no tiene organización"
    );
  }

  const user = await findUserByEmail(email);
  if (!user) return Response.json({ ok: true, email, removed: false });

  const out = await removeMembership(orgId, user.id);
  if ("error" in out) return out.error;
  return Response.json({ ok: true, email, removed: out.removed });
});
