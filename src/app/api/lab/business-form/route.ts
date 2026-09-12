import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { customizationGate } from "@/server/settings/access";
import {
  BUSINESS_FORM,
  BUSINESS_ITEMS,
  normalizeQuestion,
} from "@/server/lab/business-form";

export const dynamic = "force-dynamic";

/**
 * Formulario "Datos del negocio" del Laboratorio: GET devuelve el cuestionario
 * con lo que ya está en el Conocimiento; POST guarda cada respuesta como
 * entrada `qa` (upsert por pregunta canónica — nunca duplica).
 */
async function buildPayload(organizationId: string) {
  const db = getDb();
  const entries = await db
    .select()
    .from(schema.kbEntry)
    .where(scoped(schema.kbEntry.organizationId, organizationId));

  const byQuestion = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    if (e.kind !== "qa" || !e.question) continue;
    const key = normalizeQuestion(e.question);
    if (!byQuestion.has(key)) byQuestion.set(key, e);
  }

  let cargados = 0;
  const groups = BUSINESS_FORM.map((g) => ({
    key: g.key,
    title: g.title,
    description: g.description,
    items: g.items.map((it) => {
      const hit = byQuestion.get(normalizeQuestion(it.kbQuestion)) ?? null;
      if (hit) cargados++;
      return {
        id: it.id,
        question: it.question,
        hint: it.hint,
        kbQuestion: it.kbQuestion,
        answer: hit?.answer ?? null,
        entryId: hit?.id ?? null,
      };
    }),
  }));

  return { groups, counts: { total: BUSINESS_ITEMS.length, cargados } };
}

export const GET = withAuth(async (session) => {
  return Response.json(await buildPayload(session.organizationId));
});

const saveSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        answer: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(BUSINESS_ITEMS.length),
});

export const POST = withAuth(async (session, req: Request) => {
  const gate = customizationGate(session);
  if (gate) return gate;
  const body = await parseBody(req, saveSchema);
  if (!body.ok) return body.response;

  const itemById = new Map(BUSINESS_ITEMS.map((i) => [i.id, i]));
  for (const a of body.data.answers) {
    if (!itemById.has(a.id)) {
      return apiError(400, "unknown_item", `Ítem desconocido: ${a.id}`);
    }
  }

  const db = getDb();
  const entries = await db
    .select()
    .from(schema.kbEntry)
    .where(scoped(schema.kbEntry.organizationId, session.organizationId));
  const byQuestion = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    if (e.kind !== "qa" || !e.question) continue;
    const key = normalizeQuestion(e.question);
    if (!byQuestion.has(key)) byQuestion.set(key, e);
  }

  let created = 0;
  let updated = 0;
  for (const a of body.data.answers) {
    const item = itemById.get(a.id);
    if (!item) continue;
    const hit = byQuestion.get(normalizeQuestion(item.kbQuestion));
    if (hit) {
      await db
        .update(schema.kbEntry)
        .set({ answer: a.answer, updatedAt: new Date() })
        .where(
          scoped(
            schema.kbEntry.organizationId,
            session.organizationId,
            eq(schema.kbEntry.id, hit.id)
          )
        );
      updated++;
    } else {
      await db.insert(schema.kbEntry).values({
        id: newId("kbEntry"),
        organizationId: session.organizationId,
        kind: "qa",
        question: item.kbQuestion,
        answer: a.answer,
      });
      created++;
    }
  }

  const payload = await buildPayload(session.organizationId);
  return Response.json({ created, updated, ...payload });
});
