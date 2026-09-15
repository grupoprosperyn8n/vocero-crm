"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BellOff,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  ExternalLink,
  Eye,
  GitBranch,
  Hourglass,
  Inbox,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  Users,
} from "lucide-react";
import { ShareAlertDialog } from "@/components/alerts/share-alert-dialog";
import { AssignAlertDialog } from "@/components/alerts/assign-alert-dialog";
import { AlertRulesDialog } from "@/components/alerts/alert-rules-dialog";
import { AddToPipelineButton } from "@/components/pipeline/add-to-pipeline";
import { alertDate, alertEstadoLabel, parseAlertDetalle } from "@/lib/alerts";
import { alertRecordInterfaceUrl, sgsaClientInterfaceUrl } from "@/lib/sgsa-links";
import type { SgsaAlertDto } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 027 — Alertas del sistema de seguros.
 *
 * Misma cola que ven la PWA y la extensión: el CRM la muestra y acciona
 * (Leído / Progreso / Concluido / Anular) contra el backend, que escribe en
 * Airtable. La lista se cachea en localStorage para pintar al instante al
 * volver (patrón de la PWA) y se refresca sola cada 60 segundos.
 */

const CACHE_KEY = "vocero.alerts.cache";
const SOUND_KEY = "vocero.alerts.sound";
const REFRESH_MS = 60_000;

type UrgFilter = "" | "3" | "2" | "1";

const URG_STYLES: Record<number, { border: string; chip: string; dot: string }> = {
  3: {
    border: "border-l-[3px] border-l-danger",
    chip: "bg-danger-tint text-danger-text",
    dot: "bg-danger",
  },
  2: {
    border: "border-l-[3px] border-l-warning",
    chip: "bg-warning-tint text-warning-text",
    dot: "bg-warning",
  },
  1: {
    border: "border-l-[3px] border-l-warning-soft",
    chip: "bg-accent text-text-2",
    dot: "bg-warning-soft",
  },
  0: {
    border: "border-l-[3px] border-l-border-strong",
    chip: "bg-accent text-text-2",
    dot: "bg-border-strong",
  },
};

const URG_FALLBACK = URG_STYLES[0]!;

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, at: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      o.type = "sine";
      g.gain.setValueAtTime(0.06, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.02);
    };
    tone(660, 0, 0.15);
    tone(880, 0.1, 0.1);
    tone(1100, 0.2, 0.12);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* sin audio disponible */
  }
}

function safeLink(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

const ACTION_DEFS: {
  key: "ack" | "EN_PROGRESO" | "TURNO_CONFIRMADO" | "CONCLUIDA" | "ANULADA";
  label: string;
  icon: typeof Eye;
  cls: string;
  turnoOnly?: boolean;
}[] = [
  { key: "ack", label: "Leído", icon: Eye, cls: "hover:border-brand hover:text-brand-text" },
  { key: "EN_PROGRESO", label: "Progreso", icon: Hourglass, cls: "hover:border-brand hover:text-brand-text" },
  {
    key: "TURNO_CONFIRMADO",
    label: "Turno confirmado",
    icon: CalendarCheck2,
    cls: "hover:border-success hover:text-success-text",
    turnoOnly: true,
  },
  { key: "CONCLUIDA", label: "Concluido", icon: CheckCircle2, cls: "hover:border-success hover:text-success-text" },
  { key: "ANULADA", label: "Anular", icon: CircleSlash, cls: "hover:border-danger hover:text-danger-text" },
];

export function AlertsClient() {
  const [alerts, setAlerts] = useState<SgsaAlertDto[] | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [hist, setHist] = useState(false);
  const [urg, setUrg] = useState<UrgFilter>("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastAt, setLastAt] = useState<Date | null>(null);
  // El sonido arranca encendido salvo que el usuario lo apague (como la PWA).
  const [sound, setSound] = useState(true);
  const [shareFor, setShareFor] = useState<SgsaAlertDto | null>(null);
  // 028 — derivación y reglas: owner/admin/manager derivan; el resto gestiona.
  const [assignFor, setAssignFor] = useState<SgsaAlertDto | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [mine, setMine] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [viewerRole, setViewerRole] = useState<string | null>(null);

  const soundRef = useRef(sound);
  const histRef = useRef(hist);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const canManageRef = useRef(false);

  useEffect(() => {
    soundRef.current = sound;
    try {
      localStorage.setItem(SOUND_KEY, sound ? "1" : "0");
    } catch {
      /* sin storage */
    }
  }, [sound]);

  useEffect(() => {
    histRef.current = hist;
  }, [hist]);

  // Sonido guardado + caché para el primer pintado instantáneo.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      if (saved === "0") setSound(false);
      // La caché guarda la vista activa («todas» o «para mí»): va la última.
      let cached: { alerts: SgsaAlertDto[]; at?: number; canManage?: boolean } | null = null;
      for (const key of [CACHE_KEY, `${CACHE_KEY}.mine`]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          alerts?: SgsaAlertDto[];
          at?: number;
          canManage?: boolean;
        };
        if (!Array.isArray(parsed.alerts) || !parsed.alerts.length) continue;
        if (!cached || (parsed.at ?? 0) > (cached.at ?? 0)) {
          cached = { alerts: parsed.alerts, at: parsed.at, canManage: parsed.canManage };
        }
      }
      if (cached) {
        setAlerts(cached.alerts);
        seenIdsRef.current = new Set(cached.alerts.map((a) => a.id));
        // Quien ya venía viendo solo lo suyo pinta su vista desde el arranque.
        if (cached.canManage === false) setMine(true);
      }
    } catch {
      /* sin storage */
    }
  }, []);

  const load = useCallback(async (history: boolean) => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/alerts?hist=${history ? 1 : 0}&mine=${mine ? 1 : 0}`
      ).catch(() => null);
      if (!res) {
        setError("No se pudo conectar con el sistema de alertas.");
        setAlerts((prev) => prev ?? []); // destrabar el skeleton
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        alerts?: SgsaAlertDto[];
        pendientes?: number;
        error?: string;
        viewerRole?: string;
        canManageAssignments?: boolean;
      } | null;
      if (!res.ok || data?.error) {
        setError("El sistema de alertas no responde. Reintentá en un momento.");
        setAlerts((prev) => (prev?.length ? prev : []));
        return;
      }
      setError(null);
      if (data?.viewerRole) setViewerRole(data.viewerRole);
      if (typeof data?.canManageAssignments === "boolean") {
        canManageRef.current = data.canManageAssignments;
        setCanManage(data.canManageAssignments);
        // 028 — un miembro ve SOLO lo derivado a él (directo o por su grupo).
        if (!data.canManageAssignments) setMine(true);
      }
      const list = data?.alerts ?? [];
      if (!history) {
        // Aviso sonoro solo cuando APARECEN alertas nuevas estando la página
        // abierta (no en la primera carga ni en el historial).
        const fresh = list.filter((a) => !seenIdsRef.current.has(a.id));
        if (
          !firstLoadRef.current &&
          seenIdsRef.current.size > 0 &&
          fresh.length > 0 &&
          soundRef.current
        ) {
          beep();
        }
        seenIdsRef.current = new Set(list.map((a) => a.id));
        firstLoadRef.current = false;
        setPendientes(data?.pendientes ?? list.length);
        try {
          const cacheKey = mine ? `${CACHE_KEY}.mine` : CACHE_KEY;
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              alerts: list.slice(0, 60),
              at: Date.now(),
              canManage: canManageRef.current,
            })
          );
        } catch {
          /* sin storage */
        }
      }
      setAlerts(list);
      setLastAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [mine]);

  useEffect(() => {
    void load(hist);
  }, [hist, load]);

  // Refresco automático: la cola la mueven la PWA, la extensión y el backend.
  useEffect(() => {
    const t = setInterval(() => void load(histRef.current), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const refresh = () => void load(hist);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function act(a: SgsaAlertDto, kind: "ack" | string) {
    if (busyId) return;
    setBusyId(a.id);
    try {
      const res =
        kind === "ack"
          ? await fetch(`/api/alerts/${encodeURIComponent(a.id)}/ack`, {
              method: "POST",
            }).catch(() => null)
          : await fetch(`/api/alerts/${encodeURIComponent(a.id)}/status`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ estado: kind }),
            }).catch(() => null);
      if (!res?.ok) {
        setError("No se pudo actualizar la alerta.");
        void load(histRef.current);
        return;
      }
      setError(null);
      if (soundRef.current) beep();
      if (!histRef.current) {
        // Pendientes: la tarjeta sale de la cola al instante (como la PWA).
        setAlerts((prev) => (prev ?? []).filter((x) => x.id !== a.id));
        setPendientes((p) => Math.max(0, p - 1));
        try {
          const cacheKey = mine ? `${CACHE_KEY}.mine` : CACHE_KEY;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as { alerts?: SgsaAlertDto[] };
            localStorage.setItem(
              cacheKey,
              JSON.stringify({
                ...parsed,
                alerts: (parsed.alerts ?? []).filter((x) => x.id !== a.id),
              })
            );
          }
        } catch {
          /* sin storage */
        }
      } else {
        void load(true);
      }
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    let list = alerts ?? [];
    if (urg) {
      const level = Number(urg);
      list = list.filter((a) => a.urgencia === level);
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (a) =>
          a.titulo.toLowerCase().includes(needle) ||
          a.cuerpo.toLowerCase().includes(needle) ||
          a.tipo.toLowerCase().includes(needle) ||
          (a.clienteNombre ?? "").toLowerCase().includes(needle)
      );
    }
    return list;
  }, [alerts, urg, q]);

  const loading = alerts === null;
  const isMember = viewerRole === "member";

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-subtle px-4 py-3">
        <h1 className="flex items-center gap-2 text-[15px] font-bold">
          <BellRing className="h-4 w-4 text-brand" strokeWidth={1.9} />
          Alertas
        </h1>
        <span className="text-[12px] text-text-2">
          {hist ? "Historial" : `${pendientes} pendiente${pendientes === 1 ? "" : "s"}`}
        </span>
        <div className="flex-1" />
        <span className="hidden text-[11px] text-text-3 sm:block">
          {lastAt
            ? `Actualizado ${lastAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : ""}
        </span>
        <button
          onClick={() => setSound((s) => !s)}
          title={sound ? "Silenciar alertas" : "Activar sonido"}
          className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
        >
          {sound ? (
            <BellRing className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <BellOff className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
        <button
          onClick={refresh}
          title="Actualizar"
          className="rounded-md p-1.5 text-text-3 transition-colors hover:bg-accent hover:text-foreground"
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
            strokeWidth={1.8}
          />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar alertas..."
            className="h-9 w-full rounded-md border bg-card py-1.5 pl-8 pr-2.5 text-[13px] outline-none placeholder:text-text-3 focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ["", "Todas"],
              ["3", "🔴 Urgentes"],
              ["2", "🟠 Altas"],
              ["1", "🟡 Medias"],
            ] as [UrgFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value || "all"}
              onClick={() => setUrg(value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                urg === value
                  ? "border-brand bg-brand-tint text-brand-text"
                  : "text-text-2 hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {canManage && (
          <button
            onClick={() => setMine((m) => !m)}
            title="Ver solo las alertas derivadas a mí"
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
              mine ? "border-brand bg-brand-tint text-brand-text" : "text-text-2 hover:bg-accent"
            )}
          >
            Para mí
          </button>
        )}
        {isMember && (
          <span className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold text-text-3">
            Solo las derivadas a vos
          </span>
        )}
        <div className="flex-1" />
        {canManage && (
          <button
            onClick={() => setRulesOpen(true)}
            title="Reglas por tipo de alerta: quién ve y gestiona cada tipo"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent"
          >
            <Settings2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            Reglas
          </button>
        )}
        <button
          onClick={() => setHist((h) => !h)}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
            hist ? "border-brand bg-brand-tint text-brand-text" : "text-text-2 hover:bg-accent"
          )}
        >
          {hist ? "Ver pendientes" : "Historial"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-danger-soft bg-danger-tint px-3 py-2 text-[12.5px] text-danger-text">
            <span>{error}</span>
            <button onClick={refresh} className="ml-auto shrink-0 font-semibold underline">
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[86px] animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <Inbox className="h-8 w-8 text-text-3" strokeWidth={1.5} />
            <p className="text-[13.5px] font-semibold">
              {hist
                ? "Sin historial para mostrar"
                : mine || isMember
                  ? "Sin alertas asignadas a vos"
                  : "Sin alertas pendientes"}
            </p>
            <p className="max-w-xs text-[12px] text-text-3">
              {hist
                ? "Las alertas gestionadas quedan acá cuando el sistema las consolida."
                : mine || isMember
                  ? "Cuando te deriven alertas (por regla o asignación directa) van a aparecer acá."
                  : "Las alertas operativas (pólizas, turnos, gestiones, siniestros) aparecen acá solas."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((a) => {
              const styles = URG_STYLES[a.urgencia] ?? URG_FALLBACK;
              const open = expanded.has(a.id);
              const link = alertRecordInterfaceUrl(
                safeLink(a.linkRegistro),
                a.clienteRecordId
              );
              const clienteUrl = a.clienteRecordId
                ? sgsaClientInterfaceUrl(a.clienteRecordId)
                : null;
              const rows = open ? parseAlertDetalle(a.detalle) : [];
              const busy = busyId === a.id;
              return (
                <div
                  key={a.id}
                  data-alert-card={a.id}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-card transition-opacity",
                    styles.border,
                    busy && "opacity-60"
                  )}
                >
                  <button
                    onClick={() => toggleExpanded(a.id)}
                    className="w-full px-3.5 py-3 text-left"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={cn("mt-[5px] h-2 w-2 shrink-0 rounded-full", styles.dot)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold">
                            {a.titulo}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                              styles.chip
                            )}
                          >
                            {a.urgenciaLabel}
                          </span>
                        </div>
                        {a.cuerpo && (
                          <p className="mt-1 line-clamp-2 text-[12.5px] text-text-2">
                            {a.cuerpo}
                          </p>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-3">
                          <span>{alertDate(a.fecha)}</span>
                          <span className="rounded bg-accent px-1.5 py-0.5 font-medium">
                            {a.tipo}
                          </span>
                          {a.estado !== "PENDIENTE" && (
                            <span className="rounded bg-accent px-1.5 py-0.5 font-medium">
                              {alertEstadoLabel(a.estado)}
                            </span>
                          )}
                          {(a.compartidaCon.length > 0 || a.compartidaGrupos) && (
                            <span
                              className="rounded bg-accent px-1.5 py-0.5 font-medium"
                              title={
                                a.compartidaGrupos
                                  ? `Compartida: ${a.compartidaGrupos}`
                                  : "Compartida"
                              }
                            >
                              Compartida
                            </span>
                          )}
                          {(a.asignaciones?.length ?? 0) > 0 && (
                            <span
                              className="rounded bg-accent px-1.5 py-0.5 font-medium"
                              title={`Derivada a: ${(a.asignaciones ?? [])
                                .map(
                                  (t) =>
                                    `${t.targetName}${t.source === "rule" ? " (regla)" : ""}`
                                )
                                .join(", ")}`}
                            >
                              Derivada: {(a.asignaciones ?? [])[0]?.targetName}
                              {(a.asignaciones?.length ?? 0) > 1
                                ? ` +${(a.asignaciones?.length ?? 1) - 1}`
                                : ""}
                            </span>
                          )}
                          {a.asignadaParaMi && (
                            <span className="rounded bg-brand-tint px-1.5 py-0.5 font-semibold text-brand-text">
                              Para mí
                            </span>
                          )}
                          <ChevronDown
                            className={cn(
                              "ml-auto h-3.5 w-3.5 transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t px-3.5 pb-3 pt-2.5">
                      {rows.length > 0 && (
                        <div className="mb-2.5 space-y-1">
                          {rows.map((r, i) =>
                            "k" in r ? (
                              <div key={i} className="flex gap-2 text-[12.5px]">
                                <span className="w-28 shrink-0 text-text-3">{r.k}</span>
                                <span className="min-w-0 flex-1">{r.v}</span>
                              </div>
                            ) : (
                              <div key={i} className="text-[12.5px] text-text-2">
                                {r.text}
                              </div>
                            )
                          )}
                        </div>
                      )}
                      {(link || clienteUrl) && (
                        <div className="mb-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1">
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-text hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Abrir registro
                            </a>
                          )}
                          {clienteUrl && (
                            <a
                              href={clienteUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={
                                a.clienteNombre
                                  ? `Abrir ${a.clienteNombre} en la interface del sistema`
                                  : "Abrir el cliente en la interface del sistema"
                              }
                              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-text hover:underline"
                            >
                              <Users className="h-3.5 w-3.5" />
                              Abrir cliente
                            </a>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {ACTION_DEFS.filter(
                          (d) => !d.turnoOnly || a.tipo.startsWith("TURNO_")
                        ).map((d) => (
                          <button
                            key={d.key}
                            data-alert-action={d.key}
                            disabled={busy}
                            onClick={() => void act(a, d.key)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors disabled:opacity-50",
                              d.cls
                            )}
                          >
                            <d.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {d.label}
                          </button>
                        ))}
                        {canManage && !hist && (
                          <button
                            data-alert-action="assign"
                            disabled={busy}
                            onClick={() => setAssignFor(a)}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:border-brand hover:text-brand-text disabled:opacity-50"
                          >
                            <GitBranch className="h-3.5 w-3.5" strokeWidth={1.8} />
                            Derivar
                          </button>
                        )}
                        <button
                          data-alert-action="share"
                          disabled={busy}
                          onClick={() => setShareFor(a)}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:border-brand hover:text-brand-text disabled:opacity-50"
                        >
                          <Share2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                          Compartir
                        </button>
                        {/* 029 — mandar la alerta a MI pipeline de gestiones. */}
                        <AddToPipelineButton
                          source={{
                            kind: "alert",
                            ref: a.airtableRecordId ?? a.id,
                            label: a.titulo,
                            meta: {
                              tipo: a.tipo,
                              urgencia: a.urgenciaLabel,
                              clienteNombre: a.clienteNombre ?? undefined,
                              clienteRecordId: a.clienteRecordId ?? undefined,
                              linkRegistro: safeLink(a.linkRegistro) ?? undefined,
                            },
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {shareFor && (
        <ShareAlertDialog
          alert={shareFor}
          onClose={() => setShareFor(null)}
          onShared={() => void load(histRef.current)}
        />
      )}
      {assignFor && (
        <AssignAlertDialog
          alert={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={() => void load(histRef.current)}
        />
      )}
      {rulesOpen && (
        <AlertRulesDialog
          alertTypes={Array.from(new Set((alerts ?? []).map((a) => a.tipo))).sort()}
          onClose={() => setRulesOpen(false)}
          onSaved={() => void load(histRef.current)}
        />
      )}
    </div>
  );
}
