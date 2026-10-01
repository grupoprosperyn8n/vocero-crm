import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  activateAiConnection,
  deactivateAiConnection,
  deleteAiConnection,
  listAiConnections,
  setSystemAiEnabled,
} from "@/server/ai/connections";
import { connectionsGate } from "@/server/settings/access";

export const dynamic = "force-dynamic";

/**
 * 046 — Acciones de Ajustes → IA: activar / desconectar / eliminar una
 * conexión, y conectar o desconectar la IA del sistema (fallback por env).
 */

const actionSchema = z.union([
  z.object({ action: z.literal("activate"), id: z.string().trim().min(1) }),
  z.object({ action: z.literal("deactivate"), id: z.string().trim().min(1) }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1) }),
  z.object({ action: z.literal("system-ai"), enabled: z.boolean() }),
]);

export const POST = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const body = await parseBody(req, actionSchema);
  if (!body.ok) return body.response;
  const data = body.data;

  if (data.action === "system-ai") {
    await setSystemAiEnabled(session.organizationId, data.enabled);
  } else {
    const found =
      data.action === "activate"
        ? await activateAiConnection(session.organizationId, data.id)
        : data.action === "deactivate"
          ? await deactivateAiConnection(session.organizationId, data.id)
          : await deleteAiConnection(session.organizationId, data.id);
    if (!found) return apiError(404, "not_found", "Esa conexión no existe");
  }

  return Response.json({
    ok: true,
    connections: await listAiConnections(session.organizationId),
  });
});
