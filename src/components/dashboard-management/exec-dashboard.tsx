"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
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
  Search,
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
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  ClientInsight,
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
  const [engine, setEngine] = useState<InsightMode>("dual");
  const [insights, setInsights] = useState<
    Record<string, { status: "loading" | "error" | "done"; data?: ClientInsight; error?: string }>
  >({});
  const [copiedInsight, setCopiedInsight] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  /* — Motor de sugerencias del Cliente 360° — */

  async function requestInsight(
    customer: DashboardResponse["customers"][number],
    mode: "dual" | "ia"
  ) {
    const key = `${mode}:${customer.id}`;
    setInsights((prev) => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const response = await fetch("/api/dashboard-management/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: customer.id,
          mode,
          context: {
            name: customer.name,
            activePolicies: customer.activePolicies,
            historicalOperations: customer.historicalOperations,
            historicalAltas: customer.historicalAltas,
            historicalAnulaciones: customer.historicalAnulaciones,
            historicalSiniestros: customer.historicalSiniestros,
            activePremium: customer.activePremium,
            score: customer.score,
            recommendation: customer.recommendation,
            recommendationWhy: customer.recommendationWhy,
            recommendationSteps: customer.recommendationSteps,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error?.message || result?.error || "La IA no respondió.");
      }
      setInsights((prev) => ({
        ...prev,
        [key]: { status: "done", data: result.insight as ClientInsight },
      }));
    } catch (err) {
      setInsights((prev) => ({
        ...prev,
        [key]: {
          status: "error",
          error: err instanceof Error && err.message ? err.message : "La IA no respondió.",
        },
      }));
    }
  }

  function chooseEngine(mode: InsightMode) {
    setEngine(mode);
  }

  async function copyInsightMessage(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedInsight(key);
      setTimeout(() => setCopiedInsight(null), 1800);
    } catch {}
  }

  const aiRow = (module: ModuleAiId) => {
    const mode: InsightMode = modEngines[module] || "dual";
    return (
      <ModuleAiRow
        key={`ai-${module}`}
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
      setListRestore((prev) => prev || { tab, scrollY: scrollRef.current?.scrollTop ?? 0 });
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
      scrollRef.current?.scrollTo({ top: restore.scrollY, behavior: "auto" });
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
        key={`lists-${module}`}
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
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
    <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
    <div className="w-full space-y-3 px-3 pb-8 lg:px-5">
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
          scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
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

      {tab === "cartera" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.cartera} id="cartera" onAction={applyHelpAction} />

          {aiRow("cartera")}

          {listsRow("cartera")}

          <div className="flex items-start gap-2.5 rounded-md border border-warning-soft bg-warning-tint px-3 py-2.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-text" />
            <div className="text-[12.5px] text-text-2">
              <strong className="block text-foreground">Cartera todavía en proceso de carga</strong>
              <span>
                Estos indicadores reflejan únicamente las pólizas ya creadas y cargadas en el sistema
                nuevo (Seguros Agénticos). No deben interpretarse como la cartera final.
              </span>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              title="Pólizas cargadas en el sistema nuevo"
              value={number(data.current.loadedPolicies)}
              subtitle={`Activas ${number(data.current.activePolicies)} · No vigentes ${number(
                data.current.loadedPolicies - data.current.activePolicies
              )}`}
              onClick={() => openList("cartera", "loaded")}
              icon={<BriefcaseBusiness size={17} />}
            />
            <Kpi
              title="Pólizas activas"
              value={number(data.current.activePolicies)}
              subtitle="Vigentes o renovadas — según estado"
              onClick={() => openList("cartera", "active")}
              icon={<ShieldCheck size={17} />}
            />
            <Kpi
              title="Clientes activos cargados"
              value={number(data.current.activeClients)}
              subtitle="Con al menos una póliza activa"
              onClick={() => openList("cartera", "clients")}
              icon={<Users size={17} />}
            />
            <Kpi
              title="Prima activa cargada"
              value={money(data.current.activePremium)}
              subtitle="Valor parcial"
              onClick={() => openList("cartera", "active")}
              icon={<CircleDollarSign size={17} />}
            />
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Section title="Productos históricos" subtitle="Todo lo que realmente se gestionó en Rafael">
              <div className="h-[320px]">
                <ResponsiveContainer>
                  <BarChart data={data.historicProducts} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" fontSize={11} />
                    <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="value" name="Gestiones" fill={CHART.series[0]} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Productos cargados actualmente" subtitle="Foto parcial de la nueva base">
              <div className="h-[320px]">
                <ResponsiveContainer>
                  <BarChart data={data.currentProducts}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="value" name="Pólizas" fill={CHART.altas} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          <Section title="Compañías" subtitle="Distribución de las pólizas ya cargadas">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full">
                <thead className="bg-subtle text-left text-[11px] uppercase tracking-wide text-text-3">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Compañía</th>
                    <th className="px-3 py-2 font-semibold">Pólizas</th>
                    <th className="px-3 py-2 font-semibold">Prima activa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.companies.map((company) => (
                    <tr key={company.name}>
                      <td className="px-3 py-2 text-[12.5px]">{company.name}</td>
                      <td className="px-3 py-2 text-[12.5px] tabular-nums">
                        {number(company.policies)}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] tabular-nums">
                        {money(company.activePremium)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {tab === "retencion" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.retencion} id="retencion" onAction={applyHelpAction} />

          {aiRow("retencion")}

          {listsRow("retencion")}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              title="Vencen ≤7 días"
              value={number(data.current.expires7)}
              subtitle="Acción inmediata"
              onClick={() => openList("retencion", "expires7")}
              icon={<Clock3 size={17} />}
              tone="danger"
            />
            <Kpi
              title="Vencen ≤30 días"
              value={number(data.current.expires30)}
              subtitle="Secuencia de renovación"
              onClick={() => openList("retencion", "expires30")}
              icon={<Clock3 size={17} />}
              tone="warning"
            />
            <Kpi
              title="Clientes a observar"
              value={number(data.opportunity.retentionWatch)}
              subtitle="Activos con anulaciones históricas"
              onClick={() => openList("retencion", "watch")}
              icon={<AlertTriangle size={17} />}
            />
            <Kpi
              title="Siniestros históricos"
              value={number(data.historic.siniestros)}
              subtitle="Clave para medir experiencia"
              onClick={() => gotoList("pulso", "siniestros")}
              icon={<Activity size={17} />}
            />
          </section>

          <Section
            title="Retención: de contar bajas a anticiparlas"
            subtitle="El sistema ya puede combinar historia y situación contractual actual"
          >
            <div className="rounded-md border border-brand-soft bg-brand-tint px-4 py-3">
              <h3 className="text-[12.5px] font-bold text-brand-text">Próxima evolución</h3>
              <p className="mt-1 text-[12.5px] text-text-2">
                Construir un score de riesgo 0–100 combinando antigüedad, anulaciones, siniestros,
                cantidad de pólizas, forma de pago, cercanía al vencimiento y comportamiento de
                atención.
              </p>
            </div>
          </Section>
        </div>
      )}

      {tab === "reactivacion" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.reactivacion} id="reactivacion" onAction={applyHelpAction} />

          {aiRow("reactivacion")}

          {listsRow("reactivacion")}

          <section className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Candidatos detectados"
              value={number(data.opportunity.reactivationCandidates)}
              subtitle="Historia de alta sin póliza activa cargada"
              onClick={() => openList("reactivacion", "candidates")}
              icon={<Target size={17} />}
              tone="accent"
            />
            <Kpi
              title="Históricos sin activa cargada"
              value={number(data.opportunity.historicalWithoutCurrentPolicy)}
              subtitle="Universo potencial"
              onClick={() => openList("reactivacion", "universe")}
              icon={<Users size={17} />}
            />
          </section>

          <Section
            title="Motor de recuperación"
            subtitle="Priorizar clientes conocidos antes de comprar nuevos leads"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="flex gap-2.5 rounded-md border border-success-soft bg-success-tint px-3 py-2.5">
                <Target size={17} className="mt-0.5 shrink-0 text-success-text" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">Reactivación prioritaria</strong>
                  <span>Exclientes recientes, con altas históricas y productos rentables.</span>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-md border bg-card px-3 py-2.5">
                <Activity size={17} className="mt-0.5 shrink-0 text-text-3" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">Win-back por producto</strong>
                  <span>Ejemplo: tuvo Moto o Auto y hoy no aparece con ese producto activo.</span>
                </div>
              </div>
              <div className="flex gap-2.5 rounded-md border bg-card px-3 py-2.5">
                <Users size={17} className="mt-0.5 shrink-0 text-text-3" />
                <div className="text-[12.5px] text-text-2">
                  <strong className="block text-foreground">Campañas segmentadas</strong>
                  <span>No contactar a toda la base: trabajar por score y probabilidad.</span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === "cross" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.cross} id="cross" onAction={applyHelpAction} />

          {aiRow("cross")}

          {listsRow("cross")}

          <section className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Una sola póliza"
              value={number(data.current.onePolicyClients)}
              subtitle="Oportunidad directa de cross-selling"
              onClick={() => openList("cross", "one")}
              icon={<ArrowUpRight size={17} />}
            />
            <Kpi
              title="Dos o más pólizas"
              value={number(data.current.multiPolicyClients)}
              subtitle="Clientes más vinculados"
              onClick={() => gotoList("cartera", "multi")}
              icon={<HeartHandshake size={17} />}
              tone="success"
            />
          </section>

          <Section
            title="Próximo mejor producto"
            subtitle="Oportunidades calculadas sobre lo actualmente cargado"
          >
            <div className="divide-y divide-border rounded-md border">
              {data.crossSell.map((item) => (
                <button
                  key={item.opportunity}
                  className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  onClick={() =>
                    openList("cross", item.opportunity.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
                  }
                  title="Ver los clientes de esta combinación"
                >
                  <strong className="min-w-0 flex-1 truncate text-[12.5px]">
                    {item.opportunity}
                  </strong>
                  <span className="text-[12.5px] tabular-nums text-text-2">
                    {number(item.customers)} clientes
                  </span>
                  <span className="text-[11.5px] font-semibold text-brand-text">Ver clientes →</span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {tab === "clientes" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.clientes} id="clientes" onAction={applyHelpAction} />

          <Section title="Cliente 360°" subtitle="Buscar por nombre, DNI o teléfono">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-3"
                />
                <input
                  value={filters.search}
                  placeholder="Ej. Juan Pérez, DNI o teléfono"
                  onChange={(event) => {
                    const value = event.target.value;
                    setFilters({ ...filters, search: value });
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => {
                      void load({ ...filters, search: value });
                    }, 700);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void load();
                  }}
                  className="h-9 w-full rounded-md border border-border-strong bg-background pl-8 pr-2 text-[12.5px]"
                />
              </div>
              <button
                className="h-9 rounded-md bg-brand px-3.5 text-[12.5px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
                onClick={() => void load()}
              >
                Buscar cliente
              </button>
            </div>
          </Section>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
              Motor de sugerencias
            </span>
            <div className="inline-flex rounded-md border bg-subtle p-0.5">
              {(
                [
                  ["algoritmo", "Algoritmo solo", "Solo reglas del sistema: instantáneo y auditable"],
                  ["dual", "Dual (IA + algoritmo)", "El sistema prioriza con reglas y la IA enriquece el análisis"],
                  ["ia", "Solo IA", "La IA analiza el contexto real y decide la mejor acción"],
                ] as const
              ).map(([id, label, hint]) => (
                <button
                  key={id}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                    engine === id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-text-2 hover:text-foreground"
                  )}
                  onClick={() => chooseEngine(id)}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11.5px] text-text-3">
              {engine === "algoritmo" && "Reglas del sistema: instantáneo, gratis y auditable."}
              {engine === "dual" &&
                "El sistema prioriza con reglas y la IA enriquece el por qué y los pasos con el mismo contexto."}
              {engine === "ia" &&
                "La IA analiza el contexto real del cliente y propone la mejor acción."}
            </span>
          </div>

          <p className="text-[11.5px] text-text-3">
            {filters.search
              ? data.customers.length === 0
                ? "Sin resultados. Probá con otro nombre, DNI o teléfono."
                : data.customerStats && data.customerStats.matched > data.customers.length
                  ? `Mostrando las últimas ${data.customers.length} de ${data.customerStats.matched} coincidencias. Afiná la búsqueda para ver menos.`
                  : `${data.customers.length} resultado${data.customers.length === 1 ? "" : "s"}.`
              : data.customerStats
                ? `Últimas ${data.customers.length} de ${data.customerStats.total} clientes cargados (los más recientes). Buscá por nombre, DNI o teléfono para ir directo a una ficha.`
                : ""}
          </p>

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {data.customers.map((customer) => (
              <article key={customer.id} className="flex flex-col rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[13.5px] font-bold">{customer.name}</h3>
                    <span className="text-[11.5px] text-text-3">DNI {customer.dni || "—"}</span>
                  </div>
                  <span
                    className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-brand-soft bg-brand-tint px-1.5 text-[12.5px] font-bold text-brand-text"
                    title="Score del cliente"
                  >
                    {customer.score}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-1 rounded-md border bg-subtle/50 px-2 py-2">
                  <div className="text-center">
                    <span className="block text-[10.5px] text-text-3">Pólizas activas</span>
                    <strong className="text-[13px] tabular-nums">{customer.activePolicies}</strong>
                  </div>
                  <div className="text-center">
                    <span className="block text-[10.5px] text-text-3">Gestiones históricas</span>
                    <strong className="text-[13px] tabular-nums">
                      {customer.historicalOperations}
                    </strong>
                  </div>
                  <div className="text-center">
                    <span className="block text-[10.5px] text-text-3">Altas</span>
                    <strong className="text-[13px] tabular-nums">{customer.historicalAltas}</strong>
                  </div>
                  <div className="text-center">
                    <span className="block text-[10.5px] text-text-3">Anulaciones</span>
                    <strong className="text-[13px] tabular-nums">
                      {customer.historicalAnulaciones}
                    </strong>
                  </div>
                </div>

                <div className="mt-3 flex-1">
                  {engine !== "ia" && (
                    <>
                      <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">
                        Próxima mejor acción
                      </span>
                      <strong className="mt-0.5 block text-[12.5px]">
                        {customer.recommendation}
                      </strong>
                      {customer.recommendationWhy && (
                        <p className="mt-0.5 text-[11.5px] text-text-2">
                          {customer.recommendationWhy}
                        </p>
                      )}
                      {customer.recommendationSteps?.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11.5px] text-text-2">
                          {customer.recommendationSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}

                  {engine !== "algoritmo" &&
                    (() => {
                      const withAi = engine === "ia" ? ("ia" as const) : ("dual" as const);
                      const insightKey = `${withAi}:${customer.id}`;
                      const insightState = insights[insightKey];
                      const insight =
                        insightState?.status === "done" ? insightState.data : undefined;

                      return (
                        <div
                          className={cn(
                            "mt-2 rounded-md border px-2.5 py-2",
                            engine === "ia"
                              ? "border-brand-soft bg-brand-tint"
                              : "border-border bg-subtle/40"
                          )}
                        >
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-bold",
                              engine === "ia" ? "text-brand-text" : "text-text-2"
                            )}
                          >
                            <Sparkles size={11} />
                            {engine === "ia" ? "Análisis con IA" : "Análisis IA (extra)"}
                          </span>

                          {insightState?.status === "loading" && (
                            <div className="mt-1 text-[11.5px] text-text-2">
                              Generando análisis con la IA…
                            </div>
                          )}

                          {!insightState && (
                            <button
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-brand-soft bg-card px-2 py-1 text-[11.5px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                              onClick={() => void requestInsight(customer, withAi)}
                            >
                              <Sparkles size={11} />
                              Generar análisis con IA
                            </button>
                          )}

                          {insightState?.status === "error" && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-danger-text">
                              <span>{insightState.error}</span>
                              <button
                                className="rounded-md border border-danger-soft bg-card px-2 py-0.5 text-[11px] font-semibold"
                                onClick={() => void requestInsight(customer, withAi)}
                              >
                                Reintentar
                              </button>
                            </div>
                          )}

                          {insight && (
                            <div className="mt-1 space-y-1.5">
                              <strong className="block text-[12px]">{insight.accion}</strong>
                              <p className="text-[11.5px] text-text-2">{insight.porQue}</p>
                              {insight.pasos.length > 0 && (
                                <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-text-2">
                                  {insight.pasos.map((paso) => (
                                    <li key={paso}>{paso}</li>
                                  ))}
                                </ul>
                              )}
                              {insight.mensajeWhatsapp && (
                                <div className="rounded-md border bg-card px-2 py-1.5">
                                  <p className="text-[11.5px] text-text-2">
                                    {insight.mensajeWhatsapp}
                                  </p>
                                  <button
                                    className="mt-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                    onClick={() =>
                                      void copyInsightMessage(insightKey, insight.mensajeWhatsapp)
                                    }
                                  >
                                    {copiedInsight === insightKey ? "Copiado ✓" : "Copiar mensaje"}
                                  </button>
                                </div>
                              )}
                              <span className="block text-[10.5px] text-text-3">
                                Generado con {insight.model} · solo sobre los datos del sistema
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>

                {customer.backendUrl && (
                  <a
                    className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand-text hover:underline"
                    href={customer.backendUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir la ficha de este cliente en el backoffice"
                  >
                    Abrir ficha en el backoffice
                    <ArrowUpRight size={12} />
                  </a>
                )}
              </article>
            ))}
          </div>

          {data.customers.length === 0 && (
            <div className="rounded-lg border bg-card px-4 py-8 text-center text-[12.5px] text-text-3">
              Sin resultados. Probá con otro nombre, DNI o teléfono.
            </div>
          )}
        </div>
      )}

      {tab === "migracion" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.migracion} id="migracion" onAction={applyHelpAction} />

          {aiRow("migracion")}

          {listsRow("migracion")}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              title="Clientes"
              value={number(data.migration.clients)}
              subtitle="Maestro Agéntico"
              onClick={() => openList("migracion", "clients")}
              icon={<Users size={17} />}
            />
            <Kpi
              title="Gestiones históricas"
              value={number(data.migration.historicOperations)}
              subtitle="Base Rafael"
              onClick={() => openList("migracion", "recent")}
              icon={<Database size={17} />}
            />
            <Kpi
              title="Clientes vinculados"
              value={number(data.migration.matchedClients)}
              subtitle={percent(data.migration.clientMatchRate)}
              onClick={() => openList("migracion", "matched")}
              icon={<UserRoundCheck size={17} />}
              tone="success"
            />
            <Kpi
              title="Gestiones vinculadas"
              value={number(data.migration.matchedOperations)}
              subtitle={percent(data.migration.operationMatchRate)}
              onClick={() => openList("migracion", "matchedops")}
              icon={<ShieldCheck size={17} />}
              tone="success"
            />
          </section>

          <Section
            title="Salud de la migración"
            subtitle="Lo que todavía debemos completar antes de considerar la cartera definitiva"
          >
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                <span className="block text-[11px] text-text-3">Pólizas cargadas</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.loadedPolicies)}
                </strong>
              </div>
              <button
                className="rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-soft"
                onClick={() => openList("migracion", "incomplete")}
                title="Ver la lista detrás de este número"
              >
                <span className="block text-[11px] text-text-3">Sin cliente</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.policiesWithoutClient)}
                </strong>
              </button>
              <button
                className="rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-soft"
                onClick={() => openList("migracion", "incomplete")}
                title="Ver la lista detrás de este número"
              >
                <span className="block text-[11px] text-text-3">Sin producto</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.policiesWithoutProduct)}
                </strong>
              </button>
              <button
                className="rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-soft"
                onClick={() => openList("migracion", "incomplete")}
                title="Ver la lista detrás de este número"
              >
                <span className="block text-[11px] text-text-3">Sin compañía</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.policiesWithoutCompany)}
                </strong>
              </button>
              <button
                className="rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-soft"
                onClick={() => openList("migracion", "incomplete")}
                title="Ver la lista detrás de este número"
              >
                <span className="block text-[11px] text-text-3">Sin vencimiento</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.policiesWithoutExpiry)}
                </strong>
              </button>
              <button
                className="rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-brand-soft"
                onClick={() => openList("migracion", "unmatched")}
                title="Ver la lista detrás de este número"
              >
                <span className="block text-[11px] text-text-3">Gestiones sin match</span>
                <strong className="text-[15px] tabular-nums">
                  {number(data.migration.unmatchedOperations)}
                </strong>
              </button>
            </div>
          </Section>
        </div>
      )}

      {tab === "crm" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.crm} id="crm" onAction={applyHelpAction} />

          {data.crm?.available && aiRow("crm")}

          {listsRow("crm")}

          {!data.crm?.available ? (
            <Section title="CRM · Venta y gestión" subtitle="Datos del CRM Vocero (solo lectura)">
              <div className="rounded-md border bg-subtle/50 px-4 py-8 text-center text-[12.5px] text-text-3">
                Todavía no hay snapshot del CRM en este entorno. Se regenera automáticamente con la
                sincronización del tablero.
              </div>
            </Section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  title="Contactos del CRM"
                  value={number(data.crm.kpis.contacts)}
                  subtitle={`${number(data.crm.kpis.conversations)} conversaciones · ${number(
                    data.crm.kpis.openConversations
                  )} ${data.crm.kpis.openConversations === 1 ? "abierta" : "abiertas"}`}
                  onClick={() => openList("crm", "matched")}
                  icon={<Users size={17} />}
                />
                <Kpi
                  title="Mensajes intercambiados"
                  value={number(data.crm.kpis.messages)}
                  subtitle={`${number(data.crm.kpis.inbound)} recibidos · ${number(
                    data.crm.kpis.outbound
                  )} enviados`}
                  icon={<MessageSquareText size={17} />}
                  tone="accent"
                />
                <Kpi
                  title="Respuestas con IA"
                  value={number(data.crm.kpis.ai)}
                  subtitle="Mensajes generados por el agente"
                  icon={<ShieldCheck size={17} />}
                  tone="success"
                />
                <Kpi
                  title="Oportunidades abiertas"
                  value={number(data.crm.kpis.leads)}
                  subtitle={`${number(data.crm.kpis.converted)} ganadas (${percent(
                    data.crm.kpis.conversionRate
                  )})`}
                  icon={<Target size={17} />}
                />
                <Kpi
                  title="Monto en pipeline"
                  value={money(data.crm.kpis.pipelineAmount)}
                  subtitle="Suma de las oportunidades cargadas"
                  icon={<CircleDollarSign size={17} />}
                  tone="warning"
                />
                <Kpi
                  title="Vínculo con la cartera"
                  value={percent(data.crm.kpis.matchRate)}
                  subtitle={`${number(data.crm.kpis.matchedContacts)} de ${number(
                    data.crm.kpis.contacts
                  )} contactos cruzados con SGSA`}
                  onClick={() => openList("crm", "matched")}
                  icon={<HeartHandshake size={17} />}
                />
                <Kpi
                  title="Prima activa vinculada"
                  value={money(data.crm.kpis.matchedPremium)}
                  subtitle={`Pólizas activas de contactos del CRM · ${number(
                    data.crm.kpis.expiring30
                  )} vencen ≤ 30 días`}
                  icon={<BriefcaseBusiness size={17} />}
                  tone="success"
                />
                <Kpi
                  title="Oportunidades ligadas"
                  value={number(data.crm.kpis.leadsLinked)}
                  subtitle={`${money(data.crm.kpis.linkedAmount)} en juego sobre clientes de la cartera`}
                  icon={<Activity size={17} />}
                />
              </section>

              <Section
                title="Venta — pipeline desde el CRM"
                subtitle="Cómo avanza cada oportunidad según la etapa del tablero comercial"
              >
                <div className="space-y-2">
                  {data.crm.pipeline.map((stage) => {
                    const max = Math.max(
                      ...data.crm.pipeline.map((item) => item.amount),
                      1
                    );
                    const width = Math.max((stage.amount / max) * 100, stage.amount > 0 ? 3 : 0);
                    return (
                      <div
                        key={stage.name}
                        className="grid grid-cols-[150px_1fr] items-center gap-3 sm:grid-cols-[220px_1fr_auto]"
                      >
                        <div className="min-w-0">
                          <strong className="block truncate text-[12.5px]">{stage.name}</strong>
                          <small className="text-[10.5px] text-text-3">
                            {stage.kind === "won"
                              ? "ganada"
                              : stage.kind === "lost"
                                ? "perdida"
                                : "en curso"}
                          </small>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-subtle">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="text-[12px] tabular-nums text-text-2 sm:text-right">
                          <strong className="text-foreground">{money(stage.amount)}</strong> ·{" "}
                          {number(stage.leads)}{" "}
                          {stage.leads === 1 ? "oportunidad" : "oportunidades"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <div className="grid gap-3 lg:grid-cols-2">
                <Section
                  title="Gestión — mensajes por día"
                  subtitle="Recibidos y enviados (últimos 30 días con actividad)"
                >
                  <div className="h-[300px]">
                    <ResponsiveContainer>
                      <AreaChart data={data.crm.daily}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(value) =>
                            String(value).slice(5).replace("-", "/")
                          }
                        />
                        <YAxis tick={{ fontSize: 10 }} width={34} />
                        <Tooltip />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="inbound"
                          name="Recibidos"
                          stroke={CHART.series[0]}
                          fill={CHART.series[0]}
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="outbound"
                          name="Enviados"
                          stroke={CHART.series[5]}
                          fill={CHART.series[5]}
                          fillOpacity={0.12}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Section>

                <Section title="Canales y equipo" subtitle="Conversaciones según canal de entrada">
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                    {data.crm.channels.map((channel) => (
                      <div
                        key={channel.name}
                        className="rounded-md border bg-subtle/50 px-3 py-2"
                      >
                        <span className="block truncate text-[11px] text-text-3">
                          {channel.name}
                        </span>
                        <strong className="text-[14px] tabular-nums">
                          {number(channel.value)}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-md border bg-subtle/40 px-3 py-2 text-[11.5px] text-text-2">
                    <Users size={14} className="shrink-0 text-text-3" />
                    <span>
                      <strong>{number(data.crm.kpis.users)} usuarios</strong> en el CRM ·{" "}
                      {number(data.crm.kpis.closedConversations)}{" "}
                      {data.crm.kpis.closedConversations === 1
                        ? "conversación cerrada"
                        : "conversaciones cerradas"}
                    </span>
                  </div>
                </Section>
              </div>

              <Section
                title="Macheo con la cartera (CRM ↔ SGSA)"
                subtitle="Contactos del CRM cruzados contra clientes, pólizas activas y gestiones históricas"
              >
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Contactos vinculados</span>
                    <strong className="text-[15px] tabular-nums">
                      {number(data.crm.kpis.matchedContacts)}
                    </strong>
                  </div>
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Tasa de vínculo</span>
                    <strong className="text-[15px] tabular-nums">
                      {percent(data.crm.kpis.matchRate)}
                    </strong>
                  </div>
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Con póliza activa</span>
                    <strong className="text-[15px] tabular-nums">
                      {number(data.crm.kpis.matchedWithActive)}
                    </strong>
                  </div>
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Prima activa vinculada</span>
                    <strong className="text-[15px] tabular-nums">
                      {money(data.crm.kpis.matchedPremium)}
                    </strong>
                  </div>
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Vencen ≤ 30 días</span>
                    <strong className="text-[15px] tabular-nums">
                      {number(data.crm.kpis.expiring30)}
                    </strong>
                  </div>
                  <div className="rounded-md border bg-subtle/50 px-3 py-2.5">
                    <span className="block text-[11px] text-text-3">Oportunidades ligadas</span>
                    <strong className="text-[15px] tabular-nums">
                      {number(data.crm.kpis.leadsLinked)} · {money(data.crm.kpis.linkedAmount)}
                    </strong>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto rounded-md border">
                  <table className="w-full">
                    <thead className="bg-subtle text-left text-[11px] uppercase tracking-wide text-text-3">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Contacto</th>
                        <th className="px-3 py-2 font-semibold">Canal</th>
                        <th className="px-3 py-2 font-semibold">Mensajes</th>
                        <th className="px-3 py-2 font-semibold">Vínculo</th>
                        <th className="px-3 py-2 font-semibold">Pólizas activas</th>
                        <th className="px-3 py-2 font-semibold">Prima activa</th>
                        <th className="px-3 py-2 font-semibold">Vence ≤ 30d</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.crm.rows.slice(0, 12).map((row) => (
                        <tr key={row.contactId}>
                          <td className="px-3 py-2 text-[12.5px]">
                            <strong>{row.name}</strong>
                          </td>
                          <td className="px-3 py-2 text-[12.5px] text-text-2">
                            {row.channel || "—"}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tabular-nums">
                            {number(row.messages)}
                          </td>
                          <td className="px-3 py-2 text-[12.5px]">
                            {row.link === "sin-match" ? (
                              <Badge>Sin vínculo</Badge>
                            ) : (
                              <>
                                <Badge tone={row.link === "sgsa" ? "success" : "accent"}>
                                  {row.link === "sgsa"
                                    ? "Vínculo directo"
                                    : row.link === "telefono"
                                      ? "Por teléfono"
                                      : "Por nombre"}
                                </Badge>
                                {row.clientName && (
                                  <div className="mt-0.5 text-[11px] text-text-3">
                                    {row.clientName}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tabular-nums">
                            {number(row.activePolicies)}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tabular-nums">
                            {row.activePremium > 0 ? money(row.activePremium) : "—"}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] tabular-nums">
                            {row.expiring30 > 0 ? number(row.expiring30) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-md border bg-subtle/40 px-3 py-2 text-[11.5px] text-text-2">
                  <RefreshCcw size={14} className="shrink-0 text-text-3" />
                  <span>
                    Snapshot de solo lectura del CRM al{" "}
                    <strong>
                      {new Date(data.crm.generatedAt || data.generatedAt).toLocaleString("es-AR")}
                    </strong>{" "}
                    · sin registros de prueba
                  </span>
                </div>
              </Section>
            </>
          )}
        </div>
      )}

      <p className="pb-2 text-right text-[10.5px] text-text-4">
        Datos generados el {new Date(data.generatedAt).toLocaleString("es-AR")} · Dashboard
        Management
      </p>
    </div>
    </div>
  );
}
