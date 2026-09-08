"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Plug,
  PlugZap,
  Terminal,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * 019b — Panel de Agentes (Ajustes → Agentes).
 *
 * Detecta los agentes CLI de la máquina que abrió esta URL (Enmienda 1:
 * agent-first — Codex, Claude, Hermes, OpenCode…), no los del servidor.
 * El navegador no puede escanear binarios: habla con el "companion" local
 * (scripts/companion.py, 127.0.0.1:8790) que sí los detecta y ejecuta la
 * automejora sobre el checkout del repo en esa máquina, con los gates del
 * proyecto (typecheck + lint + test) y push al fork.
 */

const DEFAULT_COMPANION = "http://127.0.0.1:8790";
const COMPANION_KEY = "vocero.companionUrl";

type AgentInfo = {
  id: string;
  bin: string;
  path: string;
  version: string;
  headless: boolean;
};

type RepoInfo = {
  repo: string;
  exists: boolean;
  branch: string;
  commit: string;
  dirty: boolean;
};

type RunInfo = {
  id: string;
  agent: string;
  status: "running" | "done" | "failed" | "gates_failed" | "push_failed";
  log: string[];
  commit: string | null;
};

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const STATUS_LABEL: Record<string, { text: string; tone: "ok" | "err" | "run" }> = {
  running: { text: "Ejecutando…", tone: "run" },
  done: { text: "Automejora completa", tone: "ok" },
  failed: { text: "Falló la ejecución del agente", tone: "err" },
  gates_failed: { text: "Gates en rojo — no se pusheó", tone: "err" },
  push_failed: { text: "El push al fork falló", tone: "err" },
};

export function AgentsPanel() {
  const [companionUrl, setCompanionUrl] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_COMPANION;
    return localStorage.getItem(COMPANION_KEY) || DEFAULT_COMPANION;
  });
  const [editingUrl, setEditingUrl] = useState(false);
  const [companion, setCompanion] = useState<"checking" | "online" | "offline">("checking");
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [agentsError, setAgentsError] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [agentSel, setAgentSel] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [run, setRun] = useState<RunInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Carga agentes (la 1ra detección tarda ~5s; con cache del companion, ~1ms). */
  const loadAgents = useCallback(async (base: string) => {
    try {
      const ra = await fetchWithTimeout(`${base}/api/agents`, 12000);
      const data = (await ra.json()) as { agents: AgentInfo[] };
      setAgents(data.agents);
      setAgentsError(false);
      setAgentsLoaded(true);
      const first = data.agents.find((a) => a.headless);
      if (first) setAgentSel((prev) => prev || first.id);
    } catch {
      setAgentsError(true);
      setAgentsLoaded(true);
    }
  }, []);

  const detect = useCallback(
    async (url?: string) => {
      const base = (url ?? companionUrl).replace(/\/+$/, "");
      setCompanion("checking");
      try {
        const res = await fetchWithTimeout(`${base}/api/repo`, 5000);
        if (!res.ok) throw new Error("no");
        setRepo((await res.json()) as RepoInfo);
        setCompanion("online");
        void loadAgents(base);
      } catch {
        setCompanion("offline");
        setAgents(null);
        setRepo(null);
      }
    },
    [companionUrl, loadAgents]
  );

  function applyUrl(next: string) {
    setCompanionUrl(next);
    localStorage.setItem(COMPANION_KEY, next);
    setEditingUrl(false);
    void detect(next);
  }

  // Heartbeat: re-chequea el companion cada 15s (sin recargar la lista de
  // agentes). Mantiene el estado online estable y detecta si se cae.
  useEffect(() => {
    if (companion !== "online") return;
    const hb = setInterval(() => {
      const base = companionUrl.replace(/\/+$/, "");
      fetchWithTimeout(`${base}/api/repo`, 3000)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) {
            setRepo(d as RepoInfo);
          } else {
            setCompanion("offline");
          }
        })
        .catch(() => setCompanion("offline"));
    }, 15000);
    return () => clearInterval(hb);
  }, [companion, companionUrl]);

  useEffect(() => {
    void detect();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [detect]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [run?.log]);

  async function startRun() {
    setError(null);
    if (!objetivo.trim() || !agentSel) return;
    setRun(null);
    const base = companionUrl.replace(/\/+$/, "");
    const res = await fetchWithTimeout(`${base}/api/automejora`, 5000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agentSel, objetivo: objetivo.trim() }),
    }).catch(() => null);
    if (!res) {
      setError("No se pudo contactar al companion local");
      return;
    }
    const data = (await res.json()) as { ok: boolean; id?: string; error?: string };
    if (!res.ok || !data.ok || !data.id) {
      setError(data.error ?? "Error al iniciar la automejora");
      return;
    }
    const id = data.id;
    const poll = async () => {
      const r = await fetchWithTimeout(`${base}/api/run/${id}`, 4000).catch(
        () => null
      );
      if (!r) return;
      const body = (await r.json()) as { run: RunInfo };
      setRun(body.run);
      if (body.run.status !== "running" && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 2500);
  }

  const selectedAgent = agents?.find((a) => a.id === agentSel);
  const status = run ? STATUS_LABEL[run.status] : null;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Estado del companion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            Agentes CLI de esta máquina
            {companion === "online" && (
              <Badge variant="success">
                <PlugZap className="mr-1 h-3 w-3" /> Companion conectado
              </Badge>
            )}
            {companion === "offline" && (
              <Badge variant="secondary">
                <Plug className="mr-1 h-3 w-3" /> Companion no detectado
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            <b>Automejora del sistema</b> — estos agentes modifican el código del
            CRM (no atienden conversaciones). El agente que contesta tus
            WhatsApp se configura en{" "}
            <a
              href="/agent"
              className="font-semibold text-brand-text underline-offset-2 hover:underline"
            >
              Agente
            </a>{" "}
            (menú principal, junto a Bandeja y Pipeline), con su prompt de
            sistema, tono y knowledge base; su proveedor de IA se elige en{" "}
            <a
              href="/settings/ai"
              className="font-semibold text-brand-text underline-offset-2 hover:underline"
            >
              IA
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {companion === "checking" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando companion…
            </p>
          )}

          {companion === "offline" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No se encontró el companion en{" "}
                <code className="rounded border bg-background px-1">{companionUrl}</code>.
                Para detectar tus agentes y usar la automejora, levantalo en la
                máquina donde estén los agentes (una terminal):
              </p>
              <pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs">
                {`cd ~/Documentos/vocero-crm && python3 scripts/companion.py`}
              </pre>
              {editingUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    defaultValue={companionUrl}
                    id="companion-url"
                    placeholder="http://127.0.0.1:8790"
                    className="max-w-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById("companion-url") as HTMLInputElement | null;
                      applyUrl(el?.value.trim() || DEFAULT_COMPANION);
                    }}
                  >
                    Conectar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingUrl(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => void detect()}>
                    Reintentar detección
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingUrl(true)}
                  >
                    Usar otra URL de companion
                  </Button>
                </div>
              )}
            </div>
          )}

          {companion === "online" && repo && (
            <div className="grid gap-2 text-sm">
              <p className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success-text" />
                <span className="text-muted-foreground">Companion:</span>
                <code className="rounded border bg-background px-1">{companionUrl}</code>
                <button
                  type="button"
                  onClick={() => setEditingUrl(true)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  cambiar
                </button>
              </p>
              <p className="flex items-center gap-2">
                Repo: <code className="rounded border bg-background px-1">{repo.repo}</code>
                <Badge variant="secondary">{repo.branch}</Badge>
                <Badge variant="secondary">{repo.commit}</Badge>
                {repo.dirty && <Badge variant="warning">cambios sin commitear</Badge>}
              </p>
              {editingUrl && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    defaultValue={companionUrl}
                    id="companion-url-online"
                    className="max-w-xs"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const el = document.getElementById("companion-url-online") as HTMLInputElement | null;
                      applyUrl(el?.value.trim() || DEFAULT_COMPANION);
                    }}
                  >
                    Conectar
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingUrl(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          {companion === "online" && agentsError && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning-soft bg-warning-tint p-3 text-sm">
              <span className="text-warning-text">
                El companion conecta, pero no se pudieron listar los agentes (la
                primera detección tarda unos segundos).
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void loadAgents(companionUrl)}
              >
                Reintentar
              </Button>
            </div>
          )}

          {agents && agents.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.bin}</p>
                      {a.version && (
                        <p className="truncate text-xs text-muted-foreground">{a.version}</p>
                      )}
                    </div>
                  </div>
                  {a.headless ? (
                    <Badge variant="success">headless</Badge>
                  ) : (
                    <Badge variant="secondary">sin headless</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
          {companion === "online" && !agentsError && agentsLoaded && agents?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No se detectaron agentes CLI conocidos en esta máquina.
            </p>
          )}
          {companion === "online" && !agentsError && !agentsLoaded && (
            <p className="text-sm text-muted-foreground">
              Buscando agentes CLI…
            </p>
          )}
        </CardContent>
      </Card>

      {/* Automejora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            Automejora con cualquier agente
            <Badge variant="secondary">Enmienda 1</Badge>
          </CardTitle>
          <CardDescription>
            Misma calidad que el loop SDD de siempre: el agente lee{" "}
            <code className="rounded border bg-background px-1">AGENTS.md</code>, implementa,
            corre los gates (typecheck + lint + 422 tests) y pushea al fork si está verde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="agent-sel">Agente que ejecuta la mejora</Label>
            <select
              id="agent-sel"
              value={agentSel}
              onChange={(e) => setAgentSel(e.target.value)}
              disabled={companion !== "online" || !agents?.length}
              className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {agents?.filter((a) => a.headless).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bin}
                  {a.version ? ` — ${a.version}` : ""}
                </option>
              ))}
              {agents?.filter((a) => !a.headless).map((a) => (
                <option key={a.id} value={a.id} disabled>
                  {a.bin} (sin modo headless)
                </option>
              ))}
            </select>
            {selectedAgent && !selectedAgent.headless && (
              <p className="text-xs text-warning-text">
                {selectedAgent.bin} no tiene modo headless configurado todavía — elegí otro.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="agent-goal">Objetivo de la mejora</Label>
            <Textarea
              id="agent-goal"
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              placeholder={
                "Ej: que el agente salude con el nombre del cliente en el primer mensaje\n\nDescribí el objetivo con detalle — el agente lee AGENTS.md y lo ejecuta completo (spec → plan → código → gates → push)."
              }
              disabled={companion !== "online"}
              className="min-h-[110px] resize-y"
              rows={6}
            />
            <p className="text-right text-xs text-muted-foreground">
              {objetivo.length} caracteres
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-destructive">
              ⚠️ {error}
            </p>
          )}

          {status && (
            <div className="space-y-2">
              <p
                className={
                  status.tone === "ok"
                    ? "flex items-center gap-2 rounded-md border border-success-soft bg-success-tint p-3 text-sm text-success-text"
                    : status.tone === "err"
                      ? "rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-destructive"
                      : "flex items-center gap-2 rounded-md border bg-background p-3 text-sm"
                }
              >
                {status.tone === "run" && <Loader2 className="h-4 w-4 animate-spin" />}
                {status.text}
                {run?.commit && (
                  <Badge variant="success">commit {run.commit}</Badge>
                )}
              </p>
              <pre
                ref={logRef}
                className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-3 font-mono text-xs leading-relaxed"
              >
                {run?.log.join("\n") ?? "…"}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={() => void startRun()}
              disabled={
                companion !== "online" ||
                !agentSel ||
                !objetivo.trim() ||
                run?.status === "running"
              }
            >
              {run?.status === "running" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ejecutar automejora
            </Button>
            {run && run.status !== "running" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setRun(null);
                  setObjetivo("");
                }}
              >
                Nueva mejora
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          ¿Falta un agente? Se detecta solo con que esté instalado en esta máquina. El
          companion ({" "}
          <code className="rounded border bg-background px-1">scripts/companion.py</code>{" "}
          ) es parte del repo: cualquier agente puede extenderlo. La automejora corre
          sobre el checkout local y pushea a{" "}
          <code className="rounded border bg-background px-1">grupoprosperyn8n/vocero-crm</code>.
        </span>
      </p>
    </div>
  );
}
