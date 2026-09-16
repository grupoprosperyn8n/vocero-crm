import { and, eq } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ChatError } from "@/server/internal/chat";
import {
  getReviewAnalisis,
  reviewAssetsConfigured,
} from "@/server/reviews/assets";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ recordId: string }> };

/**
 * 033 — El análisis IA completo (campo «CULPABILIDAD IA») del registro en
 * revisión, servido como .txt exactamente igual que el documento que viaja a
 * Telegram. Solo para miembros del equipo con una revisión de ese registro.
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
    const text = await getReviewAnalisis(id);
    if (!text) {
      return apiError(
        404,
        "not_found",
        "El registro no tiene análisis IA asociado"
      );
    }
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="analisis-ia-${id}.txt"`,
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
