import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { withAdminKey } from "@/server/admin/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { resolveInstanceOrg } from "@/server/bot/auth";

export const dynamic = "force-dynamic";

/**
 * Sync v2 — espejo de OFICINAS (Airtable) para el CRM.
 *
 * El productor manda el listado completo; acá se hace upsert por
 * `externalId` (el rec de Airtable) y las oficinas que ya no vienen en el
 * listado quedan `active=false` — una baja en el origen desaparece de la
 * lista sin romper referencias. Las oficinas activas alimentan el selector
 * de sucursal del ingreso y la lectura administrativa.
 */

const officeSchema = z.object({
  externalId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  cleanName: z.string().trim().max(160).nullable().optional(),
  locality: z.string().trim().max(160).nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
});

const bodySchema = z.object({
  offices: z.array(officeSchema).max(1000),
});

type OfficeRow = typeof schema.office.$inferSelect;
type OfficeNext = {
  name: string;
  cleanName: string | null;
  locality: string | null;
  sortOrder: number | null;
};

function sameOffice(row: OfficeRow, next: OfficeNext): boolean {
  return (
    row.active &&
    row.name === next.name &&
    row.cleanName === next.cleanName &&
    row.locality === next.locality &&
    row.sortOrder === next.sortOrder
  );
}

export const PUT = withAdminKey(async (req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const orgId = await resolveInstanceOrg();
  if (!orgId) {
    return apiError(
      409,
      "no_organization",
      "La instancia todavía no tiene organización"
    );
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(schema.office)
    .where(scoped(schema.office.organizationId, orgId));
  const byExternal = new Map(existing.map((r) => [r.externalId, r]));

  let upserted = 0;
  for (const o of body.data.offices) {
    const next: OfficeNext = {
      name: o.name,
      cleanName: o.cleanName ?? null,
      locality: o.locality ?? null,
      sortOrder: o.sortOrder ?? null,
    };
    const current = byExternal.get(o.externalId);
    if (!current) {
      await db.insert(schema.office).values({
        id: newId("office"),
        organizationId: orgId,
        externalId: o.externalId,
        ...next,
      });
      upserted += 1;
    } else if (!sameOffice(current, next)) {
      await db
        .update(schema.office)
        .set({ ...next, active: true, updatedAt: new Date() })
        .where(eq(schema.office.id, current.id));
      upserted += 1;
    }
  }

  // Baja suave de las ausentes: desaparecen de la lista sin romper nada.
  const seen = new Set(body.data.offices.map((o) => o.externalId));
  const gone = existing.filter((r) => r.active && !seen.has(r.externalId));
  for (const r of gone) {
    await db
      .update(schema.office)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.office.id, r.id));
  }

  return Response.json({
    ok: true,
    total: body.data.offices.length,
    upserted,
    deactivated: gone.length,
  });
});

/** Estado completo (incluye inactivas) para consistencia del productor. */
export const GET = withAdminKey(async () => {
  const orgId = await resolveInstanceOrg();
  if (!orgId) return Response.json({ offices: [] });
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.office)
    .where(scoped(schema.office.organizationId, orgId));
  return Response.json({
    offices: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      name: r.name,
      cleanName: r.cleanName,
      locality: r.locality,
      sortOrder: r.sortOrder,
      active: r.active,
    })),
  });
});
