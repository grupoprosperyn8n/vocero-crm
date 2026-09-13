import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  openConversationForContact,
  OpenConversationError,
} from "@/server/conversations/open";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  contactId: z.string().trim().min(1).max(80),
  /** Plataforma elegida por el operador; sin esto, la del contacto. */
  channel: z.enum(["whatsapp", "telegram"]).optional(),
});

/**
 * "Nueva conversación" desde el CRM: abre (o reabre) el hilo del contacto
 * para escribirle por WhatsApp o Telegram. Devuelve la conversación lista
 * para que la Bandeja la seleccione.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const result = await openConversationForContact({
      organizationId: session.organizationId,
      contactId: body.data.contactId,
      channel: body.data.channel,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof OpenConversationError) {
      return apiError(
        err.code === "not_found" ? 404 : 422,
        err.code,
        err.message
      );
    }
    throw err;
  }
});
