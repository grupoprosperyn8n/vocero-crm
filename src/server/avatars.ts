import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { airtableBaseId } from "@/server/alerts/airtable-read";
import { phoneKey } from "@/server/clients/phone";
import {
  getTelegramCredentialsByOrg,
  markTelegramReconnectRequired,
} from "@/server/telegram/credentials";
import {
  TelegramApiError,
  downloadFile,
  getFile,
  getUserProfilePhotos,
} from "@/lib/telegram/client";

/**
 * 032/035 — Fotos de perfil en el CRM.
 *
 * 032: empleados (Airtable EMPLEADOS «FOTO DE PERFIL»). La imagen se baja
 * FRESCA (las URLs de los adjuntos de Airtable expiran ~2 h) y se cachea un
 * rato. El índice email/nombre/empleado→foto se refresca cada 10 minutos; el
 * binario dura 1 hora. Empleado sin foto cargada = sin URL (la UI muestra
 * iniciales, no se inventa).
 *
 * 035: los CONTACTOS de la bandeja, según su conversación:
 *   - Telegram: la foto real del perfil del usuario, vía Bot API
 *     (getUserProfilePhotos → getFile → descarga). Si no tiene foto o su
 *     privacidad no lo permite al bot, no hay URL.
 *   - WhatsApp: la API oficial de Meta NO expone la foto de perfil del
 *     contacto; se usa la foto del CLIENTE en el sistema de seguros
 *     (Airtable CLIENTES «FOTO PERFIL»), macheado por teléfono normalizado
 *     (misma llave que el buscador) o por registro cuando se conoce.
 */

const IDX_TTL_MS = 10 * 60 * 1000;
const FOTO_TTL_MS = 60 * 60 * 1000;
/** "No tiene foto": no golpear la fuente en cada render, reintentar cada 30'. */
const FOTO_SIN_TTL_MS = 30 * 60 * 1000;
const PHOTO_FIELD = "FOTO DE PERFIL";

type Foto = { data: Buffer; type: string };

function pat(): string | null {
  return process.env.SGSA_AIRTABLE_PAT?.trim() || null;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Primera foto de un campo Adjuntos (prefiere la miniatura grande: pesa menos). */
function fotoDeAdjunto(v: unknown): string {
  const list = Array.isArray(v) ? v : [];
  const primera = list[0] as
    | { url?: unknown; thumbnails?: { large?: { url?: unknown } } }
    | undefined;
  if (!primera) return "";
  return String(primera.thumbnails?.large?.url ?? primera.url ?? "").trim();
}

/** Nombre comparable: mayúsculas, sin acentos, espacios colapsados. */
function normNombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function bajarImagen(url: string): Promise<Foto | null> {
  try {
    const img = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; vocero-crm/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!img.ok) return null;
    const type = img.headers.get("content-type") ?? "image/jpeg";
    return { data: Buffer.from(await img.arrayBuffer()), type };
  } catch {
    return null;
  }
}

/* ============================================================
 * Empleados (032) — Airtable EMPLEADOS «FOTO DE PERFIL»
 * ============================================================ */

type EmpleadoFoto = { idUnico: string; recId: string; url: string };
type IndiceEmpleados = {
  at: number;
  porEmail: Map<string, EmpleadoFoto>;
  porNombre: Map<string, EmpleadoFoto>;
  porIdUnico: Map<string, EmpleadoFoto>;
  porRec: Map<string, EmpleadoFoto>;
};

let indiceCache: IndiceEmpleados | null = null;

async function leerIndice(): Promise<IndiceEmpleados> {
  if (indiceCache && Date.now() - indiceCache.at < IDX_TTL_MS) {
    return indiceCache;
  }
  const idx: IndiceEmpleados = {
    at: Date.now(),
    porEmail: new Map(),
    porNombre: new Map(),
    porIdUnico: new Map(),
    porRec: new Map(),
  };
  const token = pat();
  if (!token) return indiceCache ?? idx;
  try {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    for (const f of [
      "ID_UNICO_EMPLEADO",
      "NOMBRE Y APELLIDO",
      "EMAIL",
      PHOTO_FIELD,
    ]) {
      params.append("fields[]", f);
    }
    const res = await fetch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent("EMPLEADOS")}?${params.toString()}`,
      {
        headers: bearer(token),
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
      // 035 — fichas sin email cargado: el nombre desempata (mismo formato
      // «APELLIDO NOMBRE» en las dos puntas).
      const nombre = normNombre(String(f["NOMBRE Y APELLIDO"] ?? ""));
      const url = fotoDeAdjunto(f[PHOTO_FIELD]);
      if (!idUnico || !url) continue;
      const entry: EmpleadoFoto = { idUnico, recId: r.id, url };
      idx.porIdUnico.set(idUnico, entry);
      idx.porRec.set(r.id.toLowerCase(), entry);
      if (email) idx.porEmail.set(email, entry);
      if (nombre) idx.porNombre.set(nombre, entry);
    }
    indiceCache = idx;
    return idx;
  } catch {
    // Red caída: mejor un índice viejo que romper los avatares.
    return indiceCache ?? idx;
  }
}

export type PersonaAvatar = { email?: string | null; name?: string | null };

/**
 * URLs del proxy para una lista de personas (empleados), una sola lectura:
 * email primero y, si la ficha no lo trae, nombre normalizado. null en la
 * posición = esa persona no tiene foto.
 */
export async function avatarUrlsForPeople(
  people: PersonaAvatar[]
): Promise<(string | null)[]> {
  const idx = await leerIndice();
  return people.map((p) => {
    const email = String(p.email ?? "").trim().toLowerCase();
    const hit =
      (email ? idx.porEmail.get(email) : undefined) ??
      idx.porNombre.get(normNombre(String(p.name ?? "")));
    return hit ? `/api/avatars/${hit.idUnico}` : null;
  });
}

/* ============================================================
 * Clientes del sistema (035) — Airtable CLIENTES «FOTO PERFIL»
 * ============================================================ */

/** Tope de páginas del índice filtrado (100 por página). */
const CLIENTES_MAX_PAGES = 20;
type ClienteFoto = { recId: string; url: string };
type IndiceClientes = {
  at: number;
  porTelefono: Map<string, ClienteFoto>;
  porRec: Map<string, ClienteFoto>;
};

let indiceClientesCache: IndiceClientes | null = null;

/**
 * Índice de clientes CON foto. El filtro de Airtable deja afuera al resto:
 * la tabla es de miles de filas y solo interesan los que tienen imagen.
 */
async function leerIndiceClientes(): Promise<IndiceClientes> {
  if (indiceClientesCache && Date.now() - indiceClientesCache.at < IDX_TTL_MS) {
    return indiceClientesCache;
  }
  const idx: IndiceClientes = {
    at: Date.now(),
    porTelefono: new Map(),
    porRec: new Map(),
  };
  const token = pat();
  if (!token) return indiceClientesCache ?? idx;
  try {
    let offset: string | null = null;
    let pages = 0;
    do {
      const params = new URLSearchParams();
      params.set("pageSize", "100");
      params.set("filterByFormula", `NOT({${PHOTO_FIELD}} = '')`);
      for (const f of [
        "ID_UNICO_CLIENTE",
        "TELEFONO NORMALIZADO",
        "TELEFONO",
        PHOTO_FIELD,
      ]) {
        params.append("fields[]", f);
      }
      if (offset) params.set("offset", offset);
      const res = await fetch(
        `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent("CLIENTES")}?${params.toString()}`,
        {
          headers: bearer(token),
          signal: AbortSignal.timeout(12000),
          cache: "no-store",
        }
      );
      if (!res.ok) return indiceClientesCache ?? idx;
      const data = (await res.json()) as {
        records?: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      };
      for (const r of data.records ?? []) {
        const f = r.fields;
        const url = fotoDeAdjunto(f[PHOTO_FIELD]);
        if (!url) continue;
        const entry: ClienteFoto = { recId: r.id, url };
        idx.porRec.set(r.id.toLowerCase(), entry);
        const key = phoneKey(
          String(f["TELEFONO NORMALIZADO"] ?? f["TELEFONO"] ?? "")
        );
        if (key.length >= 8) idx.porTelefono.set(key, entry);
      }
      offset = data.offset ?? null;
      pages += 1;
    } while (offset && pages < CLIENTES_MAX_PAGES);
    indiceClientesCache = idx;
    return idx;
  } catch {
    return indiceClientesCache ?? idx;
  }
}

/* ============================================================
 * Contactos de la bandeja (035): qué URL de foto les toca
 * ============================================================ */

export type ContactoAvatar = {
  id: string;
  channel: string;
  waIdentity: string | null;
  phone: string | null;
};

/** Chat id de Telegram (`tg:<id>`) → id; null si la identidad no es de TG. */
function tgChatId(waIdentity: string | null): string | null {
  const s = String(waIdentity ?? "").trim();
  return s.toLowerCase().startsWith("tg:") ? s.slice(3).trim() || null : null;
}

/**
 * Foto que le corresponde a cada contacto según SU conversación:
 *   - Telegram → foto real de perfil (se resuelve recién al pedir la imagen).
 *   - WhatsApp → foto del cliente del sistema con el mismo teléfono; si no
 *     hay, sin URL (la UI cae a las iniciales). Nunca se inventa una cara.
 * Devuelve un Map contacto→URL (los sin foto no aparecen).
 */
export async function avatarUrlsForContacts(
  contacts: ContactoAvatar[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const idx = await leerIndiceClientes();
  for (const c of contacts) {
    if (c.channel === "telegram") {
      const id = tgChatId(c.waIdentity);
      if (id) out.set(c.id, `/api/avatars/tg:${id}`);
      continue;
    }
    if (c.channel !== "whatsapp") continue;
    const key = phoneKey(c.phone ?? c.waIdentity ?? "");
    if (key.length >= 8 && idx.porTelefono.has(key)) {
      out.set(c.id, `/api/avatars/cli:${key}`);
    }
  }
  return out;
}

/** Igual que la anterior pero para UN contacto. */
export async function avatarUrlForContact(
  contact: ContactoAvatar
): Promise<string | null> {
  return (await avatarUrlsForContacts([contact])).get(contact.id) ?? null;
}

/* ============================================================
 * Proxy de imágenes: /api/avatars/<key> (032/035)
 * ============================================================ */

const fotoCache = new Map<string, { at: number; data: Buffer; type: string }>();
/** Marca de "no tiene foto" por llave: evita golpear la fuente en cada render. */
const sinFotoCache = new Map<string, number>();

async function fotoDeEmpleado(
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

  const img = await bajarImagen(hit.url);
  if (!img) return cached ?? null;
  const entry = { at: Date.now(), ...img };
  fotoCache.set(hit.idUnico, entry);
  return entry;
}

/** Foto del cliente del sistema: `cli:<llave de teléfono>` o `cli:<rec…>`. */
async function fotoDeCliente(
  keyPart: string
): Promise<{ data: Buffer; type: string } | null> {
  const k = String(keyPart ?? "").trim().toLowerCase();
  if (!k) return null;
  const idx = await leerIndiceClientes();
  const hit = k.startsWith("rec") ? idx.porRec.get(k) : idx.porTelefono.get(k);
  if (!hit) return null;
  const ck = `cli:${k}`;
  const cached = fotoCache.get(ck);
  if (cached && Date.now() - cached.at < FOTO_TTL_MS) return cached;
  const img = await bajarImagen(hit.url);
  if (!img) return cached ?? null;
  const entry = { at: Date.now(), ...img };
  fotoCache.set(ck, entry);
  return entry;
}

/**
 * Foto real del perfil de Telegram del contacto: el bot de la organización la
 * pide a la Bot API. Vacío = no tiene foto o su privacidad no la expone;
 * token muerto = se marca la conexión para reconectar.
 */
async function fotoDeTelegrama(
  organizationId: string,
  chatIdRaw: string
): Promise<{ data: Buffer; type: string } | null> {
  const chatId = String(chatIdRaw ?? "").trim();
  if (!chatId) return null;
  const ck = `tg:${chatId}`;
  const cached = fotoCache.get(ck);
  if (cached && Date.now() - cached.at < FOTO_TTL_MS) return cached;
  const sin = sinFotoCache.get(ck);
  if (sin && Date.now() - sin < FOTO_SIN_TTL_MS) return cached ?? null;

  const creds = await getTelegramCredentialsByOrg(organizationId);
  if (!creds || creds.status !== "connected") return cached ?? null;
  try {
    const photos = await getUserProfilePhotos(creds.token, chatId);
    const sizes = Array.isArray(photos.photos) ? photos.photos[0] : null;
    const largest = sizes && sizes.length ? sizes[sizes.length - 1] : null;
    if (!largest?.file_id) {
      sinFotoCache.set(ck, Date.now());
      return cached ?? null;
    }
    const file = await getFile(creds.token, largest.file_id);
    if (!file.file_path) {
      sinFotoCache.set(ck, Date.now());
      return cached ?? null;
    }
    const data = await downloadFile(creds.token, file.file_path);
    const entry = { at: Date.now(), data, type: "image/jpeg" };
    fotoCache.set(ck, entry);
    return entry;
  } catch (err) {
    if (err instanceof TelegramApiError && err.isAuthError) {
      await markTelegramReconnectRequired(organizationId).catch(() => {});
      return cached ?? null;
    }
    sinFotoCache.set(ck, Date.now());
    return cached ?? null;
  }
}

/**
 * La foto en sí, para el proxy `/api/avatars/[key]`. Llaves:
 *   - `EMP995` / `rec…` / `usr_…` → empleados (032).
 *   - `tg:<chat id>` → foto de perfil de Telegram (035).
 *   - `cli:<llave de teléfono>` / `cli:rec…` → foto del cliente del sistema (035).
 * null = sin foto: la UI cae a las iniciales.
 */
export async function fotoDeAvatar(
  key: string,
  organizationId: string
): Promise<{ data: Buffer; type: string } | null> {
  const k = String(key ?? "").trim();
  const low = k.toLowerCase();
  if (low.startsWith("tg:")) return fotoDeTelegrama(organizationId, k.slice(3));
  if (low.startsWith("cli:")) return fotoDeCliente(k.slice(4));
  return fotoDeEmpleado(k);
}
