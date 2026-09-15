import { withAuth } from "@/lib/api";
import { fotoDeEmpleado } from "@/server/avatars";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

/**
 * 032 — Foto de perfil de un empleado para los avatares del CRM.
 *
 * Fuente: Airtable EMPLEADOS «FOTO DE PERFIL» (la misma del backend de
 * seguros). La llave acepta idUnico (EMP995), record (rec…) o usuario del CRM
 * (usr_…; se resuelve por su email). 404 = ese perfil no tiene foto cargada:
 * la UI cae a las iniciales, sin inventar nada.
 */
export const GET = withAuth(async (_session, _req: Request, ctx: Params) => {
  const { key } = await ctx.params;
  const foto = await fotoDeEmpleado(key);
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.data), {
    headers: {
      "Content-Type": foto.type,
      "Cache-Control": "private, max-age=1800, stale-while-revalidate=3600",
    },
  });
});
