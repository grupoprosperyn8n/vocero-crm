import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  AI_PROVIDERS,
  type AiDialect,
  type AiProviderId,
  isAiProviderId,
  resolveBaseUrl,
} from "@/lib/ai/providers";

/**
 * 019 — Configuración de IA por organización.
 *
 * Fuente de verdad en runtime: la fila de `ai_settings` de la organización
 * (la edita el instalador de Ajustes → IA). Sin fila → null, y el adaptador
 * cae a las env vars OPENROUTER_* (legacy, agent-first).
 */

/** Config ya resuelta y lista para el adaptador. */
export type OrgAiConfig = {
  provider: AiProviderId;
  dialect: AiDialect;
  /** Base URL completa (convención de `providers.ts`). */
  baseUrl: string;
  apiKey: string;
  model: string;
  judgeModel: string | null;
};

export type OrgAiSettingsView = {
  provider: AiProviderId;
  baseUrl: string | null;
  model: string;
  judgeModel: string | null;
  /** Últimos 4 de la key guardada (nunca la key completa). */
  keyLast4: string | null;
  updatedAt: string;
};

type Row = typeof schema.aiSettings.$inferSelect;

function toView(row: Row): OrgAiSettingsView {
  return {
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    judgeModel: row.judgeModel,
    keyLast4: row.apiKeyCipher ? last4OfCipher(row.apiKeyCipher) : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** La key está cifrada; "últimos 4" solo es informativo en la UI. */
function last4OfCipher(_cipher: string): string | null {
  // No podemos mostrar los últimos 4 reales sin descifrar; la UI muestra
  // "configurada" y permite reemplazarla. El cipher no es la key.
  return null;
}

/** Carga la config de IA de la org, descifrando la key. */
export async function getOrgAiConfig(
  organizationId: string
): Promise<OrgAiConfig | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiSettings)
    .where(scoped(schema.aiSettings.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.model || !row.apiKeyCipher || !row.apiKeyIv || !row.apiKeyTag) {
    return null;
  }
  const baseUrl = resolveBaseUrl(row.provider, row.baseUrl);
  if (!baseUrl) return null;
  const apiKey = decryptSecret({
    cipher: row.apiKeyCipher,
    iv: row.apiKeyIv,
    tag: row.apiKeyTag,
  });
  return {
    provider: row.provider,
    dialect: AI_PROVIDERS[row.provider as AiProviderId].dialect,
    baseUrl,
    apiKey,
    model: row.model,
    judgeModel: row.judgeModel,
  };
}

/** Vista para la UI (GET /api/settings/ai) — sin secretos. */
export async function getOrgAiSettingsView(
  organizationId: string
): Promise<OrgAiSettingsView | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiSettings)
    .where(scoped(schema.aiSettings.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toView(rows[0]) : null;
}

export type SaveOrgAiInput = {
  organizationId: string;
  provider: string;
  /** Vacío/ausente = conservar la key guardada. */
  apiKey?: string | null;
  baseUrl?: string | null;
  model: string;
  judgeModel?: string | null;
};

/**
 * Upsert de la config. Regla: si `apiKey` viene vacío y ya hay una guardada,
 * se conserva la existente (permite cambiar proveedor/modelo sin re-pegar la
 * key). Cifrado AES-256-GCM igual que las credenciales de WhatsApp.
 */
export async function saveOrgAiConfig(input: SaveOrgAiInput): Promise<void> {
  if (!isAiProviderId(input.provider)) {
    throw new Error(`proveedor inválido: ${input.provider}`);
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.aiSettings.id })
    .from(schema.aiSettings)
    .where(scoped(schema.aiSettings.organizationId, input.organizationId))
    .limit(1);
  const existing = rows[0];

  // Key: nueva cifrada, o conservar la existente, o error si no hay ninguna.
  let cipher: string | null = null;
  let iv: string | null = null;
  let tag: string | null = null;
  if (input.apiKey?.trim()) {
    const enc = encryptSecret(input.apiKey.trim());
    cipher = enc.cipher;
    iv = enc.iv;
    tag = enc.tag;
  } else if (existing) {
    const prev = await db
      .select({
        cipher: schema.aiSettings.apiKeyCipher,
        iv: schema.aiSettings.apiKeyIv,
        tag: schema.aiSettings.apiKeyTag,
      })
      .from(schema.aiSettings)
      .where(eq(schema.aiSettings.id, existing.id))
      .limit(1);
    cipher = prev[0]?.cipher ?? null;
    iv = prev[0]?.iv ?? null;
    tag = prev[0]?.tag ?? null;
  }
  if (!cipher || !iv || !tag) {
    throw new Error("Se necesita una API key (o conservar la existente)");
  }

  const baseUrl = input.baseUrl?.trim() || null;
  const resolvedBase = resolveBaseUrl(
    input.provider as AiProviderId,
    baseUrl
  );
  if (!resolvedBase) {
    throw new Error("Este proveedor requiere una URL base (custom)");
  }

  const values = {
    provider: input.provider as AiProviderId,
    apiKeyCipher: cipher,
    apiKeyIv: iv,
    apiKeyTag: tag,
    baseUrl,
    model: input.model.trim(),
    judgeModel: input.judgeModel?.trim() || null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.aiSettings)
      .set(values)
      .where(eq(schema.aiSettings.id, existing.id));
  } else {
    await db.insert(schema.aiSettings).values({
      id: newId("aiSettings"),
      organizationId: input.organizationId,
      ...values,
    });
  }
}
