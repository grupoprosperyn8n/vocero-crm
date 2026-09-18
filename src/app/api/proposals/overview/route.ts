import { apiError, withAuth } from "@/lib/api";
import { isManagerOrAbove } from "@/server/proposals/permissions";
import { getCampaignOverview } from "@/server/proposals/overview";

export const dynamic = "force-dynamic";

/**
 * 042 — Tablero maestro de campañas 360.
 * Solo propietario, administrador y gerente (los que gestionan y derivan).
 */
export const GET = withAuth(async (session) => {
  if (!isManagerOrAbove(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Este tablero es para propietario, administrador y gerente"
    );
  }

  const overview = await getCampaignOverview(session.organizationId);
  return Response.json({ overview });
});
