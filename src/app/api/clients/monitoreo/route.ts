import { apiError, withAuth } from "@/lib/api";
import { isSgsaConfigured } from "@/server/clients/sgsa";
import { getClientMonitoreo } from "@/server/clients/monitoreo";

export const dynamic = "force-dynamic";

/**
 * 044b-B14 — Monitoreo del cliente para su dashboard: alertas y
 * calificaciones que SGSA dejó en Airtable. Solo lectura.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const recordId = (url.searchParams.get("recordId") ?? "").trim() || null;
  const name = (url.searchParams.get("name") ?? "").trim() || null;
  const dni = (url.searchParams.get("dni") ?? "").trim() || null;

  if (!recordId && !name) {
    return apiError(400, "bad_request", "Indicá el cliente (recordId o nombre)");
  }
  if (!isSgsaConfigured()) {
    return apiError(
      503,
      "not_configured",
      "El sistema de seguros todavía no está conectado a este CRM"
    );
  }

  try {
    const monitoreo = await getClientMonitoreo({ recordId, name, dni });
    return Response.json({ ok: true, monitoreo });
  } catch (err) {
    console.error("[clients/monitoreo] error no controlado:", err);
    return apiError(
      502,
      "sgsa_error",
      "No se pudo leer el monitoreo del cliente. Probá de nuevo en un momento"
    );
  }
});
