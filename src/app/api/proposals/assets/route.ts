import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ProposalError, storeAsset } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  mime: z.string().trim().min(3).max(60),
  filename: z.string().trim().max(160).optional().nullable(),
  /** Base64 sin prefijo data: (máx ~2,5 MB decodificado). */
  data: z
    .string()
    .min(16)
    .max(4_000_000)
    .regex(/^[A-Za-z0-9+/=\s]+$/, "base64 inválido"),
});

/**
 * 041 — Sube una imagen (foto de la publicidad, logo del emisor). Queda en la
 * base del CRM: el disco del contenedor no persiste entre deploys.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  try {
    const id = await storeAsset({
      organizationId: session.organizationId,
      mime: body.data.mime,
      filename: body.data.filename ?? null,
      data: body.data.data,
    });
    return Response.json({ id, url: `/api/public/propuesta/img/${id}` }, { status: 201 });
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals assets] error:", err);
    return apiError(500, "internal", "No se pudo guardar la imagen");
  }
});
