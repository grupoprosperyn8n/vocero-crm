/**
 * 027 — Alertas del sistema de seguros: puente server-side CRM ↔ backend SGSA.
 *
 * El CRM es un cliente del MISMO sistema de alertas que alimenta a la PWA y a
 * la extensión: lee `/api/alerts` del backend (colas pendiente/historial) y
 * acciona `/api/alerts/{id}/ack` y `/api/alerts/{id}/status`. La clave
 * (`CRM_API_KEY` del backend, Bearer) es de SERVIDOR: nunca viaja al browser.
 *
 * Config por entorno (opcional — sin clave el módulo queda oculto, patrón
 * agenda):
 *   SGSA_BACKEND_URL — default: el backend de producción (Railway).
 *   SGSA_BACKEND_KEY — Bearer para los endpoints `/api/crm/*` del backend.
 *
 * Nota: acá no se guarda nada — la fuente única sigue siendo Airtable vía el
 * backend; el CRM solo muestra y acciona con la sesión del empleado.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { alertUrgency, alertUrgencyLabel } from "@/lib/alerts";
import type { SgsaAlertDto } from "@/lib/types";
import { getTodayOffice } from "@/server/internal/office-day";

const DEFAULT_BACKEND_URL = "https://web-production-2584d.up.railway.app";

export class AlertsBackendError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "AlertsBackendError";
  }
}

export function alertsBackendUrl(): string {
  return (process.env.SGSA_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL).replace(
    /\/+$/,
    ""
  );
}

/** ¿Esta instancia tiene el sistema de alertas configurado? */
export function alertsConfigured(): boolean {
  return Boolean(process.env.SGSA_BACKEND_KEY?.trim());
}

function backendKey(): string {
  const key = process.env.SGSA_BACKEND_KEY?.trim();
  if (!key) throw new AlertsBackendError("Sin SGSA_BACKEND_KEY", 401);
  return key;
}

async function backendFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<unknown> {
  const res = await fetch(`${alertsBackendUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${backendKey()}`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(init?.timeoutMs ?? 12_000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new AlertsBackendError(`Backend SGSA respondió ${res.status}`, res.status);
  }
  return res.json();
}

type RawAlert = Record<string, unknown>;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

export function normalizeAlert(raw: RawAlert): SgsaAlertDto {
  const prioridad = str(raw.prioridad) ?? "";
  const urgencia = alertUrgency(prioridad);
  return {
    id: str(raw.id) ?? "",
    airtableRecordId: str(raw.airtable_record_id),
    tipo: str(raw.tipo_alerta) ?? "GENERICA",
    prioridad,
    urgencia,
    urgenciaLabel: alertUrgencyLabel(urgencia),
    titulo: str(raw.titulo) ?? "Alerta",
    cuerpo: str(raw.cuerpo) ?? "",
    detalle: str(raw.detalle) ?? "",
    linkRegistro: str(raw.link_registro),
    estado: str(raw.estado) ?? "PENDIENTE",
    leida: Boolean(raw.leida),
    fecha: str(raw.fecha),
    fechaVisto: str(raw.fecha_visto),
    clienteNombre: str(raw.cliente_nombre),
    empleadoLeido: str(raw.empleado_que_marco_leido),
  };
}

/** Lista de alertas (pendientes o historial) + contador de pendientes. */
export async function listAlerts(history: boolean): Promise<{
  alerts: SgsaAlertDto[];
  pendientes: number;
}> {
  const data = (await backendFetch(
    `/api/alerts?leidas=${history ? "true" : "false"}`
  )) as { alerts?: RawAlert[]; pendientes?: number };
  const alerts = (data.alerts ?? []).map(normalizeAlert);
  return { alerts, pendientes: data.pendientes ?? alerts.length };
}

/** Contador de pendientes por el endpoint CRM (Bearer) del backend. */
export async function alertsPendingCount(): Promise<number> {
  const data = (await backendFetch("/api/crm/alerts-summary")) as {
    total_pendientes?: number;
  };
  return data.total_pendientes ?? 0;
}

/** Marca una alerta como leída (pasa a EN_PROGRESO) en el sistema. */
export async function ackAlert(
  storeId: string,
  info: { empleadoId?: string | null; sucursalId?: string | null }
): Promise<void> {
  const params = new URLSearchParams();
  if (info.empleadoId) params.set("empleado_que_marco_leido", info.empleadoId);
  if (info.sucursalId) params.set("sucursal_id", info.sucursalId);
  const qs = params.toString();
  await backendFetch(
    `/api/alerts/${encodeURIComponent(storeId)}/ack${qs ? `?${qs}` : ""}`,
    { method: "POST" }
  );
}

/** Cambia el estado operativo de una alerta (CONCLUIDA, ANULADA, …). */
export async function setAlertStatus(
  storeId: string,
  estado: string,
  info: { empleadoId?: string | null; sucursalId?: string | null }
): Promise<void> {
  await backendFetch(`/api/alerts/${encodeURIComponent(storeId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      estado,
      empleado_id: info.empleadoId ?? undefined,
      sucursal_id: info.sucursalId ?? undefined,
    }),
  });
}

/* ─── Mapeos locales (usuario CRM → registros del sistema) ─────────────── */

/** Caché chica de empleado↔email: se repite en cada acción de alertas. */
const empleadoCache = new Map<string, string | null>();
const EMPLEADO_TTL_MS = 10 * 60_000;
let empleadoCacheAt = 0;

/**
 * Usuario CRM → record de EMPLEADOS (Airtable), por email. El backend valida
 * que `empleado_id` sea un EMPLEADO real antes de vincularlo; si no se
 * encuentra, la acción se manda sin empleado (marca igual, sin trazabilidad).
 */
export async function resolveEmpleadoForUser(userId: string): Promise<string | null> {
  let email: string | null = null;
  try {
    const rows = await getDb()
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);
    email = rows[0]?.email ?? null;
  } catch {
    return null;
  }
  return email ? resolveEmpleadoIdByEmail(email) : null;
}

async function resolveEmpleadoIdByEmail(rawEmail: string): Promise<string | null> {
  const key = rawEmail.trim().toLowerCase();
  if (!key) return null;
  if (Date.now() - empleadoCacheAt > EMPLEADO_TTL_MS) {
    empleadoCache.clear();
    empleadoCacheAt = Date.now();
  }
  if (empleadoCache.has(key)) return empleadoCache.get(key) ?? null;

  const pat = process.env.SGSA_AIRTABLE_PAT?.trim();
  if (!pat) return null;
  const baseId = process.env.SGSA_BASE_ID?.trim() || "appuhslj3GFf60Tea";
  const url = new URL(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent("EMPLEADOS")}`
  );
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set(
    "filterByFormula",
    `LOWER({EMAIL})="${key.replace(/"/g, "")}"`
  );
  url.searchParams.append("fields[]", "EMAIL");
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}` },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { records?: { id: string }[] };
    const found = data.records?.[0]?.id ?? null;
    empleadoCache.set(key, found);
    return found;
  } catch {
    return null;
  }
}

/**
 * Sucursal del empleado (la que marcó hoy) → record de OFICINAS (Airtable).
 * El CRM guarda el espejo en `office.externalId`; si hoy no marcó sucursal,
 * la acción viaja sin sucursal (igual acciona).
 */
export async function resolveSucursalForUser(
  organizationId: string,
  userId: string
): Promise<string | null> {
  try {
    const today = await getTodayOffice(organizationId, userId);
    if (!today) return null;
    const rows = await getDb()
      .select({ externalId: schema.office.externalId })
      .from(schema.office)
      .where(eq(schema.office.id, today.officeId))
      .limit(1);
    return rows[0]?.externalId ?? null;
  } catch {
    return null;
  }
}
