import { withAuth } from "@/lib/api";
import { getAiUsageSummary } from "@/server/ai/usage";
import { connectionsGate } from "@/server/settings/access";

export const dynamic = "force-dynamic";

/** 046 — Gestión de consumos: totales + cortes por modelo, módulo y día. */
export const GET = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, Math.round(raw))) : 30;
  const summary = await getAiUsageSummary(session.organizationId, days);
  return Response.json({ ok: true, summary });
});
