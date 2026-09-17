import { apiError, withAuth } from "@/lib/api";
import { CockpitUnavailableError, cockpitFetch } from "@/server/dashboard-management/cockpit";

export const dynamic = "force-dynamic";

/**
 * 038b — Datos del dashboard (proxy al cockpit).
 *
 * El navegador pide acá (mismo origen, con la cookie del CRM); el servidor
 * reenvía la consulta al cockpit con los filtros tal cual. Dueño y
 * propietarios únicamente — la misma regla que la página.
 */
export const GET = withAuth(async (session, req: Request) => {
  if (session.role === "member") {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  const search = new URL(req.url).search;

  try {
    const res = await cockpitFetch(`/api/dashboard${search}`, { method: "GET" });
    if (!res.ok) {
      return apiError(502, "cockpit", "El cockpit devolvió un error.");
    }
    return Response.json(await res.json());
  } catch (err) {
    if (err instanceof CockpitUnavailableError) {
      return apiError(503, "cockpit_offline", err.message);
    }
    throw err;
  }
});
