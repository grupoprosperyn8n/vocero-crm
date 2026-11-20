import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { desc } from "drizzle-orm";

/**
 * 050 — Log append-only del alta por Embedded Signup.
 *
 * Meta exige registrar los eventos del flujo (session logging). Se guarda una
 * ALLOWLIST de campos, construida campo por campo: nunca el `code` de canje
 * (es una credencial reutilizable hasta que vence), nunca el token, nunca el
 * teléfono completo, nunca `verified_name` y nunca el mensaje crudo de Meta
 * (que arrastra detalles de la cuenta).
 */

export type OnboardingEvent =
  | "launch"
  | "finish"
  | "exchange"
  | "verify"
  | "subscribe"
  | "sync"
  | "error";

export type OnboardingResultKind = "ok" | "failed" | "skipped" | "declined";

export type OnboardingLogInput = {
  organizationId: string;
  event: OnboardingEvent;
  result: OnboardingResultKind;
  errorCode?: number | null;
  wabaMasked?: string | null;
  phoneMasked?: string | null;
  registered?: boolean | null;
  syncType?: string | null;
  requestId?: string | null;
};

export async function logOnboarding(input: OnboardingLogInput): Promise<void> {
  const db = getDb();
  await db.insert(schema.whatsappOnboardingLog).values({
    id: newId("onboarding"),
    organizationId: input.organizationId,
    event: input.event,
    result: input.result,
    errorCode: input.errorCode ?? null,
    wabaMasked: input.wabaMasked ?? null,
    phoneMasked: input.phoneMasked ?? null,
    registered: input.registered ?? null,
    syncType: input.syncType ?? null,
    requestId: input.requestId ?? null,
  });
}

/** Últimos eventos del alta de una organización (diagnóstico en Ajustes). */
export async function listOnboarding(organizationId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(schema.whatsappOnboardingLog)
    .where(scoped(schema.whatsappOnboardingLog.organizationId, organizationId))
    .orderBy(desc(schema.whatsappOnboardingLog.createdAt))
    .limit(limit);
}
