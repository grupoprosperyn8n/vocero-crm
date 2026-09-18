import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ProposalError, storeAsset } from "@/server/proposals/service";
import { loadLibraryAssetBytes } from "@/server/library/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  mime: z.string().trim().min(3).max(60).optional(),
  filename: z.string().trim().max(160).optional().nullable(),
  /**
   * Base64 sin prefijo `data:` (máx ~8 MB decodificado, antes de adaptar).
   * El charset se verifica sobre los extremos y no con un regex sobre los
   * ~9 MB completos: RegExp.test sobre una cadena de ese tamaño revienta la
   * pila de V8 (Maximum call stack size exceeded, visto en producción).
   */
  data: z
    .string()
    .min(16)
    .max(12_000_000)
    .refine(
      (s) =>
        /^[A-Za-z0-9+/\s]*$/.test(s.slice(0, 4096)) &&
        /^[A-Za-z0-9+/=\s]*$/.test(s.slice(-4096)),
      "base64 inválido"
    )
    .optional(),
  /**
   * 041d — Alternativa a subir bytes: copia un archivo del CONTENEDOR
   * universal (la imagen ya vive ahí y se elige para la publicidad).
   */
  libraryId: z
    .string()
    .trim()
    .regex(/^lib_[A-Za-z0-9_-]{4,40}$/, "id de biblioteca inválido")
    .optional()
    .nullable(),
});

/**
 * 041 — Guarda una imagen para la pieza (foto de la publicidad, logo del
 * emisor). Dos caminos: subir bytes (base64) o copiar del contenedor
 * universal elegido. Queda en la base del CRM: el disco del contenedor no
 * persiste entre deploys.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;

  const { mime, filename, data, libraryId } = body.data;

  try {
    if (libraryId) {
      const file = await loadLibraryAssetBytes({
        organizationId: session.organizationId,
        id: libraryId,
      });

      if (!file) {
        return apiError(404, "not_found", "El archivo elegido ya no está");
      }

      if (!file.mime.startsWith("image/")) {
        return apiError(
          415,
          "not_an_image",
          "Para la pieza elegí una imagen del contenedor"
        );
      }

      const id = await storeAsset({
        organizationId: session.organizationId,
        mime: file.mime,
        filename: file.name,
        data: file.data.toString("base64"),
      });

      return Response.json({ id, url: `/api/public/propuesta/img/${id}` }, { status: 201 });
    }

    if (!mime || !data) {
      return apiError(422, "invalid_body", "Faltan la imagen o el archivo elegido");
    }

    const id = await storeAsset({
      organizationId: session.organizationId,
      mime,
      filename: filename ?? null,
      data,
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
