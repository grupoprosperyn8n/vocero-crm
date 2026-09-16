import { z } from "zod";
import { apiError } from "@/lib/api";
import { ChatError } from "@/server/internal/chat";
import {
  markReviewStatus,
  resolveReviewsOrganizationId,
  reviewsConfigured,
  reviewsKeyOk,
} from "@/server/reviews/service";

export const dynamic = "force-dynamic";

/**
 * 033 — Estado de la revisión informado por el FLUJO (server-to-server).
 * Sirve para dos cosas:
 * - registrar una decisión tomada por Telegram (aprobado/detenido, `via`),
 * - mostrar en qué condición quedó el envío (enviado = despachado con
 *   detalle de qué se envió; trabado = quedó frenado con el motivo).
 * Actualiza la tarjeta del chat interno en el momento.
 * Auth: `Authorization: Bearer <REVIEWS_INBOUND_KEY>`.
 */

const bodySchema = z.object({
  recordId: z.string().min(1),
  estado: z.enum(["aprobado", "detenido", "enviado", "trabado"]),
  detalle: z.string().nullish(),
  via: z.string().nullish(),
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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "invalid_body", "Cuerpo inválido");
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(422, "invalid_status", "El estado no es válido");
  }
  const organizationId = await resolveReviewsOrganizationId();
  if (!organizationId) {
    return apiError(500, "no_org", "No hay una organización configurada");
  }
  try {
    const result = await markReviewStatus({
      organizationId,
      recordId: parsed.data.recordId,
      update: {
        estado: parsed.data.estado,
        detalle: parsed.data.detalle ?? null,
        via: parsed.data.via ?? null,
      },
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ChatError) {
      return apiError(err.status, err.code, err.message);
    }
    throw err;
  }
}
