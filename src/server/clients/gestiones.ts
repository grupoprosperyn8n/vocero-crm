/**
 * Gestiones del sistema (Airtable «GESTIÓN GENERAL») — lectura SOLO desde el
 * CRM, hermano de `sgsa.ts` (clientes). Acá no se copia nada: la base sigue
 * siendo la fuente única.
 *
 * Pedido (Diego, 15Sep): en el Pipeline de gestiones, un buscador para sumar
 * gestiones puntuales del backoffice como tarjetas.
 *
 * Config por entorno del servidor:
 *   SGSA_AIRTABLE_PAT — PAT con lectura sobre la base (obligatorio).
 *   SGSA_BASE_ID      — default: appuhslj3GFf60Tea (base de producción).
 */
import type { SgsaGestionDto } from "@/lib/types";
import { sgsaGestionInterfaceUrl } from "@/lib/sgsa-links";
import {
  airtableList,
  normalizeNameQuery,
  searchClients,
  searchDigits,
} from "@/server/clients/sgsa";

const GESTIONES_TABLE = "GESTIÓN GENERAL";

/** Campos que la tarjeta necesita (la fila completa trae 50+ campos). */
const GESTION_FIELDS = [
  "ID_UNICO_GESTION",
  "NUMERO",
  "CLIENTE",
  "DNI (from CLIENTE)",
  "TELEFONO (from CLIENTE)",
  "MOTIVOS DE LA CONSULTA",
  "TIPO DE ATENCIÓN",
  "PRIORIDAD DE TRABAJO",
  "FECHA DE CREACION",
  "N° DE POLIZA",
  "PATENTE DEL VEHICULO",
  "MARCA",
  "MODELO",
  "ES CLIENTE",
] as const;

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Link arrays y lookups: el primer valor (los clientes de una gestión son 1). */
function firstOf(v: unknown): string | null {
  if (Array.isArray(v)) return v.length > 0 ? str(v[0]) : null;
  return str(v);
}

/**
 * Fórmula del buscador de gestiones: id único / motivo / marca / modelo /
 * póliza por substring, DNI/teléfono/patente por dígitos, número exacto y
 * los clientes que el buscador de clientes ya resolvió (`ARRAYJOIN(CLIENTE)`
 * permite buscar por link). Las comillas del input se descartan: duplicarlas
 * rompería la fórmula.
 */
export function buildGestionSearchFormula(q: string, clienteRecIds: string[]): string {
  const safe = q.replace(/"/g, "");
  const name = normalizeNameQuery(safe);
  const digits = searchDigits(safe);
  const parts: string[] = [];

  if (name.length >= 2) {
    parts.push(`FIND("${name}", UPPER({ID_UNICO_GESTION}))`);
    parts.push(`FIND("${name}", UPPER({MOTIVOS DE LA CONSULTA}))`);
    parts.push(`FIND("${name}", UPPER({MARCA}))`);
    parts.push(`FIND("${name}", UPPER({MODELO}))`);
    parts.push(`FIND("${name}", UPPER(ARRAYJOIN({N° DE POLIZA})))`);
  }
  if (digits.length >= 3) {
    parts.push(`FIND("${digits}", ARRAYJOIN({DNI (from CLIENTE)}))`);
    parts.push(`FIND("${digits}", ARRAYJOIN({TELEFONO (from CLIENTE)}))`);
    parts.push(`FIND("${digits}", UPPER({PATENTE DEL VEHICULO}))`);
    if (/^\d{1,6}$/.test(digits) && digits === safe.trim()) {
      parts.push(`{NUMERO}=${Number(digits)}`);
    }
  }
  for (const rec of clienteRecIds) {
    parts.push(`FIND("${rec}", ARRAYJOIN({CLIENTE}))`);
  }
  if (!parts.length) {
    // Entrada sin contenido buscable: fórmula válida que no matchea nada.
    parts.push('FIND("@@no-match@@", {ID_UNICO_GESTION})');
  }
  return `OR(${parts.join(", ")})`;
}

/**
 * Busca gestiones (por id único, número, motivo, marca, patente, póliza,
 * DNI/teléfono o nombre del cliente) y las mapea a la tarjeta del pipeline.
 */
export async function searchGestiones(q: string, limit = 12): Promise<SgsaGestionDto[]> {
  // El buscador de clientes ya sabe de nombres/DNI/teléfono: sus recordIds
  // entran a la fórmula como `ARRAYJOIN({CLIENTE})`.
  const clientes = await searchClients(q, 8).catch(() => []);

  const params = new URLSearchParams();
  params.set("maxRecords", String(limit));
  params.set("filterByFormula", buildGestionSearchFormula(q, clientes.map((c) => c.recordId)));
  for (const f of GESTION_FIELDS) params.append("fields[]", f);
  params.set("sort[0][field]", "FECHA DE CREACION");
  params.set("sort[0][direction]", "desc");
  const recs = await airtableList(GESTIONES_TABLE, params);

  // Nombres de cliente: los que ya trajo la búsqueda + una pasada por los
  // que falten (las gestiones se muestran con nombre, no con rec…).
  const names = new Map<string, string>(
    clientes.map((c) => [c.recordId, `${c.nombre} ${c.apellido}`.trim()])
  );
  const missing = Array.from(
    new Set(
      recs.flatMap((r) =>
        Array.isArray(r.fields["CLIENTE"]) ? (r.fields["CLIENTE"] as string[]) : []
      )
    )
  ).filter((id) => !names.has(id));
  if (missing.length) {
    const p2 = new URLSearchParams();
    p2.set("maxRecords", "50");
    p2.set("filterByFormula", `OR(${missing.map((id) => `RECORD_ID()="${id}"`).join(",")})`);
    p2.append("fields[]", "NOMBRES");
    p2.append("fields[]", "APELLIDO");
    const cli = await airtableList("CLIENTES", p2).catch(() => []);
    for (const c of cli) {
      names.set(c.id, `${str(c.fields["NOMBRES"]) ?? ""} ${str(c.fields["APELLIDO"]) ?? ""}`.trim());
    }
  }

  return recs.map((r) => {
    const f = r.fields;
    const clienteRecordId = Array.isArray(f["CLIENTE"])
      ? (f["CLIENTE"] as string[])[0] ?? null
      : null;
    const marca = str(f["MARCA"]);
    const modelo = str(f["MODELO"]);
    return {
      recordId: r.id,
      idUnico: str(f["ID_UNICO_GESTION"]),
      numero: num(f["NUMERO"]),
      clienteRecordId,
      clienteNombre: clienteRecordId ? names.get(clienteRecordId) ?? null : null,
      dni: firstOf(f["DNI (from CLIENTE)"]),
      telefono: firstOf(f["TELEFONO (from CLIENTE)"]),
      motivo: str(f["MOTIVOS DE LA CONSULTA"]),
      tipoAtencion: str(f["TIPO DE ATENCIÓN"]),
      prioridad: str(f["PRIORIDAD DE TRABAJO"]),
      fecha: str(f["FECHA DE CREACION"]),
      poliza: firstOf(f["N° DE POLIZA"]),
      patente: str(f["PATENTE DEL VEHICULO"]),
      marcaModelo: [marca, modelo].filter(Boolean).join(" ") || null,
      esCliente: typeof f["ES CLIENTE"] === "boolean" ? (f["ES CLIENTE"] as boolean) : null,
      registroUrl: sgsaGestionInterfaceUrl(r.id, clienteRecordId),
    } satisfies SgsaGestionDto;
  });
}
