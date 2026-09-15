import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { airtableBaseId } from "@/server/alerts/airtable-read";

/**
 * 032 — Fotos de perfil de los empleados (Airtable «FOTO DE PERFIL») en el CRM.
 *
 * Misma lógica que el backend de seguros (revisado antes de escribir esto):
 * la tabla EMPLEADOS es la fuente, la imagen se baja FRESCA (las URLs de los
 * adjuntos de Airtable expiran ~2 h) y se cachea un rato. El índice
 * email/empleado→foto se refresca cada 10 minutos; el binario dura 1 hora.
 * Empleado sin foto cargada = sin URL (la UI muestra iniciales, no se inventa).
 */

const IDX_TTL_MS = 10 * 60 * 1000;
const FOTO_TTL_MS = 60 * 60 * 1000;
const PHOTO_FIELD = "FOTO DE PERFIL";

type EmpleadoFoto = { idUnico: string; recId: string; url: string };
type Indice = {
  at: number;
  porEmail: Map<string, EmpleadoFoto>;
  porIdUnico: Map<string, EmpleadoFoto>;
  porRec: Map<string, EmpleadoFoto>;
};

let indiceCache: Indice | null = null;
const fotoCache = new Map<string, { at: number; data: Buffer; type: string }>();

function pat(): string | null {
  return process.env.SGSA_AIRTABLE_PAT?.trim() || null;
}

async function leerIndice(): Promise<Indice> {
  if (indiceCache && Date.now() - indiceCache.at < IDX_TTL_MS) {
    return indiceCache;
  }
  const idx: Indice = {
    at: Date.now(),
    porEmail: new Map(),
    porIdUnico: new Map(),
    porRec: new Map(),
  };
  const token = pat();
  if (!token) return indiceCache ?? idx;
  try {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of ["ID_UNICO_EMPLEADO", "EMAIL", PHOTO_FIELD]) {
      params.append("fields[]", f);
    }
    const res = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent("EMPLEADOS")}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      }
    );
    if (!res.ok) return indiceCache ?? idx;
    const data = (await res.json()) as {
      records?: { id: string; fields: Record<string, unknown> }[];
    };
    for (const r of data.records ?? []) {
      const f = r.fields;
      const idUnico = String(f["ID_UNICO_EMPLEADO"] ?? "").trim().toLowerCase();
      const email = String(f["EMAIL"] ?? "").trim().toLowerCase();
      const fotos = f[PHOTO_FIELD];
      const primera =
        Array.isArray(fotos) && fotos[0] && typeof fotos[0] === "object"
          ? (fotos[0] as { url?: unknown })
          : null;
      const url = String(primera?.url ?? "").trim();
      if (!idUnico || !url) continue;
      const entry: EmpleadoFoto = { idUnico, recId: r.id, url };
      idx.porIdUnico.set(idUnico, entry);
      idx.porRec.set(r.id.toLowerCase(), entry);
      if (email) idx.porEmail.set(email, entry);
    }
    indiceCache = idx;
    return idx;
  } catch {
    // Red caída: mejor un índice viejo que romper los avatares.
    return indiceCache ?? idx;
  }
}

/** URL del proxy para el avatar de un email (null si ese empleado no tiene foto). */
export async function avatarUrlForEmail(
  email: string | null | undefined
): Promise<string | null> {
  const clean = String(email ?? "").trim().toLowerCase();
  if (!clean) return null;
  const idx = await leerIndice();
  const e = idx.porEmail.get(clean);
  return e ? `/api/avatars/${e.idUnico}` : null;
}

/** Igual, para varios emails de una (una sola lectura del índice). */
export async function avatarUrlsForEmails(
  emails: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const idx = await leerIndice();
  const out = new Map<string, string>();
  for (const raw of emails) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (!email || out.has(email)) continue;
    const e = idx.porEmail.get(email);
    if (e) out.set(email, `/api/avatars/${e.idUnico}`);
  }
  return out;
}

/**
 * La foto en sí, para el proxy. `key` = idUnico (EMP995), rec (rec…) o usuario
 * del CRM (usr_…; su email decide). Devuelve null si no hay foto cargada.
 */
export async function fotoDeEmpleado(
  key: string
): Promise<{ data: Buffer; type: string } | null> {
  const k = String(key ?? "").trim().toLowerCase();
  if (!k) return null;
  const idx = await leerIndice();
  let hit: EmpleadoFoto | undefined;
  if (k.startsWith("rec")) {
    hit = idx.porRec.get(k);
  } else if (k.startsWith("usr")) {
    const rows = await getDb()
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, k))
      .limit(1);
    const email = String(rows[0]?.email ?? "").trim().toLowerCase();
    hit = email ? idx.porEmail.get(email) : undefined;
  } else {
    hit = idx.porIdUnico.get(k);
  }
  if (!hit) return null;

  const cached = fotoCache.get(hit.idUnico);
  if (cached && Date.now() - cached.at < FOTO_TTL_MS) return cached;

  try {
    const img = await fetch(hit.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; vocero-crm/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!img.ok) return cached ?? null;
    const type = img.headers.get("content-type") ?? "image/jpeg";
    const data = Buffer.from(await img.arrayBuffer());
    const entry = { at: Date.now(), data, type };
    fotoCache.set(hit.idUnico, entry);
    return entry;
  } catch {
    return cached ?? null;
  }
}
