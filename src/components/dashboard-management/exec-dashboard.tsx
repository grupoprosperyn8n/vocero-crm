"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Database,
  HeartHandshake,
  HelpCircle,
  Lightbulb,
  ListTree,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  MODULE_HELP,
  type HelpAction,
  type ModuleHelp,
  type TabId,
} from "@/lib/dashboard-management/help";
import type {
  DashboardResponse,
  DrillList,
  InsightMode,
  ModuleAiId,
  ModuleInsight,
} from "@/lib/dashboard-management/types";

/**
 * 038b — Dashboard Management: el cockpit ejecutivo como parte NATIVA del CRM.
 *
 * Reescritura fiel del tablero (rafael-intelligence) con el sistema de diseño
 * de Vocero: mismos módulos, mismos números, mismos filtros, mismo motor de
 * IA y las mismas listas de registros — sin iframe. Los datos llegan por el
 * proxy del servidor del CRM (`/api/dashboard-management/*`).
 */

const CHART = {
  altas: "#1fb35b",
  anulaciones: "#d94a4a",
  net: "#0d5bff",
  series: ["#0d5bff", "#1fb35b", "#f2a71b", "#8b5cf6", "#e11d48", "#0ea5e9"],
};

function number(value: number) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function presetRange(preset: "month" | "lastMonth" | "year" | "all") {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === "all") return { from: "", to: "" };
  if (preset === "year") return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
  if (preset === "month") {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: iso(now) };
  }
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { from: iso(first), to: iso(last) };
}

/* ————————————————————————— KPI ————————————————————————— */

const KPI_TONES = {
  default: "bg-subtle text-text-3",
  accent: "bg-brand-tint text-brand-text",
  success: "bg-success-tint text-success-text",
  warning: "bg-warning-tint text-warning-text",
  danger: "bg-danger-tint text-danger-text",
} as const;

function Kpi({
  title,
  value,
  subtitle,
  icon,
  tone = "default",
  onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: keyof typeof KPI_TONES;
  onClick?: () => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-4",
        onClick && "cursor-pointer transition-colors hover:border-brand-soft"
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={onClick ? "Ver la lista de registros detrás de este número" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-text-2">{title}</span>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            KPI_TONES[tone]
          )}
        >
          {icon}
        </span>
      </div>
      <strong className="mt-2 block text-2xl font-bold tabular-nums">{value}</strong>
      <span className="mt-0.5 block text-[11.5px] text-text-3">{subtitle}</span>
      {onClick && (
        <span className="mt-1.5 block text-[11.5px] font-semibold text-brand-text">
          Ver lista →
        </span>
      )}
    </article>
  );
}

/* ———————————————————————— Secciones ———————————————————————— */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <header>
        <h2 className="text-[13px] font-bold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11.5px] text-text-3">{subtitle}</p>}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-subtle text-text-2",
    warning: "border-warning-soft bg-warning-tint text-warning-text",
    success: "border-success-soft bg-success-tint text-success-text",
    accent: "border-brand-soft bg-brand-tint text-brand-text",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone] ?? tones.neutral
      )}
    >
      {children}
    </span>
  );
}

/* ——————————————————————— Guía del módulo ——————————————————————— */

function HelpZone({
  help,
  id,
  onAction,
}: {
  help: ModuleHelp;
  id: string;
  onAction: (action: HelpAction) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(`dm-help-${id}`));
    } catch {}
    if (!seen) {
      setOpen(true);
      try {
        localStorage.setItem(`dm-help-${id}`, "1");
      } catch {}
    }
  }, [id]);

  return (
    <section className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-tint text-brand-text">
          <HelpCircle size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[12.5px] font-bold">¿Cómo funciona {help.title}?</strong>
          <em className="block truncate text-[11.5px] not-italic text-text-3">{help.tagline}</em>
        </span>
        <span className="flex items-center gap-1 text-[11.5px] font-semibold text-text-2">
          {open ? "Cerrar guía" : "Abrir guía"}
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                ¿Qué es?
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] text-text-2">
                {help.what.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                ¿Qué mide?
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] text-text-2">
                {help.measures.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
                ¿Para qué te sirve?
              </h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] text-text-2">
                {help.usage.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {help.suggestions.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <h4 className="flex items-center gap-1.5 text-[11.5px] font-bold text-text-2">
                <Lightbulb size={13} /> Sugerencias
              </h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {help.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.text}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-text-2 transition-colors hover:border-brand-soft hover:bg-brand-tint"
                    onClick={() => {
                      if (suggestion.action) onAction(suggestion.action);
                    }}
                  >
                    {suggestion.text}
                    {suggestion.action && <ArrowUpRight size={12} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ———————————————————— Sugerencias de hoy ———————————————————— */

function SuggestionsStrip({
  data,
  onGoto,
  onOpenList,
}: {
  data: DashboardResponse;
  onGoto: (tab: TabId) => void;
  onOpenList: (tab: TabId, listId: string) => void;
}) {
  const items: { text: string; tab: TabId; list?: string }[] = [];

  if (data.current.expires7 > 0) {
    items.push({
      text: `${number(data.current.expires7)} pólizas vencen en ≤7 días — hablá hoy`,
      tab: "retencion",
      list: "expires7",
    });
  } else if (data.current.expires30 > 0) {
    items.push({
      text: `${number(data.current.expires30)} pólizas vencen este mes — prepará la ronda`,
      tab: "retencion",
      list: "expires30",
    });
  }

  if (data.opportunity.reactivationCandidates > 0) {
    items.push({
      text: `${number(data.opportunity.reactivationCandidates)} clientes para reactivar`,
      tab: "reactivacion",
      list: "candidates",
    });
  }

  const topCross = data.crossSell?.[0];
  if (topCross && topCross.customers > 0) {
    items.push({
      text: `${topCross.opportunity}: ${number(topCross.customers)} clientes para ampliar`,
      tab: "cross",
      list: topCross.opportunity.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    });
  }

  if (data.crm?.available && data.crm.kpis?.leads > 0) {
    const leads = data.crm.kpis.leads;
    items.push({
      text: `CRM: ${number(leads)} ${leads === 1 ? "oportunidad abierta" : "oportunidades abiertas"}`,
      tab: "crm",
    });
  }

  items.push({
    text: `Migración: ${percent(data.migration.operationMatchRate)} de gestiones vinculadas`,
    tab: "migracion",
  });

  if (!items.length) return null;

  return (
    <section className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-text-3">
        <Sparkles size={14} />
        Sugerencias de hoy
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 5).map((item) => (
          <button
            key={item.text}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-text-2 transition-colors hover:border-brand-soft hover:bg-brand-tint"
            onClick={() => (item.list ? onOpenList(item.tab, item.list) : onGoto(item.tab))}
          >
            {item.text}
          </button>
        ))}
      </div>
    </section>
  );
}

/* —————————————————————— Listas del módulo —————————————————————— */

function ModuleLists({
  module,
  lists,
  open,
  active,
  onToggle,
  onSelect,
  onClose,
}: {
  module: string;
  lists: DrillList[];
  open: boolean;
  active: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const current = lists.find((list) => list.id === active) || lists[0];

  if (lists.length === 0 || !current) return null;

  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? current.items.filter((item) =>
        [item.name, item.dni, item.detail, item.extra]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      )
    : current.items;

  const totalRecords = lists.reduce((sum, list) => sum + list.total, 0);

  return (
    <div className="rounded-lg border bg-card" id={`lists-${module}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={open}
      >
        <ListTree size={15} className="text-text-3" />
        <span className="text-[12.5px] font-bold">
          {open ? "Cerrar listas" : "Listas del módulo"}
        </span>
        <span className="rounded-full border border-border bg-subtle px-2 py-0.5 text-[11px] tabular-nums text-text-2">
          {number(totalRecords)} registros
        </span>
        <span className="flex-1" />
        <ChevronDown
          size={15}
          className={cn("text-text-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border p-3">
          <div className="flex flex-wrap gap-1.5">
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  list.id === current.id
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-border bg-card text-text-2 hover:bg-accent"
                )}
                onClick={() => onSelect(list.id)}
              >
                {list.title}
                <b className="tabular-nums">{number(list.total)}</b>
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrar (nombre, DNI, póliza…)"
              className="h-8 min-w-[220px] flex-1 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
            />
            <span className="text-[11.5px] tabular-nums text-text-3">
              {normalized
                ? `${visible.length} de ${current.items.length}`
                : current.total > current.shown
                  ? `Últimas ${current.shown} de ${number(current.total)}`
                  : `${number(current.total)} registro${current.total === 1 ? "" : "s"}`}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent"
              onClick={onClose}
              title="Cerrar y volver a donde estabas"
            >
              <X size={13} /> Cerrar
            </button>
          </div>

          <div className="mt-2.5 max-h-[420px] divide-y divide-border overflow-y-auto rounded-md border">
            {visible.map((item, index) => (
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                key={`${item.name}-${index}`}
              >
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[12.5px]">{item.name}</strong>
                  {item.dni && <span className="text-[11px] text-text-3">DNI {item.dni}</span>}
                </div>
                <div className="min-w-0 flex-1 text-right text-[11.5px] text-text-2">
                  <span className="block truncate">{item.detail}</span>
                  <span className="block truncate text-[11px] text-text-3">{item.extra}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                    >
                      {link.label}
                      <ArrowUpRight size={11} />
                    </a>
                  ))}
                </div>
              </div>
            ))}

            {visible.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-text-3">
                Sin resultados para el filtro.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ————————————————————— Motor de IA del módulo ————————————————————— */

const MODULE_AI_TITLES: Record<ModuleAiId, string> = {
  pulso: "Pulso del negocio",
  cartera: "Cartera",
  retencion: "Retención",
  reactivacion: "Reactivación",
  cross: "Venta cruzada",
  migracion: "Calidad y avance de la migración",
  crm: "CRM · Venta y gestión",
};

function ModuleAiRow({
  id,
  engine,
  onEngine,
  state,
  onGenerate,
  onCopy,
  copied,
}: {
  id: ModuleAiId;
  engine: InsightMode;
  onEngine: (mode: InsightMode) => void;
  state?: {
    status: "loading" | "error" | "done";
    data?: ModuleInsight;
    error?: string;
  };
  onGenerate: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const label = MODULE_AI_TITLES[id];
  const insight = state?.status === "done" ? state.data : undefined;

  useEffect(() => {
    if (engine === "ia" && !state) {
      onGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const options: { id: InsightMode; label: string; hint: string }[] = [
    {
      id: "algoritmo",
      label: "Algoritmo solo",
      hint: "Sin IA: solo los datos y las reglas del sistema.",
    },
    {
      id: "dual",
      label: "Dual (IA + datos)",
      hint: "Los datos del módulo + la lectura de la IA (la generás cuando quieras).",
    },
    {
      id: "ia",
      label: "Solo IA",
      hint: "La IA lee los datos reales de este módulo y arma el resumen y las acciones; se genera sola.",
    },
  ];

  const current = options.find((option) => option.id === engine) ?? options[1]!;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
          Motor
        </span>
        <div className="inline-flex rounded-md border bg-subtle p-0.5">
          {options.map((option) => (
            <button
              key={option.id}
              className={cn(
                "rounded-sm px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                engine === option.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-text-2 hover:text-foreground"
              )}
              onClick={() => onEngine(option.id)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="text-[11.5px] text-text-3">{current.hint}</span>
      </div>

      {engine !== "algoritmo" && (
        <div className="mt-2.5 rounded-md border border-brand-soft bg-brand-tint px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand-text">
            <Sparkles size={12} />
            {engine === "ia" ? `Análisis con IA · ${label}` : `Análisis IA (extra) · ${label}`}
          </span>

          {state?.status === "loading" && (
            <div className="mt-2 text-[12.5px] text-text-2">Generando análisis con la IA…</div>
          )}

          {!state && (
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-brand-soft bg-card px-2.5 py-1.5 text-[12px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
              onClick={onGenerate}
            >
              <Sparkles size={13} />
              Generar análisis con IA
            </button>
          )}

          {state?.status === "error" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-danger-text">
              <span>{state.error}</span>
              <button
                className="rounded-md border border-danger-soft bg-card px-2.5 py-1 text-[11.5px] font-semibold"
                onClick={onGenerate}
              >
                Reintentar
              </button>
            </div>
          )}

          {insight && (
            <div className="mt-2 space-y-2">
              <p className="text-[12.5px] text-text-2">{insight.resumen}</p>

              {insight.focos.length > 0 && (
                <div>
                  <span className="text-[11.5px] font-bold text-text-3">Qué mirar</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-text-2">
                    {insight.focos.map((foco) => (
                      <li key={foco}>{foco}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.acciones.length > 0 && (
                <div>
                  <span className="text-[11.5px] font-bold text-text-3">Qué hacer</span>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-text-2">
                    {insight.acciones.map((accion) => (
                      <li key={accion}>{accion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insight.mensaje && (
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <p className="text-[12.5px] text-text-2">{insight.mensaje}</p>
                  <button
                    className="mt-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
                    onClick={() => onCopy(insight.mensaje ?? "")}
                  >
                    {copied ? "Copiado ✓" : "Copiar mensaje"}
                  </button>
                </div>
              )}

              <span className="block text-[11px] text-text-3">
                Generado con {insight.model} · solo sobre los datos del sistema
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ——————————————————————— Próximo bloque ——————————————————————— */

const COMING_SOON: Partial<Record<TabId, string>> = {
  cartera: "Cartera",
  retencion: "Retención",
  reactivacion: "Reactivación",
  cross: "Venta cruzada",
  clientes: "Cliente 360°",
  crm: "CRM · Venta y gestión",
  migracion: "Calidad de datos",
};

function ComingSoon({ tab }: { tab: TabId }) {
  const label = COMING_SOON[tab] ?? tab;
  return (
    <section className="rounded-lg border bg-card px-4 py-10 text-center">
      <h2 className="text-[14px] font-bold">{label}</h2>
      <p className="mx-auto mt-1 max-w-[520px] text-[12.5px] text-text-2">
        Este módulo ya está mapeado del tablero original y se integra en el próximo bloque de la
        migración. No se pierde nada: cada número, gráfico, lista y lectura con IA va a estar acá,
        con el diseño del CRM.
      </p>
    </section>
  );
}

/* ——————————————————————————— Main ——————————————————————————— */

const EMPTY_FILTERS = {
  from: "",
  to: "",
  office: "",
  product: "",
  employee: "",
  channel: "",
  company: "",
  search: "",
};

const MODULE_TABS: { id: TabId; label: string; Icon: typeof TrendingUp }[] = [
  { id: "pulso", label: "Pulso del negocio", Icon: TrendingUp },
  { id: "cartera", label: "Cartera", Icon: BriefcaseBusiness },
  { id: "retencion", label: "Retención", Icon: HeartHandshake },
  { id: "reactivacion", label: "Reactivación", Icon: Target },
  { id: "cross", label: "Venta cruzada", Icon: ArrowUpRight },
  { id: "clientes", label: "Cliente 360°", Icon: Users },
  { id: "crm", label: "CRM · Venta y gestión", Icon: MessageSquareText },
  { id: "migracion", label: "Calidad de datos", Icon: Database },
];

export function ExecDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [tab, setTab] = useState<TabId>("pulso");
  const [modEngines, setModEngines] = useState<Partial<Record<ModuleAiId, InsightMode>>>({});
  const [modInsights, setModInsights] = useState<
    Record<string, { status: "loading" | "error" | "done"; data?: ModuleInsight; error?: string }>
  >({});
  const [copiedMod, setCopiedMod] = useState<ModuleAiId | null>(null);
  const [listOpen, setListOpen] = useState<Record<string, boolean>>({});
  const [listSel, setListSel] = useState<Record<string, string>>({});
  const [listRestore, setListRestore] = useState<{ tab: TabId; scrollY: number } | null>(null);

  const load = useCallback(
    async (override?: typeof filters) => {
      const active = override || filters;
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams();
        Object.entries(active).forEach(([key, value]) => {
          if (value) query.set(key, value);
        });
        const response = await fetch(`/api/dashboard-management/dashboard?${query}`, {
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error?.message || "No se pudo cargar el dashboard.");
        }
        setData(result as DashboardResponse);
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : "No se pudo cargar el dashboard."
        );
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* — Lecturas con IA — */

  function moduleContext(module: ModuleAiId): Record<string, unknown> {
    if (!data) return {};
    switch (module) {
      case "pulso":
        return {
          "Pólizas activas": data.current.activePolicies,
          "Prima activa ARS": data.current.activePremium,
          "Clientes con póliza activa": data.current.activeClients,
          "Vencen ≤7 días": data.current.expires7,
          "Vencen ≤30 días": data.current.expires30,
          "Altas históricas": data.historic.altas,
          "Anulaciones históricas": data.historic.anulaciones,
          "Crecimiento neto": data.historic.net,
          "Siniestros históricos": data.historic.siniestros,
          Cotizaciones: data.historic.cotizaciones,
          "Evolución mensual (últimos 6 meses)": data.monthly
            .slice(-6)
            .map(
              (row) =>
                `${row.month}: altas ${row.altas}, anulaciones ${row.anulaciones}, neto ${row.net}, siniestros ${row.siniestros}`
            ),
        };
      case "cartera":
        return {
          "Pólizas cargadas": data.current.loadedPolicies,
          "Pólizas activas": data.current.activePolicies,
          "Prima activa ARS": data.current.activePremium,
          "Clientes con 1 póliza": data.current.onePolicyClients,
          "Clientes con 2 o más": data.current.multiPolicyClients,
          "Productos con más pólizas activas": data.currentProducts
            .slice(0, 6)
            .map((row) => `${row.name}: ${row.value}`),
          "Compañías (pólizas y prima activa)": data.companies
            .slice(0, 6)
            .map((row) => `${row.name}: ${row.policies} pólizas, prima activa $${row.activePremium}`),
          "Oficinas (altas / anulaciones / neto)": data.offices
            .slice(0, 6)
            .map((row) => `${row.name}: ${row.altas} / ${row.anulaciones} / ${row.net}`),
        };
      case "retencion":
        return {
          "Vencen ≤7 días": data.current.expires7,
          "Vencen ≤30 días": data.current.expires30,
          "Pólizas activas": data.current.activePolicies,
          "Clientes a observar (activos con anulaciones históricas)": data.opportunity.retentionWatch,
          "Siniestros históricos": data.historic.siniestros,
          "Anulaciones históricas": data.historic.anulaciones,
        };
      case "reactivacion":
        return {
          "Candidatos (histórico sin póliza activa)": data.opportunity.reactivationCandidates,
          "Universo potencial (histórico sin póliza cargada)":
            data.opportunity.historicalWithoutCurrentPolicy,
          "Altas históricas": data.historic.altas,
          "Anulaciones históricas": data.historic.anulaciones,
          "Siniestros históricos": data.historic.siniestros,
        };
      case "cross":
        return {
          "Clientes con 1 sola póliza activa": data.opportunity.activeWithOnePolicy,
          "Pólizas activas": data.current.activePolicies,
          "Oportunidades detectadas (clientes por combinación)": data.crossSell
            .slice(0, 8)
            .map((row) => `${row.opportunity}: ${row.customers} clientes`),
        };
      case "migracion":
        return {
          "Clientes en el sistema": data.migration.clients,
          "Gestiones históricas": data.migration.historicOperations,
          "Clientes vinculados": data.migration.matchedClients,
          "Gestiones vinculadas": data.migration.matchedOperations,
          "Tasa de vínculo de clientes %": data.migration.clientMatchRate,
          "Tasa de vínculo de gestiones %": data.migration.operationMatchRate,
          "Gestiones sin vincular": data.migration.unmatchedOperations,
          "Pólizas cargadas": data.migration.loadedPolicies,
          "Pólizas sin cliente": data.migration.policiesWithoutClient,
          "Pólizas sin producto": data.migration.policiesWithoutProduct,
          "Pólizas sin compañía": data.migration.policiesWithoutCompany,
          "Pólizas sin vencimiento": data.migration.policiesWithoutExpiry,
        };
      case "crm":
        return {
          Nota: data.crm?.available ? "Snapshot real del CRM Vocero" : "Snapshot del CRM no disponible",
          Contactos: data.crm?.kpis?.contacts,
          Conversaciones: data.crm?.kpis?.conversations,
          "Conversaciones abiertas": data.crm?.kpis?.openConversations,
          Mensajes: data.crm?.kpis?.messages,
          "Mensajes de la IA": data.crm?.kpis?.ai,
          Leads: data.crm?.kpis?.leads,
          Convertidos: data.crm?.kpis?.converted,
          "Tasa de conversión %": data.crm?.kpis?.conversionRate,
          "Monto de pipeline ARS": data.crm?.kpis?.pipelineAmount,
          "Contactos vinculados a cartera": data.crm?.kpis?.matchedContacts,
          "Tasa de vínculo %": data.crm?.kpis?.matchRate,
          "Prima vinculada ARS": data.crm?.kpis?.matchedPremium,
          "Etapas del pipeline (leads por etapa)": data.crm?.pipeline
            ?.slice(0, 6)
            .map((row) => `${row.name}: ${row.leads}`),
        };
      default:
        return {};
    }
  }

  const insightKeyFor = (module: ModuleAiId, mode: InsightMode) =>
    `${module}:${mode === "ia" ? "ia" : "dual"}`;

  async function requestModuleInsight(module: ModuleAiId, mode: "dual" | "ia") {
    const key = `${module}:${mode}`;
    setModInsights((prev) => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const response = await fetch("/api/dashboard-management/module-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, mode, context: moduleContext(module) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error?.message || result?.error || "La IA no respondió.");
      }
      setModInsights((prev) => ({
        ...prev,
        [key]: { status: "done", data: result.insight as ModuleInsight },
      }));
    } catch (err) {
      setModInsights((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          error: err instanceof Error && err.message ? err.message : "La IA no respondió.",
        },
      }));
    }
  }

  function chooseModEngine(module: ModuleAiId, mode: InsightMode) {
    setModEngines((prev) => ({ ...prev, [module]: mode }));
    if (mode === "ia" && !modInsights[`${module}:ia`]) {
      void requestModuleInsight(module, "ia");
    }
  }

  async function copyModuleMessage(module: ModuleAiId, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMod(module);
      setTimeout(() => setCopiedMod(null), 1800);
    } catch {}
  }

  const aiRow = (module: ModuleAiId) => {
    const mode: InsightMode = modEngines[module] || "dual";
    return (
      <ModuleAiRow
        key={module}
        id={module}
        engine={mode}
        onEngine={(next) => chooseModEngine(module, next)}
        state={modInsights[insightKeyFor(module, mode)]}
        onGenerate={() => void requestModuleInsight(module, mode === "ia" ? "ia" : "dual")}
        onCopy={(text) => void copyModuleMessage(module, text)}
        copied={copiedMod === module}
      />
    );
  };

  /* — Listas por módulo — */

  const openList = useCallback(
    (module: string, listId: string) => {
      setListRestore((prev) => prev || { tab, scrollY: window.scrollY });
      setListSel((prev) => ({ ...prev, [module]: listId }));
      setListOpen({ [module]: true });
      setTimeout(() => {
        document
          .getElementById(`lists-${module}`)
          ?.scrollIntoView({ behavior: "auto", block: "start" });
      }, 80);
    },
    [tab]
  );

  const closeList = useCallback(() => {
    setListOpen({});
    const restore = listRestore;
    if (!restore) return;
    setListRestore(null);
    setTab(restore.tab);
    setTimeout(() => {
      window.scrollTo({ top: restore.scrollY, behavior: "auto" });
    }, 80);
  }, [listRestore]);

  const gotoList = (module: string, listId: string) => {
    setTab(module as TabId);
    openList(module, listId);
  };

  const listsRow = (module: string) => {
    const moduleLists = (data && data.lists && data.lists[module]) || [];
    if (moduleLists.length === 0) return null;
    return (
      <ModuleLists
        key={module}
        module={module}
        lists={moduleLists}
        open={Boolean(listOpen[module])}
        active={listSel[module] || moduleLists[0]!.id}
        onToggle={() => {
          if (listOpen[module]) {
            closeList();
          } else {
            openList(module, listSel[module] || moduleLists[0]!.id);
          }
        }}
        onSelect={(id) => {
          setListSel((prev) => ({ ...prev, [module]: id }));
          setListOpen((prev) => ({ ...prev, [module]: true }));
        }}
        onClose={() => closeList()}
      />
    );
  };

  /* — Filtros y acciones de la guía — */

  function applyHelpAction(action: HelpAction) {
    if (action.kind === "goto") {
      setTab(action.tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (action.kind === "dates") {
      const range = presetRange(action.preset);
      const next = { ...filters, from: range.from, to: range.to };
      setFilters(next);
      void load(next);
    }
  }

  function removeFilter(key: keyof typeof filters) {
    const next = { ...filters, [key]: "" };
    setFilters(next);
    void load(next);
  }

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
    void load({ ...EMPTY_FILTERS });
  }

  function updateFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    void load(next);
  }

  const totalOpportunity = useMemo(() => {
    if (!data) return 0;
    return data.opportunity.reactivationCandidates + data.current.onePolicyClients;
  }, [data]);

  /* — Pantallas — */

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <RefreshCcw className="h-8 w-8 animate-spin text-brand" size={34} />
        <h1 className="text-[15px] font-bold">Preparando inteligencia de cartera</h1>
        <p className="text-[12.5px] text-text-2">Cruzando clientes, historial y pólizas…</p>
        <span className="text-[11.5px] text-text-3">
          La primera carga puede tardar hasta 2 minutos. Después abre al instante.
        </span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle className="h-9 w-9 text-warning" size={36} />
        <h1 className="text-[15px] font-bold">No pudimos cargar los datos</h1>
        <p className="max-w-[460px] text-[12.5px] text-text-2">{error}</p>
        <button
          className="mt-1 rounded-md border px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent"
          onClick={() => void load()}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const filterLabels: Record<keyof typeof filters, (value: string) => string> = {
    from: (value) => `Desde ${value}`,
    to: (value) => `Hasta ${value}`,
    office: (value) => `Oficina: ${value}`,
    product: (value) => `Producto: ${value}`,
    employee: (value) => `Empleado: ${value}`,
    channel: (value) => `Canal: ${value}`,
    company: (value) => `Compañía: ${value}`,
    search: (value) => `Búsqueda: “${value}”`,
  };

  const activeFilterChips = (
    Object.entries(filters) as [keyof typeof filters, string][]
  ).filter(([, value]) => value);

  const selectClass =
    "h-8 rounded-md border border-border-strong bg-background px-2 text-[12px] text-text-2";

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-3 px-1">
      {/* Encabezado */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand-text">
            Cockpit ejecutivo
          </p>
          <h1 className="mt-0.5 text-[17px] font-bold">
            Decisiones claras sobre clientes, cartera y crecimiento
          </h1>
          <p className="mt-0.5 text-[12px] text-text-3">
            La historia de Rafael y la nueva plataforma, analizadas como una única cartera.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="warning">Pólizas en proceso de carga</Badge>
          <button
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCcw size={14} className={cn(loading && "animate-spin")} />
            Actualizar
          </button>
        </div>
      </header>

      {/* Sugerencias */}
      <SuggestionsStrip
        data={data}
        onGoto={(next) => {
          setTab(next);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onOpenList={(next, listId) => {
          setTab(next);
          openList(next, listId);
        }}
      />

      {/* Filtros */}
      <section className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["Este mes", "month"],
              ["Mes pasado", "lastMonth"],
              ["Este año", "year"],
              ["Todo el tiempo", "all"],
            ] as const
          ).map(([label, preset]) => (
            <button
              key={label}
              className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
              onClick={() => {
                const range = presetRange(preset);
                const next = { ...filters, from: range.from, to: range.to };
                setFilters(next);
                void load(next);
              }}
            >
              {label}
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-border" />

          <input
            type="date"
            value={filters.from}
            onChange={(e) => updateFilter("from", e.target.value)}
            className={selectClass}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => updateFilter("to", e.target.value)}
            className={selectClass}
          />

          <select
            value={filters.office}
            onChange={(e) => updateFilter("office", e.target.value)}
            className={selectClass}
          >
            <option value="">Todas las oficinas</option>
            {data.filters.offices.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={filters.product}
            onChange={(e) => updateFilter("product", e.target.value)}
            className={selectClass}
          >
            <option value="">Todos los productos</option>
            {data.filters.products.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={filters.channel}
            onChange={(e) => updateFilter("channel", e.target.value)}
            className={selectClass}
          >
            <option value="">Todos los canales</option>
            {data.filters.channels.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={filters.employee}
            onChange={(e) => updateFilter("employee", e.target.value)}
            className={selectClass}
          >
            <option value="">Todos los empleados</option>
            {data.filters.employees.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={filters.company}
            onChange={(e) => updateFilter("company", e.target.value)}
            className={selectClass}
          >
            <option value="">Todas las compañías</option>
            {data.filters.companies.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <input
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="Buscar cliente, DNI o póliza…"
            className="h-8 min-w-[200px] flex-1 rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
          />
        </div>

        {activeFilterChips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-text"
              >
                {filterLabels[key](value)}
                <button onClick={() => removeFilter(key)} aria-label={`Quitar filtro ${key}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
            <button
              className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
              onClick={clearFilters}
            >
              Limpiar todo
            </button>
          </div>
        )}

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-3">
          <SlidersHorizontal size={12} />
          Estos filtros afectan a todos los módulos del tablero.
        </p>
      </section>

      {/* Módulos */}
      <nav className="flex flex-wrap gap-1.5">
        {MODULE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors",
              tab === id
                ? "border-brand bg-brand text-brand-fg"
                : "border-border bg-card text-text-2 hover:bg-accent"
            )}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      {/* Módulo activo */}
      {tab === "pulso" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.pulso} id="pulso" onAction={applyHelpAction} />

          {aiRow("pulso")}

          {listsRow("pulso")}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi
              title="Clientes históricos"
              value={number(data.migration.clients)}
              subtitle="Base maestra actual"
              onClick={() => openList("pulso", "clients")}
              icon={<Users size={17} />}
            />
            <Kpi
              title="Altas históricas"
              value={number(data.historic.altas)}
              subtitle="Historia comercial"
              onClick={() => openList("pulso", "altas")}
              icon={<UserRoundCheck size={17} />}
            />
            <Kpi
              title="Crecimiento histórico"
              value={`+${number(data.historic.net)}`}
              subtitle="Altas menos anulaciones"
              icon={<TrendingUp size={17} />}
              tone="success"
            />
            <Kpi
              title="Pólizas en el sistema nuevo"
              value={number(data.current.loadedPolicies)}
              subtitle="Activas + no vigentes — cualquier estado"
              onClick={() => gotoList("cartera", "loaded")}
              icon={<ShieldCheck size={17} />}
              tone="warning"
            />
            <Kpi
              title="Prima activa cargada"
              value={money(data.current.activePremium)}
              subtitle="No representa aún la cartera total"
              onClick={() => gotoList("cartera", "active")}
              icon={<CircleDollarSign size={17} />}
            />
            <Kpi
              title="Oportunidades detectadas"
              value={number(totalOpportunity)}
              subtitle="Reactivación + venta cruzada"
              icon={<Target size={17} />}
              tone="accent"
            />
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section
              title="¿Estamos creciendo?"
              subtitle="Altas, anulaciones y crecimiento neto histórico"
            >
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <ComposedChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="altas" name="Altas" fill={CHART.altas} radius={[5, 5, 0, 0]} />
                    <Bar
                      dataKey="anulaciones"
                      name="Anulaciones"
                      fill={CHART.anulaciones}
                      radius={[5, 5, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Crecimiento neto"
                      stroke={CHART.net}
                      strokeWidth={3}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Cómo llegan y se atienden" subtitle="Distribución histórica por canal">
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={data.channels}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                    >
                      {data.channels.map((_, index) => (
                        <Cell
                          key={index}
                          fill={CHART.series[index % CHART.series.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          <Section title="Lectura ejecutiva" subtitle="Las señales que requieren decisión">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex gap-2.5 rounded-md border border-danger-soft bg-danger-tint px-3 py-2.5">
                <AlertTriangle size={18} className="shrink-0 text-danger-text" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">
                    {number(data.historic.anulaciones)} anulaciones históricas
                  </strong>
                  <span>
                    Equivalen al {percent(data.historic.ratio)} de las altas. No es churn todavía,
                    pero sí una señal prioritaria.
                  </span>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-md border border-warning-soft bg-warning-tint px-3 py-2.5">
                <Clock3 size={18} className="shrink-0 text-warning-text" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">
                    {number(data.current.expires30)} pólizas cargadas vencen pronto
                  </strong>
                  <span>
                    {number(data.current.expires7)} están dentro de los próximos 7 días.
                  </span>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-md border border-success-soft bg-success-tint px-3 py-2.5">
                <Target size={18} className="shrink-0 text-success-text" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">
                    {number(data.opportunity.reactivationCandidates)} candidatos de reactivación
                  </strong>
                  <span>
                    Clientes con historia comercial que todavía no muestran póliza activa cargada.
                  </span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab !== "pulso" && <ComingSoon tab={tab} />}

      <p className="pb-2 text-right text-[10.5px] text-text-4">
        Datos generados el {new Date(data.generatedAt).toLocaleString("es-AR")} · Dashboard
        Management
      </p>
    </div>
  );
}
