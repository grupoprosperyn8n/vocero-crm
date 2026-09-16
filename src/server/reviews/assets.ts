import { ChatError } from "@/server/internal/chat";

/**
 * 033 — Assets de la revisión de envío (audio + análisis IA).
 *
 * Se sirven SIEMPRE frescos desde Airtable porque las URLs de los adjuntos
 * expiran en ~2 h: el CRM baja el archivo en el momento en que alguien mira
 * la tarjeta. Mismo origen que el flujo de Telegram:
 *   DENUNCIA DE ACCIDENTE → «CULPABILIDAD IA» (texto del análisis) y
 *   «EXTRACTOR_CODIGO_AUDIO» → BIBLIOTECA_AUDIOS (CODIGO_ID) → ARCHIVO_AUDIO.
 */

const AIRTABLE_API = "https://api.airtable.com/v0";
const DENUNCIA_TABLE = "DENUNCIA DE ACCIDENTE";
const BIBLIOTECA_TABLE = "BIBLIOTECA_AUDIOS";

const REC_ID_RE = /^rec[A-Za-z0-9]{14}$/;

function sgsaEnv(): { pat: string; baseId: string } | null {
  const pat = process.env.SGSA_AIRTABLE_PAT?.trim();
  const baseId = process.env.SGSA_BASE_ID?.trim();
  if (!pat || !baseId) return null;
  return { pat, baseId };
}

/** ¿Están configuradas las credenciales del sistema (Airtable)? */
export function reviewAssetsConfigured(): boolean {
  return sgsaEnv() !== null;
}

async function airtableGet(path: string): Promise<unknown> {
  const env = sgsaEnv();
  if (!env) {
    throw new ChatError(
      503,
      "not_configured",
      "Los adjuntos del sistema no están configurados en este CRM"
    );
  }
  const res = await fetch(`${AIRTABLE_API}/${env.baseId}/${path}`, {
    headers: { Authorization: `Bearer ${env.pat}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new ChatError(502, "airtable", "El sistema no respondió al pedir el adjunto");
  }
  return res.json();
}

/** Mismo `toText` del flujo: soporta lookup objects `{value}` y adjuntos. */
function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return toText(value[0]);
  if (typeof value === "object") {
    return String((value as { value?: unknown }).value ?? "").trim();
  }
  return String(value).trim();
}

async function denunciaFields(
  recordId: string
): Promise<Record<string, unknown> | null> {
  if (!REC_ID_RE.test(recordId)) return null;
  const data = (await airtableGet(
    `${encodeURIComponent(DENUNCIA_TABLE)}/${recordId}`
  )) as { fields?: Record<string, unknown> };
  return data.fields ?? null;
}

/** Análisis IA completo (campo «CULPABILIDAD IA») o null si no hay. */
export async function getReviewAnalisis(
  recordId: string
): Promise<string | null> {
  const fields = await denunciaFields(recordId);
  const text = toText(fields?.["CULPABILIDAD IA"]);
  return text || null;
}

/**
 * El audio REAL del flujo (el mismo que recibiría el cliente):
 * EXTRACTOR_CODIGO_AUDIO → BIBLIOTECA_AUDIOS (CODIGO_ID) → ARCHIVO_AUDIO.
 */
export async function getReviewAudio(
  recordId: string
): Promise<{ url: string; filename: string } | null> {
  const fields = await denunciaFields(recordId);
  if (!fields) return null;
  const code = toText(fields["EXTRACTOR_CODIGO_AUDIO"])
    .replace(/^\[+\s*/, "")
    .replace(/\s*\]+$/, "")
    .trim();
  if (!code) return null;
  const qs = new URLSearchParams({
    filterByFormula: `{CODIGO_ID} = '${code.replace(/'/g, "\\'")}'`,
    maxRecords: "1",
  });
  const data = (await airtableGet(
    `${encodeURIComponent(BIBLIOTECA_TABLE)}?${qs.toString()}`
  )) as { records?: { fields?: Record<string, unknown> }[] };
  const audioFields = data.records?.[0]?.fields;
  const attachment = Array.isArray(audioFields?.ARCHIVO_AUDIO)
    ? (audioFields?.ARCHIVO_AUDIO as { url?: unknown; filename?: unknown }[])[0]
    : null;
  const url = typeof attachment?.url === "string" ? attachment.url : null;
  if (!url) return null;
  const filename =
    typeof attachment?.filename === "string" && attachment.filename
      ? attachment.filename
      : `audio-${recordId}.mp3`;
  return { url, filename };
}
