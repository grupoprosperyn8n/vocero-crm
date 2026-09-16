import { withAuth } from "@/lib/api";
import { fotoDeAvatar } from "@/server/avatars";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

/**
 * 032/035 — Foto de perfil para los avatares del CRM.
 *
 * Llaves: empleado (`EMP995`, `rec…`, `usr_…`), Telegram del contacto
 * (`tg:<chat id>`, vía Bot API de la organización) y cliente del sistema
 * (`cli:<llave de teléfono>` o `cli:rec…`, Airtable CLIENTES «FOTO PERFIL»).
 * 404 = ese perfil no tiene foto: la UI cae a las iniciales, sin inventar nada.
 * La caché del navegador es corta (60 s) para que una foto cargada/cambiada en
 * el backend se refleje sola, sin recargar nada a mano.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { key } = await ctx.params;
  const foto = await fotoDeAvatar(key, session.organizationId);
  if (!foto) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(foto.data), {
    headers: {
      "Content-Type": foto.type,
      "Cache-Control": "private, max-age=60",
    },
  });
});
