import { AI_PROVIDERS, type AiDialect, type AiProviderId } from "@/lib/ai/providers";
import { getActiveAiConnection } from "@/server/ai/connections";

/**
 * 046 — Configuración de IA por organización.
 *
 * Fuente de verdad en runtime: la conexión ACTIVA de Ajustes → IA
 * (`ai_connections`; la tabla legado `ai_settings` quedó sin uso y su fila se
 * migró al bloque 046). Sin conexión activa → null, y la resolución
 * (`resolveAi`) decide si cae a la IA del sistema (env) o queda apagada.
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
  /** 046 — id de la conexión (para el registro de consumo). */
  connectionId: string;
};

/** Carga la config de IA de la org (conexión activa, descifrada). */
export async function getOrgAiConfig(
  organizationId: string
): Promise<OrgAiConfig | null> {
  const conn = await getActiveAiConnection(organizationId);
  if (!conn) return null;
  return {
    provider: conn.provider,
    dialect: conn.dialect,
    baseUrl: conn.baseUrl,
    apiKey: conn.apiKey,
    model: conn.model,
    judgeModel: conn.judgeModel,
    connectionId: conn.id,
  };
}

/** Etiqueta humana del proveedor (la usan la UI y los mensajes). */
export function providerLabelOf(provider: string): string {
  const meta = AI_PROVIDERS[provider as AiProviderId];
  return meta?.label ?? provider;
}
