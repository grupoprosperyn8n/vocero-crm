import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { effectiveSource } from "@/server/contact-source";
import type { FichaDto, PriorityValue } from "@/lib/types";

export function serializeContact(
  c: typeof schema.contact.$inferSelect,
  stageName: string | null = null,
  priority: PriorityValue | null = null
) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    notes: c.notes,
    channel: c.channel,
    isTest: c.isTest,
    createdAt: c.createdAt.toISOString(),
    stageName,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    source: effectiveSource(c.source),
    priority,
    // Viaja siempre, aunque esté vacía: la pantalla necesita distinguir "aún
    // no la han llenado" de "este contacto no la trae".
    ficha: (c.ficha as FichaDto | null) ?? {},
  };
}

export async function getContactById(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Etapa actual del lead del contacto (si existe), en el tablero de ventas
 *  DEL USUARIO que mira: el pipeline es personal (029). */
export async function getContactStage(
  organizationId: string,
  contactId: string,
  ownerUserId: string
) {
  const db = getDb();
  const rows = await db
    .select({ stage: schema.pipelineStage, lead: schema.lead })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.lead.stageId, schema.pipelineStage.id)
    )
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        and(
          eq(schema.lead.contactId, contactId),
          eq(schema.lead.ownerUserId, ownerUserId),
          eq(schema.lead.board, "ventas")
        )
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
