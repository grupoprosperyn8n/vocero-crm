/**
 * 028b/028d — Resolución del CLIENTE de cada alerta (Airtable ALERTAS).
 *
 * Las alertas traen `clienteNombre` (a veces null) pero no el registro del
 * cliente; el LINK_REGISTRO que arma SGSA apunta al registro origen
 * (póliza/gestión), no al cliente. Para «Abrir registro» CON el cliente por
 * debajo (merge `?detail` + `?DSjXA`) hace falta el recordId del cliente: se
 * lee el campo link `CLIENTE` de ALERTAS y, si está vacío, el campo
 * `CLIENTES` (string `rec…` que traen las alertas de GESTIÓN GENERAL) — así
 * TODAS las alertas con cliente quedan cubiertas, no solo las de póliza.
 *
 * Lectura SOLO con el PAT de servidor (SGSA_AIRTABLE_PAT); caché en memoria
 * con TTL para no pegarle a Airtable en cada listado del badge/contador.
 */
import { isSgsaConfigured } from "@/server/clients/sgsa";
import type { SgsaAlertDto } from "@/lib/types";

const DEFAULT_BASE_ID = "appuhslj3GFf60Tea";
const ALERTAS_TABLE = "ALERTAS";
const BATCH = 50;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 1000;

/** airtableAlertRecordId → clienteRecordId (o null si la alerta no tiene). */
const cache = new Map<string, string | null>();
let cacheAt = 0;

function baseId(): string {
  return process.env.SGSA_BASE_ID?.trim() || DEFAULT_BASE_ID;
}

/** Record IDs de Airtable: `rec` + exactamente 14 alfanuméricos. */
const REC_ID_RE = /^rec[A-Za-z0-9]{14}$/;

function asRecId(v: unknown): string | null {
  if (typeof v === "string" && REC_ID_RE.test(v.trim())) return v.trim();
  return null;
}

/**
 * Cliente de un record de ALERTAS: el campo link `CLIENTE` (array) y, si está
 * vacío, `CLIENTES` (string `rec…`, el que usan las alertas de GESTIÓN
 * GENERAL) — cubre TODAS las alertas, no solo las de póliza.
 */
export function pickClientId(fields: Record<string, unknown>): string | null {
  const link = fields["CLIENTE"];
  if (Array.isArray(link)) {
    for (const v of link) {
      const id = asRecId(v);
      if (id) return id;
    }
  } else {
    const id = asRecId(link);
    if (id) return id;
  }
  const text = fields["CLIENTES"];
  if (Array.isArray(text)) {
    for (const v of text) {
      const id = asRecId(v);
      if (id) return id;
    }
    return null;
  }
  return asRecId(text);
}

/**
 * Resuelve el record del cliente para un lote de alertas (por su
 * `airtableRecordId`). Devuelve solo las que tienen cliente; las que no,
 * quedan cacheadas como null.
 */
export async function resolveAlertClientRecords(
  alertRecordIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isSgsaConfigured()) return out;

  const stale = Date.now() - cacheAt > CACHE_TTL_MS;
  if (stale || cache.size > CACHE_MAX) {
    cache.clear();
    cacheAt = Date.now();
  }

  const need: string[] = [];
  for (const id of alertRecordIds) {
    if (!id) continue;
    if (cache.has(id)) {
      const c = cache.get(id);
      if (c) out.set(id, c);
    } else if (!need.includes(id)) {
      need.push(id);
    }
  }
  if (!need.length) return out;

  for (let i = 0; i < need.length; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const params = new URLSearchParams();
    params.set("maxRecords", String(BATCH));
    params.set("filterByFormula", formula);
    params.append("fields[]", "CLIENTE");
    params.append("fields[]", "CLIENTES");
    const url = new URL(
      `https://api.airtable.com/v0/${baseId()}/${ALERTAS_TABLE}`
    );
    url.search = params.toString();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.SGSA_AIRTABLE_PAT ?? ""}` },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable respondió ${res.status} leyendo CLIENTE de alertas`);
    }
    const data = (await res.json()) as {
      records?: { id: string; fields?: Record<string, unknown> }[];
    };
    for (const rec of data.records ?? []) {
      const cliente = pickClientId(rec.fields ?? {});
      cache.set(rec.id, cliente);
      if (cliente) out.set(rec.id, cliente);
    }
    for (const id of batch) {
      if (!cache.has(id)) cache.set(id, null);
    }
  }
  return out;
}

/**
 * Decora alertas con `clienteRecordId` para el botón «Abrir cliente».
 * Nunca rompe el listado: ante error de Airtable devuelve las alertas como
 * estaban (el botón simplemente no aparece).
 */
export async function withClientRecordIds(
  alerts: SgsaAlertDto[]
): Promise<SgsaAlertDto[]> {
  const ids = alerts
    .map((a) => a.airtableRecordId)
    .filter((x): x is string => Boolean(x));
  if (!ids.length) return alerts;
  let map: Map<string, string>;
  try {
    map = await resolveAlertClientRecords(ids);
  } catch (err) {
    console.error("[alerts] no se pudo resolver el cliente de las alertas:", err);
    return alerts;
  }
  if (!map.size) return alerts;
  return alerts.map((a) => {
    const c = a.airtableRecordId ? map.get(a.airtableRecordId) : undefined;
    return c ? { ...a, clienteRecordId: c } : a;
  });
}
