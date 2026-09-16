import { z } from "zod";
import { apiError } from "@/lib/api";
import { sanitizeReviewShare } from "@/server/internal/chat";
import {
  ingestReviewRequest,
  postReviewAviso,
  resolveReviewsOrganizationId,
  reviewsConfigured,
  reviewsKeyOk,
} from "@/server/reviews/service";

export const dynamic = "force-dynamic";

/**
 * 033 — Entrada server-to-server desde n8n (dual con Telegram).
 *
 * Dos modos, `kind`:
 * - `review` (default): un registro entró en revisión → publica la tarjeta
 *   con el demo del mensaje al cliente, el audio y el análisis IA, más los
 *   botones ✅/🛑 en el chat interno.
 * - `aviso`: espejo fiel de los avisos del bot de monitoreo (⚠️/🚨: error de
 *   envío, caso ya procesado, error de workflow…) como mensaje del sistema.
 *
 * Auth: `Authorization: Bearer <REVIEWS_INBOUND_KEY>`.
 */

const reviewSchema = z.object({
  recordId: z.string().min(1),
  cliente: z.string().nullish(),
  titulo: z.string().nullish(),
  canales: z.string().nullish(),
  asuntoEmail: z.string().nullish(),
  emailTo: z.string().nullish(),
  whatsappTo: z.string().nullish(),
  reintento: z.boolean().optional(),
  mensaje: z.string().min(1),
});

const avisoSchema = z.object({
  texto: z.string().min(1),
  recordId: z.string().nullish(),
  titulo: z.string().nullish(),
});

export async function POST(req: Request) {
  if (!reviewsConfigured()) {
    return apiError(
      503,
      "not_configured",
      "La revisión por chat interno no está configurada"
    );
  }
  if (!reviewsKeyOk(req.headers.get("authorization"))) {
    return apiError(401, "unauthorized", "Credencial inválida");
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido");
  }
  if (!payload || typeof payload !== "object") {
    return apiError(400, "invalid_body", "Cuerpo inválido");
  }
  const raw = payload as Record<string, unknown>;
  const organizationId = await resolveReviewsOrganizationId();
  if (!organizationId) {
    return apiError(500, "no_org", "No hay una organización configurada");
  }
  if (raw.kind === "aviso") {
    const parsed = avisoSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(422, "invalid_aviso", "El aviso no es válido");
    }
    const texto = parsed.data.texto.trim();
    if (!texto) {
      return apiError(422, "invalid_aviso", "El aviso está vacío");
    }
    const result = await postReviewAviso({
      organizationId,
      texto,
      recordId: parsed.data.recordId ?? null,
    });
    return Response.json({ ok: true, ...result });
  }
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(422, "invalid_review", "La revisión de envío no es válida");
  }
  const review = sanitizeReviewShare({
    ...parsed.data,
    reintento: parsed.data.reintento === true,
  });
  if (!review) {
    return apiError(422, "invalid_review", "La revisión de envío no es válida");
  }
  const result = await ingestReviewRequest({ organizationId, review });
  return Response.json({ ok: true, ...result });
}
