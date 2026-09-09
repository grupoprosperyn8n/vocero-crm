import { createHmac } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { chatJson } from "@/lib/ai";
import { getOrgAiConfig } from "@/server/ai/config";

/**
 * 1F — Cierre de conversación con curado.
 *
 * Cuando el operador cierra una conversación desde la bandeja:
 *   1. La conversación queda cerrada (closed_at): sale de la cola activa. El
 *      transcript COMPLETO queda en la base local del CRM (es su historia).
 *   2. El CRM cura la gestión: resumen IA de lo conversado (rápido, con el
 *      modelo auxiliar de la org) + datos de negocio (cliente, quién atendió,
 *      topic, canal, fechas). El transcript NO viaja.
 *   3. Emite el webhook saliente "conversation.closed" al backend
 *      (CLOSURE_WEBHOOK_URL → n8n → Airtable), que crea el ÚNICO registro
 *      curado (GESTIÓN GENERAL / PROSPECTOS según el workflow). Firma HMAC
 *      cuando hay CLOSURE_WEBHOOK_SECRET; 3 intentos con backoff.
 *
 * Si el webhook falla tras los reintentos, la conversación queda cerrada con
 * closure_status=failed y closure_error visible: la gestión no se pierde en
 * silencio (reintentar = volver a emitir el webhook de una conv cerrada).
 */

const summarySchema = z.object({
  resumen: z.string().min(1).max(2000),
});

export type ClosureOutcome = {
  closed: boolean;
  alreadyClosed: boolean;
  summary: string | null;
  webhook: "sent" | "skipped" | "failed";
  webhookError: string | null;
};

export function webhookUrl(): string | null {
  return getEnv().CLOSURE_WEBHOOK_URL ?? null;
}

/** Firma HMAC-SHA256 hex del body (receptor: n8n). Sin secret → sin firma. */
export function signatureFor(body: string): string | null {
  const secret = getEnv().CLOSURE_WEBHOOK_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Resumen curado por IA del transcript (modelo auxiliar de la org). */
async function curateSummary(
  organizationId: string,
  transcript: { role: "cliente" | "agente"; text: string }[]
): Promise<string | null> {
  if (transcript.length === 0) return null;
  const aiConfig = await getOrgAiConfig(organizationId).catch(() => null);
  const lines = transcript
    .slice(-60)
    .map((m) => `${m.role === "cliente" ? "Cliente" : "Agente"}: ${m.text}`)
    .join("\n");
  const result = await chatJson(
    summarySchema,
    [
      {
        role: "system",
        content:
          "Sos el curador de gestiones de una compania de seguros. Resumí la conversación en 2-4 oraciones para el registro de gestion del backoffice: qué pidió el cliente, qué se resolvió y si quedó pendiente. Respondé ÚNICAMENTE el objeto JSON {\"resumen\": \"...\"}.",
      },
      { role: "user", content: lines },
    ],
    {
      // El modelo auxiliar (flash) alcanza para curar; nunca el razonador.
      model: aiConfig?.judgeModel ?? aiConfig?.model ?? undefined,
      config: aiConfig ?? null,
      timeoutMs: 25_000,
    }
  );
  if (!result.ok) return null;
  return result.data.resumen;
}

async function deliverWebhook(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const url = webhookUrl();
  if (!url) return { ok: false, error: "no_webhook_url" };
  const body = JSON.stringify(payload);
  const signature = signatureFor(body);
  let lastError = "sin respuesta del destino";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vocero-event": "conversation.closed",
          ...(signature ? { "x-vocero-signature": signature } : {}),
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true, error: null };
      lastError = `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return { ok: false, error: lastError.slice(0, 500) };
}

export async function closeConversation(input: {
  organizationId: string;
  conversationId: string;
  closedByUserId: string;
}): Promise<ClosureOutcome> {
  const db = getDb();
  const { organizationId, conversationId, closedByUserId } = input;

  const convs = await db
    .select({
      conversation: schema.conversation,
      contact: schema.contact,
      assignee: { id: schema.user.id, name: schema.user.name },
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.conversation.contactId, schema.contact.id))
    .leftJoin(schema.user, eq(schema.conversation.assigneeId, schema.user.id))
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  const found = convs[0];
  if (!found) throw new Error("conversación no encontrada");

  if (found.conversation.closedAt) {
    // Idempotente: ya cerrada, no se re-emite el webhook por accidente.
    return {
      closed: true,
      alreadyClosed: true,
      summary: found.conversation.closureSummary,
      webhook: (found.conversation.closureStatus as ClosureOutcome["webhook"]) ?? "skipped",
      webhookError: found.conversation.closureError,
    };
  }

  const closedAt = new Date();
  await db
    .update(schema.conversation)
    .set({
      closedAt,
      closedBy: closedByUserId,
      closureStatus: "pending",
      updatedAt: closedAt,
    })
    .where(eq(schema.conversation.id, conversationId));

  // Transcript (solo para curar; no viaja en el webhook).
  const msgs = await db
    .select({ direction: schema.message.direction, text: schema.message.text, aiGenerated: schema.message.aiGenerated })
    .from(schema.message)
    .where(eq(schema.message.conversationId, conversationId))
    .orderBy(desc(schema.message.createdAt))
    .limit(80);
  const transcript = msgs
    .slice()
    .reverse()
    .map((m) => ({
      role: (m.direction === "out" ? "agente" : "cliente") as "cliente" | "agente",
      text: m.text ?? `(${m.aiGenerated ? "mensaje IA" : "adjunto"})`,
    }));

  const summary = await curateSummary(organizationId, transcript);

  const { conversation: conv, contact, assignee } = found;
  const closedByRows = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.id, closedByUserId))
    .limit(1);
  const closedBy = closedByRows[0] ?? null;

  const payload = {
    event: "conversation.closed",
    conversationId,
    organizationId,
    channel: conv.channel,
    topic: conv.topic,
    isTest: conv.isTest,
    closedAt: closedAt.toISOString(),
    closedBy: closedBy ? { id: closedBy.id, name: closedBy.name } : null,
    assignee: assignee?.id ? { id: assignee.id, name: assignee.name } : null,
    contact: { id: contact.id, name: contact.name, phone: contact.phone },
    summary,
    messageCount: msgs.length,
    startedAt: conv.createdAt.toISOString(),
    lastMessageAt: conv.lastMessageAt?.toISOString() ?? conv.updatedAt.toISOString(),
  };

  const delivered = await deliverWebhook(payload);
  const outcome: ClosureOutcome = delivered.ok
    ? { closed: true, alreadyClosed: false, summary, webhook: "sent", webhookError: null }
    : {
        closed: true,
        alreadyClosed: false,
        summary,
        webhook: delivered.error === "no_webhook_url" ? "skipped" : "failed",
        webhookError: delivered.error === "no_webhook_url" ? null : delivered.error,
      };

  await db
    .update(schema.conversation)
    .set({
      closureStatus: outcome.webhook,
      closureSummary: summary,
      closureError: outcome.webhookError,
      closureWebhookAt: outcome.webhook === "sent" ? new Date() : null,
    })
    .where(eq(schema.conversation.id, conversationId));

  return outcome;
}
