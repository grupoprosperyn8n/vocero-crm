import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { resolveInstanceOrg } from "@/server/bot/auth";

export const dynamic = "force-dynamic";

/**
 * Lista de oficinas activas (sucursales). Público a propósito: la pantalla
 * de ingreso la necesita ANTES de la sesión para poblar el selector de
 * sucursal. Solo expone nombre/localidad — nada sensible.
 */
export const GET = async () => {
  const orgId = await resolveInstanceOrg();
  if (!orgId) return Response.json({ offices: [] });
  const db = getDb();
  const rows = await db
    .select({
      id: schema.office.id,
      name: schema.office.name,
      cleanName: schema.office.cleanName,
      locality: schema.office.locality,
      sortOrder: schema.office.sortOrder,
    })
    .from(schema.office)
    .where(
      scoped(
        schema.office.organizationId,
        orgId,
        eq(schema.office.active, true)
      )
    )
    .orderBy(
      sql`${schema.office.sortOrder} asc nulls last`,
      asc(schema.office.name)
    );
  return Response.json({ offices: rows });
};
