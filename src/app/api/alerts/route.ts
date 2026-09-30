import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { canManageAlerts } from "@/lib/roles";
import { canManageAlertAssignments, decorateAlertsForSession } from "@/server/alerts/assignments";
import {
  AlertsBackendError,
  alertsConfigured,
  createAlert,
  listAlerts,
} from "@/server/alerts/service";
import { listPendingReviewAlerts, type ReviewInboxAlert } from "@/server/reviews/inbox";

export const dynamic = "force-dynamic";

/**
 * 027 — Alertas del sistema de seguros (el mismo sistema de la PWA).
 * `?hist=1` = historial (leídas/gestionadas); sin él, solo pendientes.
 * El contador de pendientes viaja siempre para el badge del nav.
 * 033c — las revisiones de envío pendientes viajan PRIMERO: viven en el chat
 * interno (grupo «Alerta de Siniestro») pero la cola las muestra como alerta
 * con «Abrir conversación» para decidir.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const hist = url.searchParams.get("hist") === "1";
  const mineOnly = url.searchParams.get("mine") === "1";
  let reviewAlerts: ReviewInboxAlert[] = [];
  try {
    reviewAlerts = await listPendingReviewAlerts({
      organizationId: session.organizationId,
      userId: session.userId,
      role: session.role,
    });
  } catch (err) {
    console.error("[api/alerts] no se pudieron leer las revisiones de envío:", err);
  }
  if (!alertsConfigured()) {
    return Response.json({
      configured: false,
      alerts: reviewAlerts,
      pendientes: reviewAlerts.length,
      viewerRole: session.role,
      canManageAssignments: canManageAlertAssignments(session.role),
      canCreateAlert: false,
      mineOnly,
    });
  }
  try {
    const { alerts, pendientes } = await listAlerts(hist);
    const scopedAlerts = await decorateAlertsForSession(session, alerts, mineOnly, {
      withClients: true,
    });
    const canManage = canManageAlertAssignments(session.role);
    // Para un miembro (o el filtro «para mí») el contador muestra lo que ve.
    const pendientesScoped = !hist && (!canManage || mineOnly) ? scopedAlerts.length : pendientes;
    return Response.json({
      configured: true,
      alerts: hist ? scopedAlerts : [...reviewAlerts, ...scopedAlerts],
      pendientes: hist ? pendientesScoped : pendientesScoped + reviewAlerts.length,
      viewerRole: session.role,
      canManageAssignments: canManage,
      canCreateAlert: canManageAlerts(session.role),
      mineOnly,
    });
  } catch (err) {
    console.error("[api/alerts] backend SGSA inaccesible:", err);
    return Response.json(
      {
        configured: true,
        alerts: [],
        pendientes: 0,
        error: "backend_unreachable",
        upstreamStatus: err instanceof AlertsBackendError ? (err.status ?? null) : null,
      },
      { status: 502 }
    );
  }
});

/**
 * 30Sep — crear una alerta NUEVA desde el CRM (pedido Diego): viaja al backend
 * SGSA por el mismo push que usa n8n y queda persistida en Airtable (tabla
 * ALERTAS) con origen «CRM» y, si se eligió, el cliente vinculado (campo
 * CLIENTE: habilita «Abrir cliente» y el match con los clientes del sistema).
 * Reservado a dueño, propietario o gerente (canManageAlerts).
 */
const CreateAlertBody = z.object({
  titulo: z.string().trim().min(3, "mínimo 3 caracteres").max(160),
  tipo: z.string().trim().min(2, "elegí un tipo de alerta").max(60),
  prioridad: z.enum(["🔴 Alta", "🟠 Media", "🟡 Baja"]),
  detalle: z.string().trim().max(2000).default(""),
  clienteRecordId: z
    .string()
    .trim()
    .regex(/^rec[A-Za-z0-9]{14}$/, "recordId inválido")
    .nullable()
    .optional(),
  clienteNombre: z.string().trim().max(200).nullable().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canManageAlerts(session.role)) {
    return apiError(
      403,
      "forbidden",
      "Solo dueño, propietario o gerente pueden crear alertas"
    );
  }
  if (!alertsConfigured()) {
    return apiError(
      503,
      "alerts_not_configured",
      "El sistema de alertas no está configurado"
    );
  }
  const parsed = await parseBody(req, CreateAlertBody);
  if (!parsed.ok) return parsed.response;
  const { titulo, tipo, prioridad, detalle, clienteRecordId, clienteNombre } =
    parsed.data;

  // Autor legible para el backoffice (el detalle viaja a Airtable).
  let autor = "CRM";
  try {
    const rows = await getDb()
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, session.userId))
      .limit(1);
    autor = rows[0]?.name?.trim() || "CRM";
  } catch {
    // sin nombre: la alerta se crea igual
  }
  const detalleFull = [(detalle ?? "").trim(), `Creada desde el CRM por ${autor}`]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await createAlert({
      titulo,
      tipo,
      prioridad,
      detalle: detalleFull,
      clienteNombre: clienteNombre?.trim() || null,
      clienteRecordId: clienteRecordId ?? null,
    });
    return Response.json({ ok: true, id: res.id, pendientes: res.pendientes });
  } catch (err) {
    console.error("[api/alerts] no se pudo crear la alerta:", err);
    return apiError(
      502,
      "backend_unreachable",
      "El sistema de alertas no pudo guardar la alerta. Reintentá en un momento."
    );
  }
});
