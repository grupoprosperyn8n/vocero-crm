import { and, eq } from "drizzle-orm";
import { apiError } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

/**
 * 1F — Helpers compartidos de Conectores salientes (rutas + UI de settings).
 */

export type ConnectorAdminSession = {
  organizationId: string;
  role: string;
};

/** Escritura de conectores: solo owner y admin. */
export function isConnectorAdmin(session: ConnectorAdminSession): boolean {
  return session.role === "owner" || session.role === "admin";
}

/** Carga scoped del conector (org) + gate de escritura. */
export async function loadOwnedConnector(
  session: ConnectorAdminSession,
  id: string
): Promise<
  | { ok: true; row: typeof schema.outboundWebhook.$inferSelect }
  | { ok: false; response: Response }
> {
  if (!isConnectorAdmin(session)) {
    return {
      ok: false,
      response: apiError(403, "FORBIDDEN", "Solo owner y admin configuran conectores."),
    };
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.outboundWebhook)
    .where(
      and(
        eq(schema.outboundWebhook.id, id),
        eq(schema.outboundWebhook.organizationId, session.organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { ok: false, response: apiError(404, "NOT_FOUND", "Conector no encontrado.") };
  }
  return { ok: true, row };
}
