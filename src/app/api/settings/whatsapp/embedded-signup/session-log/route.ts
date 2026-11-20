import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { connectionsGate } from "@/server/settings/access";
import { logOnboarding } from "@/server/whatsapp/onboarding-log";

export const dynamic = "force-dynamic";

/**
 * 050 — Session logging del diálogo de Meta (Meta lo exige para Embedded
 * Signup). El navegador manda solo el nombre del evento y cómo terminó: nada de
 * códigos, tokens ni datos de la cuenta. Todo lo demás se descarta por schema.
 */
const bodySchema = z
  .object({
    event: z.enum(["launch", "finish", "error"]),
    result: z.enum(["ok", "failed", "skipped"]),
    errorCode: z.number().int().optional(),
  })
  .strict();

export const POST = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  await logOnboarding({
    organizationId: session.organizationId,
    event: body.data.event,
    result: body.data.result,
    errorCode: body.data.errorCode ?? null,
  });

  return Response.json({ ok: true });
});
