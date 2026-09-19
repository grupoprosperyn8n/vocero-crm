import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { teamGate } from "@/server/settings/access";
import {
  createCrmProduct,
  deleteCrmProduct,
  listProductOptions,
  ProductError,
  updateCrmProduct,
} from "@/server/proposals/products";

export const dynamic = "force-dynamic";

/**
 * 042f — Productos para el selector «Tipo de producto» de la publicidad.
 *
 * GET  = el menú completo (tabla PRODUCTOS del sistema —Airtable, solo
 *        lectura— + la mini tabla del CRM). Lo ve todo el equipo.
 * POST/PUT/DELETE = administrar los productos PROPIOS del CRM (los del
 *        sistema no se tocan): dueño/administrador, igual que las plantillas.
 */
export const GET = withAuth(async (session) => {
  try {
    const { products, systemOk } = await listProductOptions(session.organizationId);
    return Response.json({ products, systemOk, viewer: { role: session.role } });
  } catch (err) {
    console.error("[api/proposals products] error:", err);
    return apiError(500, "internal", "No se pudieron cargar los productos");
  }
});

const postSchema = z.object({
  name: z.string().trim().min(2).max(120),
  icon: z.string().trim().max(8).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export const POST = withAuth(async (session, req: Request) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;
  try {
    const product = await createCrmProduct(session.organizationId, body.data);
    return Response.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof ProductError) return apiError(err.status, err.code, err.message);
    console.error("[api/proposals products POST] error:", err);
    return apiError(500, "internal", "No se pudo crear el producto");
  }
});

const putSchema = z.object({
  id: z.string().trim().min(4).max(64),
  name: z.string().trim().min(2).max(120).optional(),
  icon: z.string().trim().max(8).optional().nullable(),
  note: z.string().trim().max(200).optional().nullable(),
});

export const PUT = withAuth(async (session, req: Request) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  const { id, ...fields } = body.data;
  try {
    const product = await updateCrmProduct(session.organizationId, id, fields);
    return Response.json({ product });
  } catch (err) {
    if (err instanceof ProductError) return apiError(err.status, err.code, err.message);
    console.error("[api/proposals products PUT] error:", err);
    return apiError(500, "internal", "No se pudo guardar el producto");
  }
});

const deleteSchema = z.object({
  id: z.string().trim().min(4).max(64),
});

export const DELETE = withAuth(async (session, req: Request) => {
  const gate = teamGate(session);
  if (gate) return gate;
  const body = await parseBody(req, deleteSchema);
  if (!body.ok) return body.response;
  try {
    await deleteCrmProduct(session.organizationId, body.data.id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof ProductError) return apiError(err.status, err.code, err.message);
    console.error("[api/proposals products DELETE] error:", err);
    return apiError(500, "internal", "No se pudo eliminar el producto");
  }
});
