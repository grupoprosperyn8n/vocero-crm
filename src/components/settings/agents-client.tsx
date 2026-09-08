"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Pin,
  PinOff,
  Plug,
  PlugZap,
  Plus,
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
  objetivo: string;
  turn: number;
  status: "running" | "done" | "ready_to_push" | "gates_failed" | "failed" | "push_failed";
  log: string[];
  commit: string | null;
  messages: { role: string; content: string }[];
  title: string;
  pinned: boolean;
  memory: string;
  usage: { turn: number; in_tokens: number; out_tokens: number; cost_usd: number | null }[];
};

type SessionSummary = {
  id: string;
  agent: string;
  title: string;
  pinned: boolean;
  memory: string;
  status: string;
  turn: number;
  commit: string | null;
  started: number;
  ended: number | null;
  messages: number;
  usage: { turn: number; in_tokens: number; out_tokens: number; cost_usd: number | null }[];
};

/** Separa el log en turnos: resumen del agente + línea de resultado. */
function parseTurns(log: string[]): { n: number; summary: string; tail: string }[] {
  const raw: { n: number; lines: string[] }[] = [];
  let current: { n: number; lines: string[] } | null = null;
  for (const line of log) {
    const m = line.match(/——— turno (\d+) ———/);
    if (m) {
      if (current) raw.push(current);
      current = { n: Number(m[1]), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) raw.push(current);
  return raw.map((t) => {
    const agentLines: string[] = [];
    let tail = "";
    for (const l of t.lines) {
      if (l.startsWith("$ pnpm")) break;
      if (l.trim()) agentLines.push(l);
    }
    const rev = [...t.lines].reverse();
    for (const l of rev) {
      if (l.trim()) {
        tail = l.trim();
        break;
      }
    }
    return { n: t.n, summary: agentLines.join("\n").slice(-600), tail };
  });
}

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
  ready_to_push: { text: "Cambios listos — pushealos cuando quieras", tone: "ok" },
  failed: { text: "Falló la ejecución del agente — podés iterar con una corrección", tone: "err" },
  gates_failed: { text: "Gates en rojo — los cambios quedaron en el repo. Corregí el rumbo abajo", tone: "err" },
  push_failed: { text: "El push al fork falló — reintentá", tone: "err" },
};

/** Sugerencias del estado vacío del chat (arrancan la automejora directo). */
const SUGGESTIONS: string[] = [
  "Que el agente de conversación salude usando el nombre del cliente cuando lo tenga",
  "Buscar y corregir textos en inglés que deberían estar en español",
  "Agregar un test de contrato que falle si el formato de /api/health cambia",
];

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
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState<RunInfo | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
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

  const loadSessions = useCallback(async () => {
    const base = companionUrl.replace(/\/+$/, "");
    try {
      const r = await fetchWithTimeout(`${base}/api/sessions`, 4000);
      if (!r.ok) return;
      const data = (await r.json()) as { sessions: SessionSummary[] };
      setSessions(data.sessions);
    } catch {
      // sider no crítico
    }
  }, [companionUrl]);

  // Carga el sider al conectar el companion (y cuando vuelve a online).
  useEffect(() => {
    if (companion === "online") void loadSessions();
  }, [companion, loadSessions]);

  /** Corta el polling activo (al cambiar de sesión o crear una nueva). */
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const selectSession = useCallback(async (id: string) => {
    stopPolling();
    const base = companionUrl.replace(/\/+$/, "");
    try {
      const r = await fetchWithTimeout(`${base}/api/run/${id}`, 6000);
      if (!r.ok) return;
      const data = (await r.json()) as { run: RunInfo };
      setRun(data.run);
      setDraft("");
      setMemoryDraft(data.run.memory || "");
    } catch {
      setError("No se pudo cargar la sesión");
    }
  }, [companionUrl, stopPolling]);

  const togglePin = useCallback(async (id: string) => {
    const base = companionUrl.replace(/\/+$/, "");
    await fetchWithTimeout(`${base}/api/sessions/toggle-pin`, 4000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: id }),
    }).catch(() => null);
    void loadSessions();
  }, [companionUrl, loadSessions]);

  /** Limpia el chat para una conversación nueva (corta polling y run). */
  const resetChat = useCallback(() => {
    stopPolling();
    setRun(null);
    setDraft("");
    setMemoryDraft("");
  }, [stopPolling]);

  const deleteSession = useCallback(async (id: string) => {
    const base = companionUrl.replace(/\/+$/, "");
    await fetchWithTimeout(`${base}/api/sessions/delete`, 4000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: id }),
    }).catch(() => null);
    if (run?.id === id) {
      stopPolling();
      setRun(null);
      setDraft("");
      setMemoryDraft("");
    }
    void loadSessions();
  }, [companionUrl, loadSessions, run, stopPolling]);

  const saveMemory = useCallback(async (text: string) => {
    if (!run) return;
    const base = companionUrl.replace(/\/+$/, "");
    const r = await fetchWithTimeout(`${base}/api/sessions/memory`, 4000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: run.id, memory: text }),
    }).catch(() => null);
    if (r?.ok) {
      setRun({ ...run, memory: text });
      void loadSessions();
    }
  }, [companionUrl, run, loadSessions]);

  // Refresca el sider cuando el run cambia de estado (terminó/empezó turno).
  useEffect(() => {
    if (run?.status === "running") return;
    if (run) void loadSessions();
  }, [run?.status, run?.turn, loadSessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sincroniza el borrador de memoria cuando llega un run del polling/sider.
  useEffect(() => {
    if (run && !memoryDraft && run.memory) setMemoryDraft(run.memory);
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Polling del run hasta que deje de estar running. */
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const base = companionUrl.replace(/\/+$/, "");
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
  }, [companionUrl]);

  async function postAction(path: string, payload: Record<string, string>) {
    setError(null);
    const base = companionUrl.replace(/\/+$/, "");
    const res = await fetchWithTimeout(`${base}${path}`, 5000, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res) {
      setError("No se pudo contactar al companion local");
      return false;
    }
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean; id?: string; error?: string;
    } | null;
    if (!res.ok || !data?.ok || !data.id) {
      setError(data?.error ?? "Error al comunicarse con el companion");
      return false;
    }
    startPolling(data.id);
    return true;
  }

  /** Primer mensaje sin sesión: crea la automejora (sin push automático). */
  async function startRun(text: string) {
    if (!text.trim() || !agentSel) return;
    stopPolling();
    setRun(null);
    setMemoryDraft("");
    // Modo sesión: el primer turno NO pushea solo — Diego revisa e itera,
    // y el push es manual (botón "Pushear cambios") con gates en verde.
    await postAction("/api/automejora", {
      agent: agentSel,
      objetivo: text.trim(),
      auto_push: "false",
    });
  }

  /** Mensaje con sesión activa: turno de seguimiento sobre el mismo run. */
  async function followTurn(text: string) {
    if (!run || !text.trim()) return;
    await postAction("/api/automejora", {
      agent: run.agent,
      run_id: run.id,
      follow_up: text.trim(),
    });
  }

  /** Envía el mensaje del chat: crea la sesión o itera sobre la actual. */
  async function sendMessage() {
    const msg = draft.trim();
    if (!msg) return;
    setDraft("");
    if (!run) {
      await startRun(msg);
    } else {
      await followTurn(msg);
    }
  }

  async function pushRun() {
    if (!run) return;
    await postAction("/api/automejora/push", { run_id: run.id });
  }

  const status = run ? STATUS_LABEL[run.status] : null;
  const totalTokens = run
    ? run.usage.reduce((a, u) => a + (u.in_tokens || 0) + (u.out_tokens || 0), 0)
    : 0;
  const totalCost = run
    ? run.usage.reduce((a, u) => a + (u.cost_usd ?? 0), 0)
    : 0;

  return (
    <div className="space-y-4 xl:grid xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start xl:gap-4 xl:space-y-0">
      {/* Columna izquierda: estado del companion + agentes CLI */}
      <Card className="xl:sticky xl:top-2">
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
              <p className="text-xs text-muted-foreground">
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
            <div className="space-y-1 text-xs">
              <p className="flex min-w-0 items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-text" />
                <span className="shrink-0 text-muted-foreground">Companion:</span>
                <code className="min-w-0 flex-1 truncate rounded border bg-background px-1">
                  {companionUrl}
                </code>
                <button
                  type="button"
                  onClick={() => setEditingUrl(true)}
                  className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                >
                  cambiar
                </button>
              </p>
              <p className="flex min-w-0 items-center gap-1.5 pl-5">
                <code className="max-w-[120px] truncate rounded border bg-background px-1">
                  {repo.repo}
                </code>
                <Badge variant="secondary">{repo.branch}</Badge>
                <Badge variant="secondary">{repo.commit}</Badge>
                {repo.dirty && <Badge variant="warning">sucio</Badge>}
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
            <ul className="space-y-1">
              {agents.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold leading-tight">{a.bin}</p>
                      {a.version && (
                        <p className="truncate text-[11px] leading-tight text-muted-foreground">
                          {a.version}
                        </p>
                      )}
                    </div>
                  </div>
                  {a.headless ? (
                    <Badge variant="success">headless</Badge>
                  ) : (
                    <Badge variant="secondary">sin headless</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {companion === "online" && !agentsError && agentsLoaded && agents?.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No se detectaron agentes CLI conocidos en esta máquina.
            </p>
          )}
          {companion === "online" && !agentsError && !agentsLoaded && (
            <p className="text-sm text-muted-foreground">
              Buscando agentes CLI…
            </p>
          )}
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
        </CardContent>
      </Card>

      {/* Automejora — bandeja de chat (patrón Ornith con diseño Vocero) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[15px]">
            Automejora con cualquier agente
            <Badge variant="secondary">Enmienda 1</Badge>
          </CardTitle>
          <CardDescription>
            Escribile al agente qué mejorar: lee{" "}
            <code className="rounded border bg-background px-1">AGENTS.md</code>, implementa con
            spec + tests (typecheck + lint + 426), y los cambios quedan listos para pushear
            desde el chat cuando digas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]">
            {/* ===== SIDER DE CONVERSACIONES (estilo Ornith) ===== */}
            <aside className="flex max-h-[560px] min-h-[200px] flex-col overflow-hidden rounded-xl border bg-background/50 lg:max-h-[640px]">
              <div className="flex items-center justify-between gap-2 border-b p-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Conversaciones
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={resetChat}
                >
                  <Plus className="h-3.5 w-3.5" /> Nueva
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {sessions === null ? (
                  <p className="p-2 text-xs text-muted-foreground">Cargando…</p>
                ) : sessions.length === 0 ? (
                  <p className="p-2 text-xs leading-relaxed text-muted-foreground">
                    Todavía no hay sesiones. Escribí el primer objetivo en el chat →
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {sessions.map((s) => {
                      const active = run?.id === s.id;
                      return (
                        <li
                          key={s.id}
                          className={
                            "group flex items-start gap-1 rounded-lg border p-1.5 transition-colors " +
                            (active
                              ? "border-brand-soft bg-brand-tint/60"
                              : "border-transparent hover:bg-accent/60")
                          }
                        >
                          <button
                            type="button"
                            onClick={() => void selectSession(s.id)}
                            className="min-w-0 flex-1 text-left"
                            title={s.title}
                          >
                            <p className="truncate text-[13px] font-medium leading-tight">
                              {s.title}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                              {s.agent} · turno {s.turn}
                              <span
                                className={
                                  s.status === "running"
                                    ? "text-brand-text"
                                    : s.status === "done" || s.status === "ready_to_push"
                                      ? "text-success-text"
                                      : "text-destructive"
                                }
                              >
                                ●
                              </span>
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => void togglePin(s.id)}
                            className="mt-0.5 rounded p-1 text-muted-foreground opacity-60 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                            title={s.pinned ? "Despinear" : "Pinear"}
                          >
                            {s.pinned ? (
                              <Pin className="h-3.5 w-3.5 text-brand-text" />
                            ) : (
                              <PinOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSession(s.id)}
                            className="mt-0.5 rounded p-1 text-muted-foreground opacity-60 hover:bg-danger-tint hover:text-destructive group-hover:opacity-100"
                            title="Borrar sesión"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>

            {/* ===== CHAT ===== */}
            <div className="flex min-h-[520px] flex-col space-y-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background/50">
            {/* Mensajes */}
            <div className="min-h-[280px] flex-1 space-y-4 overflow-y-auto p-4">
              {!run ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border bg-background shadow-sm">
                    <Bot className="h-6 w-6 text-brand-text" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">¿Qué mejora hacemos hoy?</p>
                    <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                      Escribí el objetivo abajo o elegí uno de estos: el agente lo ejecuta
                      completo (spec → plan → código → gates) y volvés a escribirle para
                      iterar hasta que quede como querés.
                    </p>
                  </div>
                  <div className="flex max-w-lg flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void startRun(s)}
                        className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-soft hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {run.messages.map((m, i) => (
                    <div key={`u${i}`} className="text-left">
                      <div className="inline-block max-w-[88%] whitespace-pre-wrap rounded-xl border border-brand-soft/60 bg-brand-tint/70 px-3.5 py-2.5 text-sm">
                        {m.content}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {i === 0 ? "Objetivo" : "Seguimiento"} · vos
                      </p>
                    </div>
                  ))}
                  {parseTurns(run.log).map((t) => (
                    <div key={`t${t.n}`} className="text-left">
                      <div className="inline-block max-w-[88%] whitespace-pre-wrap rounded-xl border bg-background px-3.5 py-2.5 text-sm shadow-sm">
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                          <Bot className="h-3.5 w-3.5 text-brand-text" /> {run.agent}
                          <span className="font-normal">· turno {t.n}</span>
                          {t.tail.startsWith("✅") && (
                            <span className="font-medium text-success-text">✓</span>
                          )}
                          {t.tail.startsWith("⛔") && (
                            <span className="font-medium text-destructive">✕</span>
                          )}
                        </p>
                        <p className="whitespace-pre-wrap">{t.summary || "…"}</p>
                        {(t.tail.startsWith("✅") ||
                          t.tail.startsWith("⛔") ||
                          t.tail.startsWith("ℹ️")) && (
                          <p
                            className={
                              t.tail.startsWith("✅")
                                ? "mt-1.5 text-xs font-medium text-success-text"
                                : t.tail.startsWith("⛔")
                                  ? "mt-1.5 text-xs font-medium text-destructive"
                                  : "mt-1.5 text-xs text-muted-foreground"
                            }
                          >
                            {t.tail}
                          </p>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {run.agent} ·{" "}
                        {t.n === run.turn && run.status === "running"
                          ? "trabajando…"
                          : "respuesta"}
                        {run.commit && t.n === run.turn ? ` · commit ${run.commit}` : ""}
                      </p>
                    </div>
                  ))}
                  {run.status === "running" && (
                    <div className="text-left">
                      <div className="inline-flex items-center gap-2 rounded-xl border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-brand-text" />
                        {run.agent} está trabajando…
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Toolbar + input (tarjeta tipo guía) */}
            <div className="border-t bg-background p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {!run ? (
                  <>
                    <Label htmlFor="agent-sel-chat" className="text-[11px] font-medium text-muted-foreground">
                      Agente
                    </Label>
                    <select
                      id="agent-sel-chat"
                      value={agentSel}
                      onChange={(e) => setAgentSel(e.target.value)}
                      disabled={companion !== "online" || !agents?.length}
                      className="max-w-[220px] rounded-md border bg-background px-2 py-1 text-xs"
                    >
                      {agents?.filter((a) => a.headless).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bin}
                          {a.version ? ` — ${a.version}` : ""}
                        </option>
                      ))}
                      {agents?.filter((a) => !a.headless).map((a) => (
                        <option key={a.id} value={a.id} disabled>
                          {a.bin} (sin headless)
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Bot className="h-3 w-3" /> {run.agent}
                  </Badge>
                )}
                {run && <Badge variant="secondary">turno {run.turn}</Badge>}
                {run && status && (
                  <span
                    className={
                      status.tone === "ok"
                        ? "text-xs font-medium text-success-text"
                        : status.tone === "err"
                          ? "text-xs font-medium text-destructive"
                          : "flex items-center gap-1 text-xs text-muted-foreground"
                    }
                  >
                    {status.tone === "run" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {status.text}
                  </span>
                )}
                {run?.commit && <Badge variant="success">commit {run.commit}</Badge>}
                {run && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetChat}
                  >
                    Nueva mejora
                  </Button>
                )}
                {run && run.usage.length > 0 && (
                  <span className="ml-auto rounded-full border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                    ≈ {totalTokens.toLocaleString("es-AR")} tok · $
                    {totalCost.toFixed(4)} estimado
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  Enter envía · Shift+Enter salto
                </span>
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    !run
                      ? "Escribí el objetivo de la mejora… ej: que el agente salude con el nombre del cliente"
                      : run.status === "running"
                        ? "El agente está trabajando…"
                        : "Seguimiento… ej: 'ahora cambiá también X' · 'no, mejor así'"
                  }
                  className="min-h-[44px] flex-1 resize-y rounded-xl border bg-background/60 text-sm"
                  rows={1}
                  disabled={companion !== "online" || (run?.status === "running")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (draft.trim() && run?.status !== "running") {
                        void sendMessage();
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || run?.status === "running" || companion !== "online"}
                  aria-label="Enviar mensaje"
                  className="h-11 w-11 shrink-0 rounded-xl"
                >
                  ➤
                </Button>
                {run && (run.status === "ready_to_push" || run.status === "push_failed") && (
                  <Button type="button" onClick={() => void pushRun()}>
                    Pushear (gates)
                  </Button>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-destructive">
              ⚠️ {error}
            </p>
          )}

          {run && (
            <>
              <details className="rounded-md border bg-background/40 px-3 py-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Ver log técnico completo
                </summary>
                <pre
                  ref={logRef}
                  className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed"
                >
                  {run.log.join("\n")}
                </pre>
              </details>
              {/* Memoria de la sesión (persistente por conversación) */}
              <details
                className="rounded-md border bg-background/40 px-3 py-2 text-xs"
                open={Boolean(run.memory)}
              >
                <summary className="cursor-pointer text-muted-foreground">
                  Memoria de la sesión
                </summary>
                <div className="mt-2 flex items-end gap-2">
                  <textarea
                    value={memoryDraft}
                    onChange={(e) => setMemoryDraft(e.target.value)}
                    placeholder="Notas para retomar esta mejora después (se guardan con la sesión)…"
                    className="min-h-[60px] flex-1 resize-y rounded-md border bg-background px-2 py-1.5 text-xs"
                    rows={2}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void saveMemory(memoryDraft)}
                  >
                    Guardar memoria
                  </Button>
                </div>
              </details>
            </>
          )}
            </div>
          </div>
        </CardContent>
      </Card>


    </div>
  );
}
