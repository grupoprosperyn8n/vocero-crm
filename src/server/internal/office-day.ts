import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * 023 — Sucursal del día.
 *
 * Los empleados rotan entre oficinas: al entrar al CRM marcan dónde están
 * trabajando hoy (el selector vive en el nav). Queda el registro diario
 * empleado | fecha | oficina y se puede cambiar durante el mismo día
 * (upsert sobre la fila del día). La fecha es la del negocio
 * (America/Argentina/Buenos_Aires), no UTC: a las 22:00 de Argentina ya es
 * "mañana" en UTC pero sigue siendo el día en curso para el equipo.
 */

/** Error de dominio para las rutas de sucursal (mismo shape que ChatError). */
export class OfficeDayError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "OfficeDayError";
  }
}

/** Clave de día local del negocio (-03), formato YYYY-MM-DD. */
export function artDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type TodayOffice = {
  officeId: string;
  displayName: string;
  locality: string | null;
  selectedAt: string;
};

/** La sucursal marcada hoy por el empleado (null si todavía no eligió). */
export async function getTodayOffice(
  organizationId: string,
  userId: string
): Promise<TodayOffice | null> {
  const rows = await getDb()
    .select({
      officeId: schema.staffOfficeDay.officeId,
      name: schema.office.name,
      cleanName: schema.office.cleanName,
      locality: schema.office.locality,
      selectedAt: schema.staffOfficeDay.selectedAt,
    })
    .from(schema.staffOfficeDay)
    .innerJoin(
      schema.office,
      eq(schema.office.id, schema.staffOfficeDay.officeId)
    )
    .where(
      and(
        eq(schema.staffOfficeDay.organizationId, organizationId),
        eq(schema.staffOfficeDay.userId, userId),
        eq(schema.staffOfficeDay.day, artDayKey())
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    officeId: row.officeId,
    displayName: (row.cleanName ?? row.name).trim(),
    locality: row.locality,
    selectedAt: row.selectedAt.toISOString(),
  };
}

/** Marca (o cambia) la sucursal de hoy. Una fila por empleado y día. */
export async function setTodayOffice(input: {
  organizationId: string;
  userId: string;
  officeId: string;
}): Promise<TodayOffice> {
  const officeId = String(input.officeId ?? "").trim();
  if (!officeId) {
    throw new OfficeDayError(422, "invalid_office", "Elegí una sucursal");
  }
  const db = getDb();
  const officeRows = await db
    .select({ id: schema.office.id })
    .from(schema.office)
    .where(
      and(
        eq(schema.office.organizationId, input.organizationId),
        eq(schema.office.id, officeId),
        eq(schema.office.active, true)
      )
    )
    .limit(1);
  if (!officeRows[0]) {
    throw new OfficeDayError(
      422,
      "unknown_office",
      "Esa sucursal no existe o está inactiva"
    );
  }
  const now = new Date();
  const day = artDayKey(now);
  await db
    .insert(schema.staffOfficeDay)
    .values({
      id: newId("staffOfficeDay"),
      organizationId: input.organizationId,
      userId: input.userId,
      officeId,
      day,
      selectedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.staffOfficeDay.organizationId,
        schema.staffOfficeDay.userId,
        schema.staffOfficeDay.day,
      ],
      set: { officeId, selectedAt: now, updatedAt: now },
    });
  const today = await getTodayOffice(input.organizationId, input.userId);
  if (!today) {
    throw new OfficeDayError(500, "not_saved", "No se pudo guardar la sucursal");
  }
  return today;
}
