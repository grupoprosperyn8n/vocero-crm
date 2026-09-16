import { and, desc, eq, sql } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { seesWholeTeam } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * 037 — las TAREAS de UNA entidad: el checklist de todo lo que afecta a un
 * contacto, una alerta o un siniestro.
 *
 * `originKind=contact` matchea por la columna `contact_id` (vínculo real);
 * alerta / siniestro / cliente van en `meta.origin` ({kind, ref, label}).
 * Alcance gemelo del tablero: un member ve solo lo suyo; los roles de
 * gestión ven el del equipo.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const originKind = (url.searchParams.get("originKind") ?? "").trim();
  const ref = (url.searchParams.get("ref") ?? "").trim();
  if (!originKind || !ref || originKind.length > 24 || ref.length > 200) {
    return apiError(422, "missing_origin", "Falta el origen de la consulta");
  }

  const db = getDb();
  const conds = [eq(schema.lead.board, "tareas")];
  if (!seesWholeTeam(session.role)) {
    conds.push(eq(schema.lead.ownerUserId, session.userId));
  }
  if (originKind === "contact") {
    conds.push(eq(schema.lead.contactId, ref));
  } else {
    conds.push(sql`${schema.lead.meta}->>'originKind' = ${originKind}`);
    conds.push(sql`${schema.lead.meta}->>'originRef' = ${ref}`);
  }

  const rows = await db
    .select({
      id: schema.lead.id,
      label: schema.lead.label,
      notes: schema.lead.notes,
      dueAt: schema.lead.dueAt,
      completedAt: schema.lead.completedAt,
      priority: schema.lead.priority,
      ownerUserId: schema.lead.ownerUserId,
      ownerName: schema.user.name,
    })
    .from(schema.lead)
    .leftJoin(schema.user, eq(schema.lead.ownerUserId, schema.user.id))
    .where(scoped(schema.lead.organizationId, session.organizationId, and(...conds)))
    .orderBy(
      sql`${schema.lead.completedAt} IS NOT NULL`,
      sql`${schema.lead.dueAt} ASC NULLS LAST`,
      desc(schema.lead.createdAt)
    )
    .limit(100);

  return Response.json({
    tasks: rows.map((t) => ({
      id: t.id,
      label: t.label,
      notes: t.notes,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      priority: t.priority,
      ownerUserId: t.ownerUserId,
      ownerName: t.ownerName,
    })),
  });
});
