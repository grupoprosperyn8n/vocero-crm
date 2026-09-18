import { apiError, withAuth } from "@/lib/api";
import { loadLibraryAssetBytes } from "@/server/library/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 041d — Sirve los bytes del archivo del contenedor (con sesión). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  if (!/^lib_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de archivo inválido");
  }

  const file = await loadLibraryAssetBytes({
    organizationId: session.organizationId,
    id,
  });

  if (!file) {
    return apiError(404, "not_found", "Archivo no encontrado");
  }

  const body = new Uint8Array(file.data);

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": file.mime,
      "content-length": String(body.byteLength),
      // El archivo de la biblioteca no cambia una vez subido: cacheable.
      "cache-control": "private, max-age=3600",
    },
  });
});
