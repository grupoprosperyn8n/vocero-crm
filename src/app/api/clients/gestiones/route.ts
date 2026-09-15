import { apiError, withAuth } from "@/lib/api";
import { isSgsaConfigured, SgsaError } from "@/server/clients/sgsa";
import { searchGestiones } from "@/server/clients/gestiones";

export const dynamic = "force-dynamic";

/**
 * 030 — buscador de GESTIONES del sistema (GESTIÓN GENERAL) para sumarlas al
 * pipeline de gestiones como tarjetas. Solo lectura contra Airtable.
 */
export const GET = withAuth(async (_session, req: Request) => {
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

  try {
    const results = await searchGestiones(q, 12);
    return Response.json({ results });
  } catch (err) {
    return apiError(
      502,
      "sgsa_error",
      err instanceof SgsaError
        ? "El sistema de seguros no respondió. Probá de nuevo en un momento"
        : "Error consultando el sistema de seguros"
    );
  }
});
