/**
 * 044b-B14 — Monitoreo de un cliente: lo que SGSA dejó en Airtable.
 *
 * Trae, SOLO con el PAT de servidor (SGSA_AIRTABLE_PAT):
 *  - ALERTAS del cliente (link `CLIENTE` por record id; si no, por nombre
 *    en `CLIENTES` / `NO_CLIENTE`).
 *  - CALIFICACIONES del cliente (link `CLIENTE`; si no, por `NOMBRE`/`DNI`).
 *
 * Las tablas son chicas y cambian poco durante el día: se cachean en memoria
 * (TTL 5 min) y el filtro por cliente corre sobre la lista cacheada, así el
 * panel abre al instante.
 */
import { isSgsaConfigured } from "@/server/clients/sgsa";
import { pickClientId } from "@/server/alerts/client-record";
import type {
  ClientMonitoreoAlertaDto,
  ClientMonitoreoCalificacionDto,
  ClientMonitoreoDto,
} from "@/lib/types";

const DEFAULT_BASE_ID = "appuhslj3GFf60Tea";
const ALERTAS_TABLE = "ALERTAS";
const CALIFICACIONES_TABLE = "CALIFICACIONES";

const CACHE_TTL_MS = 5 * 60_000;
const MAX_ROWS = 3000;

type Rec = { id: string; fields: Record<string, unknown> };

type CacheEntry<T> = { at: number; rows: T[] };

let alertasCache: CacheEntry<Rec> | null = null;
let calificacionesCache: CacheEntry<Rec> | null = null;

function baseId(): string {
  return process.env.SGSA_BASE_ID?.trim() || DEFAULT_BASE_ID;
}

async function listTable(table: string, fields: string[]): Promise<Rec[]> {
  const out: Rec[] = [];
  let offset = "";
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${process.env.SGSA_AIRTABLE_PAT ?? ""}` },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      }
    );
    if (!res.ok) throw new Error(`Airtable ${res.status} listando ${table}`);
    const data = (await res.json()) as { records?: Rec[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = out.length >= MAX_ROWS ? "" : data.offset ?? "";
  } while (offset);
  return out.slice(0, MAX_ROWS);
}

async function cachedRows(
  table: string,
  fields: string[],
  slot: "alertas" | "calificaciones"
): Promise<Rec[]> {
  const now = Date.now();
  const entry = slot === "alertas" ? alertasCache : calificacionesCache;
  if (entry && now - entry.at < CACHE_TTL_MS) return entry.rows;
  try {
    const rows = await listTable(table, fields);
    if (slot === "alertas") alertasCache = { at: now, rows };
    else calificacionesCache = { at: now, rows };
    return rows;
  } catch (err) {
    if (entry) return entry.rows; // viejo pero sirve
    throw err;
  }
}

/* Fechas de Airtable: "2026-09-30T16:00:08.000Z" o createdTime igual. */
function asIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function norm(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linkIds(value: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) if (typeof v === "string") out.push(v);
  } else if (typeof value === "string" && value.startsWith("rec")) {
    out.push(value);
  }
  return out;
}

export type MonitoreoFilter = {
  recordId?: string | null;
  name?: string | null;
  dni?: string | null;
};

function matchCliente(
  fields: Record<string, unknown>,
  filter: MonitoreoFilter,
  nameField: string
): boolean {
  const recordId = filter.recordId?.trim() || "";
  if (recordId) {
    if (pickClientId(fields) === recordId) return true;
    if (linkIds(fields["CLIENTE"]).includes(recordId)) return true;
  }
  const targets = [filter.name, filter.dni]
    .map((v) => norm(v))
    .filter(Boolean);
  if (!targets.length) return false;

  const name = norm(fields[nameField]);
  if (name && targets.includes(name)) return true;

  const noCliente = norm(fields["NO_CLIENTE"]);
  if (noCliente && targets.includes(noCliente)) return true;

  const dni = String(fields["DNI"] ?? "").replace(/\D+/g, "");
  if (dni && filter.dni && dni === filter.dni.replace(/\D+/g, "")) return true;

  return false;
}

/** Monitoreo completo de un cliente (alertas + calificaciones). */
export async function getClientMonitoreo(
  filter: MonitoreoFilter
): Promise<ClientMonitoreoDto> {
  const empty: ClientMonitoreoDto = {
    alertas: [],
    calificaciones: [],
    generatedAt: new Date().toISOString(),
  };
  if (!isSgsaConfigured()) return empty;

  const [alertasRows, calificacionesRows] = await Promise.all([
    cachedRows(
      ALERTAS_TABLE,
      [
        "TITULO",
        "TIPO_ALERTA",
        "PRIORIDAD",
        "ESTADO",
        "DETALLE",
        "CUERPO",
        "FECHA_CREACION",
        "CLIENTE",
        "CLIENTES",
        "NO_CLIENTE",
      ],
      "alertas"
    ),
    cachedRows(
      CALIFICACIONES_TABLE,
      [
        "NOMBRE",
        "ESTRELLAS",
        "SERVICIO",
        "COMENTARIO",
        "FECHA DE CREACION",
        "URGENCIA DE ATENCION (AI)",
        "CLIENTE",
        "DNI",
      ],
      "calificaciones"
    ),
  ]);

  const alertas: ClientMonitoreoAlertaDto[] = alertasRows
    .filter((rec) => matchCliente(rec.fields, filter, "CLIENTES"))
    .map((rec) => ({
      id: rec.id,
      titulo: String(rec.fields["TITULO"] ?? "Alerta"),
      tipo: String(rec.fields["TIPO_ALERTA"] ?? ""),
      prioridad: rec.fields["PRIORIDAD"] ? String(rec.fields["PRIORIDAD"]) : null,
      estado: rec.fields["ESTADO"] ? String(rec.fields["ESTADO"]) : null,
      detalle: rec.fields["DETALLE"]
        ? String(rec.fields["DETALLE"])
        : rec.fields["CUERPO"]
          ? String(rec.fields["CUERPO"])
          : null,
      createdAt: asIso(rec.fields["FECHA_CREACION"]),
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  const calificaciones: ClientMonitoreoCalificacionDto[] = calificacionesRows
    .filter((rec) => matchCliente(rec.fields, filter, "NOMBRE"))
    .map((rec) => ({
      id: rec.id,
      nombre: String(rec.fields["NOMBRE"] ?? filter.name ?? ""),
      estrellas: Number(rec.fields["ESTRELLAS"] ?? 0) || 0,
      servicio: rec.fields["SERVICIO"] ? String(rec.fields["SERVICIO"]) : null,
      comentario: rec.fields["COMENTARIO"]
        ? String(rec.fields["COMENTARIO"])
        : null,
      createdAt: asIso(rec.fields["FECHA DE CREACION"]),
      urgencia: rec.fields["URGENCIA DE ATENCION (AI)"]
        ? String(rec.fields["URGENCIA DE ATENCION (AI)"])
        : null,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  return { alertas, calificaciones, generatedAt: new Date().toISOString() };
}
