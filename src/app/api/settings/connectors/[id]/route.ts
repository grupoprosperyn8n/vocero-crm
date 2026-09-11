import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { isConnectorOwner, loadOwnedConnector } from "@/server/settings/connectors";

export const dynamic = "force-dynamic";

/**
 * 1F — Conector individual: PATCH (nombre/url/secret/enabled) y DELETE.
 * El secret no se puede leer: PATCH con secret = reemplazo, PATCH sin el
 * campo = no lo toca. Para quitarlo hay que mandar secret: null.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  url: z.string().url().max(500).optional(),
  secret: z.string().min(8).max(200).nullable().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = withAuth(
  async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    if (!isConnectorOwner(session)) {
      return apiError(403, "FORBIDDEN", "Solo el propietario configura conectores.");
    }
    const owned = await loadOwnedConnector(session, id);
    if (!owned.ok) return owned.response;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;
    const db = getDb();
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.data.name !== undefined) set.name = body.data.name;
    if (body.data.url !== undefined) set.url = body.data.url;
    if (body.data.enabled !== undefined) set.enabled = body.data.enabled;
    // secret: null lo limpia; string lo reemplaza; ausente no lo toca.
    if (body.data.secret !== undefined) set.secret = body.data.secret;
    await db
      .update(schema.outboundWebhook)
      .set(set)
      .where(eq(schema.outboundWebhook.id, id));
    return Response.json({ ok: true });
  }
);

export const DELETE = withAuth(
  async (session, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    if (!isConnectorOwner(session)) {
      return apiError(403, "FORBIDDEN", "Solo el propietario configura conectores.");
    }
    const owned = await loadOwnedConnector(session, id);
    if (!owned.ok) return owned.response;
    const db = getDb();
    await db.delete(schema.outboundWebhook).where(eq(schema.outboundWebhook.id, id));
    return Response.json({ ok: true });
  }
);
