import { desc } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import {
  createLocalTemplate,
  createTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const templates = await db
    .select()
    .from(schema.template)
    .where(scoped(schema.template.organizationId, session.organizationId))
    .orderBy(desc(schema.template.createdAt));
  return Response.json({ templates: templates.map(serializeTemplate) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  language: z.string().trim().min(2).max(10).optional(),
  category: z.enum(["UTILITY", "MARKETING"]),
  body: z.string().trim().min(1).max(1024),
  /** 044b-B13 — true = queda local (Borrador, no se envía a Meta). */
  local: z.boolean().optional(),
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
});

/**
 * 044b-B13 — crea una plantilla. `local: true` = plantilla del catálogo del
 * CRM (Borrador, sin Meta: lo usan todos los roles); sin `local` = flujo de
 * siempre (se envía a aprobación de Meta).
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;
  const {
    local,
    segment,
    explanation,
    header,
    footer,
    buttons,
    auto,
    autoRule,
    ...core
  } = body.data;

  try {
    const template = local
      ? await createLocalTemplate(session.organizationId, {
          name: core.name,
          language: core.language,
          category: core.category,
          body: core.body,
          segment,
          explanation,
          header,
          footer,
          buttons,
          auto,
          autoRule,
        })
      : await createTemplate(session.organizationId, {
          name: core.name,
          language: core.language ?? "es_AR",
          category: core.category,
          body: core.body,
        });
    return Response.json(
      { template: serializeTemplate(template) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
