import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 041 — Sirve una imagen de propuesta (foto de la publicidad, logo del
 * emisor, logo de la compañía auspiciada). PÚBLICA a propósito: la página
 * /p/<token> se abre desde cualquier computadora, sin sesión. El id es un
 * nanoid no adivinable y las imágenes quedan inmutables (cache largo).
 */
export const GET = async (_req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^pass_[A-Za-z0-9_-]{10,40}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const db = getDb();
  const rows = await db
    .select({
      mime: schema.proposalAsset.mime,
      data: schema.proposalAsset.data,
    })
    .from(schema.proposalAsset)
    .where(eq(schema.proposalAsset.id, id))
    .limit(1);
  const asset = rows[0];
  if (!asset) return new Response("Not found", { status: 404 });

  const bytes = new Uint8Array(Buffer.from(asset.data, "base64"));
  return new Response(bytes, {
    headers: {
      "content-type": asset.mime,
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
