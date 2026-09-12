import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ClientLinkError, resolveOrLinkClient } from "@/server/clients/link";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  recordId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
});

/**
 * "Abrir chat" desde la tarjeta de un cliente del sistema de gestión:
 * resuelve (o crea) el contacto del CRM por teléfono normalizado, guarda el
 * vínculo `sgsa:<recordId>` y devuelve la conversación para escribir.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  try {
    const result = await resolveOrLinkClient({
      organizationId: session.organizationId,
      recordId: body.data.recordId,
      name: body.data.name,
      phone: body.data.phone ?? null,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof ClientLinkError) {
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
});
