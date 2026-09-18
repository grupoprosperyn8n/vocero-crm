/**
 * 042b — EL MENSAJE VUELVE AL ASESOR.
 *
 * La página pública de una publicidad trae el botón «Hablar por WhatsApp» que
 * abre el chat del negocio con un texto ya escrito por el cliente; ese texto
 * incluye una referencia `(ref <token>)` de la propuesta. Cuando ese mensaje
 * entra al CRM, acá se busca la propuesta por token y, si tiene un empleado
 * derivado, se le avisa por el chat interno: el cliente que le respondió SU
 * publicidad le cae directo en su sala.
 *
 * Reglas:
 *  · Solo lectura/aviso: no toca Airtable, no asigna conversaciones ajenas.
 *  · Si el token no existe, la propuesta fue eliminada o no hay derivado a una
 *    persona (p. ej. derivada a la IA), no se avisa nada: la IA atiende.
 *  · Jamás tumba la ingesta: cualquier error se traga y se loguea.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { createDmRoom, postChatMessage } from "@/server/internal/chat";
import { ensureSystemUser } from "@/server/reviews/service";

/** «(ref _uqdOe1ZZb-S)» — el token viaja tal cual en el texto prellenado. */
const REF_RE = /\(ref[ :]([A-Za-z0-9_-]{8,32})\)/i;

export async function notifyProposalRef(input: {
  organizationId: string;
  text: string | null;
}): Promise<void> {
  const text = input.text;
  if (!text) return;
  const match = REF_RE.exec(text);
  if (!match) return;
  const token = match[1];
  if (!token) return;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.proposal.id,
      title: schema.proposal.title,
      kind: schema.proposal.kind,
      clientName: schema.proposal.clientName,
      assigneeUserId: schema.proposal.assigneeUserId,
      deletedAt: schema.proposal.deletedAt,
    })
    .from(schema.proposal)
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.token, token)
      )
    )
    .limit(1);
  const p = rows[0];
  if (!p || p.deletedAt || !p.assigneeUserId) return;

  // Aviso en la sala del empleado, firmado por el usuario de sistema (el
  // mismo que firma las tarjetas de revisión): le queda en su DM y no
  // depende de que haya alguien mirando el tablero.
  const systemUserId = await ensureSystemUser(input.organizationId);
  const room = await createDmRoom(input.organizationId, systemUserId, p.assigneeUserId);
  await postChatMessage({
    organizationId: input.organizationId,
    roomId: room.id,
    senderId: systemUserId,
    body: [
      `💬 ${p.clientName} respondió a tu publicidad`,
      `«${p.title}»`,
      "",
      "Atendelo desde el CRM: la conversación ya está en la bandeja.",
    ].join("\n"),
    system: true,
  });
}
