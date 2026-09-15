/**
 * 028b — Resolución del CLIENTE de cada alerta (Airtable ALERTAS → CLIENTE[]).
 *
 * Las alertas del backend traen el nombre del cliente (`clienteNombre`) pero
 * no el registro de CLIENTES al que pertenece; el LINK_REGISTRO que arma SGSA
 * apunta al registro origen (póliza/gestión), no al cliente. Para el botón
 * «Abrir cliente» (ficha del cliente en la interface) hace falta el recordId
 * del cliente, así que se lee el campo link `CLIENTE` de la tabla ALERTAS.
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
      records?: { id: string; fields?: { CLIENTE?: unknown } }[];
    };
    for (const rec of data.records ?? []) {
      const links = rec.fields?.CLIENTE;
      const cliente =
        Array.isArray(links) && links.length && typeof links[0] === "string"
          ? links[0]
          : null;
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
