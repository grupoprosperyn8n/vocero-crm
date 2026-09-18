import { apiError, withAuth } from "@/lib/api";
import {
  createLibraryAsset,
  LibraryError,
  listLibraryAssets,
  MAX_LIBRARY_UPLOAD_BYTES,
} from "@/server/library/service";

export const dynamic = "force-dynamic";

/**
 * 041d — Contenedor universal de archivos (imágenes y videos del equipo).
 * GET  = lista los archivos vigentes (filtro ?kind=image|video).
 * POST = sube UN archivo: cuerpo crudo (binario) y el nombre en ?name=.
 *        Nada de base64 en el JSON: un video no viaja en un string.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind")?.trim() || null;

  const assets = await listLibraryAssets({
    organizationId: session.organizationId,
    viewerUserId: session.userId,
    viewerRole: session.role,
    kind,
  });

  return Response.json({
    assets,
    viewer: { role: session.role },
    maxUploadBytes: MAX_LIBRARY_UPLOAD_BYTES,
  });
});

export const POST = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim() || "archivo";

  const length = Number(req.headers.get("content-length") ?? "0");

  if (Number.isFinite(length) && length > MAX_LIBRARY_UPLOAD_BYTES + 1024) {
    return apiError(413, "too_large", "El archivo no puede pasar de 40 MB");
  }

  const buffer = new Uint8Array(await req.arrayBuffer());

  if (buffer.byteLength > MAX_LIBRARY_UPLOAD_BYTES) {
    return apiError(413, "too_large", "El archivo no puede pasar de 40 MB");
  }

  try {
    const asset = await createLibraryAsset({
      organizationId: session.organizationId,
      userId: session.userId,
      userRole: session.role,
      name,
      bytes: buffer,
    });

    return Response.json({ asset }, { status: 201 });
  } catch (err) {
    if (err instanceof LibraryError) {
      return apiError(err.status, err.code, err.message);
    }

    console.error("[library] subir:", err);

    return apiError(500, "internal", "No se pudo guardar el archivo");
  }
});
