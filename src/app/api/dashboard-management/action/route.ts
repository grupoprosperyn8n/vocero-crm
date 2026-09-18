import { z } from "zod";

import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export const dynamic = "force-dynamic";

/**
 * 040 — Registro de acciones del tablero (trazabilidad).
 *
 * Cada vez que el Dashboard Management convierte una sugerencia en acción
 * (mandar mensaje desde la ficha del Cliente 360° o desde la Cola de hoy),
 * queda esta fila. Es la materia prima del embudo sugerencia → acción →
 * respuesta que el cockpit agrega por jugada: así el sistema de datos
 * aprende qué jugada mueve la aguja.
 *
 * Best-effort: si la inserción falla, responde ok:false con 200 — el
 * operador nunca ve un error por una acción ya ejecutada.
 */

const bodySchema = z.object({
  source: z.enum(["cola", "ficha"]),
  playId: z.string().trim().max(60).optional(),
  module: z.string().trim().max(60).optional(),
  contactId: z.string().trim().max(120).optional(),
  conversationId: z.string().trim().max(120).optional(),
  clientRef: z.string().trim().max(200).optional(),
  clientName: z.string().trim().max(200).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  const data = parsed.data;

  try {
    const db = getDb();

    await db.insert(schema.dashboardAction).values({
      id: newId("dashboardAction"),
      organizationId: session.organizationId,
      source: data.source,
      playId: data.playId ?? null,
      module: data.module ?? null,
      contactId: data.contactId ?? null,
      conversationId: data.conversationId ?? null,
      clientRef: data.clientRef ?? null,
      clientName: data.clientName ?? null,
      userId: session.userId ?? null,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/dashboard-management/action] error:", err);

    return Response.json({ ok: false });
  }
});
