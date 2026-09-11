import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { customizationGate } from "@/server/settings/access";
import { isConnectorOwner } from "@/server/settings/connectors";

export const dynamic = "force-dynamic";

/**
 * 1F — Conectores salientes (Configuración → Conectores).
 *
 * Destinos del webhook de cierre configurables desde la UI, sin env vars:
 * cada conector es un endpoint del backend (n8n, Airtable, ...) que recibe
 * el payload curado "conversation.closed" firmado con su propio secreto.
 * Multi conector: el cierre emite a TODOS los conectores habilitados.
 *
 * GET  → lista de la org (el secreto nunca viaja; solo secretSet).
 * POST → alta. El secreto es opcional (sin secret el destino no recibe
 *        firma) y no se puede leer después: se reemplaza o se limpia.
 */

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  url: z.string().url().max(500),
  // kind queda fijo en conversation.closed por ahora; el campo existe para
  // que el día que haya otros eventos salientes la tabla no cambie.
  secret: z.string().min(8).max(200).optional(),
});

export type { ConnectorAdminSession } from "@/server/settings/connectors";

export const GET = withAuth(async (session) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.outboundWebhook.id,
      name: schema.outboundWebhook.name,
      kind: schema.outboundWebhook.kind,
      url: schema.outboundWebhook.url,
      secretSet: sql<boolean>`${schema.outboundWebhook.secret} IS NOT NULL`,
      enabled: schema.outboundWebhook.enabled,
      createdAt: schema.outboundWebhook.createdAt,
    })
    .from(schema.outboundWebhook)
    .where(eq(schema.outboundWebhook.organizationId, session.organizationId))
    .orderBy(desc(schema.outboundWebhook.createdAt));
  return Response.json({
    connectors: rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      url: r.url,
      secretSet: Boolean(r.secretSet),
      enabled: r.enabled,
      createdAt: r.createdAt,
    })),
  });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!isConnectorOwner(session)) {
    return apiError(403, "FORBIDDEN", "Solo el propietario configura conectores.");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  const db = getDb();
  const id = newId("outboundWebhook");
  await db.insert(schema.outboundWebhook).values({
    id,
    organizationId: session.organizationId,
    name: body.data.name,
    kind: "conversation.closed",
    url: body.data.url,
    secret: body.data.secret ?? null,
    enabled: true,
  });
  return Response.json(
    {
      connector: {
        id,
        name: body.data.name,
        url: body.data.url,
        enabled: true,
        secretSet: Boolean(body.data.secret),
      },
    },
    { status: 201 }
  );
});
