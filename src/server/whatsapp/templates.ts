import { and, eq, inArray } from "drizzle-orm";
import {
  countVariables,
  renderBody,
  validateBodyVariables,
} from "@/lib/templates";
import { CATALOGO_PLANTILLAS } from "@/lib/templates-catalog";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { graphRequest, MetaApiError, normalizeRecipient } from "@/lib/meta/client";
import { destinatarioMeta } from "@/lib/meta/destinatario";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import {
  getCredentialsByOrg,
  getCredentialsByWabaId,
  markReconnectRequired,
} from "@/server/whatsapp/credentials";
import { callGraphSend, SendError } from "@/server/inbox/send";
import { serializeMessage } from "@/server/inbox/ingest";
import type { WebhookValue } from "@/server/inbox/webhook";

/** Errores tipados del servicio de plantillas → HTTP en la capa de API. */
export class TemplateError extends Error {
  code:
    | "not_connected"
    | "reconnect_required"
    | "invalid"
    | "not_found"
    | "meta_error"
    | "meta_unavailable";

  constructor(code: TemplateError["code"], message: string) {
    super(message);
    this.name = "TemplateError";
    this.code = code;
  }
}

const TEMPLATE_ERROR_STATUS: Record<TemplateError["code"], number> = {
  not_connected: 409,
  reconnect_required: 409,
  invalid: 422,
  not_found: 404,
  meta_error: 422,
  meta_unavailable: 503,
};

export function templateErrorStatus(err: TemplateError): number {
  return TEMPLATE_ERROR_STATUS[err.code];
}

export { countVariables, renderBody, validateBodyVariables };

type TemplateRow = typeof schema.template.$inferSelect;

export function serializeTemplate(t: TemplateRow) {
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    body: t.body,
    status: t.status,
    rejectionReason: t.rejectionReason,
    // 044b-B13 — catálogo segmentado: uso, explicación, componentes y estado local.
    segment: t.segment ?? null,
    explanation: t.explanation ?? null,
    header: t.header ?? null,
    footer: t.footer ?? null,
    buttons: t.buttons ?? [],
    auto: t.auto,
    autoRule: t.autoRule ?? null,
    paused: t.paused,
    seedCode: t.seedCode ?? null,
    pub: t.pub ?? null,
    waTemplateId: t.waTemplateId ?? null,
  };
}

/** Crea la plantilla y la manda a aprobación de Meta (FR-050). */
export async function createTemplate(
  organizationId: string,
  input: { name: string; language: string; category: string; body: string }
): Promise<TemplateRow> {
  const variableError = validateBodyVariables(input.body);
  if (variableError) throw new TemplateError("invalid", variableError);

  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    throw new TemplateError("not_connected", "Conecta tu número de WhatsApp primero");
  }
  if (creds.status === "reconnect_required") {
    throw new TemplateError("reconnect_required", "Reconecta tu número antes de crear plantillas");
  }

  const name = input.name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!name) throw new TemplateError("invalid", "Nombre de plantilla inválido");

  // Meta pide un ejemplo por variable: si faltan, rechaza la plantilla.
  const variableCount = countVariables(input.body);
  const examples = Array.from(
    { length: variableCount },
    (_, i) => `ejemplo ${i + 1}`
  );
  let waTemplateId: string | null = null;
  try {
    const res = await graphRequest<{ id?: string; status?: string }>(
      `${creds.wabaId}/message_templates`,
      {
        method: "POST",
        token: creds.token,
        body: {
          name,
          language: input.language,
          category: input.category,
          components: [
            {
              type: "BODY",
              text: input.body,
              ...(variableCount > 0
                ? { example: { body_text: [examples] } }
                : {}),
            },
          ],
        },
      }
    );
    waTemplateId = res.id ?? null;
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(organizationId);
        throw new TemplateError("reconnect_required", "El token expiró: reconecta el número");
      }
      if (err.status === 0 || err.status >= 500) {
        throw new TemplateError("meta_unavailable", "Meta no está disponible ahora");
      }
      throw new TemplateError("meta_error", err.message);
    }
    throw err;
  }

  const db = getDb();
  const inserted = await db
    .insert(schema.template)
    .values({
      id: newId("template"),
      organizationId,
      name,
      language: input.language,
      category: input.category,
      body: input.body,
      status: "pending",
      waTemplateId,
    })
    .onConflictDoUpdate({
      target: [
        schema.template.organizationId,
        schema.template.name,
        schema.template.language,
      ],
      set: {
        category: input.category,
        body: input.body,
        status: "pending",
        rejectionReason: null,
        waTemplateId,
        updatedAt: new Date(),
      },
    })
    .returning();
  return inserted[0]!;
}

function mapMetaStatus(
  status: string | undefined
): TemplateRow["status"] | null {
  const s = (status ?? "").toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED") return "rejected";
  if (s === "PENDING" || s === "IN_APPEAL" || s === "PENDING_DELETION") {
    return "pending";
  }
  return null;
}

/**
 * Sincroniza estados desde Graph (`GET {waba}/message_templates`). Cubre el
 * modo agencia: los webhooks de plantillas NO siguen el override de callback,
 * así que el pull es la vía universal (DV-VC-04/DV-VC-15).
 */
export async function syncTemplates(organizationId: string): Promise<number> {
  const creds = await getCredentialsByOrg(organizationId);
  if (!creds) {
    throw new TemplateError("not_connected", "Conecta tu número de WhatsApp primero");
  }

  let data: {
    data?: { id?: string; name?: string; language?: string; status?: string; category?: string; quality_score?: unknown; rejected_reason?: string }[];
  };
  try {
    data = await graphRequest(`${creds.wabaId}/message_templates`, {
      token: creds.token,
    });
  } catch (err) {
    if (err instanceof MetaApiError) {
      if (err.isAuthError) {
        await markReconnectRequired(organizationId);
        throw new TemplateError("reconnect_required", "El token expiró: reconecta el número");
      }
      throw new TemplateError("meta_unavailable", "No se pudo consultar Meta");
    }
    throw err;
  }

  const db = getDb();
  const local = await db
    .select()
    .from(schema.template)
    .where(scoped(schema.template.organizationId, organizationId));

  let updated = 0;
  for (const remote of data.data ?? []) {
    const status = mapMetaStatus(remote.status);
    if (!status) continue;
    const match = local.find(
      (t) =>
        (remote.id && t.waTemplateId === remote.id) ||
        (t.name === remote.name && t.language === remote.language)
    );
    if (!match) continue;
    // Meta reclasifica la categoría al aprobar (una UTILITY puede volverse
    // MARKETING, lo que cambia el costo por conversación): es autoridad.
    const category = remote.category ?? match.category;
    if (match.status === status && match.category === category) continue;
    await db
      .update(schema.template)
      .set({
        status,
        category,
        rejectionReason: remote.rejected_reason ?? null,
        waTemplateId: match.waTemplateId ?? remote.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.template.id, match.id));
    updated += 1;
  }
  return updated;
}

/** Evento webhook `message_template_status_update` (modo directo, FR-050). */
export async function applyTemplateStatusEvent(
  wabaId: string | null,
  value: WebhookValue
): Promise<void> {
  if (!wabaId) return;
  const creds = await getCredentialsByWabaId(wabaId);
  if (!creds) return;

  const status = mapMetaStatus(value.event);
  const name = value.message_template_name;
  const language = value.message_template_language;
  if (!status || !name || !language) return;

  const db = getDb();
  await db
    .update(schema.template)
    .set({
      status,
      rejectionReason: status === "rejected" ? (value.reason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.template.organizationId, creds.organizationId),
        eq(schema.template.name, name),
        eq(schema.template.language, language)
      )
    );
}

/** Envía una plantilla APROBADA a una conversación (ventana cerrada, FR-051). */
export async function sendTemplate(input: {
  organizationId: string;
  conversationId: string;
  templateId: string;
  variables?: string[];
}): Promise<{ messageId: string }> {
  const db = getDb();

  const templates = await db
    .select()
    .from(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        input.organizationId,
        eq(schema.template.id, input.templateId)
      )
    )
    .limit(1);
  const template = templates[0];
  if (!template) throw new TemplateError("not_found", "Plantilla no encontrada");
  if (template.status !== "approved") {
    throw new TemplateError("invalid", "Solo se pueden enviar plantillas aprobadas");
  }
  // Meta exige EXACTAMENTE un parámetro por variable del cuerpo: si sobran o
  // falta alguno responde 132000 (plantilla y parámetros no coinciden).
  const variableCount = countVariables(template.body);
  const values = (input.variables ?? [])
    .slice(0, variableCount)
    .map((v) => v.trim());
  if (values.length < variableCount || values.some((v) => !v)) {
    const missing = values.findIndex((v) => !v);
    const n = missing === -1 ? values.length + 1 : missing + 1;
    throw new TemplateError(
      "invalid",
      variableCount === 1
        ? "La plantilla requiere el valor de {{1}}"
        : `La plantilla requiere ${variableCount} valores: falta {{${n}}}`
    );
  }

  const rows = await db
    .select({ conversation: schema.conversation, contact: schema.contact })
    .from(schema.conversation)
    .innerJoin(
      schema.contact,
      eq(schema.conversation.contactId, schema.contact.id)
    )
    .where(
      scoped(
        schema.conversation.organizationId,
        input.organizationId,
        eq(schema.conversation.id, input.conversationId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new TemplateError("not_found", "Conversación no encontrada");
  if (row.conversation.isTest) {
    // Aserción dura del sandbox (FR-031)
    throw new SendError(
      "sandbox_violation",
      "Conversación de prueba del Laboratorio: el envío real está prohibido"
    );
  }

  const creds = await getCredentialsByOrg(input.organizationId);
  if (!creds) throw new TemplateError("not_connected", "Sin número conectado");
  if (creds.status === "reconnect_required") {
    throw new TemplateError("reconnect_required", "Reconecta el número");
  }

  // 003: destinatario = teléfono normalizado o BSUID.
  // 003: teléfono en `to`, BSUID en `recipient` — Meta los pide en campos
  // distintos y mandar el BSUID en `to` devuelve 131026.
  const destinatario = destinatarioMeta(
    row.contact.phone ? normalizeRecipient(row.contact.phone) : null,
    row.contact.waUserId
  );
  if (!destinatario) {
    throw new TemplateError(
      "meta_error",
      "El contacto no tiene teléfono ni identidad de WhatsApp utilizable"
    );
  }

  const waMessageId = await callGraphSend(creds, {
    messaging_product: "whatsapp",
    ...destinatario,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(variableCount > 0
        ? {
            components: [
              {
                type: "body",
                parameters: values.map((text) => ({ type: "text", text })),
              },
            ],
          }
        : {}),
    },
  });

  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      waMessageId,
      direction: "out",
      type: "template",
      text: renderBody(template.body, values),
      status: "pending",
      origin: "template",
    })
    .returning();
  const message = inserted[0]!;

  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.conversation.id, input.conversationId));

  publish(input.organizationId, {
    type: "message.new",
    data: {
      conversationId: input.conversationId,
      message: serializeMessage(message),
    },
  });

  return { messageId: message.id };
}

/* ============================================================
 * 044b-B13 — Catálogo de Plantillas de Meta segmentado
 * ============================================================ */

/**
 * Crea una plantilla LOCAL del CRM (catálogo): queda en estado Borrador y NO
 * se envía a Meta — el modo directo no tiene WABA. Si algún día se conecta la
 * API oficial, se sube desde Meta aparte.
 */
export async function createLocalTemplate(
  organizationId: string,
  input: {
    name: string;
    language?: string;
    category: string;
    body: string;
    segment?: string | null;
    explanation?: string | null;
    header?: string | null;
    footer?: string | null;
    buttons?: Array<{ tipo: string; label: string }> | null;
    auto?: boolean;
    autoRule?: string | null;
  }
): Promise<TemplateRow> {
  const trimmedBody = input.body.trim();
  if (!trimmedBody) throw new TemplateError("invalid", "El cuerpo no puede quedar vacío");
  const variableError = validateBodyVariables(trimmedBody);
  if (variableError) throw new TemplateError("invalid", variableError);

  const name = input.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!name) throw new TemplateError("invalid", "Nombre de plantilla inválido");

  const db = getDb();
  const inserted = await db
    .insert(schema.template)
    .values({
      id: newId("template"),
      organizationId,
      name,
      language: input.language ?? "es_AR",
      category: input.category,
      body: trimmedBody,
      status: "draft",
      segment: input.segment ?? null,
      explanation: input.explanation ?? null,
      header: input.header ?? null,
      footer: input.footer ?? null,
      buttons: input.buttons ?? [],
      auto: input.auto ?? false,
      autoRule: input.autoRule ?? null,
    })
    .onConflictDoNothing()
    .returning();
  const row = inserted[0];
  if (!row) {
    throw new TemplateError("invalid", "Ya existe una plantilla con ese nombre");
  }
  return row;
}

/** Campos editables localmente de una plantilla (catálogo o de Meta). */
export type TemplatePatch = {
  name?: string;
  body?: string;
  category?: string;
  segment?: string | null;
  explanation?: string | null;
  header?: string | null;
  footer?: string | null;
  buttons?: Array<{ tipo: string; label: string }> | null;
  auto?: boolean;
  autoRule?: string | null;
  paused?: boolean;
  pub?: TemplateRow["pub"];
};

/** Actualiza una plantilla de la organización (los campos locales del catálogo). */
export async function updateTemplate(
  organizationId: string,
  id: string,
  patch: TemplatePatch
): Promise<TemplateRow> {
  const db = getDb();
  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    if (!name) throw new TemplateError("invalid", "Nombre de plantilla inválido");
    sets.name = name;
  }
  if (patch.body !== undefined) {
    const trimmed = patch.body.trim();
    if (!trimmed) throw new TemplateError("invalid", "El cuerpo no puede quedar vacío");
    const variableError = validateBodyVariables(trimmed);
    if (variableError) throw new TemplateError("invalid", variableError);
    sets.body = trimmed;
  }
  if (patch.category !== undefined) sets.category = patch.category;
  if (patch.segment !== undefined) sets.segment = patch.segment;
  if (patch.explanation !== undefined) sets.explanation = patch.explanation;
  if (patch.header !== undefined) sets.header = patch.header;
  if (patch.footer !== undefined) sets.footer = patch.footer;
  if (patch.buttons !== undefined) sets.buttons = patch.buttons ?? [];
  if (patch.auto !== undefined) sets.auto = patch.auto;
  if (patch.autoRule !== undefined) sets.autoRule = patch.autoRule;
  if (patch.paused !== undefined) sets.paused = patch.paused;
  if (patch.pub !== undefined) sets.pub = patch.pub;

  const updated = await db
    .update(schema.template)
    .set(sets)
    .where(
      scoped(
        schema.template.organizationId,
        organizationId,
        eq(schema.template.id, id)
      )
    )
    .returning();
  const row = updated[0];
  if (!row) throw new TemplateError("not_found", "Plantilla no encontrada");
  return row;
}

/** Elimina una plantilla de la organización. El catálogo no la re-crea solo. */
export async function deleteTemplate(
  organizationId: string,
  id: string
): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(schema.template)
    .where(
      scoped(
        schema.template.organizationId,
        organizationId,
        eq(schema.template.id, id)
      )
    )
    .returning({ id: schema.template.id });
  if (!deleted[0]) throw new TemplateError("not_found", "Plantilla no encontrada");
}

/**
 * Siembra el catálogo de Plantillas de Meta (44b-B13) para la organización:
 * inserta las que falten (por seedCode) y de cada una siembra su pieza
 * pre-cargada del Constructor (piece_template, sourceCode = code).
 * Idempotente: correrlo dos veces NO duplica. Una plantilla borrada a
 * propósito vuelve solo si se vuelve a apretar «Cargar catálogo».
 */
export async function seedTemplateCatalog(
  organizationId: string
): Promise<{ templates: number; pieces: number }> {
  const db = getDb();
  const codes = CATALOGO_PLANTILLAS.map((p) => p.code);

  const existingTpl = await db
    .select({ seedCode: schema.template.seedCode })
    .from(schema.template)
    .where(
      and(
        scoped(schema.template.organizationId, organizationId),
        inArray(schema.template.seedCode, codes)
      )
    );
  const haveTpl = new Set(existingTpl.map((r) => r.seedCode));

  const existingPie = await db
    .select({ sourceCode: schema.pieceTemplate.sourceCode })
    .from(schema.pieceTemplate)
    .where(
      and(
        scoped(schema.pieceTemplate.organizationId, organizationId),
        inArray(schema.pieceTemplate.sourceCode, codes)
      )
    );
  const havePie = new Set(existingPie.map((r) => r.sourceCode));

  let templates = 0;
  let pieces = 0;
  for (const p of CATALOGO_PLANTILLAS) {
    if (!haveTpl.has(p.code)) {
      const inserted = await db
        .insert(schema.template)
        .values({
          id: newId("template"),
          organizationId,
          name: p.code,
          language: "es_AR",
          category: p.categoriaMeta === "Marketing" ? "MARKETING" : "UTILITY",
          body: p.cuerpo,
          status: "draft",
          segment: p.segmento,
          explanation: p.cuando,
          header: p.encabezado ?? null,
          footer: p.pie ?? null,
          buttons: p.botones ?? [],
          auto: p.auto,
          autoRule: p.reglaAuto ?? null,
          seedCode: p.code,
          pub: p.publicacion ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.template.id });
      if (inserted[0]) templates += 1;
    }
    if (!havePie.has(p.code)) {
      const inserted = await db
        .insert(schema.pieceTemplate)
        .values({
          id: newId("pieceTemplate"),
          organizationId,
          kind: "publicacion",
          name: p.nombre,
          segment: p.segmento,
          data: {
            title: p.publicacion.titulo,
            subtitle: p.publicacion.subtitulo ?? "",
            body: p.publicacion.cuerpo,
            benefit: p.publicacion.beneficio ?? "",
            ctaLabel: p.publicacion.cta ?? "",
            ctaKind: "link",
          },
          sourceCode: p.code,
          autoRule: p.reglaAuto ?? null,
          createdBy: null,
        })
        .onConflictDoNothing()
        .returning({ id: schema.pieceTemplate.id });
      if (inserted[0]) pieces += 1;
    }
  }
  return { templates, pieces };
}
