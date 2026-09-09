import { createHmac } from "node:crypto";
import { withAuth } from "@/lib/api";
import { loadOwnedConnector } from "@/server/settings/connectors";

export const dynamic = "force-dynamic";

/**
 * 1F — Prueba de conector: envía un evento de prueba (firmado con el secreto
 * del conector) al destino para verificar el circuito sin cerrar una
 * conversación real. Útil al configurar el receptor n8n/Airtable.
 */

export const POST = withAuth(
  async (session, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    const owned = await loadOwnedConnector(session, id);
    if (!owned.ok) return owned.response;
    const { url, secret, name } = owned.row;

    const payload = {
      event: "test",
      destination: { id, name },
      at: new Date().toISOString(),
      message: "Prueba de conexión desde Configuración → Conectores (Vocero CRM).",
    };
    const body = JSON.stringify(payload);
    const signature = secret
      ? createHmac("sha256", secret).update(body).digest("hex")
      : null;

    let error: string | null = null;
    let status = 0;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vocero-event": "test",
          "x-vocero-destination": name,
          ...(signature ? { "x-vocero-signature": signature } : {}),
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (error) {
      return Response.json({ ok: false, error, status }, { status: 502 });
    }
    return Response.json({ ok: true, status });
  }
);
