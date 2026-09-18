import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { ProposalError, storeAssetFull } from "@/server/proposals/service";
import { loadLibraryAssetBytes } from "@/server/library/service";

export const dynamic = "force-dynamic";

const schema = z.object({
  mime: z.string().trim().min(3).max(60).optional(),
  filename: z.string().trim().max(160).optional().nullable(),
  /**
   * Base64 sin prefijo `data:` (máx ~42 MB decodificado, video incluido).
   * El charset se verifica sobre los extremos y no con un regex sobre los
   * ~53 M chars completos: RegExp.test sobre una cadena de ese tamaño revienta
   * la pila de V8 (Maximum call stack size exceeded, visto en producción).
   * Ojo: el `=` del padding solo puede ir al final; cuando el texto es más
   * corto que el tramo, el primer slice ES el string completo — por eso el
   * primer tramo se exige sin `=` únicamente si el payload es largo (bug de
   * prod 042: una foto chica daba 422 por el `=` del final).
   */
  data: z
    .string()
    .min(16)
    .max(56_000_000)
    .refine(
      (s) =>
        (s.length <= 4096 || /^[A-Za-z0-9+/\s]*$/.test(s.slice(0, 4096))) &&
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
  /** 042 — para qué se elige: los medios aceptan video, el logo no. */
  purpose: z.enum(["media", "logo"]).optional(),
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

  const { mime, filename, data, libraryId, purpose } = body.data;

  try {
    if (libraryId) {
      const file = await loadLibraryAssetBytes({
        organizationId: session.organizationId,
        id: libraryId,
      });

      if (!file) {
        return apiError(404, "not_found", "El archivo elegido ya no está");
      }

      const esVideo = file.mime.startsWith("video/");
      if (!file.mime.startsWith("image/") && !(esVideo && purpose === "media")) {
        return apiError(
          415,
          "not_an_image",
          esVideo
            ? "Ese archivo es un video: usalo en los medios de la publicidad, no como logo"
            : "Para la pieza elegí una imagen del contenedor"
        );
      }

      const stored = await storeAssetFull({
        organizationId: session.organizationId,
        mime: file.mime,
        filename: file.name,
        data: file.data.toString("base64"),
      });

      return Response.json(
        { id: stored.id, mime: stored.mime, url: `/api/public/propuesta/img/${stored.id}` },
        { status: 201 }
      );
    }

    if (!mime || !data) {
      return apiError(422, "invalid_body", "Faltan la imagen o el archivo elegido");
    }

    // 042 — el logo va con imagen; el video es solo para los medios.
    if (purpose === "logo" && mime.toLowerCase().startsWith("video/")) {
      return apiError(
        415,
        "not_an_image",
        "El logo va con una imagen: el video se usa en los medios de la publicidad"
      );
    }

    const stored = await storeAssetFull({
      organizationId: session.organizationId,
      mime,
      filename: filename ?? null,
      data,
    });

    return Response.json(
      { id: stored.id, mime: stored.mime, url: `/api/public/propuesta/img/${stored.id}` },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof ProposalError) {
      return apiError(err.status, err.code, err.message);
    }
    console.error("[api/proposals assets] error:", err);
    return apiError(500, "internal", "No se pudo guardar la imagen");
  }
});
