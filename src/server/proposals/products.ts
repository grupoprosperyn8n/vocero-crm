/**
 * 042f — Productos para el selector «Tipo de producto» de la publicidad.
 *
 * Dos fuentes, un solo menú:
 *   1. La tabla PRODUCTOS del SISTEMA (Airtable) — SOLO LECTURA, con caché
 *      de 10 min y a prueba de fallos (si Airtable no responde, el selector
 *      sigue vivo con lo del CRM).
 *   2. La mini tabla del CRM (`crm_product`): los productos que el negocio
 *      necesita crear sin tocar el sistema.
 *
 * El CRM nunca escribe en Airtable: leer productos es un cruce en memoria.
 */
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { airtableList } from "@/server/clients/sgsa";
import type { CrmProductDto, ProductOptionDto } from "@/lib/types";

const PRODUCTOS_TABLE = "PRODUCTOS";
const SYSTEM_TTL_MS = 10 * 60_000;
const MAX_NAME = 120;

export class ProductError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "product_error"
  ) {
    super(message);
  }
}

type SystemProduct = { ref: string; name: string; icon: string | null };
let systemCache: { at: number; items: SystemProduct[]; ok: boolean } | null = null;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Lee (con caché) los productos del sistema. Falla suave: null ok = no respondió. */
export async function listSystemProducts(force = false): Promise<{
  items: SystemProduct[];
  ok: boolean;
}> {
  if (!force && systemCache && Date.now() - systemCache.at < SYSTEM_TTL_MS) {
    return systemCache;
  }
  try {
    const params = new URLSearchParams();
    params.set("maxRecords", "200");
    params.append("fields[]", "NOMBRE PRODUCTO");
    params.append("fields[]", "ICONO");
    const recs = await airtableList(PRODUCTOS_TABLE, params);
    const items: SystemProduct[] = [];
    for (const r of recs) {
      const name = str(r.fields["NOMBRE PRODUCTO"]);
      if (!name) continue;
      items.push({ ref: r.id, name, icon: str(r.fields["ICONO"]) });
    }
    items.sort((a, b) => a.name.localeCompare(b.name, "es"));
    systemCache = { at: Date.now(), items, ok: true };
    return systemCache;
  } catch {
    // Airtable caído o sin credencial: seguimos con lo del CRM (y lo viejo en caché).
    if (systemCache) return { ...systemCache, ok: false };
    systemCache = { at: Date.now(), items: [], ok: false };
    return systemCache;
  }
}

function toCrmDto(row: typeof schema.crmProduct.$inferSelect): CrmProductDto {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCrmProducts(organizationId: string): Promise<CrmProductDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId))
    .orderBy(asc(schema.crmProduct.name));
  return rows.map(toCrmDto);
}

/** 042f — la fusión sistema + CRM (pura, para testear). */
export function mergeProductOptions(
  systemItems: SystemProduct[],
  crmItems: CrmProductDto[]
): ProductOptionDto[] {
  return [
    ...systemItems.map((p) => ({
      ref: p.ref,
      name: p.name,
      icon: p.icon,
      note: null,
      source: "sistema" as const,
    })),
    ...crmItems.map((p) => ({
      ref: p.id,
      name: p.name,
      icon: p.icon,
      note: p.note,
      source: "crm" as const,
    })),
  ];
}

/** El menú completo: primero el sistema, después los del CRM. */
export async function listProductOptions(organizationId: string): Promise<{
  products: ProductOptionDto[];
  systemOk: boolean;
}> {
  const [system, local] = await Promise.all([
    listSystemProducts(),
    listCrmProducts(organizationId),
  ]);
  return { products: mergeProductOptions(system.items, local), systemOk: system.ok };
}

async function findDuplicate(
  organizationId: string,
  name: string,
  exceptId: string | null
): Promise<boolean> {
  const local = await listCrmProducts(organizationId);
  const norm = name.trim().toLowerCase();
  return local.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === norm);
}

export async function createCrmProduct(
  organizationId: string,
  input: { name: string; icon?: string | null; note?: string | null }
): Promise<CrmProductDto> {
  const name = cleanText(input.name, MAX_NAME);
  if (!name || name.length < 2) {
    throw new ProductError("Poné un nombre de producto de al menos 2 letras", 400, "bad_name");
  }
  if (await findDuplicate(organizationId, name, null)) {
    throw new ProductError("Ya existe un producto con ese nombre en el CRM", 409, "duplicated");
  }
  const db = getDb();
  const now = new Date();
  await db.insert(schema.crmProduct).values({
    id: newId("crmProduct"),
    organizationId,
    name,
    icon: cleanText(input.icon, 8),
    note: cleanText(input.note, 200),
    createdAt: now,
    updatedAt: now,
  });
  const rows = await db
    .select()
    .from(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId))
    .orderBy(asc(schema.crmProduct.createdAt));
  const row = rows.find((r) => r.name === name)!;
  return toCrmDto(row);
}

export async function updateCrmProduct(
  organizationId: string,
  id: string,
  input: { name?: string; icon?: string | null; note?: string | null }
): Promise<CrmProductDto> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId, eq(schema.crmProduct.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new ProductError("Producto no encontrado", 404, "not_found");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = cleanText(input.name, MAX_NAME);
    if (!name || name.length < 2) {
      throw new ProductError("Poné un nombre de producto de al menos 2 letras", 400, "bad_name");
    }
    if (await findDuplicate(organizationId, name, id)) {
      throw new ProductError("Ya existe un producto con ese nombre en el CRM", 409, "duplicated");
    }
    patch.name = name;
  }
  if (input.icon !== undefined) patch.icon = cleanText(input.icon, 8);
  if (input.note !== undefined) patch.note = cleanText(input.note, 200);

  await db
    .update(schema.crmProduct)
    .set(patch)
    .where(scoped(schema.crmProduct.organizationId, organizationId, eq(schema.crmProduct.id, id)));
  const after = await db
    .select()
    .from(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId, eq(schema.crmProduct.id, id)))
    .limit(1);
  return toCrmDto(after[0]!);
}

export async function deleteCrmProduct(organizationId: string, id: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.crmProduct.id })
    .from(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId, eq(schema.crmProduct.id, id)))
    .limit(1);
  if (!rows[0]) throw new ProductError("Producto no encontrado", 404, "not_found");
  await db
    .delete(schema.crmProduct)
    .where(scoped(schema.crmProduct.organizationId, organizationId, eq(schema.crmProduct.id, id)));
}
