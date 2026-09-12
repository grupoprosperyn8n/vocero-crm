import { apiError, withAuth } from "@/lib/api";
import type { SystemClientSearchResultDto } from "@/lib/types";
import { matchContactsByPhoneKeys } from "@/server/clients/link";
import { phoneKey } from "@/server/clients/phone";
import {
  isSgsaConfigured,
  searchClients,
  SgsaError,
} from "@/server/clients/sgsa";

export const dynamic = "force-dynamic";

/**
 * Buscador de clientes contra el sistema de gestión de seguros (Airtable
 * SGSA). Devuelve cada cliente con el estado de su vínculo en el CRM para
 * que la tarjeta sepa si ya existe contacto/conversación acá.
 */
export const GET = withAuth(async (session, req: Request) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return apiError(400, "bad_request", "Escribí al menos 2 caracteres para buscar");
  }
  if (!isSgsaConfigured()) {
    return apiError(
      503,
      "not_configured",
      "El sistema de seguros todavía no está conectado a este CRM"
    );
  }

  let clients;
  try {
    clients = await searchClients(q);
  } catch (err) {
    return apiError(
      502,
      "sgsa_error",
      err instanceof SgsaError
        ? "El sistema de seguros no respondió. Probá de nuevo en un momento"
        : "Error consultando el sistema de seguros"
    );
  }

  const matches = await matchContactsByPhoneKeys(
    session.organizationId,
    clients.map((c) => phoneKey(c.telefono))
  );
  const results: SystemClientSearchResultDto[] = clients.map((client) => ({
    client,
    crm: matches.get(phoneKey(client.telefono)) ?? null,
  }));
  return Response.json({ results });
});
