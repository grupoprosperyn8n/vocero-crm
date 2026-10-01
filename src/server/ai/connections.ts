import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  AI_PROVIDERS,
  isAiProviderId,
  resolveBaseUrl,
  type AiDialect,
  type AiProviderId,
} from "@/lib/ai/providers";

/**
 * 046 — Conexiones de IA por organización (Ajustes → IA).
 *
 * N conexiones (una por proveedor), UNA sola activa. Reemplaza en runtime a
 * la tabla legado `ai_settings` (la migración 0046 copia su fila acá).
 * La key se cifra AES-256-GCM igual que WhatsApp/Telegram y jamás vuelve al
 * navegador. `costInPer1M`/`costOutPer1M` (USD por 1M tokens) son opcionales:
 * si no están, el gestor de consumos usa el catálogo de referencia.
 */

export type AiConnectionView = {
  id: string;
  provider: AiProviderId;
  providerLabel: string;
  baseUrl: string | null;
  model: string;
  judgeModel: string | null;
  costInPer1M: number | null;
  costOutPer1M: number | null;
  isActive: boolean;
  updatedAt: string;
};

/** Config resuelta y descifrada de una conexión (solo uso interno). */
export type ActiveAiConnection = {
  id: string;
  provider: AiProviderId;
  dialect: AiDialect;
  baseUrl: string;
  apiKey: string;
  model: string;
  judgeModel: string | null;
  costInPer1M: number | null;
  costOutPer1M: number | null;
};

type Row = typeof schema.aiConnections.$inferSelect;

function toView(row: Row): AiConnectionView {
  return {
    id: row.id,
    provider: row.provider as AiProviderId,
    providerLabel: AI_PROVIDERS[row.provider as AiProviderId]?.label ?? row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    judgeModel: row.judgeModel,
    costInPer1M: row.costInPer1M,
    costOutPer1M: row.costOutPer1M,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Lista las conexiones de la organización (activa primero, luego recientes). */
export async function listAiConnections(
  organizationId: string
): Promise<AiConnectionView[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiConnections)
    .where(scoped(schema.aiConnections.organizationId, organizationId))
    .orderBy(desc(schema.aiConnections.isActive), desc(schema.aiConnections.updatedAt));
  return rows.map(toView);
}

/** La conexión ACTIVA descifrada, o null si no hay ninguna. */
export async function getActiveAiConnection(
  organizationId: string
): Promise<ActiveAiConnection | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiConnections)
    .where(scoped(schema.aiConnections.organizationId, organizationId))
    .orderBy(desc(schema.aiConnections.isActive), desc(schema.aiConnections.updatedAt))
    .limit(1);
  const row = rows.find((r) => r.isActive);
  if (!row) return null;
  const baseUrl = resolveBaseUrl(row.provider as AiProviderId, row.baseUrl);
  if (!baseUrl) return null;
  const apiKey = decryptSecret({
    cipher: row.apiKeyCipher,
    iv: row.apiKeyIv,
    tag: row.apiKeyTag,
  });
  return {
    id: row.id,
    provider: row.provider as AiProviderId,
    dialect: AI_PROVIDERS[row.provider as AiProviderId].dialect,
    baseUrl,
    apiKey,
    model: row.model,
    judgeModel: row.judgeModel,
    costInPer1M: row.costInPer1M,
    costOutPer1M: row.costOutPer1M,
  };
}

/** Config lista para probar una conexión guardada puntual (Ajustes → Probar). */
export async function getAiConnectionCallConfig(
  organizationId: string,
  connectionId: string
): Promise<{ dialect: AiDialect; baseUrl: string; apiKey: string; model: string } | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiConnections)
    .where(
      scoped(
        schema.aiConnections.organizationId,
        organizationId,
        eq(schema.aiConnections.id, connectionId)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const baseUrl = resolveBaseUrl(row.provider as AiProviderId, row.baseUrl);
  if (!baseUrl) return null;
  return {
    dialect: AI_PROVIDERS[row.provider as AiProviderId].dialect,
    baseUrl,
    apiKey: decryptSecret({
      cipher: row.apiKeyCipher,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    }),
    model: row.model,
  };
}

export type UpsertAiConnectionInput = {
  organizationId: string;
  provider: string;
  /** Vacío/ausente = conservar la key guardada (al editar). */
  apiKey?: string | null;
  baseUrl?: string | null;
  model: string;
  judgeModel?: string | null;
  costInPer1M?: number | null;
  costOutPer1M?: number | null;
  /** true = activarla ya (desactiva las demás). */
  activate?: boolean;
};

/**
 * Crea o actualiza la conexión del proveedor (una por proveedor por org).
 * Reglas: la key se conserva si no viene una nueva; la primera conexión de la
 * organización queda activa automáticamente; `activate: true` fuerza el cambio.
 */
export async function upsertAiConnection(
  input: UpsertAiConnectionInput
): Promise<{ id: string }> {
  if (!isAiProviderId(input.provider)) {
    throw new Error(`proveedor inválido: ${input.provider}`);
  }
  const provider = input.provider as AiProviderId;
  const model = input.model?.trim();
  if (!model) throw new Error("Se necesita un modelo");

  const baseUrl = input.baseUrl?.trim() || null;
  const resolvedBase = resolveBaseUrl(provider, baseUrl);
  if (!resolvedBase) throw new Error("Este proveedor requiere una URL base");

  const db = getDb();
  const existingRows = await db
    .select()
    .from(schema.aiConnections)
    .where(
      scoped(
        schema.aiConnections.organizationId,
        input.organizationId,
        eq(schema.aiConnections.provider, provider)
      )
    )
    .limit(1);
  const existing = existingRows[0];

  let cipher: string | null = null;
  let iv: string | null = null;
  let tag: string | null = null;
  if (input.apiKey?.trim()) {
    const enc = encryptSecret(input.apiKey.trim());
    cipher = enc.cipher;
    iv = enc.iv;
    tag = enc.tag;
  } else if (existing) {
    cipher = existing.apiKeyCipher;
    iv = existing.apiKeyIv;
    tag = existing.apiKeyTag;
  }
  if (!cipher || !iv || !tag) {
    throw new Error("Se necesita una API key");
  }

  const costs = {
    costInPer1M: input.costInPer1M ?? null,
    costOutPer1M: input.costOutPer1M ?? null,
  };

  let id: string;
  if (existing) {
    await db
      .update(schema.aiConnections)
      .set({
        apiKeyCipher: cipher,
        apiKeyIv: iv,
        apiKeyTag: tag,
        baseUrl,
        model,
        judgeModel: input.judgeModel?.trim() || null,
        ...costs,
        updatedAt: new Date(),
      })
      .where(eq(schema.aiConnections.id, existing.id));
    id = existing.id;
  } else {
    id = newId("aiConnection");
    const anyActive = await db
      .select({ id: schema.aiConnections.id })
      .from(schema.aiConnections)
      .where(
        scoped(
          schema.aiConnections.organizationId,
          input.organizationId,
          eq(schema.aiConnections.isActive, true)
        )
      )
      .limit(1);
    await db.insert(schema.aiConnections).values({
      id,
      organizationId: input.organizationId,
      provider,
      apiKeyCipher: cipher,
      apiKeyIv: iv,
      apiKeyTag: tag,
      baseUrl,
      model,
      judgeModel: input.judgeModel?.trim() || null,
      ...costs,
      // La primera conexión de la org queda activa; las demás nacen inactivas.
      isActive: anyActive.length === 0,
      updatedAt: new Date(),
    });
  }

  if (input.activate) {
    await activateAiConnection(input.organizationId, id);
  }
  return { id };
}

/** Activa UNA conexión (desactiva el resto en la misma operación). */
export async function activateAiConnection(
  organizationId: string,
  connectionId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.aiConnections.id })
    .from(schema.aiConnections)
    .where(
      scoped(
        schema.aiConnections.organizationId,
        organizationId,
        eq(schema.aiConnections.id, connectionId)
      )
    )
    .limit(1);
  if (!rows[0]) return false;
  await db
    .update(schema.aiConnections)
    .set({ isActive: false })
    .where(scoped(schema.aiConnections.organizationId, organizationId));
  await db
    .update(schema.aiConnections)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(schema.aiConnections.id, connectionId));
  return true;
}

/** Desconecta (desactiva) una conexión sin borrarla. */
export async function deactivateAiConnection(
  organizationId: string,
  connectionId: string
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(schema.aiConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      scoped(
        schema.aiConnections.organizationId,
        organizationId,
        eq(schema.aiConnections.id, connectionId)
      )
    )
    .returning({ id: schema.aiConnections.id });
  return updated.length > 0;
}

/** Elimina una conexión (el historial de consumo sobrevive con connectionId null). */
export async function deleteAiConnection(
  organizationId: string,
  connectionId: string
): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(schema.aiConnections)
    .where(
      scoped(
        schema.aiConnections.organizationId,
        organizationId,
        eq(schema.aiConnections.id, connectionId)
      )
    )
    .returning({ id: schema.aiConnections.id });
  return deleted.length > 0;
}

/** ¿La organización permite usar la IA del sistema (env) como fallback? */
export async function isSystemAiEnabled(organizationId: string): Promise<boolean> {
  try {
    const db = getDb();
    const rows = await db
      .select({ enabled: schema.organization.systemAiEnabled })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1);
    return rows[0]?.enabled ?? true;
  } catch (err) {
    console.error("[ai] isSystemAiEnabled falló:", err);
    return true;
  }
}

/** Conecta/desconecta la IA del sistema para esta organización. */
export async function setSystemAiEnabled(
  organizationId: string,
  enabled: boolean
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.organization)
    .set({ systemAiEnabled: enabled })
    .where(eq(schema.organization.id, organizationId));
}
