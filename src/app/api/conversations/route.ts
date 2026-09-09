import { withAuth } from "@/lib/api";
import {
  countConversations,
  listConversations,
} from "@/server/inbox/queries";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;
  const status =
    url.searchParams.get("status") === "closed" ? "closed" : "open";
  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    status
  );
  // 2A: contadores de las tabs En curso / Cerradas (siempre frescos).
  const [openTotal, closedTotal] =
    status === "closed"
      ? ([
          await countConversations(session.organizationId, "open"),
          conversations.length,
        ] as const)
      : ([
          conversations.length,
          await countConversations(session.organizationId, "closed"),
        ] as const);
  return Response.json({ conversations, openTotal, closedTotal });
});
