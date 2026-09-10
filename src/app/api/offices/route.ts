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

  // Nombre a mostrar: el limpio (NOMBRE_OFICINA_LIMPIO_WEB). Si dos oficinas
  // comparten el mismo nombre limpio (ej. "BLED GRAL" 7204 y 9513), se
  // desambiguan con localidad e interno extraídos del nombre crudo —
  // decisión Diego: "pone las dos".
  const display = rows.map((r) => ({
    ...r,
    displayName: (r.cleanName ?? r.name).trim(),
  }));
  const seen = new Map<string, number>();
  for (const o of display) {
    const k = o.displayName.toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const offices = display.map((o) => {
    if ((seen.get(o.displayName.toLowerCase()) ?? 0) < 2) return o;
    const tel = o.name.match(/\((\d+)\)\s*$/)?.[1] ?? null;
    const parts = [o.locality?.trim() || null, tel ? `int. ${tel}` : null].filter(
      (p): p is string => !!p
    );
    return {
      ...o,
      displayName: parts.length
        ? `${o.displayName} (${parts.join(" · ")})`
        : o.displayName,
    };
  });

  return Response.json({ offices });
};
