import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { normalizeMx } from "@/lib/meta/client";
import { digitsOnly, normalizeText } from "@/lib/search";
import { avatarUrlsForContacts } from "@/server/avatars";
import { serializeContact } from "@/server/contacts";

export const dynamic = "force-dynamic";

/**
 * Búsqueda tolerante en SQL, espejo de `matchesQuery` del cliente:
 * - nombre sin acentos ni mayúsculas (`translate`, sin depender de la
 *   extensión `unaccent`, que exigiría privilegios en la BD);
 * - teléfono por DÍGITOS, para poder teclearlo como se ve ("+52 462 134…").
 */
const UNACCENT_FROM = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const UNACCENT_TO = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const stage = url.searchParams.get("stage")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();

  // Etapa de cada contacto en una consulta aparte: una subconsulta
  // correlacionada aquí choca con el `id` de `lead` ("column reference id is
  // ambiguous"), y un join duplicaría contactos con más de un lead.
  // 029 — la etapa que se muestra es la de MIS tarjetas (pipeline personal):
  // el pipeline de otro no pinta nada en mi lista de Contactos.
  const leadStages = await db
    .select({
      contactId: schema.lead.contactId,
      stageName: schema.pipelineStage.name,
      priority: schema.lead.priority,
    })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.pipelineStage.id, schema.lead.stageId)
    )
    .where(
      scoped(
        schema.lead.organizationId,
        session.organizationId,
        and(
          eq(schema.lead.board, "ventas"),
          eq(schema.lead.ownerUserId, session.userId)
        )
      )
    );
  const stageByContact = new Map<string, string>();
  const priorityByContact = new Map<string, (typeof leadStages)[number]["priority"]>();
  for (const r of leadStages) {
    if (!r.contactId) continue;
    stageByContact.set(r.contactId, r.stageName);
    priorityByContact.set(r.contactId, r.priority);
  }

  const qDigits = q ? digitsOnly(q) : "";
  // El patrón viaja normalizado igual que la columna, y con los comodines de
  // LIKE escapados para que un "%" tecleado no liste todo.
  const qLike = q ? normalizeText(q).replace(/[\\%_]/g, "\\$&") : "";
  const search =
    q && q.length > 0
      ? or(
          sql`lower(translate(${schema.contact.name}, ${UNACCENT_FROM}, ${UNACCENT_TO}))
              like ${`%${qLike}%`}`,
          // Un dígito suelto barrería el directorio entero: mínimo 3.
          qDigits.length >= 3
            ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g')
                  like ${`%${qDigits}%`}`
            : undefined
        )
      : undefined;

  // El filtro de etapa se aplica ANTES del límite: si no, un contacto de la
  // etapa buscada podría quedar fuera por el corte de 200.
  const stageContactIds = stage
    ? leadStages
        .filter((r) => r.stageName === stage && r.contactId)
        .map((r) => r.contactId as string)
    : null;
  if (stageContactIds?.length === 0) return Response.json({ contacts: [] });

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        search,
        // Los clientes del sistema (`external_ref` = `sgsa:<recordId>`) NO son
        // contactos del CRM: viven en su propio segmento de búsqueda. Pedido
        // Diego 2026-09-13: "no se tiene que unir, son dos canales distintos:
        // el del CRM son los nuevos prospectos y el del backend es el del
        // sistema".
        sql`(${schema.contact.externalRef} is null or ${schema.contact.externalRef} not like 'sgsa:%')`,
        stageContactIds ? inArray(schema.contact.id, stageContactIds) : undefined
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const visibles = rows.filter((c) => includeArchived || !c.archivedAt);
  // 035 — foto de cada contacto (una sola lectura para toda la lista).
  const avatares = await avatarUrlsForContacts(
    visibles.map((c) => ({
      id: c.id,
      channel: c.channel,
      waIdentity: c.waIdentity,
      phone: c.phone,
    }))
  );
  const contacts = visibles.map((c) =>
    serializeContact(
      c,
      stageByContact.get(c.id) ?? null,
      priorityByContact.get(c.id) ?? null,
      avatares.get(c.id) ?? null
    )
  );
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /**
   * EXIGE código de país. Un número local crearía un contacto que jamás casaría
   * con los mensajes entrantes —Meta siempre manda la identidad completa— y el
   * dueño acabaría con dos fichas de la misma persona. No se asume un país:
   * diez dígitos son válidos en varios, y asumir mal produce un número
   * silenciosamente equivocado.
   */
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Teléfono en dígitos, con código de país (ej. 5215512345678)"),
  notes: z.string().max(4000).optional(),
  source: z.enum(["anuncio", "organico", "referido", "conocido", "otro"]).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  // 003: la identidad WhatsApp se deriva del teléfono normalizado.
  const phone = normalizeMx(body.data.phone);
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone,
      waIdentity: phone,
      notes: body.data.notes ?? null,
      source: body.data.source ?? null,
    })
    // El canal entra en el target porque entra en el índice único desde 014
    // (`contact_org_channel_identity_uq`). Postgres exige que el ON CONFLICT
    // nombre EXACTAMENTE las columnas de un índice existente: sin `channel`,
    // el alta manual falla con "no unique or exclusion constraint matching".
    .onConflictDoNothing({
      target: [
        schema.contact.organizationId,
        schema.contact.channel,
        schema.contact.waIdentity,
      ],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Ya existe un contacto con ese teléfono");
  }

  // 029 — el pipeline es PERSONAL y se llena a mano: dar de alta un contacto
  // NO lo mete en ningún tablero. Se agrega desde el chat, su ficha o la
  // tarjeta de origen, que es donde el gesto significa algo.
  return Response.json({ contact: serializeContact(inserted[0]) }, { status: 201 });
});
