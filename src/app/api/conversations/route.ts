import { withAuth } from "@/lib/api";
import { canSeeAllInbox } from "@/lib/roles";
import {
  countConversations,
  listConversations,
  type ConversationStatus,
  type InboxAssigneeFilter,
} from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

/**
 * 026 — La bandeja es POR USUARIO (pedido Diego 13Sep): un miembro ve SOLO lo
 * suyo (asignado a él); gerente/administrador/propietario ven todo y pueden
 * filtrar por cualquier empleado (`assignee`). El archivo personal (tab
 * «Archivadas») es de cada uno.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const statusParam = url.searchParams.get("status");
  const status: ConversationStatus =
    statusParam === "closed"
      ? "closed"
      : statusParam === "archived"
        ? "archived"
        : "open";
  const viewer = { userId: session.userId, role: session.role };

  // 026 — filtro por empleado: solo para quien ve toda la bandeja; el resto lo
  // manda igual y el server lo ignora (nunca amplía lo que puede ver).
  let assigneeFilter: InboxAssigneeFilter = undefined;
  if (canSeeAllInbox(session.role)) {
    const a = url.searchParams.get("assignee");
    assigneeFilter =
      a === "none" ? "none" : a === "me" ? session.userId : a || undefined;
  }

  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    status,
    viewer,
    assigneeFilter
  );
  // 2A/026: contadores de las tres pestañas (siempre frescos, según alcance).
  const [openTotal, closedTotal, archivedTotal] = await Promise.all([
    countConversations(session.organizationId, "open", viewer),
    countConversations(session.organizationId, "closed", viewer),
    countConversations(session.organizationId, "archived", viewer),
  ]);
  return Response.json({ conversations, openTotal, closedTotal, archivedTotal });
});
