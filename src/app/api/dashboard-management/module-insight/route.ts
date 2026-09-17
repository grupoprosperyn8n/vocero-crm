import { apiError, withAuth } from "@/lib/api";
import { CockpitUnavailableError, cockpitFetch } from "@/server/dashboard-management/cockpit";

export const dynamic = "force-dynamic";

/**
 * 038b — Análisis con IA por módulo (proxy al cockpit).
 *
 * El cockpit arma el análisis con su propio motor (OpenAI/Groq según su
 * configuración). El CRM solo transporta el pedido y devuelve la respuesta.
 */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role === "member") {
    return apiError(403, "forbidden", "Solo dueño y propietarios.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(422, "invalid_body", "El body debe ser JSON válido.");
  }

  try {
    const res = await cockpitFetch("/api/module-insight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 180_000,
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      return apiError(502, "cockpit", "El cockpit no pudo generar el análisis.");
    }
    return Response.json(json);
  } catch (err) {
    if (err instanceof CockpitUnavailableError) {
      return apiError(503, "cockpit_offline", err.message);
    }
    throw err;
  }
});
