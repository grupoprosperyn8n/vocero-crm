import { apiError, withAuth } from "@/lib/api";
import { seedTemplateCatalog } from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

/**
 * 044b-B13 — carga el catálogo semilla de Plantillas de Meta (43 plantillas
 * segmentadas + su pieza pre-cargada para el Constructor). Idempotente.
 */
export const POST = withAuth(async (session) => {
  try {
    const result = await seedTemplateCatalog(session.organizationId);
    return Response.json({
      ok: true,
      templates: result.templates,
      pieces: result.pieces,
    });
  } catch (err) {
    console.error("[api/templates/seed] error:", err);
    return apiError(500, "internal", "No se pudo cargar el catálogo");
  }
});
