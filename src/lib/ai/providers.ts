/**
 * 019 — Catálogo de proveedores de IA (instalador de Ajustes → IA).
 *
 * Única frontera de resolución: de aquí sale el dialecto (cómo se habla con el
 * proveedor) y la base URL por defecto. Agent-first: un agente agrega un
 * proveedor nuevo agregando UNA entrada a AI_PROVIDERS (y su dialecto si no
 * es OpenAI-compatible) — no hace falta tocar la UI ni la API.
 *
 * Convención de baseUrl:
 *  - dialecto "openai"   → baseUrl INCLUYE la ruta hasta /v1 (el fetch agrega
 *    `/chat/completions`). Ej: https://api.openai.com/v1
 *  - dialecto "anthropic" → baseUrl es la raíz de la API (el fetch agrega
 *    `/v1/messages`). Ej: https://api.anthropic.com
 */

export const AI_PROVIDER_IDS = [
  "openai",
  "openrouter",
  "gemini",
  "deepseek",
  "anthropic",
  "custom",
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiDialect = "openai" | "anthropic";

export type AiProviderMeta = {
  id: AiProviderId;
  label: string;
  dialect: AiDialect;
  /** Base URL por defecto (ver convención arriba). null = la pide el usuario. */
  defaultBaseUrl: string | null;
  /** Modelos sugeridos para el datalist de la UI (no exhaustivo). */
  suggestedModels: string[];
  /** Modelo juez sugerido (Laboratorio). */
  suggestedJudgeModel?: string;
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    dialect: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    suggestedModels: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o3-mini"],
    suggestedJudgeModel: "gpt-4o-mini",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (Gemini + Claude + GPT + DeepSeek…)",
    dialect: "openai",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    suggestedModels: [
      "deepseek/deepseek-v4-flash",
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash-001",
    ],
    suggestedJudgeModel: "deepseek/deepseek-v4-flash",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    dialect: "openai",
    // Endpoint OpenAI-compatible oficial de Google.
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    suggestedModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    suggestedJudgeModel: "gemini-2.5-flash",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    dialect: "openai",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    suggestedJudgeModel: "deepseek-chat",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    dialect: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    suggestedModels: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"],
    suggestedJudgeModel: "claude-haiku-4-5",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible, ej. OmniRoute)",
    dialect: "openai",
    defaultBaseUrl: null,
    suggestedModels: [],
  },
};

export const AI_PROVIDER_LIST: AiProviderMeta[] = AI_PROVIDER_IDS.map(
  (id) => AI_PROVIDERS[id]
);

export function isAiProviderId(value: string): value is AiProviderId {
  return (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Resuelve la base URL efectiva de un proveedor (default o custom). */
export function resolveBaseUrl(
  provider: AiProviderId,
  customBaseUrl?: string | null
): string | null {
  if (customBaseUrl?.trim()) return customBaseUrl.trim();
  return AI_PROVIDERS[provider].defaultBaseUrl;
}
