import { withAuth } from "@/lib/api";
import { listStaff } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

/** 022 — Equipo activo (nombre y rol) para los selectores del chat interno. */
export const GET = withAuth(async (session) => {
  const staff = await listStaff(session.organizationId);
  return Response.json({ staff });
});
