"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 019 — Instalador de IA (Ajustes → IA).
 *
 * Multi-proveedor de verdad: OpenRouter es UN proveedor más (OpenAI, Google
 * Gemini, Anthropic Claude, DeepSeek y cualquier API OpenAI-compatible con
 * URL custom). La key se guarda cifrada (AES-256-GCM) por organización.
 *
 * Agent-first: si falta un proveedor/modelo, se agrega en
 * `src/lib/ai/providers.ts` — la UI no es la única puerta de configuración.
 */

type ProviderMeta = {
  id: string;
  label: string;
  dialect: string;
  defaultBaseUrl: string | null;
  suggestedModels: string[];
  suggestedJudgeModel?: string;
};

type SettingsView = {
  provider: string;
  baseUrl: string | null;
  model: string;
  judgeModel: string | null;
  keyLast4: string | null;
  updatedAt: string;
};

type Loaded = {
  settings: SettingsView | null;
  providers: ProviderMeta[];
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

export function IaInstaller() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [provider, setProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [judgeModel, setJudgeModel] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hasSavedKey, setHasSavedKey] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/ai").catch(() => null);
    if (!res?.ok) {
      setStatus({ kind: "error", text: "No se pudo cargar la configuración" });
      return;
    }
    const data = (await res.json()) as Loaded;
    setLoaded(data);
    const s = data.settings;
    if (s) {
      setProvider(s.provider);
      setBaseUrl(s.baseUrl ?? "");
      setModel(s.model);
      setJudgeModel(s.judgeModel ?? "");
      setHasSavedKey(true);
    }
    setStatus({ kind: "idle" });
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const providers = useMemo(() => loaded?.providers ?? [], [loaded]);
  const meta = useMemo(
    () => providers.find((p) => p.id === provider) ?? null,
    [providers, provider]
  );
  const suggested = meta?.suggestedModels ?? [];
  const judgeSuggested = meta?.suggestedJudgeModel
    ? [meta.suggestedJudgeModel, ...suggested]
    : suggested;

  const dirty = useMemo(
    () => ({
      providerChanged: loaded?.settings ? loaded.settings.provider !== provider : false,
      modelChanged: loaded?.settings ? loaded.settings.model !== model.trim() : false,
    }),
    [loaded, provider, model]
  );

  async function runTest(): Promise<void> {
    setStatus({ kind: "loading" });
    const payload: Record<string, string> = {};
    // Con key en el form → probar esa config exacta; sin key → probar la guardada.
    if (apiKey.trim() || dirty.providerChanged || dirty.modelChanged) {
      if (!apiKey.trim() && dirty.providerChanged) {
        setStatus({
          kind: "error",
          text: "Cambiaste de proveedor: pegá la API key nueva para probar",
        });
        return;
      }
      payload.provider = provider;
      payload.model = model.trim();
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (baseUrl.trim()) payload.baseUrl = baseUrl.trim();
    }
    const res = await fetch("/api/settings/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) {
      setStatus({ kind: "error", text: "Sin conexión con el servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { ok: boolean; model?: string; message?: string; error?: string; detail?: string }
      | null;
    if (res.ok && data?.ok) {
      setStatus({ kind: "ok", text: `Conexión OK con ${data.model ?? model}` });
    } else {
      const msg =
        data?.message ?? data?.detail ?? data?.error ?? `Error ${res.status}`;
      setStatus({ kind: "error", text: msg });
    }
  }

  async function save(): Promise<void> {
    setStatus({ kind: "loading" });
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === "custom" ? baseUrl.trim() : baseUrl.trim() || undefined,
        model: model.trim(),
        judgeModel: judgeModel.trim() || undefined,
      }),
    }).catch(() => null);
    if (!res) {
      setStatus({ kind: "error", text: "Sin conexión con el servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      detail?: string;
      error?: string;
    } | null;
    if (res.ok && data?.ok) {
      setStatus({ kind: "ok", text: "Configuración guardada. Agente y Laboratorio usan este proveedor." });
      setApiKey("");
      setHasSavedKey(true);
      void refetch();
    } else {
      const msg =
        data?.detail ?? data?.message ?? data?.error ?? `Error ${res.status}`;
      setStatus({ kind: "error", text: msg });
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            Instalador de IA
            {hasSavedKey && (
              <Badge variant="success">Key guardada</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Elegí el proveedor y el modelo del agente que contesta tus WhatsApps
            y del Laboratorio. OpenRouter es un proveedor más: cada uno usa su
            propia API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label htmlFor="ai-provider">Proveedor</Label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {meta && (
              <p className="text-xs text-muted-foreground">
                Dialecto: {meta.dialect === "anthropic" ? "Anthropic Messages" : "OpenAI-compatible"}
              </p>
            )}
          </div>

          {provider === "custom" && (
            <div className="grid gap-2">
              <Label htmlFor="ai-baseurl">
                URL base de la API{" "}
                <span className="text-muted-foreground">
                  (hasta /v1 si es OpenAI-compatible)
                </span>
              </Label>
              <Input
                id="ai-baseurl"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://gateway.ejemplo.com/v1"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="ai-key">API key</Label>
            <div className="relative">
              <Input
                id="ai-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  hasSavedKey
                    ? "•••••••• (dejalo vacío para conservar la guardada)"
                    : "sk-…"
                }
                autoComplete="off"
                spellCheck={false}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showKey ? "Ocultar key" : "Mostrar key"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se guarda cifrada (AES-256-GCM) en tu base de datos — nunca viaja
              al navegador de nuevo.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ai-model">Modelo principal (agente)</Label>
            <Input
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              list="ai-model-suggestions"
              placeholder={meta?.suggestedModels[0] ?? "modelo"}
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id="ai-model-suggestions">
              {suggested.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ai-judge">
              Modelo juez (Laboratorio){" "}
              <span className="font-normal text-muted-foreground">
                — opcional, usa el principal si queda vacío
              </span>
            </Label>
            <Input
              id="ai-judge"
              value={judgeModel}
              onChange={(e) => setJudgeModel(e.target.value)}
              list="ai-judge-suggestions"
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id="ai-judge-suggestions">
              {judgeSuggested.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          {status.kind === "ok" && (
            <p className="flex items-start gap-2 rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {status.text}
            </p>
          )}
          {status.kind === "error" && (
            <p className="flex items-start gap-2 rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-destructive">
              <span className="mt-0.5 h-4 w-4 shrink-0">⚠️</span>
              <span className="min-w-0 break-words">{status.text}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runTest()}
              disabled={status.kind === "loading" || !model.trim()}
            >
              {status.kind === "loading" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Probar conexión
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={status.kind === "loading" || !model.trim()}
            >
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          ¿Falta tu proveedor o querés otro modelo? Este CRM es agent-first: un
          agente (Claude, Codex, Hermes…) agrega proveedores en{" "}
          <code className="rounded border bg-background px-1">src/lib/ai/providers.ts</code>{" "}
          y ajusta prompts en{" "}
          <code className="rounded border bg-background px-1">src/server/ai/prompts.ts</code>.
        </span>
      </p>
    </div>
  );
}
