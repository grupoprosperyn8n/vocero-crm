"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  Power,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react";
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
 * 046 — Ajustes → IA (antes "Instalador de IA", 019).
 *
 * Todo lo de 019 sigue acá (proveedores, key cifrada, modelo + modelo juez,
 * probar conexión), y se suma el pedido de Diego (30Sep):
 *  · N conexiones cargadas (una por proveedor), UNA activa;
 *  · desconectar/activar/eliminar conexiones — incluida la del sistema;
 *  · «IA del sistema» (la de la instancia, por env) se puede desconectar;
 *  · gestor de consumos de tokens: totales, por modelo, por módulo y por día,
 *    con el costo estimado (precio unitario por conexión o catálogo).
 *
 * Agent-first: si falta un proveedor/modelo, se agrega en
 * `src/lib/ai/providers.ts` y el precio de referencia en `src/lib/ai/pricing.ts`.
 */

type ProviderMeta = {
  id: string;
  label: string;
  dialect: string;
  defaultBaseUrl: string | null;
  suggestedModels: string[];
  suggestedJudgeModel?: string;
};

type ConnectionView = {
  id: string;
  provider: string;
  providerLabel: string;
  baseUrl: string | null;
  model: string;
  judgeModel: string | null;
  costInPer1M: number | null;
  costOutPer1M: number | null;
  isActive: boolean;
  updatedAt: string;
};

type CurrentAi = {
  via: "org" | "system";
  source: "org" | "env";
  provider: string;
  providerLabel: string;
  model: string | null;
  connectionId: string | null;
} | null;

type Loaded = {
  current: CurrentAi;
  connections: ConnectionView[];
  system: { enabled: boolean; available: boolean; model: string | null };
  providers: ProviderMeta[];
  catalog: Record<string, { in: number; out: number }>;
};

type UsageBucketView = {
  calls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
};

type UsageSummary = {
  days: number;
  totals: UsageBucketView;
  byModel: (UsageBucketView & {
    provider: string;
    model: string;
    unit: { in: number; out: number } | null;
  })[];
  bySource: (UsageBucketView & { source: string })[];
  byDay: (UsageBucketView & { day: string })[];
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

/** Módulo que usó IA → etiqueta humana para el gestor de consumos. */
const SOURCE_LABELS: Record<string, string> = {
  laboratorio: "Laboratorio IA",
  agente: "Agente (WhatsApp)",
  "paneles-clientes": "Tablero · Análisis de clientes",
  "paneles-modulos": "Tablero · Análisis de módulos",
  propuestas: "Propuestas comerciales",
  cierres: "Cierres de gestión",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-AR");
}

function fmtUsd(v: number | null): string {
  if (v === null) return "—";
  if (v > 0 && v < 0.01) return `US$ ${v.toFixed(4)}`;
  return `US$ ${v.toFixed(2)}`;
}

function fmtUnit(v: { in: number; out: number } | null): string {
  if (!v) return "—";
  return `US$ ${v.in} / ${v.out}`;
}

/** Centro unitario de referencia para un modelo (mismo criterio que pricing.ts). */
function catalogFor(
  catalog: Record<string, { in: number; out: number }>,
  model: string
): { in: number; out: number } | null {
  const id = model.trim().toLowerCase();
  if (!id) return null;
  if (catalog[id]) return catalog[id];
  const last = id.split("/").pop() ?? "";
  return last && catalog[last] ? catalog[last] : null;
}

export function IaInstaller() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Estado del gestor de consumos (se carga aparte, puede tardar).
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageDays, setUsageDays] = useState(30);
  const [usageLoading, setUsageLoading] = useState(false);

  // Formulario de conexión (crear o editar).
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [provider, setProvider] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [judgeModel, setJudgeModel] = useState("");
  const [costIn, setCostIn] = useState("");
  const [costOut, setCostOut] = useState("");
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/ai").catch(() => null);
    if (!res?.ok) {
      setStatus({ kind: "error", text: "No se pudo cargar la configuración" });
      return;
    }
    const data = (await res.json()) as Loaded;
    setLoaded(data);
    setStatus({ kind: "idle" });
  }, []);

  const loadUsage = useCallback(async (days: number) => {
    setUsageLoading(true);
    const res = await fetch(`/api/settings/ai/usage?days=${days}`).catch(() => null);
    setUsageLoading(false);
    if (!res?.ok) return;
    const data = (await res.json()) as { ok?: boolean; summary?: UsageSummary };
    if (data.ok && data.summary) setUsage(data.summary);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void loadUsage(usageDays);
  }, [loadUsage, usageDays]);

  const providers = useMemo(() => loaded?.providers ?? [], [loaded]);
  const meta = useMemo(
    () => providers.find((p) => p.id === provider) ?? null,
    [providers, provider]
  );
  const suggested = meta?.suggestedModels ?? [];
  const judgeSuggested = meta?.suggestedJudgeModel
    ? [meta.suggestedJudgeModel, ...suggested]
    : suggested;
  const editing = useMemo(
    () => loaded?.connections.find((c) => c.id === editingId) ?? null,
    [loaded, editingId]
  );
  const catalogDefault = useMemo(
    () => (loaded ? catalogFor(loaded.catalog, model) : null),
    [loaded, model]
  );

  function openCreate(): void {
    setEditingId(null);
    setProvider("deepseek");
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setJudgeModel("");
    setCostIn("");
    setCostOut("");
    setActivateOnSave(true);
    setShowKey(false);
    setStatus({ kind: "idle" });
    setFormOpen(true);
  }

  function openEdit(c: ConnectionView): void {
    setEditingId(c.id);
    setProvider(c.provider);
    setApiKey("");
    setBaseUrl(c.baseUrl ?? "");
    setModel(c.model);
    setJudgeModel(c.judgeModel ?? "");
    setCostIn(c.costInPer1M === null ? "" : String(c.costInPer1M));
    setCostOut(c.costOutPer1M === null ? "" : String(c.costOutPer1M));
    setActivateOnSave(false);
    setShowKey(false);
    setStatus({ kind: "idle" });
    setFormOpen(true);
  }

  function parseCost(raw: string): number | null | "invalid" {
    const s = raw.trim();
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return "invalid";
    return n;
  }

  async function runTest(): Promise<void> {
    setStatus({ kind: "loading" });
    const payload: Record<string, string> = {};
    if (apiKey.trim()) {
      // Probar exactamente lo que está en el formulario (key nueva incluida).
      payload.provider = provider;
      payload.model = model.trim();
      payload.apiKey = apiKey.trim();
      if (baseUrl.trim()) payload.baseUrl = baseUrl.trim();
    } else if (editingId) {
      // Probar la conexión guardada puntual.
      payload.connectionId = editingId;
      if (model.trim()) payload.model = model.trim();
    }
    // Sin key y sin id → el server prueba la conexión ACTIVA de la org.

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
      | { ok?: boolean; model?: string; message?: string; error?: string; detail?: string }
      | null;
    if (res.ok && data?.ok) {
      setStatus({ kind: "ok", text: `Conexión OK con ${data.model ?? model}` });
    } else {
      const msg = data?.message ?? data?.detail ?? data?.error ?? `Error ${res.status}`;
      setStatus({ kind: "error", text: msg });
    }
  }

  async function save(): Promise<void> {
    const ci = parseCost(costIn);
    const co = parseCost(costOut);
    if (ci === "invalid" || co === "invalid") {
      setStatus({ kind: "error", text: "Los costos deben ser números (USD por 1M tokens) o quedar vacíos" });
      return;
    }
    setStatus({ kind: "loading" });
    const res = await fetch("/api/settings/ai", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim(),
        judgeModel: judgeModel.trim() || undefined,
        costInPer1M: ci,
        costOutPer1M: co,
        activate: activateOnSave || undefined,
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
      setStatus({
        kind: "ok",
        text: editingId
          ? "Conexión actualizada."
          : "Conexión guardada. El agente y el Laboratorio ya pueden usarla.",
      });
      setApiKey("");
      setFormOpen(false);
      setEditingId(null);
      void refetch();
    } else {
      const msg = data?.detail ?? data?.message ?? data?.error ?? `Error ${res.status}`;
      setStatus({ kind: "error", text: msg });
    }
  }

  async function action(payload: Record<string, unknown>, okText: string): Promise<void> {
    setStatus({ kind: "loading" });
    const res = await fetch("/api/settings/ai/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res?.ok) {
      const data = res
        ? ((await res.json().catch(() => null)) as
            | { message?: string; detail?: string }
            | null)
        : null;
      setStatus({
        kind: "error",
        text: data?.message ?? data?.detail ?? "No se pudo completar la acción",
      });
      return;
    }
    setStatus({ kind: "ok", text: okText });
    setDeleteId(null);
    void refetch();
  }

/** Probar una conexión guardada puntual (botón "Probar" de cada fila). */
  async function runTestConnection(id: string): Promise<void> {
    setStatus({ kind: "loading" });
    const res = await fetch("/api/settings/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId: id }),
    }).catch(() => null);
    if (!res) {
      setStatus({ kind: "error", text: "Sin conexión con el servidor" });
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; model?: string; message?: string; error?: string; detail?: string }
      | null;
    if (res.ok && data?.ok) {
      setStatus({ kind: "ok", text: `Conexión OK con ${data.model ?? ""}`.trim() });
    } else {
      const msg = data?.message ?? data?.detail ?? data?.error ?? `Error ${res.status}`;
      setStatus({ kind: "error", text: msg });
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  const current = loaded.current;

  return (
    <div className="max-w-4xl space-y-6">
      {/* ---------- Estado actual ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-[15px]">
            IA del CRM
            {current?.via === "org" && <Badge variant="success">Conexión propia en uso</Badge>}
            {current?.via === "system" && <Badge variant="warning">IA del sistema en uso</Badge>}
          </CardTitle>
          <CardDescription>
            Quién piensa cuando el agente contesta WhatsApps, corre el Laboratorio
            o se piden análisis de IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {current ? (
            <p className="text-sm">
              Usando ahora:{" "}
              <span className="font-semibold">{current.providerLabel}</span>
              {current.model ? (
                <>
                  {" "}
                  · <code className="rounded border bg-background px-1 text-xs">{current.model}</code>
                </>
              ) : null}
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm text-warning-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Sin IA conectada: el agente, el Laboratorio y los análisis quedan
                apagados hasta que cargues una conexión (o vuelvas a permitir la
                IA del sistema).
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Conexiones ---------- */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-[15px]">Conexiones</CardTitle>
            <CardDescription>
              Las que cargues quedan guardadas: activá la que quieras usar y
              cambiá de una a otra cuando haga falta. La key se guarda cifrada
              (AES-256-GCM) y nunca vuelve al navegador.
            </CardDescription>
          </div>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loaded.connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay conexiones propias. Agregá la primera (DeepSeek,
              OpenAI, Gemini o Claude) y el CRM usa tu key.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {loaded.connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {c.providerLabel}
                      {c.isActive ? (
                        <Badge variant="success">Activa</Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <code className="rounded border bg-background px-1">{c.model}</code>
                      {c.judgeModel ? <> · juez: <code className="rounded border bg-background px-1">{c.judgeModel}</code></> : null}
                      {(c.costInPer1M !== null || c.costOutPer1M !== null) && (
                        <> · costo propio: {fmtUsd(c.costInPer1M)} / {fmtUsd(c.costOutPer1M)} por 1M</>
                      )}
                      {c.baseUrl ? <> · {c.baseUrl}</> : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === c.id}
                      onClick={() => {
                        setBusyId(c.id);
                        void runTestConnection(c.id).finally(() => setBusyId(null));
                      }}
                    >
                      {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      Probar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    {c.isActive ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void action({ action: "deactivate", id: c.id }, "Conexión desconectada.")}
                      >
                        <Power className="h-3.5 w-3.5" /> Desconectar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void action({ action: "activate", id: c.id }, "Conexión activada.")}
                      >
                        <Power className="h-3.5 w-3.5" /> Activar
                      </Button>
                    )}
                    {deleteId === c.id ? (
                      <span className="flex items-center gap-2 text-xs">
                        ¿Eliminar?
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void action({ action: "delete", id: c.id }, "Conexión eliminada.")}
                        >
                          Sí
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteId(null)}>
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setDeleteId(c.id)}
                        aria-label="Eliminar conexión"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {formOpen && (
            <div className="space-y-4 rounded-md border bg-secondary p-4">
              <p className="text-sm font-semibold">
                {editingId ? `Editar conexión (${editing?.providerLabel ?? provider})` : "Nueva conexión"}
              </p>

              <div className="grid gap-2">
                <Label htmlFor="ai-provider">Proveedor</Label>
                <select
                  id="ai-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={Boolean(editingId)}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-60"
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
                    <span className="text-muted-foreground">(hasta /v1 si es OpenAI-compatible)</span>
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
                      editingId
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
                  Se guarda cifrada en tu base de datos — nunca viaja al navegador
                  de nuevo.
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

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="ai-cost-in">
                    Costo entrada{" "}
                    <span className="font-normal text-muted-foreground">(USD por 1M tokens)</span>
                  </Label>
                  <Input
                    id="ai-cost-in"
                    value={costIn}
                    onChange={(e) => setCostIn(e.target.value)}
                    inputMode="decimal"
                    placeholder={catalogDefault ? String(catalogDefault.in) : "0.27"}
                    autoComplete="off"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ai-cost-out">
                    Costo salida{" "}
                    <span className="font-normal text-muted-foreground">(USD por 1M tokens)</span>
                  </Label>
                  <Input
                    id="ai-cost-out"
                    value={costOut}
                    onChange={(e) => setCostOut(e.target.value)}
                    inputMode="decimal"
                    placeholder={catalogDefault ? String(catalogDefault.out) : "1.10"}
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Vacíos = se usa el catálogo de referencia (el gestor de consumos
                  estima el gasto con estos valores).
                </p>
              </div>

              {!editingId && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={activateOnSave}
                    onChange={(e) => setActivateOnSave(e.target.checked)}
                    className="h-4 w-4 rounded border"
                  />
                  Usar esta conexión apenas se guarde
                </label>
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                    setStatus({ kind: "idle" });
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

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
        </CardContent>
      </Card>

      {/* ---------- IA del sistema ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-[15px]">
            IA del sistema
            {!loaded.system.available ? (
              <Badge variant="secondary">No disponible</Badge>
            ) : loaded.system.enabled ? (
              current?.via === "system" ? (
                <Badge variant="warning">En uso</Badge>
              ) : (
                <Badge variant="outline">Disponible</Badge>
              )
            ) : (
              <Badge variant="destructive">Desconectada</Badge>
            )}
          </CardTitle>
          <CardDescription>
            La IA que viene configurada en la instancia (hoy, del proveedor del
            sistema). Se usa SOLO si no tenés una conexión propia activa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {loaded.system.available
              ? loaded.system.model
                ? `Modelo del sistema: ${loaded.system.model}. Si la desconectás, tus funciones de IA dependen solo de tus conexiones.`
                : "Si la desconectás, tus funciones de IA dependen solo de tus conexiones."
              : "Esta instancia no tiene una IA del sistema configurada."}
          </p>
          {loaded.system.available && (
            <Button
              type="button"
              variant={loaded.system.enabled ? "outline" : "secondary"}
              size="sm"
              onClick={() =>
                void action(
                  { action: "system-ai", enabled: !loaded.system.enabled },
                  loaded.system.enabled
                    ? "IA del sistema desconectada para esta organización."
                    : "IA del sistema permitida de nuevo."
                )
              }
            >
              <Power className="h-3.5 w-3.5" />
              {loaded.system.enabled ? "Desconectar la IA del sistema" : "Volver a permitir la IA del sistema"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---------- Gestor de consumos ---------- */}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-[15px]">Consumos de tokens</CardTitle>
            <CardDescription>
              Todo el consumo de IA de la organización, segmentado. El costo es
              una estimación con el precio unitario de cada conexión (o el
              catálogo de referencia si no definiste uno propio).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[7, 30, 90, 365].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={usageDays === d ? "default" : "outline"}
                onClick={() => setUsageDays(d)}
              >
                {d === 365 ? "1 año" : `${d} días`}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void loadUsage(usageDays)}
              aria-label="Actualizar consumos"
            >
              <RefreshCw className={usageLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {usage === null ? (
            <p className="text-sm text-muted-foreground">
              {usageLoading ? "Cargando consumos…" : "No se pudieron cargar los consumos."}
            </p>
          ) : usage.totals.calls === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay consumo registrado en este período. Se registra cada
              vez que el agente, el Laboratorio, los análisis o las propuestas
              usan IA.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Llamadas", value: fmtNum(usage.totals.calls) },
                  { label: "Tokens entrada", value: fmtNum(usage.totals.tokensIn) },
                  { label: "Tokens salida", value: fmtNum(usage.totals.tokensOut) },
                  { label: "Costo estimado", value: fmtUsd(usage.totals.costUsd) },
                ].map((box) => (
                  <div key={box.label} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{box.label}</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight">{box.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Por modelo</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Proveedor</th>
                        <th className="px-3 py-2 text-left font-medium">Modelo</th>
                        <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↑</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↓</th>
                        <th className="px-3 py-2 text-right font-medium">USD /1M (in / out)</th>
                        <th className="px-3 py-2 text-right font-medium">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usage.byModel.map((m) => (
                        <tr key={`${m.provider}::${m.model}`}>
                          <td className="px-3 py-2">{m.provider}</td>
                          <td className="px-3 py-2">
                            <code className="rounded border bg-background px-1 text-xs">{m.model}</code>
                          </td>
                          <td className="px-3 py-2 text-right">{fmtNum(m.calls)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(m.tokensIn)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(m.tokensOut)}</td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">{fmtUnit(m.unit)}</td>
                          <td className="px-3 py-2 text-right">{fmtUsd(m.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Por módulo</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Módulo</th>
                        <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↑</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↓</th>
                        <th className="px-3 py-2 text-right font-medium">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usage.bySource.map((s) => (
                        <tr key={s.source}>
                          <td className="px-3 py-2">{sourceLabel(s.source)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(s.calls)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(s.tokensIn)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(s.tokensOut)}</td>
                          <td className="px-3 py-2 text-right">{fmtUsd(s.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Por día</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Día</th>
                        <th className="px-3 py-2 text-right font-medium">Llamadas</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↑</th>
                        <th className="px-3 py-2 text-right font-medium">Tokens ↓</th>
                        <th className="px-3 py-2 text-right font-medium">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {usage.byDay.map((d) => (
                        <tr key={d.day}>
                          <td className="px-3 py-2">{d.day}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(d.calls)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(d.tokensIn)}</td>
                          <td className="px-3 py-2 text-right">{fmtNum(d.tokensOut)}</td>
                          <td className="px-3 py-2 text-right">{fmtUsd(d.costUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          ¿Falta tu proveedor o querés otro modelo? Este CRM es agent-first: un
          agente (Claude, Codex, Hermes…) agrega proveedores en{" "}
          <code className="rounded border bg-background px-1">src/lib/ai/providers.ts</code>{" "}
          y precios de referencia en{" "}
          <code className="rounded border bg-background px-1">src/lib/ai/pricing.ts</code>.
        </span>
      </p>
    </div>
  );

}
