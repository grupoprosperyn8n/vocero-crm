/**
 * 044b-B13 — el BAÚL de plantillas de piezas del Constructor.
 *
 * Cualquier pieza (publicación, formulario, encuesta o cupón/voucher) se puede
 * guardar como plantilla con nombre y segmento, y reusarse desde el hub
 * «Crear» — para todos los roles. Las derivadas del catálogo de Plantillas de
 * Meta entran con `sourceCode` (las siembra `seedTemplateCatalog`).
 *
 * El `data` guarda los MISMOS campos del estado del Constructor para poder
 * re-aplicarlos tal cual (form + campos/cupon de los builders).
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export class PieceTemplateError extends Error {
  code: "invalid" | "not_found";

  constructor(code: PieceTemplateError["code"], message: string) {
    super(message);
    this.name = "PieceTemplateError";
    this.code = code;
  }
}

export function pieceTemplateErrorStatus(err: PieceTemplateError): number {
  return err.code === "not_found" ? 404 : 422;
}

/** Tipos de pieza del Constructor (mismo vocabulario que `WidgetTipo`). */
export const PIECE_KINDS = ["publicacion", "formulario", "encuesta", "cupon"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export function isPieceKind(v: unknown): v is PieceKind {
  return typeof v === "string" && (PIECE_KINDS as readonly string[]).includes(v);
}

export type PieceCampo = {
  id: string;
  label: string;
  tipo: string;
  requerido: boolean;
  opciones: string[];
};

export type PieceTemplateData = {
  title: string;
  subtitle: string;
  body: string;
  offer: string;
  benefit: string;
  ctaLabel: string;
  ctaKind: string;
  accent: string;
  /** formulario/encuesta — los campos o preguntas del builder. */
  campos?: PieceCampo[];
  /** cupón — el beneficio y sus condiciones. */
  cupon?: {
    beneficio: string;
    condiciones: string;
    desde: string;
    hasta: string;
    prefijo: string;
  };
};

const MAX_CAMPOS = 20;
const WIDGET_FIELD_TIPOS = new Set([
  "texto",
  "parrafo",
  "email",
  "telefono",
  "numero",
  "seleccion",
  "si_no",
  "escala",
]);

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function cleanOpciones(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((o) => cleanText(o, 80))
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeCampos(raw: unknown): PieceCampo[] {
  if (!Array.isArray(raw)) return [];
  const out: PieceCampo[] = [];
  for (const item of raw) {
    const c = (item ?? {}) as Record<string, unknown>;
    const label = cleanText(c.label, 200);
    if (!label) continue;
    const tipoRaw = cleanText(c.tipo, 20);
    const tipo = WIDGET_FIELD_TIPOS.has(tipoRaw) ? tipoRaw : "texto";
    const idRaw = cleanText(c.id, 40);
    out.push({
      id: /^[A-Za-z0-9_-]{4,40}$/.test(idRaw) ? idRaw : newId("widgetField"),
      label,
      tipo,
      requerido: c.requerido === true,
      opciones: cleanOpciones(c.opciones),
    });
    if (out.length >= MAX_CAMPOS) break;
  }
  return out;
}

/**
 * Valida y normaliza el `data` de una plantilla del baúl para su tipo.
 * Devuelve null si no cumple el mismo mínimo que exige el Constructor.
 */
export function sanitizePieceData(
  kind: PieceKind,
  raw: unknown
): PieceTemplateData | null {
  const d = (raw ?? {}) as Record<string, unknown>;
  const base: PieceTemplateData = {
    title: cleanText(d.title, 160),
    subtitle: cleanText(d.subtitle, 200),
    body: cleanText(d.body, 2000),
    offer: cleanText(d.offer, 200),
    benefit: cleanText(d.benefit, 160),
    ctaLabel: cleanText(d.ctaLabel, 40),
    ctaKind: ["link", "pdf", "agenda"].includes(cleanText(d.ctaKind, 10))
      ? cleanText(d.ctaKind, 10)
      : "link",
    accent: cleanText(d.accent, 20),
  };

  if (kind === "formulario" || kind === "encuesta") {
    const campos = sanitizeCampos(d.campos);
    if (campos.length === 0) return null;
    return { ...base, campos };
  }

  if (kind === "cupon") {
    const c = (d.cupon ?? {}) as Record<string, unknown>;
    const beneficio = cleanText(c.beneficio, 200);
    if (!beneficio) return null;
    const isoOrEmpty = (v: unknown): string => {
      const s = cleanText(v, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
    };
    const prefijo =
      cleanText(c.prefijo, 8)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) || "VCH";
    return {
      ...base,
      cupon: {
        beneficio,
        condiciones: cleanText(c.condiciones, 400),
        desde: isoOrEmpty(c.desde),
        hasta: isoOrEmpty(c.hasta),
        prefijo,
      },
    };
  }

  return base;
}

type PieceTemplateRow = typeof schema.pieceTemplate.$inferSelect;

export function serializePieceTemplate(t: PieceTemplateRow) {
  return {
    id: t.id,
    kind: t.kind,
    name: t.name,
    segment: t.segment ?? null,
    data: t.data,
    sourceCode: t.sourceCode ?? null,
    autoRule: t.autoRule ?? null,
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Lista el baúl completo de la organización (más nuevas primero). */
export async function listPieceTemplates(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.pieceTemplate)
    .where(scoped(schema.pieceTemplate.organizationId, organizationId))
    .orderBy(desc(schema.pieceTemplate.createdAt));
}

export async function createPieceTemplate(
  organizationId: string,
  userId: string | null,
  input: { kind: unknown; name: unknown; segment: unknown; data: unknown }
): Promise<PieceTemplateRow> {
  if (!isPieceKind(input.kind)) {
    throw new PieceTemplateError("invalid", "Tipo de plantilla inválido");
  }
  const name = cleanText(input.name, 80);
  if (!name) throw new PieceTemplateError("invalid", "Poné un nombre a la plantilla");
  const data = sanitizePieceData(input.kind, input.data);
  if (!data) {
    throw new PieceTemplateError(
      "invalid",
      input.kind === "formulario"
        ? "El formulario necesita al menos un campo con etiqueta"
        : input.kind === "encuesta"
          ? "La encuesta necesita al menos una pregunta"
          : input.kind === "cupon"
            ? "El cupón necesita un beneficio"
            : "La publicación necesita un contenido"
    );
  }
  const db = getDb();
  const inserted = await db
    .insert(schema.pieceTemplate)
    .values({
      id: newId("pieceTemplate"),
      organizationId,
      kind: input.kind,
      name,
      segment: cleanText(input.segment, 60) || null,
      data,
      createdBy: userId,
    })
    .returning();
  return inserted[0]!;
}

export async function updatePieceTemplate(
  organizationId: string,
  id: string,
  patch: { name?: unknown; segment?: unknown; data?: unknown; active?: unknown }
): Promise<PieceTemplateRow> {
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.pieceTemplate)
    .where(
      scoped(
        schema.pieceTemplate.organizationId,
        organizationId,
        eq(schema.pieceTemplate.id, id)
      )
    )
    .limit(1);
  const row = existing[0];
  if (!row) throw new PieceTemplateError("not_found", "Plantilla no encontrada");

  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 80);
    if (!name) throw new PieceTemplateError("invalid", "Poné un nombre a la plantilla");
    sets.name = name;
  }
  if (patch.segment !== undefined) {
    sets.segment = cleanText(patch.segment, 60) || null;
  }
  if (patch.data !== undefined) {
    const data = sanitizePieceData(row.kind as PieceKind, patch.data);
    if (!data) throw new PieceTemplateError("invalid", "Los datos de la plantilla no son válidos");
    sets.data = data;
  }
  if (patch.active !== undefined) sets.active = patch.active === true;

  const updated = await db
    .update(schema.pieceTemplate)
    .set(sets)
    .where(eq(schema.pieceTemplate.id, id))
    .returning();
  return updated[0]!;
}

export async function deletePieceTemplate(
  organizationId: string,
  id: string
): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(schema.pieceTemplate)
    .where(
      scoped(
        schema.pieceTemplate.organizationId,
        organizationId,
        eq(schema.pieceTemplate.id, id)
      )
    )
    .returning({ id: schema.pieceTemplate.id });
  if (!deleted[0]) throw new PieceTemplateError("not_found", "Plantilla no encontrada");
}
