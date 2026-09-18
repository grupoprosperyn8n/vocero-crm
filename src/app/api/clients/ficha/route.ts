import { apiError, withAuth } from "@/lib/api";
import { FichaError, getClientFicha } from "@/server/clients/ficha";
import { isSgsaConfigured } from "@/server/clients/sgsa";

export const dynamic = "force-dynamic";

/**
 * 041 — Ficha 360° del cliente para el panel de control del CRM.
 * Solo lectura contra el sistema de gestión (Airtable SGSA).
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const recordId = (url.searchParams.get("recordId") ?? "").trim();
  if (!/^rec[A-Za-z0-9]{4,30}$/.test(recordId)) {
    return apiError(400, "bad_request", "Cliente inválido");
  }
  if (!isSgsaConfigured()) {
    return apiError(
      503,
      "not_configured",
      "El sistema de seguros todavía no está conectado a este CRM"
    );
  }

  try {
    const ficha = await getClientFicha({
      organizationId: session.organizationId,
      recordId,
      force: url.searchParams.get("refresh") === "1",
    });
    return Response.json({ ficha });
  } catch (err) {
    if (err instanceof FichaError) {
      return apiError(err.status, "ficha_error", err.message);
    }
    console.error("[ficha] error no controlado:", err);
    return apiError(
      502,
      "sgsa_error",
      "No se pudo armar la ficha del cliente. Probá de nuevo en un momento"
    );
  }
});
