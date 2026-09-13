import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { updateConversation } from "@/server/inbox/queries";

export class OpenConversationError extends Error {
  constructor(
    public readonly code: "not_found" | "channel_mismatch" | "no_identity",
    message: string
  ) {
    super(message);
    this.name = "OpenConversationError";
  }
}

/** Plataformas que se pueden elegir a mano desde el CRM (pedido Diego). */
export type OpenableChannel = "whatsapp" | "telegram";

export type OpenConversationResult = {
  conversationId: string;
  channel: string;
  created: boolean;
  reopened: boolean;
};

const label = (c: string) => CHANNEL_LABEL[c as Channel] ?? c;

/**
 * "Nueva conversación" (2026-09-13): abre el hilo de un contacto para
 * escribirle desde la Bandeja — lo crea si nunca existió, lo reabre si estaba
 * cerrado, y si ya estaba esperando lo devuelve tal cual. Un contacto tiene
 * UN hilo real (índice `conversation_org_contact_real_uq`), así que no hay
 * ambigüedad.
 *
 * `channel` es la plataforma que eligió el operador. Si no coincide con la
 * identidad del contacto (te escribió por otro lado), no hay a dónde mandar
 * el mensaje: se avisa claro en vez de abrir un hilo muerto.
 */
export async function openConversationForContact(input: {
  organizationId: string;
  contactId: string;
  channel?: OpenableChannel;
}): Promise<OpenConversationResult> {
  const db = getDb();
  const contacts = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        eq(schema.contact.id, input.contactId)
      )
    )
    .limit(1);
  const contact = contacts[0];
  if (!contact) {
    throw new OpenConversationError("not_found", "Contacto no encontrado");
  }

  const own = contact.channel as string;
  if (input.channel && input.channel !== own) {
    throw new OpenConversationError(
      "channel_mismatch",
      `Este contacto no tiene ${label(input.channel)}: te escribió por ${label(own)}`
    );
  }
  if (!contact.waIdentity) {
    throw new OpenConversationError(
      "no_identity",
      "El contacto no tiene a dónde escribirle"
    );
  }

  const convs = await db
    .select({
      id: schema.conversation.id,
      closedAt: schema.conversation.closedAt,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.contactId, contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);
  const conv = convs[0];
  if (conv) {
    let reopened = false;
    if (conv.closedAt) {
      // Reabrir es exactamente lo que pidió el gesto "abrir conversación":
      // el hilo vuelve a la cola y se puede escribir (la ventana de cada
      // canal decide cómo).
      await updateConversation(input.organizationId, conv.id, {
        reactivate: true,
      });
      reopened = true;
    }
    return { conversationId: conv.id, channel: own, created: false, reopened };
  }

  const created = await getOrCreateConversation(
    input.organizationId,
    contact.id,
    { channel: contact.channel }
  );
  return {
    conversationId: created.id,
    channel: own,
    created: true,
    reopened: false,
  };
}
