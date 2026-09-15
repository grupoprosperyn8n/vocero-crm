/**
 * 030 — Lecturas de Airtable desde el servidor (PAT), para las funciones que
 * necesitan la tabla REAL y no una copia: el «macheado» del pipeline (ESTADO
 * de cada alerta) y el estado general de las alertas.
 */
const DEFAULT_BASE_ID = "appuhslj3GFf60Tea";

export function airtableBaseId(): string {
  return process.env.SGSA_BASE_ID?.trim() || DEFAULT_BASE_ID;
}

/** Record IDs de Airtable: `rec` + exactamente 14 alfanuméricos. */
export const REC_ID_RE = /^rec[A-Za-z0-9]{14}$/;

export type AirtableRec = { id: string; fields: Record<string, unknown> };

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.SGSA_AIRTABLE_PAT ?? ""}` };
}

/** Lista COMPLETA de una tabla (paginada), con los campos pedidos. */
export async function airtableListAll(
  table: string,
  fields: string[],
  timeoutMs = 15000
): Promise<AirtableRec[]> {
  const out: AirtableRec[] = [];
  let offset = "";
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of fields) params.append("fields[]", f);
    if (offset) params.set("offset", offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(table)}?${params.toString()}`,
      { headers: authHeaders(), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Airtable ${res.status} listando ${table}`);
    const data = (await res.json()) as { records?: AirtableRec[]; offset?: string };
    out.push(...(data.records ?? []));
    offset = data.offset ?? "";
  } while (offset);
  return out;
}

/** Registros puntuales por record id (lotes de 50 con OR(RECORD_ID()=…)). */
export async function airtableRecordsByIds(
  table: string,
  ids: string[],
  fields: string[],
  timeoutMs = 9000
): Promise<AirtableRec[]> {
  const out: AirtableRec[] = [];
  const uniq = [...new Set(ids.filter((i) => REC_ID_RE.test(i)))];
  for (let i = 0; i < uniq.length; i += 50) {
    const batch = uniq.slice(i, i + 50);
    const params = new URLSearchParams();
    params.set("maxRecords", "50");
    params.set(
      "filterByFormula",
      `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(", ")})`
    );
    for (const f of fields) params.append("fields[]", f);
    const res = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(table)}?${params.toString()}`,
      { headers: authHeaders(), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Airtable ${res.status} leyendo ${table}`);
    const data = (await res.json()) as { records?: AirtableRec[] };
    out.push(...(data.records ?? []));
  }
  return out;
}

/**
 * 031c — PATCH puntual de campos de UN registro (con typecast: si el valor
 * matchea una opción existente la usa tal cual; null limpia el campo).
 * Se usa para la prioridad, que va en ambas direcciones: la tarjeta la manda
 * a la tabla y la tabla la manda a la tarjeta. Devuelve el resultado en vez
 * de tirar: el llamador decide si el cambio se acepta o se rechaza.
 */
export async function airtablePatchRecord(
  table: string,
  recordId: string,
  fields: Record<string, unknown>,
  timeoutMs = 12000
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(table)}/${recordId}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ fields, typecast: true }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      }
    );
    if (res.ok) return { ok: true };
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: detail.slice(0, 200) };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      detail: err instanceof Error ? err.message : "network",
    };
  }
}
