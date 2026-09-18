import { withAuth } from "@/lib/api";
import { listCommercialFollowUp } from "@/server/proposals/service";

export const dynamic = "force-dynamic";

/**
 * 041b — SEGUIMIENTO COMERCIAL del Cliente 360: todas las acciones que el
 * sistema tomó (propuestas en cada hito + mensajes disparados desde la Cola
 * de hoy y la ficha), de lo más nuevo a lo más viejo.
 *
 * Alcance por rol: gerente, propietario y administrador ven todo el equipo;
 * un miembro ve lo suyo. Filtros: ?clientRef=… y ?assignee=…
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const clientRef = url.searchParams.get("clientRef")?.trim() || null;
  const assignee = url.searchParams.get("assignee")?.trim() || null;
  const { items } = await listCommercialFollowUp({
    organizationId: session.organizationId,
    viewerUserId: session.userId,
    viewerRole: session.role,
    clientRef,
    assigneeUserId: assignee,
  });
  return Response.json({
    items,
    viewer: { userId: session.userId, role: session.role },
  });
});
