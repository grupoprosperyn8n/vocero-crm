import { desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { updateConversation } from "@/server/inbox/queries";
import type { ClientConversationDto, ClientCrmMatchDto } from "@/lib/types";
import { phoneDigits, phoneKey } from "@/server/clients/phone";

export class ClientLinkError extends Error {
  constructor(
    public readonly code: "no_phone",
    message: string
  ) {
    super(message);
    this.name = "ClientLinkError";
  }
}

/**
 * Expresión SQL de la llave del teléfono, espejo de `phoneKey()`: solo
 * dígitos → sin prefijo 54 → sin 9 siguiente → últimos 10. Los contactos web
 * quedan afuera en las consultas: su identidad es un token, no un número.
 */
const keyExpr = sql`right(regexp_replace(regexp_replace(regexp_replace(
  coalesce(${schema.contact.phone}, ${schema.contact.waIdentity}, ''), '[^0-9]', '', 'g'
), '^54', ''), '^9', ''), 10)`;

async function conversationsFor(
  organizationId: string,
  contactIds: string[]
): Promise<Map<string, ClientConversationDto[]>> {
  const out = new Map<string, ClientConversationDto[]>();
  if (!contactIds.length) return out;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.conversation.id,
      contactId: schema.conversation.contactId,
      channel: schema.conversation.channel,
      isTest: schema.conversation.isTest,
      closedAt: schema.conversation.closedAt,
      lastMessageAt: schema.conversation.lastMessageAt,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        inArray(schema.conversation.contactId, contactIds)
      )
    )
    .orderBy(
      desc(
        sql`coalesce(${schema.conversation.lastMessageAt}, ${schema.conversation.createdAt})`
      )
    );
  for (const r of rows) {
    const list = out.get(r.contactId) ?? [];
    if (list.length < 4) {
      list.push({
        id: r.id,
        channel: r.channel,
        closed: Boolean(r.closedAt),
        isTest: r.isTest,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      });
    }
    out.set(r.contactId, list);
  }
  return out;
}

/**
 * Contactos del CRM cuyo teléfono coincide con las llaves dadas (mismo
 * algoritmo que `phoneKey`). Si dos contactos comparten número, gana el real
 * más nuevo — un contacto marcado como prueba nunca pisa a uno real.
 */
export async function matchContactsByPhoneKeys(
  organizationId: string,
  keys: string[]
): Promise<Map<string, ClientCrmMatchDto>> {
  const out = new Map<string, ClientCrmMatchDto>();
  const clean = Array.from(new Set(keys.filter((k) => k.length >= 8)));
  if (!clean.length) return out;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.contact.id,
      name: schema.contact.name,
      phone: schema.contact.phone,
      channel: schema.contact.channel,
      isTest: schema.contact.isTest,
      archivedAt: schema.contact.archivedAt,
      key: keyExpr,
    })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        inArray(keyExpr, clean),
        ne(schema.contact.channel, "web")
      )
    )
    .orderBy(desc(schema.contact.createdAt));
  const convs = await conversationsFor(
    organizationId,
    rows.map((r) => r.id)
  );
  for (const r of rows) {
    const k = String(r.key ?? "");
    const prev = out.get(k);
    if (!prev || (prev.isTest && !r.isTest)) {
      out.set(k, {
        contactId: r.id,
        name: r.name,
        phone: r.phone,
        channel: r.channel,
        isTest: r.isTest,
        archivedAt: r.archivedAt?.toISOString() ?? null,
        conversations: convs.get(r.id) ?? [],
      });
    }
  }
  return out;
}

export type ResolveClientResult = {
  contactId: string;
  conversationId: string;
  created: boolean;
  reopened: boolean;
};

/**
 * "Abrir chat" con un cliente del sistema de gestión: encuentra (o crea) el
 * contacto del CRM por teléfono normalizado, guarda el vínculo
 * `sgsa:<recordId>` y devuelve la conversación lista para escribir. Si la
 * conversación estaba cerrada, se reabre: el gesto "abrir chat" significa
 * exactamente eso.
 */
export async function resolveOrLinkClient(input: {
  organizationId: string;
  recordId: string;
  name: string;
  phone: string | null;
}): Promise<ResolveClientResult> {
  const digits = phoneDigits(input.phone);
  if (digits.length < 8) {
    throw new ClientLinkError(
      "no_phone",
      "El cliente no tiene teléfono en el sistema: no hay a dónde escribirle"
    );
  }
  const key = phoneKey(digits);
  const externalRef = `sgsa:${input.recordId}`;
  const db = getDb();

  const found = await db
    .select({ id: schema.contact.id, externalRef: schema.contact.externalRef })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        inArray(keyExpr, [key]),
        ne(schema.contact.channel, "web")
      )
    )
    .orderBy(schema.contact.isTest, desc(schema.contact.createdAt))
    .limit(1);

  let contactId = found[0]?.id ?? null;
  let created = false;
  if (contactId) {
    if (found[0] && found[0].externalRef !== externalRef) {
      await db
        .update(schema.contact)
        .set({ externalRef, updatedAt: new Date() })
        .where(eq(schema.contact.id, contactId));
    }
  } else {
    const inserted = await db
      .insert(schema.contact)
      .values({
        id: newId("contact"),
        organizationId: input.organizationId,
        channel: "whatsapp",
        waIdentity: digits,
        phone: digits,
        name: input.name,
        // El nombre viene del sistema de gestión: ninguna actualización del
        // perfil de WhatsApp debe pisarlo.
        nameSource: "manual",
        externalRef,
      })
      .onConflictDoNothing()
      .returning({ id: schema.contact.id });
    contactId = inserted[0]?.id ?? null;
    created = Boolean(contactId);
    if (!contactId) {
      // Carrera con otra alta: releer por identidad (org + canal + llave).
      const again = await db
        .select({ id: schema.contact.id })
        .from(schema.contact)
        .where(
          scoped(
            schema.contact.organizationId,
            input.organizationId,
            eq(schema.contact.channel, "whatsapp"),
            eq(schema.contact.waIdentity, digits)
          )
        )
        .limit(1);
      contactId = again[0]?.id ?? null;
    }
    if (!contactId) throw new Error("no se pudo crear el contacto");
  }

  const existing = await db
    .select({ id: schema.conversation.id, closedAt: schema.conversation.closedAt })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);

  let conversationId: string;
  let reopened = false;
  if (existing[0]) {
    conversationId = existing[0].id;
    if (existing[0].closedAt) {
      await updateConversation(input.organizationId, conversationId, {
        reactivate: true,
      });
      reopened = true;
    }
  } else {
    const conv = await getOrCreateConversation(input.organizationId, contactId);
    conversationId = conv.id;
  }

  return { contactId, conversationId, created, reopened };
}
