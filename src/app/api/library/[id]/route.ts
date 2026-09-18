import { apiError, withAuth } from "@/lib/api";
import { deleteLibraryAsset, LibraryError } from "@/server/library/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 041d — Quitar un archivo del contenedor.
 *
 * Lo que subió dueño/propietario/gerente está PROTEGIDO: solo dueño y
 * propietario pueden quitarlo. El resto, su autor o alguien que gestione.
 */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;

  if (!/^lib_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de archivo inválido");
  }

  try {
    const { name } = await deleteLibraryAsset({
      organizationId: session.organizationId,
      id,
      viewer: { userId: session.userId, role: session.role },
    });

    return Response.json({ ok: true, name });
  } catch (err) {
    if (err instanceof LibraryError) {
      return apiError(err.status, err.code, err.message);
    }

    console.error("[library] borrar:", err);

    return apiError(500, "internal", "No se pudo quitar el archivo");
  }
});
