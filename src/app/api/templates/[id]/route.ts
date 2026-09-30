import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deleteTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
  updateTemplate,
  type TemplatePatch,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 044b-B13 — edición local de una plantilla del catálogo: uso, explicación,
 * componentes, Automática/Offline y derivada del Constructor. La usan todos
 * los roles (la sección se ve también desde el hub «Crear» del tablero).
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^tpl_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de plantilla inválido");
  }
  const patchSchema = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    body: z.string().trim().min(1).max(1024).optional(),
    category: z.enum(["UTILITY", "MARKETING"]).optional(),
    segment: z.string().trim().max(40).optional().nullable(),
    explanation: z.string().trim().max(600).optional().nullable(),
    header: z.string().trim().max(200).optional().nullable(),
    footer: z.string().trim().max(200).optional().nullable(),
    buttons: z
      .array(
        z.object({
          tipo: z.string().trim().max(20),
          label: z.string().trim().max(80),
        })
      )
      .max(6)
      .optional()
      .nullable(),
    auto: z.boolean().optional(),
    autoRule: z.string().trim().max(300).optional().nullable(),
    paused: z.boolean().optional(),
    pub: z
      .object({
        titulo: z.string().trim().max(160),
        subtitulo: z.string().trim().max(200).optional().nullable(),
        cuerpo: z.string().trim().max(1200),
        beneficio: z.string().trim().max(160).optional().nullable(),
        cta: z.string().trim().max(40).optional().nullable(),
      })
      .optional()
      .nullable(),
  });
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  try {
    const row = await updateTemplate(
      session.organizationId,
      id,
      body.data as TemplatePatch
    );
    return Response.json({ template: serializeTemplate(row) });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});

/** 044b-B13 — eliminar una plantilla del catálogo. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!/^tpl_[A-Za-z0-9_-]{4,40}$/.test(id)) {
    return apiError(400, "invalid_id", "Id de plantilla inválido");
  }
  try {
    await deleteTemplate(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
