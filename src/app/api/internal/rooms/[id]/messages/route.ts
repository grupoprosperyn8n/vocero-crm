import { apiError, withAuth } from "@/lib/api";
import { AlertsBackendError, getAlertSharePayload } from "@/server/alerts/service";
import { ChatError, listChatMessages, postChatMessage } from "@/server/internal/chat";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 022 — Historial de una sala (solo miembros). */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  try {
    const data = await listChatMessages({
      organizationId: session.organizationId,
      roomId: id,
      meId: session.userId,
    });
    return Response.json(data);
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    if (err instanceof AlertsBackendError) {
      return apiError(err.status ?? 502, "alerts_backend_error", "No se pudo validar la alerta");
    }
    throw err;
  }
});

/** 022 — Mandar un mensaje (solo miembros). 025/027c — también compartir un contacto o alerta. */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(422, "invalid_body", "El body debe ser JSON válido");
  }
  const body = (raw as { body?: unknown })?.body;
  const contact = (raw as { contact?: unknown })?.contact;
  const alert = (raw as { alert?: unknown })?.alert;
  try {
    let alertPayload: unknown;
    if (alert !== undefined && alert !== null) {
      const alertId =
        typeof alert === "object" && alert
          ? String((alert as { id?: unknown }).id ?? "")
          : String(alert);
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(alertId)) {
        return apiError(422, "invalid_alert", "La alerta compartida no es válida");
      }
      alertPayload = await getAlertSharePayload(alertId);
      if (!alertPayload) {
        return apiError(404, "alert_not_found", "No se encontró la alerta");
      }
    }
    const message = await postChatMessage({
      organizationId: session.organizationId,
      roomId: id,
      senderId: session.userId,
      body: typeof body === "string" ? body : "",
      contact,
      alert: alertPayload,
    });
    return Response.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof ChatError) return apiError(err.status, err.code, err.message);
    if (err instanceof AlertsBackendError) {
      return apiError(err.status ?? 502, "alerts_backend_error", "No se pudo validar la alerta");
    }
    throw err;
  }
});
