import { and, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ChatError } from "@/server/internal/chat";
import { getReviewAudio, reviewAssetsConfigured } from "@/server/reviews/assets";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

/**
 * 033 — El audio REAL del flujo (el mismo archivo que recibiría el cliente si
 * se aprueba el envío), servido fresco desde Airtable para el reproductor de
 * la tarjeta. Solo para miembros del equipo con una revisión de ese registro.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { recordId } = await ctx.params;
  const id = decodeURIComponent(recordId);
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
    return apiError(400, "invalid_record", "Registro inválido");
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.reviewRequest.id })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, session.organizationId),
        eq(schema.reviewRequest.recordId, id)
      )
    )
    .limit(1);
  if (!rows[0]) {
    return apiError(404, "not_found", "No hay una revisión para ese registro");
  }
  if (!reviewAssetsConfigured()) {
    return apiError(
      503,
      "not_configured",
      "Los adjuntos del sistema no están configurados en este CRM"
    );
  }
  try {
    const audio = await getReviewAudio(id);
    if (!audio) {
      return apiError(404, "not_found", "El registro no tiene audio asociado");
    }
    const upstream = await fetch(audio.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok || !upstream.body) {
      return apiError(502, "upstream", "No se pudo descargar el audio");
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Content-Disposition": `inline; filename="${audio.filename.replace(
          /[^A-Za-z0-9._-]/g,
          "_"
        )}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ChatError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
});
