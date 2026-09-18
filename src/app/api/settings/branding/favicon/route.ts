import { rm } from "node:fs/promises";
import { apiError, withAuth } from "@/lib/api";
import {
  FAVICON_ASSET,
  MAX_FAVICON_UPLOAD_BYTES,
  MAX_FAVICON_VECTOR_BYTES,
  sniffFaviconMime,
  type FaviconMime,
} from "@/lib/favicon";
import { getBranding, saveBranding } from "@/server/branding";
import { normalizeBrandIcon } from "@/server/images/normalize";
import { mediaFilePath, saveMediaFile } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

/**
 * Subir el icono de la pestaña. El cuerpo va crudo con su `content-type`, sin
 * multipart: es un archivo suelto y montar un parser de formulario para eso
 * es trabajo que no compra nada.
 *
 * 041 — La imagen se ADAPTA: cualquier foto (HEIC del iPhone incluido) entra y
 * se guarda como PNG de 512×512, cuadrada o ajustada sin recortar según su
 * proporción. Antes había que traerla ya recortada y por debajo de 256 KB.
 * SVG e ICO pasan tal cual: ya están en el tamaño/formato que el navegador
 * quiere y rasterizarlos solo los empeora.
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede cambiar la marca");
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return apiError(422, "empty", "No llegó ningún archivo");
  }
  if (buf.byteLength > MAX_FAVICON_UPLOAD_BYTES) {
    return apiError(
      413,
      "too_large",
      `La imagen no puede pasar de ${Math.round(MAX_FAVICON_UPLOAD_BYTES / (1024 * 1024))} MB`
    );
  }

  // El tipo sale de los BYTES, no de lo que declare el cliente: decir
  // `image/png` y mandar un HTML es la forma clásica de colar un documento
  // donde se espera una imagen, y esto se sirve desde el mismo dominio.
  const mime = sniffFaviconMime(buf);
  if (!mime) {
    return apiError(
      422,
      "unsupported",
      "No pude leer la imagen. Probá con PNG, JPG, WebP, HEIC, AVIF, GIF, SVG o ICO."
    );
  }

  let guardado: Uint8Array = buf;
  let guardadoMime: FaviconMime = mime;

  if (mime === "image/svg+xml" || mime === "image/x-icon") {
    if (buf.byteLength > MAX_FAVICON_VECTOR_BYTES) {
      return apiError(
        413,
        "too_large",
        `El icono vectorial no puede pasar de ${Math.round(MAX_FAVICON_VECTOR_BYTES / 1024)} KB`
      );
    }
  } else {
    // Raster: se adapta al tamaño que necesita la interfaz.
    try {
      const normalizada = await normalizeBrandIcon(buf);
      guardado = normalizada.data;
      guardadoMime = normalizada.mime;
    } catch (err) {
      console.error("[branding/favicon] no se pudo normalizar:", err);
      return apiError(422, "unreadable", "No pude procesar esa imagen");
    }
  }

  await saveMediaFile(session.organizationId, FAVICON_ASSET, guardado);

  const branding = await getBranding(session.organizationId);
  // Marca de tiempo y no un contador: al quitar el icono no queda dónde
  // recordar por cuál íbamos, así que un contador reiniciaría en 1 y la URL
  // `?v=u1` sería la MISMA que la del logo anterior — el navegador seguiría
  // enseñando el viejo, que es justo lo que este número existe para evitar.
  const version = Date.now();
  await saveBranding(session.organizationId, {
    ...branding,
    favicon: { mime: guardadoMime, version },
  });

  return Response.json({ favicon: { mime: guardadoMime, version } });
});

/** Quitar el subido y volver al generado de la marca. */
export const DELETE = withAuth(async (session) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede cambiar la marca");
  }

  const branding = await getBranding(session.organizationId);
  await saveBranding(session.organizationId, { ...branding, favicon: null });
  // El archivo se borra DESPUÉS de que la marca ya no lo referencia: si esto
  // falla, queda un archivo huérfano —inofensivo— en vez de una marca
  // apuntando a algo que ya no está.
  await rm(mediaFilePath(session.organizationId, FAVICON_ASSET), {
    force: true,
  }).catch(() => null);

  return Response.json({ favicon: null });
});
