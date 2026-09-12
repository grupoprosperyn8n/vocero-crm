/**
 * Clientes del sistema de gestión de seguros (Airtable "SISTEMA GESTION DE
 * SEGUROS AGENTICO") — lectura SOLO desde el CRM.
 *
 * El pedido (Diego, 2026-09-12): desde el CRM buscar un cliente en el
 * backend, ver su tarjeta con los datos que importan y desde ahí abrir el
 * chat (WhatsApp/Telegram) sin salir del CRM. La base sigue siendo la fuente
 * única: acá no se copia nada; el vínculo se guarda como `external_ref`
 * (`sgsa:<recordId>`) en el contacto del CRM al abrir el chat.
 *
 * Config por entorno del servidor:
 *   SGSA_AIRTABLE_PAT — PAT con lectura sobre la base (obligatorio).
 *   SGSA_BASE_ID      — default: appuhslj3GFf60Tea (base de producción).
 */
import type { SystemClientDto } from "@/lib/types";
import { phoneDigits } from "@/server/clients/phone";

const DEFAULT_BASE_ID = "appuhslj3GFf60Tea";
const CLIENTES_TABLE = "CLIENTES";
const OFICINAS_TABLE = "OFICINAS";

/**
 * Campos que la tarjeta necesita. Traer la fila completa es carísimo (64
 * campos, varios con IA); con `fields[]` la respuesta baja a lo justo.
 */
const CLIENTE_FIELDS = [
  "NOMBRES",
  "APELLIDO",
  "DNI",
  "TELEFONO",
  "TELEFONO NORMALIZADO",
  "EMAIL",
  "🏷️ ESTADO_CLIENTE",
  "ID_UNICO_CLIENTE",
  "FECHA DE ALTA",
  "FECHA DE BAJA",
  "✅ CANTIDAD_POLIZAS",
  "🟢 POLIZAS_ACTIVAS",
  "🔴 POLIZAS_ANULADAS",
  "🟡 POLIZAS_EN_TRAMITES",
  "📆 LA_POLIZAS VENCE EN 30 DIAS",
  "📆 LA_POLIZAS VENCE EN 7 DIAS",
  "OFICINAS",
  "PERFIL_DE_RIESGO_IA",
] as const;

type AirtableRecord = { id: string; fields: Record<string, unknown> };

export class SgsaError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "SgsaError";
  }
}

export function isSgsaConfigured(): boolean {
  return Boolean(process.env.SGSA_AIRTABLE_PAT?.trim());
}

function baseId(): string {
  return process.env.SGSA_BASE_ID?.trim() || DEFAULT_BASE_ID;
}

/** Nombre como está en la base: mayúsculas sin acentos (NOMBRE NORMALIZADO). */
export function normalizeNameQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Dígitos útiles de la consulta (para teléfono/DNI). */
export function searchDigits(q: string): string {
  return phoneDigits(q);
}

/**
 * Fórmula Airtable del buscador: nombre normalizado por substring, teléfono
 * por substring de dígitos y DNI exacto. Las comillas del input se descartan:
 * duplicarlas rompería la fórmula.
 */
export function buildSearchFormula(q: string): string {
  const safe = q.replace(/"/g, "");
  const name = normalizeNameQuery(safe);
  const digits = searchDigits(safe);
  const parts: string[] = [];
  if (name) parts.push(`FIND("${name}", {NOMBRE NORMALIZADO})`);
  if (digits.length >= 6) {
    parts.push(`FIND("${digits}", {TELEFONO NORMALIZADO})`);
  }
  if (/^\d{6,8}$/.test(digits) && digits === safe.trim()) {
    parts.push(`{DNI}=${Number(digits)}`);
  }
  if (!parts.length) {
    // Entrada sin contenido buscable (p. ej. solo comillas): fórmula válida
    // que no matchea nada, para no romper el request.
    parts.push('FIND("@@no-match@@", {NOMBRE NORMALIZADO})');
  }
  return `OR(${parts.join(", ")})`;
}

async function airtableList(
  table: string,
  params: URLSearchParams
): Promise<AirtableRecord[]> {
  const url = new URL(
    `https://api.airtable.com/v0/${baseId()}/${encodeURIComponent(table)}`
  );
  url.search = params.toString();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.SGSA_AIRTABLE_PAT ?? ""}` },
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SgsaError(`Airtable respondió ${res.status}`, res.status);
  }
  const data = (await res.json()) as { records?: AirtableRecord[] };
  return data.records ?? [];
}

/** Caché chica de nombres de oficina: se repiten en cada búsqueda. */
const oficinaCache = new Map<string, string>();
let oficinaCacheAt = 0;
const OFICINA_TTL_MS = 10 * 60_000;

async function resolveOficinas(ids: string[]): Promise<Map<string, string>> {
  const stale = Date.now() - oficinaCacheAt > OFICINA_TTL_MS;
  const need = stale ? ids : ids.filter((id) => !oficinaCache.has(id));
  const out = new Map<string, string>();
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const params = new URLSearchParams();
    params.set("maxRecords", "50");
    params.set("filterByFormula", formula);
    params.append("fields[]", "OFICINAS");
    const recs = await airtableList(OFICINAS_TABLE, params);
    for (const r of recs) {
      oficinaCache.set(r.id, String(r.fields["OFICINAS"] ?? ""));
    }
  }
  if (need.length) oficinaCacheAt = Date.now();
  for (const id of ids) {
    const name = oficinaCache.get(id);
    if (name) out.set(id, name);
  }
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

/** Busca clientes por nombre / teléfono / DNI y los mapea a la tarjeta. */
export async function searchClients(
  q: string,
  limit = 8
): Promise<SystemClientDto[]> {
  const params = new URLSearchParams();
  params.set("maxRecords", String(limit));
  params.set("filterByFormula", buildSearchFormula(q));
  for (const f of CLIENTE_FIELDS) params.append("fields[]", f);
  const recs = await airtableList(CLIENTES_TABLE, params);

  const oficinaIds = Array.from(
    new Set(
      recs.flatMap((r) =>
        Array.isArray(r.fields["OFICINAS"])
          ? (r.fields["OFICINAS"] as string[])
          : []
      )
    )
  );
  const oficinas = oficinaIds.length
    ? await resolveOficinas(oficinaIds)
    : new Map<string, string>();

  return recs.map((r) => {
    const f = r.fields;
    const telDigits =
      str(f["TELEFONO NORMALIZADO"]) ?? phoneDigits(str(f["TELEFONO"]) ?? "");
    const oficinaId = Array.isArray(f["OFICINAS"])
      ? (f["OFICINAS"] as string[])[0]
      : undefined;
    const perfil = str(f["PERFIL_DE_RIESGO_IA"]);
    return {
      recordId: r.id,
      nombre: str(f["NOMBRES"]) ?? "",
      apellido: str(f["APELLIDO"]) ?? "",
      dni: str(f["DNI"]),
      telefono: telDigits || null,
      telefonoRaw: str(f["TELEFONO"]),
      email: str(f["EMAIL"]),
      estado: str(f["🏷️ ESTADO_CLIENTE"]),
      oficina: oficinaId ? (oficinas.get(oficinaId) ?? null) : null,
      idUnico: str(f["ID_UNICO_CLIENTE"]),
      fechaAlta: str(f["FECHA DE ALTA"]),
      perfilRiesgo: perfil ? perfil.slice(0, 1500) : null,
      polizas: {
        total: num(f["✅ CANTIDAD_POLIZAS"]),
        activas: num(f["🟢 POLIZAS_ACTIVAS"]),
        anuladas: num(f["🔴 POLIZAS_ANULADAS"]),
        enTramite: num(f["🟡 POLIZAS_EN_TRAMITES"]),
        vence7: num(f["📆 LA_POLIZAS VENCE EN 7 DIAS"]),
        vence30: num(f["📆 LA_POLIZAS VENCE EN 30 DIAS"]),
      },
    } satisfies SystemClientDto;
  });
}
