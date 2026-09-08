import type { z } from "zod";
import { getEnv, isAiConfigured } from "@/lib/env";
import type { AiDialect } from "@/lib/ai/providers";

/**
 * Adaptador LLM — ÚNICA frontera con el proveedor de IA (Constitución II).
 *
 * 019 — Dos fuentes de configuración (agent-first):
 *  1. Config de la organización (`opts.config`, editada desde Ajustes → IA):
 *     proveedor + key + modelo por org, guardados cifrados en `ai_settings`.
 *  2. Env vars OPENROUTER_* (legacy): cuando el caller no pasa config, se usa
 *     el comportamiento histórico (un agente puede configurar el proveedor
 *     desde el entorno o el código sin pasar por la UI).
 *
 * Dialectos soportados: "openai" (chat/completions, Bearer) y "anthropic"
 * (/v1/messages, x-api-key). Regla operativa: la salida del modelo es
 * impredecible; todo consumo pasa por extracción robusta + Zod + reintentos,
 * y un hipo del proveedor jamás propaga excepción (resultado `error` tipado).
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** Config ya resuelta por el caller (org) — ver `@/server/ai/config`. */
export type AiCallConfig = {
  dialect: AiDialect;
  /** openai: incluye /v1 · anthropic: raíz de la API. */
  baseUrl: string;
  apiKey: string;
};

export type ChatJsonResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: "not_configured" | "provider_error" | "invalid_output"; detail: string };

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts?: { model?: string; judge?: boolean; timeoutMs?: number; config?: AiCallConfig | null }
): Promise<ChatJsonResult<T>> {
  const env = getEnv();
  // Config explícita (org) o legacy por env. Sin ninguna → not_configured.
  // isAiConfigured() lee process.env EN VIVO (getEnv está memoizado y no ve
  // cambios de entorno en tests ni hot-reload).
  const cfg: AiCallConfig | null = opts?.config ?? null;
  if (!cfg && !isAiConfigured()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_API_TOKEN configurado",
    };
  }
  const model =
    opts?.model ??
    (opts?.judge
      ? (env.OPENROUTER_JUDGE_MODEL ?? env.OPENROUTER_MODEL)
      : env.OPENROUTER_MODEL);
  if (!model?.trim()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sin modelo configurado",
    };
  }

  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "STRICT: tu respuesta anterior no fue JSON válido según el esquema. Responde ÚNICAMENTE el objeto JSON, sin explicaciones ni markdown.",
            },
          ];
    try {
      const raw = await callProvider(
        cfg ?? legacyConfig(env),
        model,
        attemptMessages,
        opts?.timeoutMs
      );
      const extracted = extractJson(raw);
      if (extracted === null) {
        lastDetail = `sin JSON extraíble (raw=${truncate(raw)})`;
        continue;
      }
      const parsed = schema.safeParse(extracted);
      if (!parsed.success) {
        lastDetail = `no cumple el esquema: ${parsed.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; ")} (raw=${truncate(raw)})`;
        continue;
      }
      return { ok: true, data: parsed.data, raw };
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return {
    ok: false,
    error: lastDetail.includes("esquema") || lastDetail.includes("JSON")
      ? "invalid_output"
      : "provider_error",
    detail: lastDetail,
  };
}

/**
 * Sonda de conexión (instalador de IA, "Probar conexión"): UNA llamada real
 * con el mensaje más simple posible. No valida JSON ni reintenta: el objetivo
 * es verificar key + baseUrl + modelo en un solo roundtrip.
 */
export async function probeProvider(
  cfg: AiCallConfig,
  model: string,
  timeoutMs = 20_000
): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    await callProvider(
      cfg,
      model,
      [{ role: "user", content: "Respondé exactamente con la palabra: OK" }],
      timeoutMs
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Config legacy desde env vars (comportamiento histórico). */
function legacyConfig(env: ReturnType<typeof getEnv>): AiCallConfig {
  return {
    dialect: "openai",
    // El default histórico es https://openrouter.ai/api (sin /v1): el
    // dialecto openai agrega /v1/chat/completions.
    baseUrl: env.OPENROUTER_BASE_URL,
    apiKey: env.OPENROUTER_API_TOKEN ?? "",
  };
}

async function callProvider(
  cfg: AiCallConfig,
  model: string,
  messages: ChatMessage[],
  timeoutMs = 60_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const content =
      cfg.dialect === "anthropic"
        ? await callAnthropic(cfg, model, messages, controller.signal)
        : await callOpenAiCompatible(cfg, model, messages, controller.signal);
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("respuesta del proveedor sin contenido");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Dialecto OpenAI-compatible: POST {base}/chat/completions con Bearer. */
async function callOpenAiCompatible(
  cfg: AiCallConfig,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  // cfg.baseUrl incluye /v1 (ver convención en providers.ts); el legacy
  // histórico (https://openrouter.ai/api) NO lo incluye → se agrega acá.
  const base = cfg.baseUrl.endsWith("/v1") ? cfg.baseUrl : `${cfg.baseUrl}/v1`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      // El token jamás se loguea; solo viaja en este header.
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`proveedor respondió ${res.status}: ${truncate(text)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Dialecto Anthropic: POST {base}/v1/messages con x-api-key. */
async function callAnthropic(
  cfg: AiCallConfig,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: rest,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`proveedor respondió ${res.status}: ${truncate(text)}`);
  }
  const json = (await res.json()) as {
    content?: { type?: string; text?: string }[];
  };
  return json.content?.find((b) => b.type === "text")?.text ?? "";
}

/**
 * Extracción robusta de JSON de una respuesta de modelo:
 * 1) bloque ```json ... ``` (o ``` ... ```), 2) el texto completo,
 * 3) del primer `{` al último `}`.
 */
export function extractJson(raw: string): unknown | null {
  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  candidates.push(raw.trim());
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // siguiente candidato
    }
  }
  return null;
}

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// isAiConfigured se re-exporta para que los callers legacy sigan usándolo.
export { isAiConfigured };
