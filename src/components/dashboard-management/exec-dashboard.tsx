"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowUpRight,
  BarChart3,
  Blend,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Database,
  FileText,
  GripVertical,
  FolderOpen,
  HeartHandshake,
  HelpCircle,
  History,
  Hourglass,
  Info,
  Infinity as InfinityIcon,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  Link2,
  ListChecks,
  ListTree,
  MessageSquareText,
  Phone,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Star,
  Target,
  Ticket,
  TrendingUp,
  Unlink,
  UserRound,
  UserRoundCheck,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, systemClientName } from "@/lib/utils";
import type { SystemClientSearchResultDto } from "@/lib/types";
import { airtableTagStyle } from "@/lib/dashboard-management/airtable-colors";
import { ClientPanel, type PanelCustomer } from "./client-panel";
import { ProposalsPanel } from "./proposals-panel";
import { ConstructorPanel, type ClienteFijoWizard } from "./constructor-panel";
import { CampaignsPanel } from "./campaigns-panel";
import { LibraryPanel } from "./library-panel";
import { FollowUpPanel } from "./followup-panel";
import {
  MODULE_HELP,
  type HelpAction,
  type ModuleHelp,
  type TabId,
} from "@/lib/dashboard-management/help";
import type {
  ClientInsight,
  DashboardResponse,
  DrillItem,
  DrillList,
  InsightMode,
  InsightRecordDto,
  ModuleAccion,
  ModuleAiId,
  ModuleInsight,
  PiezaTipo,
  Playlist,
  PlaylistItem,
  CatalogCoverageRow,
  CatalogProductRow,
  CatalogBlock,
  TeamBlock,
  TeamEmployeeRow,
  TeamOfficeRow,
} from "@/lib/dashboard-management/types";
import { buildAlgoModuleInsight } from "@/lib/dashboard-management/algo-insight";
import { InsightVault } from "./insight-vault";

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

/* ————— Gráficos: estilo común (mejora 044b) ————— */
const CHART_GRID = "#e5e9f2";
const CHART_TICK = { fontSize: 11, fill: "#7b879c" };
const CHART_LEGEND = {
  iconType: "circle" as const,
  iconSize: 9,
  wrapperStyle: { fontSize: 11.5, paddingTop: 2 },
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Tooltip de gráficos: legible, en es-AR y con el sistema de diseño. */
function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border-strong bg-card px-3 py-2 shadow-lg">
      {label !== undefined && label !== "" && (
        <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-text-3">
          {String(label)}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-5 text-[12px]">
            <span className="flex items-center gap-1.5 text-text-2">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <strong className="tabular-nums">{number(item.value ?? 0)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Etiqueta % dentro de los sectores del donut (solo en sectores legibles). */
type PieLabelProps = { x?: number; y?: number; percent?: number };
function piePercentLabel(props: PieLabelProps) {
  const { x, y, percent } = props;
  if (x === undefined || y === undefined || (percent ?? 0) < 0.06) return undefined;
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      fontSize={10.5}
      fontWeight={700}
      textAnchor="middle"
      dominantBaseline="central"
    >
      {Math.round((percent ?? 0) * 100)}%
    </text>
  );
}

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

/*
 * 045 — Semáforo de los niveles IA que ya genera el sistema (🟢/🟡/🟠/🔴).
 * El texto llega tal cual de Airtable; acá solo se elige el tono del chip.
 */
function nivelIaTone(level?: string): "success" | "warning" | "accent" | "neutral" {
  if (!level) return "neutral";
  if (level.includes("🟢")) return "success";
  if (level.includes("🔴") || level.includes("🟠")) return "warning";
  return "accent";
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

/*
 * 044b Bloque 5 — Bloques plegables y arrastrables (estilo maqueta 044).
 * El chevron pliega la sección; el asa la arrastra para reordenar dentro de su grupo.
 * Todo se recuerda por navegador (localStorage) y no cambia ningún dato del negocio.
 */
const BLOCKS_KEY = "dm-blocks:v1";

type BloquesPrefs = { collapsed: Record<string, boolean>; orders: Record<string, string[]> };

function leerBloques(): BloquesPrefs {
  try {
    const raw = localStorage.getItem(BLOCKS_KEY);
    if (!raw) return { collapsed: {}, orders: {} };
    const parsed = JSON.parse(raw) as Partial<BloquesPrefs>;
    return { collapsed: parsed.collapsed ?? {}, orders: parsed.orders ?? {} };
  } catch {
    return { collapsed: {}, orders: {} };
  }
}

function guardarBloques(prefs: BloquesPrefs) {
  try {
    localStorage.setItem(BLOCKS_KEY, JSON.stringify(prefs));
  } catch {
    /* sin almacenamiento: vale solo para esta vista */
  }
}

function bloquesDelParent(parent: HTMLElement): HTMLElement[] {
  return Array.from(parent.querySelectorAll("[data-block]")) as HTMLElement[];
}

function stackKeyDe(parent: HTMLElement): string {
  return bloquesDelParent(parent)
    .map((el) => el.dataset.block ?? "")
    .filter(Boolean)
    .sort()
    .join("|");
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const key = title;

  /* Estado guardado + reposición según el último orden elegido por el usuario. */
  useEffect(() => {
    const root = ref.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    root.dataset.block = key;
    const prefs = leerBloques();
    if (prefs.collapsed[key]) setCollapsed(true);
    const saved = prefs.orders[stackKeyDe(parent)];
    if (!saved || saved.length === 0) return;
    const actuales = bloquesDelParent(parent);
    const keys = actuales.map((el) => el.dataset.block ?? "");
    if (keys.length !== saved.length || !saved.every((k) => keys.includes(k))) return;
    const ref0 = actuales[0];
    if (!ref0) return;
    /* Marcador fijo en la posición del grupo: cada bloque se inserta justo antes,
       en el orden guardado; al quitarlo, la secuencia queda exactamente así. */
    const parentNode = ref0.parentNode;
    if (!parentNode) return;
    const marcador = document.createComment("dm-bloques");
    parentNode.insertBefore(marcador, ref0);
    for (const k of saved) {
      const el = actuales.find((x) => x.dataset.block === k);
      if (el) parentNode.insertBefore(el, marcador);
    }
    marcador.remove();
  }, [key]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      const prefs = leerBloques();
      prefs.collapsed[key] = next;
      guardarBloques(prefs);
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
    ref.current?.classList.add("dm-dragging");
  };
  const onDragEnd = () => {
    ref.current?.classList.remove("dm-dragging");
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    ref.current?.classList.add("dm-drop");
  };
  const onDragLeave = () => {
    ref.current?.classList.remove("dm-drop");
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const target = ref.current;
    const parent = target?.parentElement;
    if (!target || !parent) return;
    target.classList.remove("dm-drop");
    const srcKey = e.dataTransfer.getData("text/plain");
    const src = bloquesDelParent(parent).find((el) => el.dataset.block === srcKey);
    if (!src || src === target) return;
    const rect = target.getBoundingClientRect();
    const antes = e.clientY < rect.top + rect.height / 2;
    if (antes) parent.insertBefore(src, target);
    else parent.insertBefore(src, target.nextSibling);
    const prefs = leerBloques();
    prefs.orders[stackKeyDe(parent)] = bloquesDelParent(parent)
      .map((el) => el.dataset.block ?? "")
      .filter(Boolean);
    guardarBloques(prefs);
  };

  return (
    <section
      ref={ref}
      className="rounded-lg border bg-card p-4"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11.5px] text-text-3">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-text-3 transition-colors hover:bg-accent hover:text-text-2 active:cursor-grabbing"
            title="Arrastrar para reordenar"
            aria-label={`Mover «${title}»`}
          >
            <GripVertical size={13} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-3 transition-colors hover:bg-accent hover:text-text-2"
            title={collapsed ? "Mostrar bloque" : "Ocultar bloque"}
            aria-label={collapsed ? `Mostrar «${title}»` : `Ocultar «${title}»`}
          >
            <ChevronDown size={14} className={cn("transition-transform", collapsed && "-rotate-90")} />
          </button>
        </div>
      </header>
      <div className={cn("mt-3", collapsed && "hidden")}>{children}</div>
    </section>
  );
}

function Badge({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode;
  tone?: string;
  icon?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-border bg-subtle text-text-2",
    warning: "border-warning-soft bg-warning-tint text-warning-text",
    success: "border-success-soft bg-success-tint text-success-text",
    accent: "border-brand-soft bg-brand-tint text-brand-text",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tones[tone] ?? tones.neutral
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/*
 * 039 — Etiquetas con los colores del backend de Airtable.
 *
 * El valor llega crudo (ej. "VIGENTE", "CREDITO") y se pinta con el mismo
 * color que tiene la opción del campo de selección en Airtable. Un valor
 * desconocido cae a un chip neutro: nunca se rompe la lista.
 */
function AirtableChip({ value }: { value: string }) {
  const style = airtableTagStyle(value);

  if (!style) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-subtle px-2 py-0.5 text-[10.5px] font-semibold text-text-2">
        {value}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
      style={style}
      title={`Etiqueta del backoffice de Airtable: ${value}`}
    >
      {value}
    </span>
  );
}

/*
 * 039 — Estado de la conexión de IA del tablero (la del CRM):
 * «IA conectada · modelo» con acceso a Ajustes → IA, o CTA para conectarla.
 */
type AiStatus = {
  configured: boolean;
  source: "org" | "env" | null;
  provider: string | null;
  model: string | null;
};

function AiStatusChip({ status }: { status: AiStatus | null }) {
  if (!status) return null;

  if (status.configured) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-success-soft bg-success-tint px-2 py-1 text-[11px] font-semibold text-success-text">
        <Bot size={12} className="shrink-0" />
        <span className="max-w-[180px] truncate" title={`IA conectada (${status.source === "org" ? "Ajustes → IA" : "configuración del servidor"}) · ${status.model ?? ""}`}>
          IA conectada · {status.model ?? "modelo activo"}
        </span>
        <a
          href="/settings/ai"
          className="inline-flex shrink-0 items-center gap-0.5 underline-offset-2 hover:underline"
          title="Configurar la conexión de IA del CRM (Ajustes → IA)"
        >
          <Settings2 size={11} /> Ajustes
        </a>
      </span>
    );
  }

  return (
    <a
      href="/settings/ai"
      className="inline-flex items-center gap-1.5 rounded-full border border-warning-soft bg-warning-tint px-2 py-1 text-[11px] font-semibold text-warning-text transition-opacity hover:opacity-90"
      title="El tablero usa la conexión de IA del CRM. Conectala en Ajustes → IA para activar los análisis."
    >
      <Bot size={12} />
      IA no conectada — Conectar IA
      <ArrowUpRight size={11} />
    </a>
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

const SUGGESTION_TONES: Record<string, string> = {
  danger: "border-danger-soft bg-danger-tint text-danger-text hover:opacity-90",
  warning: "border-warning-soft bg-warning-tint text-warning-text hover:opacity-90",
  brand: "border-brand-soft bg-brand-tint text-brand-text hover:opacity-90",
  success: "border-success-soft bg-success-tint text-success-text hover:opacity-90",
};

/* 040 — Tonos de la Cola de hoy (misma semántica de color del tablero). */
const PLAYLIST_TONES: Record<string, string> = {
  danger: "border-danger-soft bg-danger-tint text-danger-text",
  warning: "border-warning-soft bg-warning-tint text-warning-text",
  brand: "border-brand-soft bg-brand-tint text-brand-text",
  success: "border-success-soft bg-success-tint text-success-text",
};

function SuggestionsStrip({
  data,
  onGoto,
  onOpenList,
}: {
  data: DashboardResponse;
  onGoto: (tab: TabId) => void;
  onOpenList: (tab: TabId, listId: string) => void;
}) {
  const items: {
    text: string;
    tab: TabId;
    list?: string;
    tone: "danger" | "warning" | "brand" | "success";
  }[] = [];

  if (data.current.expires7 > 0) {
    items.push({
      text: `${number(data.current.expires7)} pólizas vencen en ≤7 días — hablá hoy`,
      tab: "retencion",
      list: "expires7",
      tone: "danger",
    });
  } else if (data.current.expires30 > 0) {
    items.push({
      text: `${number(data.current.expires30)} pólizas vencen este mes — prepará la ronda`,
      tab: "retencion",
      list: "expires30",
      tone: "warning",
    });
  }

  if (data.opportunity.reactivationCandidates > 0) {
    items.push({
      text: `${number(data.opportunity.reactivationCandidates)} clientes para reactivar`,
      tab: "reactivacion",
      list: "candidates",
      tone: "warning",
    });
  }

  const topCross = data.crossSell?.[0];
  if (topCross && topCross.customers > 0) {
    items.push({
      text: `${topCross.opportunity}: ${number(topCross.customers)} clientes para ampliar`,
      tab: "cross",
      list: topCross.opportunity.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      tone: "brand",
    });
  }

  if (data.crm?.available && data.crm.kpis?.leads > 0) {
    const leads = data.crm.kpis.leads;
    items.push({
      text: `CRM: ${number(leads)} ${leads === 1 ? "oportunidad abierta" : "oportunidades abiertas"}`,
      tab: "crm",
      tone: "brand",
    });
  }

  items.push({
    text: `Migración: ${percent(data.migration.operationMatchRate)} de gestiones vinculadas`,
    tab: "migracion",
    tone: "success",
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
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-opacity",
              SUGGESTION_TONES[item.tone] ?? "border-border bg-card text-text-2 hover:opacity-90"
            )}
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

/** 044b-B13 — módulos cuyos listados de clientes permiten abrir el dashboard individual. */
const MODULOS_CON_DASHBOARD_CLIENTE = ["retencion", "reactivacion", "cross", "cartera", "pulso"];

function ModuleLists({
  module,
  lists,
  open,
  active,
  onToggle,
  onSelect,
  onClose,
  onOpenClient,
}: {
  module: string;
  lists: DrillList[];
  open: boolean;
  active: string;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** 044b-B13 — abre el panel del cliente (con su dashboard individual). */
  onOpenClient?: (c: PanelCustomer) => void;
}) {
  const [query, setQuery] = useState("");
  /* 044b-B13 — «Dashboard» desde un listado: busca la ficha por nombre. */
  const [buscando, setBuscando] = useState<string | null>(null);
  const [errorAviso, setErrorAviso] = useState<string | null>(null);

  const abrirDashboard = async (item: DrillItem) => {
    if (!onOpenClient || buscando) return;
    setErrorAviso(null);
    setBuscando(item.name);
    try {
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(item.name)}`, {
        cache: "no-store",
      }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as {
        results?: SystemClientSearchResultDto[];
      };
      const hit = data?.results?.[0];
      if (!res?.ok || !hit) {
        setErrorAviso(`No encontré la ficha de ${item.name} para abrir su dashboard.`);
        return;
      }
      onOpenClient({
        id: hit.client.recordId,
        name: [hit.client.nombre, hit.client.apellido].filter(Boolean).join(" ").trim(),
        dni: hit.client.dni ?? item.dni ?? null,
        phone: hit.client.telefono ?? null,
        backendUrl: item.links?.[0]?.url ?? null,
      });
    } catch {
      setErrorAviso("No se pudo consultar el sistema para abrir el dashboard.");
    } finally {
      setBuscando(null);
    }
  };

  const current = lists.find((list) => list.id === active) || lists[0];

  if (lists.length === 0 || !current) return null;

  const normalized = query.trim().toLowerCase();
  const visible = normalized
    ? current.items.filter((item) =>
        [item.name, item.dni, item.detail, item.extra, ...(item.tags ?? [])]
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
                  {(item.dni || (item.tags && item.tags.length > 0)) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      {item.dni && <span className="text-[11px] text-text-3">DNI {item.dni}</span>}
                      {item.tags?.map((tag) => (
                        <AirtableChip key={tag} value={tag} />
                      ))}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-right text-[11.5px] text-text-2">
                  <span className="block truncate">{item.detail}</span>
                  <span className="block truncate text-[11px] text-text-3">{item.extra}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {onOpenClient && MODULOS_CON_DASHBOARD_CLIENTE.includes(module) && (
                    <button
                      type="button"
                      disabled={buscando !== null}
                      onClick={() => void abrirDashboard(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-opacity hover:opacity-90 disabled:opacity-50"
                      title="Dashboard individual del cliente: su ficha, respuestas y vouchers (igual que Cliente 360)"
                    >
                      <LayoutDashboard size={11} />
                      {buscando === item.name ? "Abriendo…" : "Dashboard"}
                    </button>
                  )}
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

          {errorAviso && (
            <p className="mt-2 text-[11.5px] text-danger-text">{errorAviso}</p>
          )}
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

/* — 044b-B15 — piezas sugeridas: etiqueta + ícono del botón al Constructor — */
const PIEZA_LABELS: Record<PiezaTipo, { label: string; Icon: typeof Megaphone }> = {
  publicacion: { label: "Crear publicación", Icon: Megaphone },
  formulario: { label: "Crear formulario", Icon: ClipboardList },
  encuesta: { label: "Crear encuesta", Icon: Star },
  cupon: { label: "Crear cupón", Icon: Ticket },
};

/** Fecha corta para los chips del baúl: "30/09 14:22". */
function stampShort(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Lista de acciones del análisis; si la acción trae pieza, botón al Constructor. */
function ModuleActionList({
  acciones,
  onBuildPiece,
}: {
  acciones: ModuleAccion[];
  onBuildPiece?: (accion: ModuleAccion) => void;
}) {
  return (
    <ul className="mt-1 list-disc space-y-1 pl-4 text-[12.5px] text-text-2">
      {acciones.map((accion, index) => {
        const pieza = accion.pieza ? PIEZA_LABELS[accion.pieza] : null;
        const PiezaIcon = pieza?.Icon;
        return (
          <li key={`${index}-${accion.texto.slice(0, 24)}`}>
            <span>{accion.texto}</span>
            {pieza && PiezaIcon && onBuildPiece && (
              <button
                className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-brand-soft bg-card px-1.5 py-0.5 align-middle text-[10.5px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                title="Abre el Constructor con esta idea cargada y el análisis adjunto"
                onClick={() => onBuildPiece(accion)}
              >
                <PiezaIcon size={10} />
                {pieza.label}
                <ArrowUpRight size={10} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 044b-B15 — «Análisis del sistema»: el informe por reglas (sin IA) del módulo.
 * En modo Algoritmo es el bloque principal; en Dual queda plegado arriba de la IA.
 */
function AlgoInsightBlock({
  module,
  context,
  collapsed = false,
  onBuildPiece,
}: {
  module: ModuleAiId;
  context: Record<string, unknown>;
  collapsed?: boolean;
  onBuildPiece?: (accion: ModuleAccion) => void;
}) {
  const algo = buildAlgoModuleInsight(module, context);

  const body = (
    <>
      <p className="text-[12.5px] text-text-2">{algo.resumen}</p>

      {algo.focos.length > 0 && (
        <div>
          <span className="text-[11.5px] font-bold text-text-3">Qué mirar</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-text-2">
            {algo.focos.map((foco, index) => (
              <li key={`${index}-${foco.slice(0, 24)}`}>{foco}</li>
            ))}
          </ul>
        </div>
      )}

      {algo.acciones.length > 0 && (
        <div>
          <span className="text-[11.5px] font-bold text-text-3">Qué hacer</span>
          <ModuleActionList acciones={algo.acciones} onBuildPiece={onBuildPiece} />
        </div>
      )}
    </>
  );

  if (collapsed) {
    return (
      <details className="mt-2.5 rounded-md border bg-subtle/50 px-3 py-2">
        <summary className="flex cursor-pointer items-center gap-1.5 text-[11.5px] font-bold text-text-2">
          <Sigma size={12} />
          Ver análisis del sistema (por reglas, sin IA)
        </summary>
        <div className="mt-2 space-y-2">{body}</div>
      </details>
    );
  }

  return (
    <div className="mt-2.5 rounded-md border bg-subtle/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-text-2">
          <Sigma size={12} />
          Análisis del sistema · {MODULE_AI_TITLES[module]}
        </span>
        <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold text-text-3">
          por reglas · sin IA · instantáneo
        </span>
      </div>
      <div className="mt-2 space-y-2">{body}</div>
    </div>
  );
}

function ModuleAiRow({
  id,
  engine,
  onEngine,
  state,
  onGenerate,
  onRegenerate,
  onCopy,
  copied,
  aiStatus,
  context,
  onBuildPiece,
  onOpenVault,
}: {
  id: ModuleAiId;
  engine: InsightMode;
  onEngine: (mode: InsightMode) => void;
  state?: {
    status: "loading" | "error" | "done";
    data?: ModuleInsight;
    error?: string;
    saved?: boolean;
  };
  onGenerate: () => void;
  /** 044b-B15 — reformular: vuelve a generar y guarda la versión nueva. */
  onRegenerate?: () => void;
  onCopy: (text: string) => void;
  copied: boolean;
  aiStatus?: AiStatus | null;
  /** 044b-B15 — mismos datos que se le pasan a la IA (alimentan el algoritmo). */
  context?: Record<string, unknown>;
  /** 044b-B15 — acción con pieza → Constructor. */
  onBuildPiece?: (accion: ModuleAccion) => void;
  /** 044b-B15 — abre el baúl de análisis. */
  onOpenVault?: () => void;
}) {
  const label = MODULE_AI_TITLES[id];
  const insight = state?.status === "done" ? state.data : undefined;
  const algoContext = context ?? {};

  useEffect(() => {
    if (engine === "ia" && !state) {
      onGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const options: { id: InsightMode; label: string; hint: string; Icon: typeof TrendingUp }[] = [
    {
      id: "algoritmo",
      label: "Algoritmo",
      hint: "Sin IA: solo los datos y las reglas del sistema — instantáneo y auditable.",
      Icon: Sigma,
    },
    {
      id: "dual",
      label: "Dual",
      hint: "Los datos del módulo + la lectura de la IA (la generás cuando quieras).",
      Icon: Blend,
    },
    {
      id: "ia",
      label: "Solo IA",
      hint: "La IA lee los datos reales de este módulo y arma el resumen y las acciones; se genera sola.",
      Icon: Bot,
    },
  ];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-text-3">
          Motor
        </span>
        <div className="inline-flex rounded-md border bg-subtle p-0.5">
          {options.map((option) => {
            const OptionIcon = option.Icon;
            return (
              <button
                key={option.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                  engine === option.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-text-2 hover:text-foreground"
                )}
                onClick={() => onEngine(option.id)}
                title={option.hint}
              >
                <OptionIcon size={12} />
                {option.label}
              </button>
            );
          })}
        </div>
        <span className="flex-1" />
        <AiStatusChip status={aiStatus ?? null} />
      </div>

      {engine === "algoritmo" && (
        <AlgoInsightBlock
          module={id}
          context={algoContext}
          onBuildPiece={onBuildPiece}
        />
      )}

      {engine === "dual" && (
        <AlgoInsightBlock
          module={id}
          context={algoContext}
          collapsed
          onBuildPiece={onBuildPiece}
        />
      )}

      {engine !== "algoritmo" && (
        <div className="mt-2.5 rounded-md border border-brand-soft bg-brand-tint px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand-text">
            <Sparkles size={12} />
            {engine === "ia" ? `Análisis con IA · ${label}` : `Análisis IA (extra) · ${label}`}
          </span>

          {state?.status === "loading" && (
            <div className="mt-2 text-[12.5px] text-text-2">Generando análisis con la IA…</div>
          )}

          {!state &&
            (aiStatus && !aiStatus.configured ? (
              <a
                href="/settings/ai"
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-warning-soft bg-warning-tint px-2.5 py-1.5 text-[12px] font-semibold text-warning-text transition-opacity hover:opacity-90"
              >
                <Bot size={13} />
                Conectar la IA en Ajustes → IA
                <ArrowUpRight size={12} />
              </a>
            ) : (
              <button
                className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-brand-soft bg-card px-2.5 py-1.5 text-[12px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                onClick={onGenerate}
              >
                <Sparkles size={13} />
                Generar análisis con IA
              </button>
            ))}

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
                  <ModuleActionList acciones={insight.acciones} onBuildPiece={onBuildPiece} />
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

              <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-soft pt-2">
                <span className="text-[11px] text-text-3">
                  Generado con {insight.model} · solo sobre los datos del sistema
                  {state?.saved === true ? ` · Guardado ✓ ${stampShort(insight.generatedAt)}` : ""}
                </span>
                <span className="flex-1" />
                {onRegenerate && (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                    title="Vuelve a generar el análisis sobre los datos de ahora y guarda la versión nueva"
                    onClick={onRegenerate}
                  >
                    <RefreshCcw size={11} />
                    Reformular
                  </button>
                )}
                {onOpenVault && (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                    title="Ver todos los análisis guardados: fecha, modo y modelo"
                    onClick={onOpenVault}
                  >
                    <Archive size={11} />
                    Baúl de análisis
                  </button>
                )}
              </div>
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
  { id: "cola", label: "Cola de hoy", Icon: ListChecks },
  { id: "cartera", label: "Cartera", Icon: BriefcaseBusiness },
  { id: "retencion", label: "Retención", Icon: HeartHandshake },
  { id: "reactivacion", label: "Reactivación", Icon: Target },
  { id: "cross", label: "Venta cruzada", Icon: ArrowUpRight },
  { id: "clientes", label: "Cliente 360°", Icon: Users },
  { id: "crm", label: "CRM · Venta y gestión", Icon: MessageSquareText },
  { id: "propuestas", label: "Propuestas", Icon: FileText },
  { id: "constructor", label: "Constructor de publicaciones", Icon: Wand2 },
  { id: "seguimiento", label: "Seguimiento", Icon: History },
  { id: "campanas", label: "Campañas 360", Icon: Megaphone },
  { id: "archivos", label: "Archivos", Icon: FolderOpen },
  { id: "calidad", label: "Calidad y experiencia", Icon: Star },
  { id: "equipo", label: "Equipo", Icon: Users },
  { id: "migracion", label: "Calidad de datos", Icon: Database },
];

/* 044b Bloque 3 — Agrupación de módulos (Camino 3 de la maqueta): 5 grupos con subpestañas. */
const MODULE_GROUPS: { id: string; label: string; Icon: typeof TrendingUp; tabs: TabId[] }[] = [
  {
    id: "analisis",
    label: "Análisis",
    Icon: BarChart3,
    tabs: ["pulso", "cartera", "equipo", "migracion"],
  },
  {
    id: "oportunidades",
    label: "Oportunidades",
    Icon: Target,
    tabs: ["cola", "retencion", "reactivacion", "cross"],
  },
  { id: "clientes", label: "Clientes", Icon: Users, tabs: ["clientes", "calidad", "seguimiento"] },
  { id: "marketing", label: "Marketing", Icon: Megaphone, tabs: ["constructor", "propuestas", "campanas", "archivos"] },
  { id: "crm", label: "CRM", Icon: MessageSquareText, tabs: ["crm"] },
];

/* Filtros ideales por pestaña — verificado contra el motor real (buildDashboard):
   · oficina / producto / empleado / compañía → cartera y gestiones de todos los módulos de cartera.
   · fecha y canal → solo las gestiones del Pulso (listas altas / anulaciones / siniestros).
   · búsqueda → Cliente 360° (nombre, DNI o teléfono) — cada lista tiene además su búsqueda propia.
   · CRM y Calidad de datos → globales: no los afecta ningún filtro. */
const TAB_FILTERS: Record<
  TabId,
  { date: boolean; office: boolean; product: boolean; channel: boolean; employee: boolean; company: boolean; search: boolean }
> = {
  pulso: { date: true, office: true, product: true, channel: true, employee: true, company: true, search: false },
  cola: { date: false, office: true, product: true, channel: false, employee: true, company: true, search: false },
  cartera: { date: false, office: true, product: true, channel: false, employee: true, company: true, search: false },
  retencion: { date: false, office: true, product: true, channel: false, employee: true, company: true, search: false },
  reactivacion: { date: false, office: true, product: true, channel: false, employee: true, company: true, search: false },
  cross: { date: false, office: true, product: true, channel: false, employee: true, company: true, search: false },
  clientes: { date: false, office: true, product: false, channel: false, employee: false, company: false, search: true },
  crm: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  propuestas: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  constructor: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  seguimiento: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  campanas: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  archivos: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  calidad: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  equipo: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
  migracion: { date: false, office: false, product: false, channel: false, employee: false, company: false, search: false },
};

const FILTER_SCOPE: Record<TabId, string> = {
  pulso: "Fecha y canal acotan las gestiones del día a día; oficina, producto, empleado y compañía acotan además la cartera.",
  cola: "Filtran la cartera de la que salen las jugadas: oficina, producto, empleado y compañía.",
  cartera: "Filtran la cartera del tablero (pólizas y clientes).",
  retencion: "Filtran la cartera; las ventanas de vencimiento (≤7 días, ≤30 días, a observar) son fijas.",
  reactivacion: "Filtran el universo de clientes y su historia de gestión.",
  cross: "Filtran la cartera y los productos usados para la venta cruzada.",
  clientes: "Buscá por nombre, DNI o teléfono; la oficina acota el universo del cliente.",
  crm: "Este módulo muestra el CRM completo: los filtros de cartera y gestiones no lo afectan.",
  propuestas: "La pestaña tiene sus propios filtros: empleado asignado y estado del embudo.",
  constructor: "El constructor arma la publicación desde cero con vista previa: elegís cliente, tipo, producto y archivos; no necesita filtros de cartera.",
  seguimiento: "El archivo comercial tiene sus propios filtros: quién gestiona, origen (cola, ficha o propuesta) y búsqueda por cliente.",
  campanas: "El tablero de campañas tiene sus propios filtros: estado del embudo y búsqueda por cliente.",
  archivos: "El contenedor de archivos es global (fotos y videos de todo el equipo): los filtros de cartera no lo afectan.",
  calidad: "Módulo global de encuestas y denuncias: los filtros de cartera no lo afectan.",
  equipo: "Módulo global de rendimiento del equipo: los filtros de cartera no lo afectan.",
  migracion: "Este módulo muestra la base completa: los filtros no lo afectan.",
};

/* =========================================================================
 * 045b-r3 — PANELES DE ENTIDAD (estilo «panel del cliente»):
 * empleado, oficina/sucursal, compañía y producto — con pestañas, KPIs,
 * navegación cruzada entre entidades y todos los datos disponibles.
 * ========================================================================= */

type EquipoDetalleT =
  | { kind: "empleado"; row: TeamEmployeeRow }
  | { kind: "oficina"; row: TeamOfficeRow };

type CatalogoDetalleT =
  | { kind: "producto"; row: CatalogProductRow }
  | { kind: "cobertura"; row: CatalogCoverageRow }
  | { kind: "compania"; name: string };

/** Pestaña del panel — mismo estilo que las pestañas del panel del cliente. */
function PanelPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
        active ? "border-brand bg-brand text-white" : "bg-card text-text-2 hover:bg-subtle"
      }`}
    >
      {children}
    </button>
  );
}

/** Métrica del panel (mismo look en las 4 entidades). */
function PanelKpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-subtle/40 px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wide text-text-3">{label}</p>
      <p className="text-[15px] font-bold tabular-nums text-text-1">{value}</p>
      {hint ? <p className="mt-0.5 text-[10.5px] text-text-3">{hint}</p> : null}
    </div>
  );
}

/*
 * 045b-r3 — la LOCALIDAD del empleado («(2300) RAFAELA», código postal) y el
 * nombre de la oficina («RAFAELA (7204)») no comparten formato ni numeración:
 * se relacionan por los nombres significativos, sin tildes ni puntuación.
 */
function tokensSucursal(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(\d+\)/g, " ")
    .replace(/[.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .split(" ")
    .filter((t) => t.length >= 3);
}

/** Oficina única que corresponde a la sucursal del empleado (si no es ambigua). */
function buscarOficinaDelEmpleado(
  oficina: string | undefined,
  oficinas: TeamOfficeRow[],
): TeamOfficeRow | undefined {
  if (!oficina) return undefined;
  const tokensEmp = tokensSucursal(oficina);
  if (tokensEmp.length === 0) return undefined;
  const ranked = oficinas
    .map((o) => {
      const tokensOf = tokensSucursal(o.name);
      return { o, comunes: tokensOf.filter((t) => tokensEmp.includes(t)).length, total: tokensOf.length };
    })
    .filter((x) => x.comunes > 0)
    .sort((a, b) => b.comunes - a.comunes || a.total - b.total);
  const [top1, top2] = ranked;
  if (!top1) return undefined;
  if (!top2) return top1.o;
  // Solo navega cuando la mejor opción es claramente la única (evita adivinar).
  if (top1.comunes > top2.comunes || top1.total < top2.total) return top1.o;
  return undefined;
}

/** Wrapper común: overlay + header + barra de pestañas + cuerpo scrolleable. */
function PanelShell({
  titulo,
  nombre,
  meta,
  badge,
  onClose,
  tabs,
  children,
}: {
  titulo: string;
  nombre: string;
  meta?: string;
  badge?: React.ReactNode;
  onClose: () => void;
  tabs?: React.ReactNode;
  children: React.ReactNode;
}) {
  // El panel se cierra con Escape (mismo comportamiento que el resto).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={`${titulo} — ${nombre}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-2xl border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold text-text-1">{titulo}</p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-text-2">{nombre}</p>
            {meta ? <p className="mt-0.5 text-[11.5px] text-text-3">{meta}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {badge}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {tabs ? <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2">{tabs}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/*
 * 045b-r3 — PANEL DE EQUIPO: empleado u oficina/sucursal.
 * Resumen (KPIs + posición + navegación), lista de empleados (oficina) e informe IA.
 */
function EquipoPanel({
  detalle,
  onClose,
  team,
  onNavigate,
}: {
  detalle: EquipoDetalleT;
  onClose: () => void;
  team: TeamBlock;
  onNavigate: (d: EquipoDetalleT) => void;
}) {
  const [pestana, setPestana] = useState<"resumen" | "lista" | "informe">("resumen");
  const esEmpleado = detalle.kind === "empleado";
  const { row } = detalle;

  // Al navegar a otra entidad, el panel vuelve a arrancar por el resumen.
  useEffect(() => {
    setPestana("resumen");
  }, [detalle.kind, row.id]);

  const comisionMonth = "commissionMonth" in row ? row.commissionMonth : 0;
  const comisionYear = detalle.kind === "empleado" ? detalle.row.commissionYear : 0;

  // Navegación cruzada: el empleado lleva a su oficina y la oficina a sus empleados.
  const oficinaDeEmpleado = detalle.kind === "empleado" ? detalle.row.office : undefined;
  const oficinaRow = buscarOficinaDelEmpleado(oficinaDeEmpleado, team.offices);
  // Empleados vinculados a esta oficina: primero los de sucursal única (Localidad
  // que resuelve a esta oficina) y luego los de localidad parcial («ROSARIO» en
  // una sucursal de Rosario) que no tienen una sucursal distinta asignada.
  const genteDeOficina =
    detalle.kind === "oficina"
      ? (() => {
          const unicos: TeamEmployeeRow[] = [];
          const zona: TeamEmployeeRow[] = [];
          const tokensOf = tokensSucursal(detalle.row.name);
          for (const e of team.employees) {
            const of = buscarOficinaDelEmpleado(e.office, team.offices);
            if (of) {
              if (of.name === detalle.row.name) unicos.push(e);
              continue;
            }
            const tokensEmp = tokensSucursal(e.office ?? "");
            if (tokensOf.some((t) => tokensEmp.includes(t))) zona.push(e);
          }
          return { unicos, zona };
        })()
      : { unicos: [] as TeamEmployeeRow[], zona: [] as TeamEmployeeRow[] };
  const totalGenteOficina = genteDeOficina.unicos.length + genteDeOficina.zona.length;

  // Fila de empleado (se reutiliza para los asignados y los de la zona).
  const filaEmpleado = (empleado: TeamEmployeeRow) => (
    <button
      key={empleado.id}
      type="button"
      onClick={() => onNavigate({ kind: "empleado", row: empleado })}
      className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-text-1">{empleado.name}</span>
        <span className="block truncate text-[11px] text-text-3">
          {number(empleado.gestionesMonth)} gestiones este mes · {number(empleado.gestionesYear)} en el año
          {empleado.office ? ` · ${empleado.office}` : ""}
        </span>
      </span>
      {empleado.reportLevel && <Badge tone={nivelIaTone(empleado.reportLevel)}>{empleado.reportLevel}</Badge>}
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
        {empleado.report ? "Informe IA" : "Sin informe"}
        <ChevronRight size={14} />
      </span>
    </button>
  );

  // Posición en el equipo (ranking por gestiones del mes y del año).
  const rankMes =
    detalle.kind === "empleado"
      ? [...team.employees].sort((a, b) => b.gestionesMonth - a.gestionesMonth).findIndex((e) => e.id === row.id) + 1
      : 0;
  const rankAnio =
    detalle.kind === "empleado"
      ? [...team.employees].sort((a, b) => b.gestionesYear - a.gestionesYear).findIndex((e) => e.id === row.id) + 1
      : 0;

  const titulo = esEmpleado ? "Panel del empleado" : "Panel de la oficina";
  const meta = `${number(row.gestionesMonth)} gestiones este mes · ${number(row.gestionesYear)} en el año${
    comisionMonth > 0 ? ` · ${money(comisionMonth)} de comisión (mes)` : ""
  }`;

  return (
    <PanelShell
      titulo={titulo}
      nombre={row.name}
      meta={meta}
      badge={row.reportLevel ? <Badge tone={nivelIaTone(row.reportLevel)}>{row.reportLevel}</Badge> : null}
      onClose={onClose}
      tabs={
        <>
          <PanelPill active={pestana === "resumen"} onClick={() => setPestana("resumen")}>
            Resumen
          </PanelPill>
          {!esEmpleado && (
            <PanelPill active={pestana === "lista"} onClick={() => setPestana("lista")}>
              Empleados ({number(totalGenteOficina)})
            </PanelPill>
          )}
          <PanelPill active={pestana === "informe"} onClick={() => setPestana("informe")}>
            Informe IA
          </PanelPill>
        </>
      }
    >
      {pestana === "resumen" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <PanelKpi label="Gestiones del mes" value={number(row.gestionesMonth)} hint="Mes en curso" />
            <PanelKpi label="Gestiones del año" value={number(row.gestionesYear)} hint="Acumulado" />
            <PanelKpi
              label="Informe IA"
              value={row.report ? "Disponible" : "Sin generar"}
              hint={row.reportLevel ?? "—"}
            />
          </div>
          {(comisionMonth > 0 || comisionYear > 0) && (
            <div className="grid gap-2 sm:grid-cols-2">
              <PanelKpi label="Comisiones del mes" value={money(comisionMonth)} hint="Según el sistema" />
              <PanelKpi label="Comisiones del año" value={money(comisionYear)} hint="Según el sistema" />
            </div>
          )}
          {esEmpleado && (
            <div className="grid gap-2 sm:grid-cols-2">
              <PanelKpi
                label="Posición en el equipo (mes)"
                value={`#${number(rankMes)}`}
                hint={`de ${number(team.employees.length)} empleados`}
              />
              <PanelKpi
                label="Posición en el equipo (año)"
                value={`#${number(rankAnio)}`}
                hint={`de ${number(team.employees.length)} empleados`}
              />
            </div>
          )}
          {esEmpleado && oficinaRow && (
            <button
              type="button"
              onClick={() => onNavigate({ kind: "oficina", row: oficinaRow })}
              className="group w-full rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
            >
              <p className="text-[10.5px] uppercase tracking-wide text-text-3">Su oficina / sucursal</p>
              <p className="mt-0.5 truncate text-[12.5px] font-semibold text-text-1">{oficinaRow.name}</p>
              <p className="mt-0.5 text-[11px] text-text-3">
                {number(oficinaRow.gestionesMonth)} gestiones este mes · {number(oficinaRow.gestionesYear)} en el
                año · ver el panel de la oficina →
              </p>
            </button>
          )}
          {esEmpleado && !oficinaRow && oficinaDeEmpleado && (
            <div className="rounded-md border bg-subtle/40 px-3 py-2.5">
              <p className="text-[10.5px] uppercase tracking-wide text-text-3">Su oficina / sucursal</p>
              <p className="mt-0.5 truncate text-[12.5px] font-semibold text-text-1">{oficinaDeEmpleado}</p>
            </div>
          )}
          {!esEmpleado && totalGenteOficina > 0 && (
            <button
              type="button"
              onClick={() => setPestana("lista")}
              className="w-full rounded-md border bg-subtle/40 px-3 py-2.5 text-left text-[12px] font-semibold text-text-2 transition-colors hover:bg-subtle"
            >
              Ver los {number(totalGenteOficina)} empleados vinculados a esta sucursal, con su informe IA →
            </button>
          )}
          {!esEmpleado && totalGenteOficina === 0 && (
            <p className="rounded-md border bg-subtle/40 px-3 py-2.5 text-[12px] text-text-3">
              No hay empleados vinculados a esta sucursal por su Localidad.
            </p>
          )}
          <p className="border-t pt-2.5 text-[10.5px] text-text-3">
            {esEmpleado
              ? "Datos de gestiones y comisiones del backoffice + informe IA de productividad (solo lectura)."
              : "Datos de gestiones del backoffice + informe IA de la oficina (solo lectura)."}
          </p>
        </div>
      )}
      {pestana === "lista" && !esEmpleado && (
        <div className="space-y-1.5">
          {genteDeOficina.unicos.map((empleado) => filaEmpleado(empleado))}
          {genteDeOficina.unicos.length === 0 && genteDeOficina.zona.length > 0 && (
            <p className="rounded-md border bg-subtle/40 px-3 py-2.5 text-[11.5px] text-text-3">
              Ningún empleado tiene esta sucursal como Localidad única en el sistema. Se listan los
              empleados con localidad de la zona.
            </p>
          )}
          {genteDeOficina.zona.length > 0 && (
            <>
              <p className="pt-2 text-[10.5px] uppercase tracking-wide text-text-3">
                Con localidad de la zona (sin sucursal única en Localidad)
              </p>
              {genteDeOficina.zona.map((empleado) => filaEmpleado(empleado))}
            </>
          )}
          {totalGenteOficina === 0 && (
            <p className="rounded-md border bg-subtle/40 px-3 py-6 text-center text-[12px] text-text-3">
              No hay empleados vinculados a esta sucursal por su Localidad.
            </p>
          )}
        </div>
      )}
      {pestana === "informe" && (
        <div>
          {row.report ? (
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-text-2">{row.report}</p>
          ) : (
            <p className="text-[12px] text-text-3">
              Este registro todavía no tiene informe de la IA. Cuando el sistema lo genere, va a aparecer acá.
            </p>
          )}
          <p className="mt-3 border-t pt-2.5 text-[10.5px] text-text-3">
            {esEmpleado
              ? "Informe de productividad generado por la IA del sistema a partir de las gestiones y comisiones del backoffice (solo lectura)."
              : "Informe de la IA del sistema para esta sucursal, a partir de las gestiones del backoffice (solo lectura)."}
          </p>
        </div>
      )}
    </PanelShell>
  );
}

/*
 * 045b-r3 — PANEL DE CATÁLOGO: compañía, producto o cobertura.
 * Resumen (KPIs + navegación), productos (compañía) y análisis IA.
 */
function CatalogoPanel({
  detalle,
  onClose,
  catalog,
  companies,
  currentProducts,
  historicProducts,
  onNavigate,
}: {
  detalle: CatalogoDetalleT;
  onClose: () => void;
  catalog: CatalogBlock;
  companies: { name: string; policies: number; activePremium: number }[];
  currentProducts: { name: string; value: number }[];
  historicProducts: { name: string; value: number }[];
  onNavigate: (d: CatalogoDetalleT) => void;
}) {
  const [pestana, setPestana] = useState<"resumen" | "lista" | "analisis">("resumen");
  const clave = detalle.kind === "compania" ? detalle.name : detalle.row.id;

  // Al navegar a otra entidad, el panel vuelve a arrancar por el resumen.
  useEffect(() => {
    setPestana("resumen");
  }, [detalle.kind, clave]);

  const norm = (s: string) => s.trim().toUpperCase();
  const volumen = (name: string) => ({
    actual: currentProducts.find((p) => norm(p.name) === norm(name))?.value,
    historico: historicProducts.find((p) => norm(p.name) === norm(name))?.value,
  });

  if (detalle.kind === "cobertura") {
    return (
      <PanelShell
        titulo="Análisis IA de la cobertura"
        nombre={detalle.row.name}
        badge={
          detalle.row.analysisLevel ? (
            <Badge tone={nivelIaTone(detalle.row.analysisLevel)}>{detalle.row.analysisLevel}</Badge>
          ) : null
        }
        onClose={onClose}
      >
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Análisis IA de la cobertura
            </p>
            {detalle.row.analysis ? (
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-2">
                {detalle.row.analysis}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-text-3">
                La IA todavía no generó el análisis de esta cobertura.
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Categorización IA de tipo
            </p>
            {detalle.row.categorization ? (
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-2">
                {detalle.row.categorization}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-text-3">Sin categorización generada todavía.</p>
            )}
          </div>
          <p className="border-t pt-2.5 text-[10.5px] text-text-3">
            Generado por la IA del sistema en el backoffice (solo lectura).
          </p>
        </div>
      </PanelShell>
    );
  }

  if (detalle.kind === "compania") {
    const metrics = companies.find((c) => c.name === detalle.name);
    const prods = catalog.products.filter((p) => p.company === detalle.name);
    return (
      <PanelShell
        titulo="Panel de la compañía"
        nombre={detalle.name}
        meta={`${number(metrics?.policies ?? 0)} pólizas cargadas · ${money(
          metrics?.activePremium ?? 0,
        )} de prima activa`}
        onClose={onClose}
        tabs={
          <>
            <PanelPill active={pestana === "resumen"} onClick={() => setPestana("resumen")}>
              Resumen
            </PanelPill>
            <PanelPill active={pestana === "lista"} onClick={() => setPestana("lista")}>
              Productos ({number(prods.length)})
            </PanelPill>
            <PanelPill active={pestana === "analisis"} onClick={() => setPestana("analisis")}>
              Análisis IA
            </PanelPill>
          </>
        }
      >
        {pestana === "resumen" && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <PanelKpi
                label="Pólizas cargadas"
                value={metrics ? number(metrics.policies) : "—"}
                hint="Cartera actual"
              />
              <PanelKpi
                label="Prima activa"
                value={metrics ? money(metrics.activePremium) : "—"}
                hint="Según el sistema"
              />
              <PanelKpi label="Productos" value={number(prods.length)} hint="Con análisis IA en el catálogo" />
            </div>
            <button
              type="button"
              onClick={() => setPestana("lista")}
              className="w-full rounded-md border bg-subtle/40 px-3 py-2.5 text-left text-[12px] font-semibold text-text-2 transition-colors hover:bg-subtle"
            >
              Ver los {number(prods.length)} productos de esta compañía (pólizas, análisis y
              recomendaciones) →
            </button>
            <p className="border-t pt-2.5 text-[10.5px] text-text-3">
              Datos del backoffice (solo lectura). La compañía no tiene un análisis IA propio: el
              análisis de la IA se ve en cada uno de sus productos.
            </p>
          </div>
        )}
        {pestana === "lista" && (
          <div className="space-y-1.5">
            {prods.map((prod) => {
              const vol = volumen(prod.name);
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => onNavigate({ kind: "producto", row: prod })}
                  className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-text-1">{prod.name}</span>
                    <span className="block truncate text-[11px] text-text-3">
                      {vol.actual !== undefined ? `${number(vol.actual)} pólizas activas` : "—"}
                      {vol.historico !== undefined ? ` · ${number(vol.historico)} históricas` : ""}
                      {prod.analysis ? " · análisis IA" : " · sin análisis"}
                    </span>
                  </span>
                  {prod.analysisLevel && (
                    <Badge tone={nivelIaTone(prod.analysisLevel)}>{prod.analysisLevel}</Badge>
                  )}
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
                    Abrir
                    <ChevronRight size={14} />
                  </span>
                </button>
              );
            })}
            {prods.length === 0 && (
              <p className="rounded-md border bg-subtle/40 px-3 py-6 text-center text-[12px] text-text-3">
                No hay productos cargados para esta compañía en el catálogo.
              </p>
            )}
          </div>
        )}
        {pestana === "analisis" && (
          <div className="space-y-3">
            {prods.map((prod) => (
              <div key={prod.id} className="rounded-md border bg-subtle/40 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-1">
                    {prod.name}
                  </span>
                  {prod.analysisLevel && (
                    <Badge tone={nivelIaTone(prod.analysisLevel)}>{prod.analysisLevel}</Badge>
                  )}
                </div>
                {prod.analysis ? (
                  <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-text-2">
                    {prod.analysis}
                  </p>
                ) : (
                  <p className="mt-1 text-[11.5px] text-text-3">Sin análisis IA generado todavía.</p>
                )}
                {prod.recommendation && (
                  <p className="mt-1.5 whitespace-pre-line border-t pt-1.5 text-[11px] leading-relaxed text-text-3">
                    {prod.recommendation}
                  </p>
                )}
              </div>
            ))}
            {prods.length === 0 && (
              <p className="text-[12px] text-text-3">
                No hay productos cargados para esta compañía en el catálogo.
              </p>
            )}
            <p className="border-t pt-2.5 text-[10.5px] text-text-3">
              Análisis generados por la IA del sistema en el backoffice (solo lectura).
            </p>
          </div>
        )}
      </PanelShell>
    );
  }

  // Producto (después de cobertura y compañía, el detalle es de tipo producto).
  const prod = detalle.row;
  const vol = volumen(prod.name);
  const compDeProd = prod.company ? companies.find((c) => c.name === prod.company) : undefined;
  return (
    <PanelShell
      titulo="Panel del producto"
      nombre={prod.name}
      meta={prod.company ? `Compañía: ${prod.company}` : undefined}
      badge={
        prod.analysisLevel ? (
          <Badge tone={nivelIaTone(prod.analysisLevel)}>{prod.analysisLevel}</Badge>
        ) : null
      }
      onClose={onClose}
      tabs={
        <>
          <PanelPill active={pestana === "resumen"} onClick={() => setPestana("resumen")}>
            Resumen
          </PanelPill>
          <PanelPill active={pestana === "analisis"} onClick={() => setPestana("analisis")}>
            Análisis IA
          </PanelPill>
        </>
      }
    >
      {pestana === "resumen" && (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <PanelKpi
              label="Pólizas activas (hoy)"
              value={vol.actual !== undefined ? number(vol.actual) : "—"}
              hint="Cartera actual"
            />
            <PanelKpi
              label="Pólizas históricas"
              value={vol.historico !== undefined ? number(vol.historico) : "—"}
              hint="Acumulado del sistema"
            />
            <PanelKpi label="Compañía" value={prod.company ?? "—"} hint="Del catálogo" />
          </div>
          {prod.company && (
            <button
              type="button"
              onClick={() => prod.company && onNavigate({ kind: "compania", name: prod.company })}
              className="group w-full rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
            >
              <p className="text-[10.5px] uppercase tracking-wide text-text-3">Compañía</p>
              <p className="mt-0.5 truncate text-[12.5px] font-semibold text-text-1">{prod.company}</p>
              <p className="mt-0.5 text-[11px] text-text-3">
                {compDeProd
                  ? `${number(compDeProd.policies)} pólizas cargadas · ${money(compDeProd.activePremium)} de prima activa · `
                  : ""}
                ver el panel de la compañía →
              </p>
            </button>
          )}
          <p className="border-t pt-2.5 text-[10.5px] text-text-3">
            Volúmenes del motor de datos (pólizas agrupadas por producto) y datos del catálogo
            (solo lectura).
          </p>
        </div>
      )}
      {pestana === "analisis" && (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Análisis IA general
            </p>
            {prod.analysis ? (
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-2">
                {prod.analysis}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-text-3">
                La IA todavía no generó el análisis de este producto.
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
              Recomendación IA de mejoras
            </p>
            {prod.recommendation ? (
              <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-text-2">
                {prod.recommendation}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-text-3">Sin recomendación generada todavía.</p>
            )}
          </div>
          <p className="border-t pt-2.5 text-[10.5px] text-text-3">
            Generado por la IA del sistema en el backoffice (solo lectura).
          </p>
        </div>
      )}
    </PanelShell>
  );
}

export function ExecDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [fpanelOpen, setFpanelOpen] = useState(false);
  // 044b Bloque 3 — último módulo visitado dentro de cada grupo (subpestañas).
  const [subPorGrupo, setSubPorGrupo] = useState<Partial<Record<string, TabId>>>({});
  const [tab, setTab] = useState<TabId>("pulso");

  // 044b — el panel de filtros se cierra con Escape.
  useEffect(() => {
    if (!fpanelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFpanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fpanelOpen]);
  // 041 — panel de control del cliente (Cliente 360°), a pantalla completa.
  const [panelClient, setPanelClient] = useState<PanelCustomer | null>(null);

  // 045 — informe IA de Equipo: fila → modal con el detalle completo.
  const [equipoDetalle, setEquipoDetalle] = useState<
    { kind: "empleado"; row: TeamEmployeeRow } | { kind: "oficina"; row: TeamOfficeRow } | null
  >(null);

  // 045b — filtros de Equipo (buscar por empleado o sucursal).
  const [eqBusca, setEqBusca] = useState("");
  const [eqSucursal, setEqSucursal] = useState("");
  const [ofBusca, setOfBusca] = useState("");

  // 045b-r2 — las dos vistas del módulo Equipo, en pestañas separadas.
  const [equipoVista, setEquipoVista] = useState<"empleados" | "oficinas">("empleados");

  // 045b — catálogo: producto / cobertura / compañía → modal con el análisis IA.
  const [catalogoDetalle, setCatalogoDetalle] = useState<
    | { kind: "producto"; row: CatalogProductRow }
    | { kind: "cobertura"; row: CatalogCoverageRow }
    | { kind: "compania"; name: string }
    | null
  >(null);

  // 045b — sucursales únicas de los empleados (para el filtro por sucursal).
  const equipoSucursales = useMemo(() => {
    const set = new Set<string>();
    (data?.team?.employees ?? []).forEach((row) => {
      if (row.office) set.add(row.office);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [data?.team]);

  // 045b — empleados filtrados por búsqueda (nombre o sucursal) y sucursal elegida.
  const equipoEmpleados = useMemo(() => {
    const q = eqBusca.trim().toLowerCase();
    return (data?.team?.employees ?? []).filter((row) => {
      if (eqSucursal && row.office !== eqSucursal) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        (row.office ?? "").toLowerCase().includes(q)
      );
    });
  }, [data?.team, eqBusca, eqSucursal]);

  // 045b — oficinas filtradas por búsqueda.
  const equipoOficinas = useMemo(() => {
    const q = ofBusca.trim().toLowerCase();
    return (data?.team?.offices ?? []).filter(
      (row) => !q || row.name.toLowerCase().includes(q)
    );
  }, [data?.team, ofBusca]);

  /* 044b B9b — cliente que viaja del Cliente 360° al Constructor de publicaciones. */
  const [constructorFijo, setConstructorFijo] = useState<ClienteFijoWizard | null>(null);
  // 044b-B15 — idea que viaja del análisis de IA al Constructor (acción → pieza).
  const [constructorIdea, setConstructorIdea] = useState<{
    pieza: PiezaTipo;
    prompt: string;
    analisis?: { title: string; body: string };
  } | null>(null);
  // 044b-B15 — baúl de análisis de IA (modal).
  const [vaultOpen, setVaultOpen] = useState(false);
  // 042 — el rol del visor decide si ve el tablero de campañas (owner/admin/manager).
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [modEngines, setModEngines] = useState<Partial<Record<ModuleAiId, InsightMode>>>({});
  const [modInsights, setModInsights] = useState<
    Record<
      string,
      { status: "loading" | "error" | "done"; data?: ModuleInsight; error?: string; saved?: boolean }
    >
  >({});
  const [copiedMod, setCopiedMod] = useState<ModuleAiId | null>(null);
  const [listOpen, setListOpen] = useState<Record<string, boolean>>({});
  const [listSel, setListSel] = useState<Record<string, string>>({});
  const [listRestore, setListRestore] = useState<{ tab: TabId; scrollY: number } | null>(null);
  const [engine, setEngine] = useState<InsightMode>("dual");
  const [insights, setInsights] = useState<
    Record<
      string,
      { status: "loading" | "error" | "done"; data?: ClientInsight; error?: string; saved?: boolean }
    >
  >({});
  const [copiedInsight, setCopiedInsight] = useState<string | null>(null);
  // 039e — «Mandar mensaje»: estado del botón que abre el chat del cliente con el texto de la IA.
  const [chatState, setChatState] = useState<
    { key: string; kind: "loading" | "error"; text?: string } | null
  >(null);
  // 040 — Cola de hoy: estado por fila al generar el mensaje con la IA.
  const [queueState, setQueueState] = useState<
    Record<string, { kind: "loading" | "error"; text?: string }>
  >({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 039e — secuencia de cargas del tablero (anti-race): solo la última manda.
  const loadSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  /* 039 — Estado de la conexión de IA (la del CRM), sin secretos. */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const response = await fetch("/api/dashboard-management/ai-status", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = await response.json();
        if (!cancel && json && typeof json.configured === "boolean") {
          setAiStatus({
            configured: json.configured,
            source: json.source ?? null,
            provider: json.provider ?? null,
            model: json.model ?? null,
          });
        }
      } catch {
        /* el chip simplemente no se muestra */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const load = useCallback(
    async (override?: typeof filters) => {
      const active = override || filters;
      // 039e — anti-race: si una carga más nueva ya salió, esta respuesta vieja
      // no debe pisar los datos (evita que la lista "vuelva atrás" al buscar).
      const seq = ++loadSeq.current;
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
        if (seq !== loadSeq.current) return;
        if (!response.ok) {
          throw new Error(result?.error?.message || "No se pudo cargar el dashboard.");
        }
        setData(result as DashboardResponse);
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setError(
          err instanceof Error && err.message
            ? err.message
            : "No se pudo cargar el dashboard."
        );
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 042 — rol del visor: el tablero de campañas es para owner/admin/manager.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return;
      const body = (await res.json().catch(() => ({}))) as { viewer?: { role?: string } };
      if (body.viewer?.role) setViewerRole(body.viewer.role);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visibleTabs = useMemo(
    () =>
      viewerRole === "owner" || viewerRole === "admin" || viewerRole === "manager"
        ? MODULE_TABS
        : MODULE_TABS.filter((t) => t.id !== "campanas"),
    [viewerRole]
  );

  /* 044b Bloque 3 — grupos visibles (según rol) y grupo activo derivado del módulo. */
  const groupsVisibles = useMemo(
    () =>
      MODULE_GROUPS.map((g) => ({
        ...g,
        tabs: g.tabs.filter((t) => visibleTabs.some((v) => v.id === t)),
      })).filter((g) => g.tabs.length > 0),
    [visibleTabs]
  );
  const grupoActivo = groupsVisibles.find((g) => g.tabs.includes(tab)) ?? groupsVisibles[0];
  const tabMeta = (id: TabId) => MODULE_TABS.find((t) => t.id === id)!;

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

  async function requestModuleInsight(
    module: ModuleAiId,
    mode: "dual" | "ia",
    force = false
  ) {
    const key = `${module}:${mode}`;
    setModInsights((prev) => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const response = await fetch("/api/dashboard-management/module-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module,
          mode,
          context: moduleContext(module),
          // 044b-B15 — todo informe del bloque se guarda en el baúl (con fecha).
          save: true,
          force,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error?.message || result?.error || "La IA no respondió.");
      }
      setModInsights((prev) => ({
        ...prev,
        [key]: {
          status: "done",
          data: result.insight as ModuleInsight,
          saved: result.saved === true,
        },
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

  async function requestInsightRaw(
    clientId: string,
    mode: "dual" | "ia",
    context: Record<string, unknown>,
    force = false
  ) {
    const key = `${mode}:${clientId}`;
    setInsights((prev) => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const response = await fetch("/api/dashboard-management/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          mode,
          context,
          // 044b-B15 — todo informe del bloque se guarda en el baúl (con fecha).
          save: true,
          force,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result?.error?.message || result?.error || "La IA no respondió.");
      }
      setInsights((prev) => ({
        ...prev,
        [key]: {
          status: "done",
          data: result.insight as ClientInsight,
          saved: result.saved === true,
        },
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

  async function requestInsight(
    customer: DashboardResponse["customers"][number],
    mode: "dual" | "ia",
    force = false
  ) {
    await requestInsightRaw(
      customer.id,
      mode,
      {
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
      force
    );
  }

  /* — 044b-B15 — puentes: acción del análisis → Constructor, y baúl — */

  function moduleInsightText(insight: ModuleInsight): string {
    const parts = [insight.resumen];
    if (insight.focos.length > 0) {
      parts.push(`Qué mirar: ${insight.focos.join(" · ")}`);
    }
    if (insight.acciones.length > 0) {
      parts.push(`Acciones: ${insight.acciones.map((a) => a.texto).join(" · ")}`);
    }
    return parts.join("\n").slice(0, 1600);
  }

  function clientInsightText(insight: ClientInsight): string {
    const parts = [`Acción: ${insight.accion}. ${insight.porQue}`];
    if (insight.pasos.length > 0) {
      parts.push(`Pasos: ${insight.pasos.join(" · ")}`);
    }
    return parts.join("\n").slice(0, 1600);
  }

  /** Acción de un módulo con pieza → abre el Constructor con la idea cargada. */
  function buildPieceFromModule(
    module: ModuleAiId,
    accion: ModuleAccion,
    insight: ModuleInsight
  ) {
    if (!accion.pieza) return;
    setConstructorIdea({
      pieza: accion.pieza,
      prompt: accion.texto.slice(0, 400),
      analisis: {
        title: `${MODULE_AI_TITLES[module]} · ${stampShort(insight.generatedAt)}`,
        body: moduleInsightText(insight),
      },
    });
    setTab("constructor");
  }

  /** Acción de un cliente con pieza → abre el Constructor con la idea cargada. */
  function buildPieceFromClient(
    customer: { id: string; name: string },
    insight: ClientInsight
  ) {
    if (!insight.pieza) return;
    setConstructorIdea({
      pieza: insight.pieza,
      prompt: `${insight.accion}: ${insight.pasos.join(" ")}`.slice(0, 400),
      analisis: {
        title: `${customer.name} · ${stampShort(insight.generatedAt)}`,
        body: clientInsightText(insight),
      },
    });
    setTab("constructor");
  }

  /** Reformular desde el baúl: regenera el informe (módulo o cliente) y lo guarda. */
  function reforwardFromVault(item: InsightRecordDto) {
    setVaultOpen(false);
    if (item.scope === "module") {
      void requestModuleInsight(item.refId as ModuleAiId, item.mode, true);
    } else {
      void requestInsightRaw(item.refId, item.mode, item.input, true);
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

  /**
   * 039e — «Mandar mensaje»: agarra el texto de la IA, busca al cliente en el
   * sistema de gestión (por DNI o nombre), asegura su hilo en la Bandeja
   * (mismo camino que «Nueva conversación») y abre el chat con el mensaje
   * ya cargado en el compositor, listo para revisar y enviar.
   */
  async function openClientChat(
    key: string,
    customer: { id: string; name: string; dni?: string; phone?: string },
    message: string,
    action?: { source: "cola" | "ficha"; playId?: string; module?: string }
  ) {
    setChatState({ key, kind: "loading" });
    try {
      const q = (customer.dni || customer.name || "").trim();
      if (!q) throw new Error("El cliente no tiene DNI ni nombre para buscar en el sistema.");
      const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json().catch(() => null)) as
        | { results?: SystemClientSearchResultDto[]; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "No se pudo buscar en el sistema.");
      const results = data?.results ?? [];
      const norm = (s: string) => s.trim().toLowerCase();
      const dni = (customer.dni ?? "").trim();
      const hit =
        (dni && results.find((r) => (r.client.dni ?? "").trim() === dni)) ||
        results.find((r) => r.client.recordId === customer.id) ||
        results.find((r) => norm(systemClientName(r.client)) === norm(customer.name)) ||
        results[0];
      if (!hit) throw new Error("No encontré este cliente en el buscador del sistema.");
      const client = hit.client;
      if (!client.telefono) throw new Error("El cliente no tiene teléfono cargado en el sistema.");
      const link = await fetch("/api/clients/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recordId: client.recordId,
          name: systemClientName(client),
          phone: client.telefono,
        }),
      });
      const linkData = (await link.json().catch(() => null)) as
        | { contactId?: string; error?: { message?: string } }
        | null;
      if (!link.ok || !linkData?.contactId)
        throw new Error(linkData?.error?.message ?? "No se pudo abrir la conversación.");
      if (action) {
        // 040 — trazabilidad: esta sugerencia se convirtió en acción.
        void fetch("/api/dashboard-management/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: action.source,
            playId: action.playId,
            module: action.module,
            contactId: linkData.contactId,
            clientRef: client.recordId,
            clientName: systemClientName(client),
          }),
        }).catch(() => {});
      }
      setChatState(null);
      router.push(`/inbox?contact=${linkData.contactId}&draft=${encodeURIComponent(message)}`);
    } catch (err) {
      setChatState({
        key,
        kind: "error",
        text: err instanceof Error && err.message ? err.message : "No se pudo abrir el chat.",
      });
    }
  }

  /**
   * 041 — «Mandar mensaje (IA)» desde el panel de control: genera el mensaje
   * con la conexión de IA del CRM y abre el chat del cliente con el borrador.
   * Devuelve el texto del error (o null si salió bien) para mostrarlo en el panel.
   */
  async function sendPanelMessage(customer: PanelCustomer): Promise<string | null> {
    try {
      const res = await fetch("/api/dashboard-management/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: customer.id || customer.dni || customer.name,
          mode: "dual",
          context: {
            name: customer.name,
            dni: customer.dni,
            phone: customer.phone,
            score: customer.score,
            recommendation: customer.recommendation,
          },
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; insight?: ClientInsight; error?: string }
        | null;
      if (!res.ok || !payload?.ok || !payload.insight?.mensajeWhatsapp) {
        throw new Error(payload?.error || "No se pudo generar el mensaje con IA.");
      }
      await openClientChat(
        `panel:${customer.id}`,
        {
          id: customer.id,
          name: customer.name,
          dni: customer.dni ?? undefined,
          phone: customer.phone ?? undefined,
        },
        payload.insight.mensajeWhatsapp,
        { source: "ficha", module: "clientes" }
      );
      return null;
    } catch (err) {
      return err instanceof Error && err.message
        ? err.message
        : "No se pudo generar el mensaje.";
    }
  }

  /**
   * 040 — Cola de hoy: la IA redacta el mensaje para ESTE cliente (misma
   * conexión de IA del CRM), busca al cliente en el sistema y abre su chat
   * con el borrador cargado, listo para revisar y enviar.
   */
  async function sendQueueMessage(play: Playlist, item: PlaylistItem, row = 0) {
    const key = `${play.id}:${item.clientId || item.dni || item.name}:${row}`;
    setQueueState((prev) => ({ ...prev, [key]: { kind: "loading" } }));
    try {
      const res = await fetch("/api/dashboard-management/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: item.clientId || item.dni || item.name,
          mode: "dual",
          context: { ...item.context, name: item.name },
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; insight?: ClientInsight; error?: string }
        | null;
      if (!res.ok || !payload?.ok || !payload.insight?.mensajeWhatsapp) {
        throw new Error(payload?.error || "No se pudo generar el mensaje con IA.");
      }
      setQueueState((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await openClientChat(
        key,
        {
          id: item.clientId || "",
          name: item.name,
          dni: item.dni,
          phone: item.phone,
        },
        payload.insight.mensajeWhatsapp,
        { source: "cola", playId: play.id, module: "cola" }
      );
    } catch (err) {
      setQueueState((prev) => ({
        ...prev,
        [key]: {
          kind: "error",
          text:
            err instanceof Error && err.message
              ? err.message
              : "No se pudo generar el mensaje.",
        },
      }));
    }
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
        onRegenerate={
          mode === "algoritmo"
            ? undefined
            : () => void requestModuleInsight(module, mode === "ia" ? "ia" : "dual", true)
        }
        onCopy={(text) => void copyModuleMessage(module, text)}
        copied={copiedMod === module}
        aiStatus={aiStatus}
        context={moduleContext(module)}
        onBuildPiece={(accion) => {
          const insight = modInsights[insightKeyFor(module, mode)]?.data;
          if (insight) buildPieceFromModule(module, accion, insight);
        }}
        onOpenVault={() => setVaultOpen(true)}
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
        onOpenClient={(c) => setPanelClient(c)}
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

  const tabFilters = TAB_FILTERS[tab];
  const hasTabFilters = Object.values(tabFilters).some(Boolean);

  const maxCompanyPremium = Math.max(
    ...data.companies.map((company) => company.activePremium),
    1
  );

  const topOffices = [...data.offices].sort((a, b) => b.altas - a.altas).slice(0, 8);
  const channelsTotal = data.channels.reduce((sum, channel) => sum + channel.value, 0);

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
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-warning-soft bg-warning-tint px-2.5 py-1 text-[11px] font-semibold text-warning-text transition-colors hover:opacity-90"
            title="Hay pólizas todavía en proceso de carga en el sistema nuevo — abrilo para ver la lista"
            onClick={() => gotoList("cartera", "loaded")}
          >
            <Hourglass size={12} />
            Pólizas en proceso de carga
            <ArrowUpRight size={11} />
          </button>
          <button
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent"
            onClick={() => setVaultOpen(true)}
            title="Baúl de análisis de IA: todos los informes guardados del CRM (módulos y clientes), con fecha — ver, reformular, eliminar o limpiar viejos"
          >
            <Archive size={14} />
            Baúl de análisis IA
          </button>
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

      {/* Filtros — barra liviana + panel lateral (044b: estilo maqueta) */}
      <section className="rounded-lg border bg-card px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {hasTabFilters && (
            <button
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
                fpanelOpen
                  ? "border-brand bg-brand-tint text-brand-text"
                  : "border-border-strong bg-background text-text-2 hover:bg-accent"
              )}
              onClick={() => setFpanelOpen(true)}
              aria-expanded={fpanelOpen}
              title="Abrir el panel de filtros"
            >
              <SlidersHorizontal size={13} />
              Filtrar
              {activeFilterChips.length > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">
                  {activeFilterChips.length}
                </span>
              )}
            </button>
          )}

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

          {activeFilterChips.length > 0 && (
            <button
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
              onClick={clearFilters}
              title="Quitar todos los filtros y recargar"
            >
              <RotateCcw size={11} />
              Limpiar todo
            </button>
          )}

          {!hasTabFilters && (
            <p className="flex items-center gap-1.5 text-[11.5px] text-text-3">
              <Info size={12} />
              Este módulo se muestra completo: no usa filtros.
            </p>
          )}

          <p
            className="ml-auto hidden items-center gap-1.5 text-[11px] text-text-3 lg:flex"
            title="Cada pestaña muestra solo los filtros que ese módulo usa realmente."
          >
            <Info size={12} />
            {FILTER_SCOPE[tab]}
          </p>
        </div>
      </section>

      {/* Panel lateral de filtros (044b) */}
      {fpanelOpen && hasTabFilters && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Filtros del tablero">
          <div className="absolute inset-0 bg-overlay" onClick={() => setFpanelOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l bg-card shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold">Filtros</h2>
                <p className="mt-0.5 text-[11px] text-text-3">{FILTER_SCOPE[tab]}</p>
              </div>
              <button
                className="rounded-md border border-border-strong px-2 py-1 text-text-2 transition-colors hover:bg-accent"
                onClick={() => setFpanelOpen(false)}
                aria-label="Cerrar filtros"
              >
                <X size={14} />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {tabFilters.date && (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Tiempo
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["Este mes", "month", CalendarDays],
                        ["Mes pasado", "lastMonth", History],
                        ["Este año", "year", CalendarRange],
                        ["Todo el tiempo", "all", InfinityIcon],
                      ] as const
                    ).map(([label, preset, Icon]) => {
                      const range = presetRange(preset);
                      const active =
                        preset === "all"
                          ? !filters.from && !filters.to
                          : filters.from === range.from && filters.to === range.to;
                      return (
                        <button
                          key={label}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                            active
                              ? "border-brand bg-brand-tint text-brand-text"
                              : "border-border text-text-2 hover:bg-accent"
                          )}
                          onClick={() => {
                            const next = { ...filters, from: range.from, to: range.to };
                            setFilters(next);
                            void load(next);
                          }}
                        >
                          <Icon size={12} />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => updateFilter("from", e.target.value)}
                      className={cn(selectClass, "flex-1")}
                    />
                    <span className="text-[11px] text-text-3">hasta</span>
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => updateFilter("to", e.target.value)}
                      className={cn(selectClass, "flex-1")}
                    />
                  </div>
                </section>
              )}

              {tabFilters.office && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Oficina
                  </span>
                  <Select
                    value={filters.office}
                    onChange={(v) => updateFilter("office", v)}
                    ariaLabel="Filtrar por oficina"
                    className={cn(selectClass, "w-full")}
                    options={[
                      { value: "", label: "Todas las oficinas" },
                      ...data.filters.offices.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              )}

              {tabFilters.product && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Producto
                  </span>
                  <Select
                    value={filters.product}
                    onChange={(v) => updateFilter("product", v)}
                    ariaLabel="Filtrar por producto"
                    className={cn(selectClass, "w-full")}
                    options={[
                      { value: "", label: "Todos los productos" },
                      ...data.filters.products.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              )}

              {tabFilters.channel && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Canal
                  </span>
                  <Select
                    value={filters.channel}
                    onChange={(v) => updateFilter("channel", v)}
                    ariaLabel="Filtrar por canal"
                    className={cn(selectClass, "w-full")}
                    options={[
                      { value: "", label: "Todos los canales" },
                      ...data.filters.channels.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              )}

              {tabFilters.employee && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Empleado
                  </span>
                  <Select
                    value={filters.employee}
                    onChange={(v) => updateFilter("employee", v)}
                    ariaLabel="Filtrar por empleado"
                    className={cn(selectClass, "w-full")}
                    options={[
                      { value: "", label: "Todos los empleados" },
                      ...data.filters.employees.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              )}

              {tabFilters.company && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Compañía
                  </span>
                  <Select
                    value={filters.company}
                    onChange={(v) => updateFilter("company", v)}
                    ariaLabel="Filtrar por compañía"
                    className={cn(selectClass, "w-full")}
                    options={[
                      { value: "", label: "Todas las compañías" },
                      ...data.filters.companies.map((value) => ({ value, label: value })),
                    ]}
                  />
                </label>
              )}

              {tabFilters.search && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-3">
                    Buscar
                  </span>
                  <input
                    value={filters.search}
                    onChange={(e) => updateFilter("search", e.target.value)}
                    placeholder="Cliente, DNI o póliza…"
                    className="h-8 w-full rounded-md border border-border-strong bg-background px-2 text-[12.5px]"
                  />
                </label>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t px-4 py-3">
              <button
                className="inline-flex items-center gap-1 rounded-md border border-border-strong px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
                onClick={clearFilters}
                disabled={activeFilterChips.length === 0}
                title="Quitar todos los filtros y recargar"
              >
                <RotateCcw size={12} />
                Limpiar todo
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
                onClick={() => setFpanelOpen(false)}
              >
                Listo
              </button>
            </footer>
          </aside>
        </div>
      )}

      {/* Módulos — grupos + subpestañas (044b Bloque 3: Camino 3 de la maqueta) */}
      <nav className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {groupsVisibles.map(({ id, label, Icon, tabs }) => {
            const activo = grupoActivo?.id === id;
            return (
              <button
                key={id}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                  activo
                    ? "border-brand bg-brand text-brand-fg shadow-sm"
                    : "border-border bg-card text-text-2 hover:bg-accent"
                )}
                onClick={() => {
                  const guardado = subPorGrupo[id];
                  const destino = guardado && tabs.includes(guardado) ? guardado : tabs[0]!;
                  setTab(destino);
                }}
                aria-current={activo ? "page" : undefined}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {grupoActivo?.tabs.map((tid) => {
            const sub = tabMeta(tid);
            const subActiva = tab === tid;
            return (
              <button
                key={tid}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                  subActiva
                    ? "border-brand-soft bg-brand-tint text-brand-text"
                    : "border-transparent text-text-3 hover:bg-accent hover:text-text-2"
                )}
                onClick={() => {
                  setTab(tid);
                  setSubPorGrupo((prev) => ({ ...prev, [grupoActivo.id]: tid }));
                }}
              >
                <sub.Icon size={13} />
                {sub.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Migas del módulo activo */}
      <p className="flex items-center gap-1.5 text-[11px] text-text-3">
        <span>{grupoActivo?.label}</span>
        <span aria-hidden>›</span>
        <span className="font-semibold text-text-2">{tabMeta(tab).label}</span>
      </p>

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
                  <ComposedChart
                    data={data.monthly}
                    margin={{ top: 6, right: 10, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={CHART_TICK}
                      tickLine={false}
                      axisLine={{ stroke: CHART_GRID }}
                    />
                    <YAxis
                      tick={CHART_TICK}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tickFormatter={(value) => compactNumber(Number(value))}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(13,91,255,0.06)" }} />
                    <Legend {...CHART_LEGEND} />
                    <Bar
                      dataKey="altas"
                      name="Altas"
                      fill={CHART.altas}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={26}
                    />
                    <Bar
                      dataKey="anulaciones"
                      name="Anulaciones"
                      fill={CHART.anulaciones}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={26}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Crecimiento neto"
                      stroke={CHART.net}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: CHART.net, strokeWidth: 0 }}
                      activeDot={{ r: 4.5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Cómo llegan y se atienden" subtitle="Distribución histórica por canal">
              <div className="h-[300px]">
                <ResponsiveContainer>
                  <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Pie
                      data={data.channels}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={94}
                      paddingAngle={3}
                      cornerRadius={5}
                      strokeWidth={0}
                      label={piePercentLabel}
                      labelLine={false}
                    >
                      {data.channels.map((_, index) => (
                        <Cell
                          key={index}
                          fill={CHART.series[index % CHART.series.length]}
                        />
                      ))}
                    </Pie>
                    <text x="50%" y="40%" textAnchor="middle" fontSize={22} fontWeight={700} fill="#0f1c2e">
                      {number(channelsTotal)}
                    </text>
                    <text x="50%" y="45.5%" textAnchor="middle" fontSize={10.5} fill="#7b879c">
                      gestiones
                    </text>
                    <Tooltip content={<ChartTip />} />
                    <Legend
                      {...CHART_LEGEND}
                      formatter={(value: unknown, entry: unknown) => {
                        const e = entry as { value?: number; payload?: { value?: number } };
                        const v = e?.payload?.value ?? e?.value;
                        if (typeof v !== "number" || !channelsTotal) return String(value);
                        return `${String(value)} · ${Math.round((v / channelsTotal) * 100)}%`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {topOffices.length > 0 && (
            <Section
              title="Actividad por oficina"
              subtitle="Top 8 por altas históricas — altas y anulaciones"
            >
              <div className="h-[320px]">
                <ResponsiveContainer>
                  <BarChart
                    data={topOffices}
                    layout="vertical"
                    margin={{ top: 4, right: 44, left: 6, bottom: 0 }}
                    barGap={2}
                  >
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ ...CHART_TICK, fontSize: 10.5 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(100,116,139,0.07)" }} />
                    <Legend {...CHART_LEGEND} />
                    <Bar
                      dataKey="altas"
                      name="Altas"
                      fill={CHART.altas}
                      radius={[0, 5, 5, 0]}
                      maxBarSize={11}
                    />
                    <Bar
                      dataKey="anulaciones"
                      name="Anulaciones"
                      fill={CHART.anulaciones}
                      radius={[0, 5, 5, 0]}
                      maxBarSize={11}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

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

          <details className="rounded-md border border-warning-soft bg-warning-tint px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold text-warning-text [&::-webkit-details-marker]:hidden">
              <AlertTriangle size={15} className="shrink-0" />
              Cartera en proceso de carga — indicadores parciales
              <Info size={12} className="text-text-3" />
            </summary>
            <p className="mt-1.5 pl-[23px] text-[12px] text-text-2">
              Reflejan únicamente las pólizas ya creadas y cargadas en el sistema nuevo (Seguros
              Agénticos). No deben interpretarse como la cartera final.
            </p>
          </details>

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
                  <BarChart
                    data={data.historicProducts}
                    layout="vertical"
                    margin={{ top: 4, right: 48, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" horizontal={false} />
                    <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={118}
                      tick={{ ...CHART_TICK, fontSize: 10.5 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(13,91,255,0.05)" }} />
                    <Bar
                      dataKey="value"
                      name="Gestiones"
                      fill={CHART.series[0]}
                      radius={[0, 6, 6, 0]}
                      maxBarSize={20}
                    >
                      <LabelList
                        dataKey="value"
                        position="right"
                        style={{ fontSize: 10.5, fill: "#7b879c" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Productos cargados actualmente" subtitle="Foto parcial de la nueva base">
              <div className="h-[320px]">
                <ResponsiveContainer>
                  <BarChart
                    data={data.currentProducts}
                    margin={{ top: 20, right: 6, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ ...CHART_TICK, fontSize: 9.5 }}
                      interval={0}
                      tickLine={false}
                      axisLine={{ stroke: CHART_GRID }}
                    />
                    <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} width={34} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "rgba(31,179,91,0.06)" }} />
                    <Bar
                      dataKey="value"
                      name="Pólizas"
                      fill={CHART.altas}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={30}
                    >
                      <LabelList
                        dataKey="value"
                        position="top"
                        style={{ fontSize: 10, fill: "#7b879c" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          {data.catalog && (
            <Section
              title="Análisis IA de productos"
              subtitle={`${number(data.catalog.products.length)} productos del sistema con el análisis y la recomendación que genera la IA`}
            >
              <div className="space-y-1.5">
                {data.catalog.products.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setCatalogoDetalle({ kind: "producto", row })}
                    title="Ver el análisis IA del producto"
                    className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-1">
                        {row.name}
                      </span>
                      <span className="block truncate text-[11px] text-text-3">
                        {row.company ? `${row.company} · ` : ""}
                        {row.analysis ? "Análisis IA generado" : "Sin análisis generado todavía"}
                      </span>
                    </span>
                    {row.analysisLevel && (
                      <Badge tone={nivelIaTone(row.analysisLevel)}>{row.analysisLevel}</Badge>
                    )}
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
                      Ver análisis
                      <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {data.catalog && (
            <Section
              title="Análisis IA de coberturas"
              subtitle={`${number(data.catalog.coverages.length)} coberturas del sistema con el análisis de la IA`}
            >
              <div className="space-y-1.5">
                {data.catalog.coverages.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setCatalogoDetalle({ kind: "cobertura", row })}
                    title="Ver el análisis IA de la cobertura"
                    className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-1">
                        {row.name}
                      </span>
                      <span className="block truncate text-[11px] text-text-3">
                        {row.analysis ? "Análisis IA generado" : "Sin análisis generado todavía"}
                        {row.categorization ? " · con categorización IA" : ""}
                      </span>
                    </span>
                    {row.analysisLevel && (
                      <Badge tone={nivelIaTone(row.analysisLevel)}>{row.analysisLevel}</Badge>
                    )}
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
                      Ver análisis
                      <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Compañías"
            subtitle="Distribución de las pólizas ya cargadas · clic en una compañía para ver su detalle y sus productos con análisis IA"
          >
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
                    <tr
                      key={company.name}
                      onClick={() => setCatalogoDetalle({ kind: "compania", name: company.name })}
                      title="Ver el detalle de la compañía y sus productos con análisis IA"
                      className="cursor-pointer transition-colors hover:bg-subtle/60"
                    >
                      <td className="px-3 py-2 text-[12.5px]">{company.name}</td>
                      <td className="px-3 py-2 text-[12.5px] tabular-nums">
                        {number(company.policies)}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-subtle"
                            title={`Participación sobre la mayor compañía (${money(maxCompanyPremium)})`}
                          >
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{
                                width: `${Math.max(
                                  (company.activePremium / maxCompanyPremium) * 100,
                                  company.activePremium > 0 ? 4 : 0
                                )}%`,
                              }}
                            />
                          </div>
                          {money(company.activePremium)}
                        </div>
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
            <Kpi
              title="Perfil de riesgo IA"
              value={number(data.opportunity.riskProfiled ?? 0)}
              subtitle="Clientes con análisis de riesgo generado por la IA"
              icon={<ShieldCheck size={17} />}
              tone="accent"
            />
          </section>

          <Section
            title="Retención: de contar bajas a anticiparlas"
            subtitle="El riesgo ya no es solo una fecha: cada cliente trae su perfil de riesgo IA"
          >
            <div className="rounded-md border border-brand-soft bg-brand-tint px-4 py-3">
              <h3 className="text-[12.5px] font-bold text-brand-text">Riesgo IA activo en toda la cartera</h3>
              <p className="mt-1 text-[12.5px] text-text-2">
                Cada cliente de las listas muestra su perfil de riesgo IA (🟢 bajo · 🟡 medio · 🔴 alto) y
                cada póliza su semáforo del informe IA. Abrí una lista para ver el detalle por cliente, o
                entrá al Cliente 360° para leer el análisis completo y decidir con contexto.
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
              Motor
            </span>
            <div className="inline-flex rounded-md border bg-subtle p-0.5">
              {(
                [
                  ["algoritmo", "Algoritmo", "Solo reglas del sistema: instantáneo, gratis y auditable", Sigma],
                  ["dual", "Dual", "El sistema prioriza con reglas y la IA enriquece el por qué y los pasos con el mismo contexto", Blend],
                  ["ia", "Solo IA", "La IA analiza el contexto real del cliente y propone la mejor acción", Bot],
                ] as const
              ).map(([id, label, hint, Icon]) => (
                <button
                  key={id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                    engine === id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-text-2 hover:text-foreground"
                  )}
                  onClick={() => chooseEngine(id)}
                  title={hint}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <AiStatusChip status={aiStatus} />
          </div>

          <p className="flex items-center gap-1.5 text-[11.5px] text-text-3">
            <ListChecks size={12} className="shrink-0" />
            {filters.search
              ? data.customers.length === 0
                ? "Sin resultados. Probá con otro nombre, DNI o teléfono."
                : data.customerStats && data.customerStats.matched > data.customers.length
                  ? `Mostrando ${data.customers.length} de ${data.customerStats.matched} coincidencias.`
                  : `${data.customers.length} resultado${data.customers.length === 1 ? "" : "s"}.`
              : data.customerStats
                ? `Últimas ${data.customers.length} de ${data.customerStats.total} fichas cargadas · buscá por nombre, DNI o teléfono.`
                : ""}
          </p>

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {data.customers.map((customer) => (
              <article
                key={customer.id}
                data-dm-client={customer.id}
                className="flex flex-col rounded-lg border bg-card p-4"
              >
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

                          {!insightState &&
                            (aiStatus && !aiStatus.configured ? (
                              <a
                                href="/settings/ai"
                                className="mt-1 inline-flex items-center gap-1 rounded-md border border-warning-soft bg-warning-tint px-2 py-1 text-[11.5px] font-semibold text-warning-text transition-opacity hover:opacity-90"
                              >
                                <Bot size={11} />
                                Conectar IA en Ajustes → IA
                                <ArrowUpRight size={11} />
                              </a>
                            ) : (
                              <button
                                className="mt-1 inline-flex items-center gap-1 rounded-md border border-brand-soft bg-card px-2 py-1 text-[11.5px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                                onClick={() => void requestInsight(customer, withAi)}
                              >
                                <Sparkles size={11} />
                                Generar análisis con IA
                              </button>
                            ))}

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
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <button
                                      className="rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                      onClick={() =>
                                        void copyInsightMessage(insightKey, insight.mensajeWhatsapp)
                                      }
                                    >
                                      {copiedInsight === insightKey ? "Copiado ✓" : "Copiar mensaje"}
                                    </button>
                                    <button
                                      className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-opacity hover:opacity-90 disabled:opacity-60"
                                      disabled={
                                        chatState?.key === insightKey && chatState.kind === "loading"
                                      }
                                      title="Busca el cliente en el sistema y abre su chat con este mensaje ya cargado, listo para revisar y enviar"
                                      onClick={() =>
                                        void openClientChat(insightKey, customer, insight.mensajeWhatsapp, {
                                          source: "ficha",
                                          module: "clientes",
                                        })
                                      }
                                    >
                                      <Send size={11} />
                                      {chatState?.key === insightKey && chatState.kind === "loading"
                                        ? "Buscando…"
                                        : "Mandar mensaje"}
                                    </button>
                                  </div>
                                  {chatState?.key === insightKey && chatState.kind === "error" && (
                                    <p className="mt-1 text-[11px] text-danger-text">{chatState.text}</p>
                                  )}
                                </div>
                              )}
                              {(() => {
                                const pieza = insight.pieza ? PIEZA_LABELS[insight.pieza] : null;
                                const PiezaIcon = pieza?.Icon;
                                return pieza && PiezaIcon ? (
                                  <button
                                    className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-card px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-colors hover:bg-brand-tint"
                                    title="Abre el Constructor con esta idea cargada y el análisis adjunto"
                                    onClick={() => buildPieceFromClient(customer, insight)}
                                  >
                                    <PiezaIcon size={11} />
                                    {pieza.label}
                                    <ArrowUpRight size={11} />
                                  </button>
                                ) : null;
                              })()}

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10.5px] text-text-3">
                                  Generado con {insight.model} · solo sobre los datos del sistema
                                  {insightState?.saved === true
                                    ? ` · Guardado ✓ ${stampShort(insight.generatedAt)}`
                                    : ""}
                                </span>
                                <span className="flex-1" />
                                <button
                                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                  title="Vuelve a generar el análisis y guarda la versión nueva en el baúl"
                                  onClick={() => void requestInsight(customer, withAi, true)}
                                >
                                  <RefreshCcw size={10} />
                                  Reformular
                                </button>
                                <button
                                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[10.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                  title="Ver todos los análisis guardados"
                                  onClick={() => setVaultOpen(true)}
                                >
                                  <Archive size={10} />
                                  Baúl
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPanelClient({
                      id: customer.id,
                      name: customer.name,
                      dni: customer.dni,
                      phone: customer.phone,
                      score: customer.score,
                      recommendation: customer.recommendation,
                      recommendationWhy: customer.recommendationWhy,
                      recommendationSteps: customer.recommendationSteps,
                      backendUrl: customer.backendUrl,
                    })
                  }
                  className="mt-2.5 mr-3 inline-flex items-center gap-1 rounded-md border border-brand-soft bg-brand-tint px-2 py-1 text-[11.5px] font-bold text-brand-text transition-opacity hover:opacity-90"
                  title="Panel de control: métricas, gráficas y gestión sugerida del cliente"
                >
                  <LayoutDashboard size={12} /> Panel de control
                </button>

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

      {tab === "calidad" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.calidad} id="calidad" onAction={applyHelpAction} />

          {!data.quality || data.quality.ratings.total === 0 ? (
            <Section
              title="Calidad y experiencia"
              subtitle="Encuestas y denuncias de Airtable con la lectura de la IA (solo lectura)"
            >
              <div className="rounded-md border bg-subtle/50 px-4 py-8 text-center text-[12.5px] text-text-3">
                Todavía no hay encuestas ni denuncias cargadas en el backoffice.
              </div>
            </Section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  title="Encuestas post-atención"
                  value={number(data.quality.ratings.total)}
                  subtitle="Calificaciones cargadas en el backoffice"
                  icon={<Star size={17} />}
                  tone="accent"
                />
                <Kpi
                  title="Satisfacción promedio"
                  value={`${data.quality.ratings.average.toFixed(2)} ★`}
                  subtitle="De 1 a 5 estrellas"
                  icon={<Star size={17} />}
                  tone={data.quality.ratings.average >= 4 ? "success" : "warning"}
                />
                <Kpi
                  title="Para contactar ya"
                  value={number(data.quality.ratings.urgent)}
                  subtitle="La IA marcó estas respuestas como urgentes"
                  icon={<AlertTriangle size={17} />}
                  tone={data.quality.ratings.urgent > 0 ? "danger" : "default"}
                />
                <Kpi
                  title="Denuncias de siniestros"
                  value={number(data.quality.claims.total)}
                  subtitle="Accidente, robo e incendio"
                  icon={<ShieldCheck size={17} />}
                />
              </section>

              <Section
                title="Cómo nos califican"
                subtitle="Reparto de estrellas y urgencia IA de cada respuesta"
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    {data.quality.ratings.distribution.map((row, _i, dist) => {
                      const max = Math.max(...dist.map((d) => d.count), 1);
                      return (
                        <div key={row.stars} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 text-[11.5px] font-semibold text-text-2">
                            {row.stars} {row.stars === 1 ? "estrella" : "estrellas"}
                          </span>
                          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                row.stars >= 4
                                  ? "bg-[#1fb35b]"
                                  : row.stars === 3
                                    ? "bg-[#f2a71b]"
                                    : "bg-[#d94a4a]"
                              )}
                              style={{ width: `${(row.count / max) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-text-3">
                            {row.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap content-start gap-1.5">
                    {data.quality.ratings.urgencies.map((u) => (
                      <Badge
                        key={u.name}
                        tone={u.name.toUpperCase().includes("URGENTE") ? "warning" : "neutral"}
                      >
                        {u.name} · {u.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Section>

              <Section
                title="Últimas respuestas"
                subtitle="El comentario real del cliente y la urgencia que determinó la IA"
              >
                <div className="grid gap-2 lg:grid-cols-2">
                  {data.quality.ratings.latest.map((r) => {
                    const stars = Math.max(0, Math.min(5, r.stars ?? 0));
                    return (
                      <article key={r.id} className="rounded-md border bg-subtle/40 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] tabular-nums text-[#f2a71b]">
                            {"★".repeat(stars)}
                            <span className="text-text-3/50">{"★".repeat(5 - stars)}</span>
                          </span>
                          {r.urgency && (
                            <Badge
                              tone={
                                r.urgency.toUpperCase().includes("URGENTE") ? "warning" : "neutral"
                              }
                            >
                              {r.urgency}
                            </Badge>
                          )}
                          {r.service && <span className="text-[11px] text-text-3">{r.service}</span>}
                        </div>
                        {r.comment && (
                          <p className="mt-1.5 text-[12px] leading-relaxed text-text-2">
                            «{r.comment}»
                          </p>
                        )}
                        <p className="mt-1 text-[10.5px] text-text-3">
                          {[r.client, r.employee, r.date].filter(Boolean).join(" · ")}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </Section>

              {data.quality.claims.total > 0 && (
                <Section title="Denuncias" subtitle="Culpabilidad e informe que determinó la IA">
                  <div className="grid gap-2 lg:grid-cols-2">
                    {data.quality.claims.latest.map((c) => (
                      <article key={c.id} className="rounded-md border bg-subtle/40 p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-[12px]">{c.type}</strong>
                          {c.culpability && (
                            <Badge tone={nivelIaTone(c.culpability)}>{c.culpability}</Badge>
                          )}
                          {c.status && <span className="text-[11px] text-text-3">{c.status}</span>}
                        </div>
                        {c.report && (
                          <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-text-2">
                            {c.report}
                          </p>
                        )}
                        <p className="mt-1 text-[10.5px] text-text-3">
                          {[c.client, c.office, c.date].filter(Boolean).join(" · ")}
                        </p>
                      </article>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      )}

      {tab === "equipo" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.equipo} id="equipo" onAction={applyHelpAction} />

          {!data.team ? (
            <Section
              title="Equipo"
              subtitle="Rendimiento por empleado y oficina, con los informes IA del sistema (solo lectura)"
            >
              <div className="rounded-md border bg-subtle/50 px-4 py-8 text-center text-[12.5px] text-text-3">
                Todavía no hay datos del equipo en este entorno.
              </div>
            </Section>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  title="Empleados con actividad"
                  value={number(data.team.totals.employees)}
                  subtitle="Sin baja, con gestiones o informe"
                  icon={<Users size={17} />}
                />
                <Kpi
                  title="Gestiones del mes"
                  value={number(data.team.totals.gestionesMonth)}
                  subtitle="Todo el equipo, mes en curso"
                  icon={<Activity size={17} />}
                  tone="accent"
                />
                <Kpi
                  title="Gestiones del año"
                  value={number(data.team.totals.gestionesYear)}
                  subtitle="Acumulado del equipo"
                  icon={<TrendingUp size={17} />}
                  tone="success"
                />
                <Kpi
                  title="Informes IA disponibles"
                  value={number(data.team.totals.reports)}
                  subtitle="Empleados y oficinas con informe de productividad"
                  icon={<Bot size={17} />}
                />
              </section>

              {(data.team.totals.commissionMonth > 0 || data.team.totals.commissionYear > 0) && (
                <section className="grid gap-3 sm:grid-cols-2">
                  <Kpi
                    title="Comisiones del mes"
                    value={money(data.team.totals.commissionMonth)}
                    subtitle="Acumulado del equipo (según el sistema)"
                    icon={<CircleDollarSign size={17} />}
                    tone="success"
                  />
                  <Kpi
                    title="Comisiones del año"
                    value={money(data.team.totals.commissionYear)}
                    subtitle="Acumulado del equipo (según el sistema)"
                    icon={<CircleDollarSign size={17} />}
                  />
                </section>
              )}

              {/* 045b-r2 — pestañas separadas: rendimiento por empleado / productividad por oficina. */}
              <div className="flex flex-wrap items-center gap-1 border-b pb-2">
                <button
                  type="button"
                  onClick={() => setEquipoVista("empleados")}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    equipoVista === "empleados"
                      ? "border-brand bg-brand text-white"
                      : "bg-card text-text-2 hover:bg-subtle"
                  }`}
                >
                  <Users size={13} />
                  Rendimiento por empleado ({number(data.team.employees.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setEquipoVista("oficinas")}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                    equipoVista === "oficinas"
                      ? "border-brand bg-brand text-white"
                      : "bg-card text-text-2 hover:bg-subtle"
                  }`}
                >
                  <BriefcaseBusiness size={13} />
                  Productividad por oficina ({number(data.team.offices.length)})
                </button>
              </div>

              {equipoVista === "empleados" ? (
              <Section
                title="Rendimiento por empleado"
                subtitle="Gestiones del mes y del año, más el informe de productividad IA"
              >
                {/* 045b — filtros: buscar por empleado o sucursal. */}
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                  <input
                    type="search"
                    value={eqBusca}
                    onChange={(event) => setEqBusca(event.target.value)}
                    placeholder="Buscar empleado o sucursal…"
                    className="h-9 w-full rounded-md border bg-surface px-3 text-[12.5px] text-text-1 outline-none placeholder:text-text-3 focus:border-brand"
                  />
                  <Select
                    value={eqSucursal}
                    onChange={setEqSucursal}
                    ariaLabel="Filtrar por sucursal"
                    className="h-9 w-full rounded-md border bg-surface px-3 text-[12.5px] text-text-1 outline-none focus:border-brand"
                    options={[
                      { value: "", label: "Todas las sucursales" },
                      ...equipoSucursales.map((sucursal) => ({ value: sucursal, label: sucursal })),
                    ]}
                  />
                </div>
                {/* 045 — formato lista: click en el empleado abre el informe IA completo. */}
                <div className="space-y-1.5">
                  {equipoEmpleados.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setEquipoDetalle({ kind: "empleado", row })}
                      title="Ver el informe de productividad IA completo"
                      className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-text-1">
                          {row.name}
                        </span>
                        <span className="block truncate text-[11px] text-text-3">
                          {row.office ? `${row.office} · ` : ""}
                          {number(row.gestionesMonth)} gestiones este mes ·{" "}
                          {number(row.gestionesYear)} en el año
                          {row.commissionMonth > 0
                            ? ` · ${money(row.commissionMonth)} de comisión (mes)`
                            : ""}
                        </span>
                      </span>
                      {row.reportLevel && (
                        <Badge tone={nivelIaTone(row.reportLevel)}>{row.reportLevel}</Badge>
                      )}
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
                        {row.report ? "Informe IA" : "Sin informe"}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  ))}
                  {equipoEmpleados.length === 0 && (
                    <p className="rounded-md border bg-subtle/40 px-3 py-6 text-center text-[12px] text-text-3">
                      No hay empleados que coincidan con la búsqueda.
                    </p>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-text-3">
                  Mostrando {number(equipoEmpleados.length)} de{" "}
                  {number(data.team.employees.length)} empleados
                  {eqSucursal ? ` · sucursal: ${eqSucursal}` : ""}
                </p>
              </Section>
              ) : (
              <Section
                title="Productividad por oficina"
                subtitle="Gestiones por sucursal, más el informe IA de cada oficina"
              >
                {/* 045b — buscador por sucursal. */}
                <input
                  type="search"
                  value={ofBusca}
                  onChange={(event) => setOfBusca(event.target.value)}
                  placeholder="Buscar sucursal u oficina…"
                  className="mb-3 h-9 w-full rounded-md border bg-surface px-3 text-[12.5px] text-text-1 outline-none placeholder:text-text-3 focus:border-brand"
                />
                {/* 045 — formato lista: click en la sucursal abre el informe IA completo. */}
                <div className="space-y-1.5">
                  {equipoOficinas.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setEquipoDetalle({ kind: "oficina", row })}
                      title="Ver el informe IA de la oficina completo"
                      className="group flex w-full items-center gap-3 rounded-md border bg-subtle/40 px-3 py-2.5 text-left transition-colors hover:bg-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-text-1">
                          {row.name}
                        </span>
                        <span className="block truncate text-[11px] text-text-3">
                          {number(row.gestionesMonth)} gestiones este mes ·{" "}
                          {number(row.gestionesYear)} en el año
                        </span>
                      </span>
                      {row.reportLevel && (
                        <Badge tone={nivelIaTone(row.reportLevel)}>{row.reportLevel}</Badge>
                      )}
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-text-3 group-hover:text-text-2">
                        {row.report ? "Informe IA" : "Sin informe"}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  ))}
                  {equipoOficinas.length === 0 && (
                    <p className="rounded-md border bg-subtle/40 px-3 py-6 text-center text-[12px] text-text-3">
                      No hay sucursales que coincidan con la búsqueda.
                    </p>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-text-3">
                  Mostrando {number(equipoOficinas.length)} de{" "}
                  {number(data.team.offices.length)} sucursales
                </p>
              </Section>
              )}
            </>
          )}
        </div>
      )}

      {tab === "constructor" && (
        <div className="space-y-3">
          <HelpZone
            help={MODULE_HELP.constructor}
            id="constructor"
            onAction={applyHelpAction}
          />

          <ConstructorPanel
            onGoToProposals={() => setTab("propuestas")}
            onOpenInbox={(input) => {
              // B9 — el panel post-creación abre el chat con el borrador listo.
              if (input.contactId) {
                const params = new URLSearchParams({
                  contact: input.contactId,
                  draft: input.draft,
                });
                if (input.attach) params.set("attach", input.attach);
                router.push(`/inbox?${params.toString()}`);
              } else {
                router.push("/inbox");
              }
            }}
            clienteFijo={constructorFijo ?? undefined}
            onQuitarClienteFijo={() => setConstructorFijo(null)}
            ideaInicial={constructorIdea ?? undefined}
            onQuitarIdea={() => setConstructorIdea(null)}
          />
        </div>
      )}

      {tab === "propuestas" && (
        <div className="space-y-3">
          <HelpZone
            help={MODULE_HELP.propuestas}
            id="propuestas"
            onAction={applyHelpAction}
          />

          <ProposalsPanel onOpenPanel={(c) => setPanelClient(c)} />
        </div>
      )}

      {tab === "seguimiento" && (
        <div className="space-y-3">
          <HelpZone
            help={MODULE_HELP.seguimiento}
            id="seguimiento"
            onAction={applyHelpAction}
          />

          <FollowUpPanel onOpenPanel={(c) => setPanelClient(c)} />
        </div>
      )}

      {tab === "campanas" && (
        <div className="space-y-3">
          <HelpZone
            help={MODULE_HELP.campanas}
            id="campanas"
            onAction={applyHelpAction}
          />

          <CampaignsPanel onOpenPanel={(c) => setPanelClient(c)} />
        </div>
      )}

      {tab === "archivos" && (
        <div className="space-y-3">
          <HelpZone
            help={MODULE_HELP.archivos}
            id="archivos"
            onAction={applyHelpAction}
          />

          <LibraryPanel />
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

      {tab === "cola" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.cola} id="cola" onAction={applyHelpAction} />

          <Section
            title="Cola de hoy"
            subtitle="Jugadas calculadas sobre la cartera real: del análisis a la acción, sin buscar en listas"
          >
            {!data.playlists || data.playlists.length === 0 ? (
              <div className="rounded-md border bg-subtle/50 px-4 py-8 text-center text-[12.5px] text-text-3">
                El motor de datos todavía no calculó la cola en esta respuesta. Actualizá el tablero
                (⟳) y vas a ver las jugadas del día.
              </div>
            ) : (
              <div className="space-y-3" data-dm-cola>
                {data.playlists.map((play) => (
                  <article
                    key={play.id}
                    data-dm-play={play.id}
                    className="overflow-hidden rounded-xl border bg-card"
                  >
                    <header className="flex flex-wrap items-center gap-2 border-b bg-subtle/40 px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide",
                          PLAYLIST_TONES[play.tone] || PLAYLIST_TONES.brand
                        )}
                      >
                        <ListChecks size={11} />
                        {play.title}
                      </span>
                      <span className="text-[11.5px] text-text-3">{play.subtitle}</span>
                      <span className="ml-auto rounded-full border px-2 py-0.5 text-[10.5px] font-semibold text-text-2">
                        {number(play.total)} en total
                      </span>
                    </header>
                    <ul className="divide-y">
                      {play.items.map((item, idx) => {
                        const key = `${play.id}:${item.clientId || item.dni || item.name}:${idx}`;
                        const generating = queueState[key]?.kind === "loading";
                        const hopping = chatState?.key === key && chatState.kind === "loading";
                        return (
                          <li key={key} className="flex flex-wrap items-start gap-2 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <strong className="text-[12.5px]">{item.name}</strong>
                                {item.dni && (
                                  <span className="text-[10.5px] text-text-3">DNI {item.dni}</span>
                                )}
                                {(item.tags || []).slice(0, 3).map((tag, tagIdx) => (
                                  <span
                                    key={`${tag}:${tagIdx}`}
                                    className="rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold"
                                    style={airtableTagStyle(tag) ?? undefined}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[11.5px] text-text-2">{item.detail}</p>
                              <p className="text-[10.5px] text-text-3">{item.extra}</p>
                              {queueState[key]?.kind === "error" && (
                                <p className="text-[11px] text-danger-text">{queueState[key]!.text}</p>
                              )}
                              {chatState?.key === key && chatState.kind === "error" && (
                                <p className="text-[11px] text-danger-text">{chatState.text}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <button
                                className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand-text transition-opacity hover:opacity-90 disabled:opacity-60"
                                disabled={generating || hopping}
                                title="La IA redacta el mensaje para este cliente, lo busca en el sistema y abre su chat con el borrador cargado"
                                onClick={() => void sendQueueMessage(play, item, idx)}
                              >
                                <Send size={11} />
                                {generating ? "Redactando…" : hopping ? "Buscando…" : "Mandar mensaje"}
                              </button>
                              {item.clientId && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                  title="Panel de control del cliente (Cliente 360°): métricas, campañas y gestión sugerida"
                                  onClick={() =>
                                    setPanelClient({
                                      id: item.clientId!,
                                      name: item.name,
                                      dni: item.dni ?? null,
                                      phone: item.phone ?? null,
                                      backendUrl: item.links?.[0]?.url ?? null,
                                    })
                                  }
                                >
                                  <LayoutDashboard size={11} />
                                  Panel 360
                                </button>
                              )}
                              {item.phone && (
                                <a
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                  href={`tel:${item.phone}`}
                                  title={`Llamar a ${item.phone}`}
                                >
                                  <Phone size={11} />
                                  Llamar
                                </a>
                              )}
                              {item.links?.[0] && (
                                <a
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 transition-colors hover:bg-accent"
                                  href={item.links[0].url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <Link2 size={11} />
                                  Ficha
                                </a>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {play.total > play.items.length && (
                      <footer className="border-t bg-subtle/30 px-3 py-1.5 text-[10.5px] text-text-3">
                        Mostrando {number(play.items.length)} de {number(play.total)} — los primeros son
                        los más urgentes.
                      </footer>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === "crm" && (
        <div className="space-y-3">
          <HelpZone help={MODULE_HELP.crm} id="crm" onAction={applyHelpAction} />

          {data.crm?.available && aiRow("crm")}

          {data.crm?.available && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-[3px]">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    data.crm.snapshotSource === "live" ? "bg-[#20C933]" : "bg-[#f2a71b]"
                  )}
                />
                {data.crm.snapshotSource === "live"
                  ? `CRM en vivo${
                      typeof data.crm.snapshotAgeMinutes === "number"
                        ? ` · sincronizado hace ${Math.max(data.crm.snapshotAgeMinutes, 0)} min`
                        : ""
                    }`
                  : "CRM · snapshot del archivo local"}
              </span>
              {data.crm.kpis.respondedRecently > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-[3px]">
                  <UserRoundCheck size={11} className="text-[#20C933]" />
                  {number(data.crm.kpis.respondedRecently)} contestaron el último mes
                </span>
              )}
              {data.crm.kpis.noReply > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-[3px]">
                  <Hourglass size={11} />
                  {number(data.crm.kpis.noReply)} sin respuesta a nuestros mensajes
                </span>
              )}
            </div>
          )}

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

              {data.crm.actions && data.crm.actions.sent > 0 && (
                <Section
                  title="Acciones desde el tablero"
                  subtitle="De la sugerencia a la acción: mensajes abiertos desde el tablero en los últimos 30 días y cuántos respondieron"
                >
                  <div className="space-y-1.5">
                    {data.crm.actions.byPlay.map((play) => {
                      const share = play.sent ? play.responded / play.sent : 0;
                      return (
                        <div
                          key={play.key}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-[12px]"
                        >
                          <span className="flex items-center gap-1.5">
                            <Send size={11} className="text-brand" />
                            {play.label}
                          </span>
                          <span className="text-text-3">
                            {number(play.sent)} {play.sent === 1 ? "mensaje" : "mensajes"} ·{" "}
                            {number(play.responded)}{" "}
                            {play.responded === 1 ? "respuesta" : "respuestas"} ({percent(share)})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10.5px] text-text-3">
                    Total 30 días: {number(data.crm.actions.sent)} acciones ·{" "}
                    {percent(data.crm.actions.rate)} respondidas.
                  </p>
                </Section>
              )}

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
                          <strong className="flex items-center gap-1.5 text-[12.5px]">
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                stage.kind === "won"
                                  ? "bg-[#20C933]"
                                  : stage.kind === "lost"
                                    ? "bg-[#F82B60]"
                                    : "bg-brand"
                              )}
                            />
                            <span className="truncate">{stage.name}</span>
                          </strong>
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
                            className={cn(
                              "h-full rounded-full",
                              stage.kind === "won"
                                ? "bg-[#20C933]"
                                : stage.kind === "lost"
                                  ? "bg-[#F82B60]"
                                  : "bg-brand"
                            )}
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
                      <AreaChart
                        data={data.crm.daily}
                        margin={{ top: 6, right: 10, left: -12, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="gradInbound" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART.series[0]} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={CHART.series[0]} stopOpacity={0.03} />
                          </linearGradient>
                          <linearGradient id="gradOutbound" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CHART.series[5]} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={CHART.series[5]} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke={CHART_GRID} strokeDasharray="4 4" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tick={{ ...CHART_TICK, fontSize: 10 }}
                          tickLine={false}
                          axisLine={{ stroke: CHART_GRID }}
                          tickFormatter={(value) =>
                            String(value).slice(5).replace("-", "/")
                          }
                        />
                        <YAxis
                          tick={{ ...CHART_TICK, fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={34}
                        />
                        <Tooltip
                          content={<ChartTip />}
                          cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
                        />
                        <Legend {...CHART_LEGEND} />
                        <Area
                          type="monotone"
                          dataKey="inbound"
                          name="Recibidos"
                          stroke={CHART.series[0]}
                          fill="url(#gradInbound)"
                          fillOpacity={1}
                          strokeWidth={2.2}
                          activeDot={{ r: 3.5 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="outbound"
                          name="Enviados"
                          stroke={CHART.series[5]}
                          fill="url(#gradOutbound)"
                          fillOpacity={1}
                          strokeWidth={2.2}
                          activeDot={{ r: 3.5 }}
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
                              <Badge icon={<Unlink size={11} />}>Sin vínculo</Badge>
                            ) : (
                              <>
                                <Badge
                                  tone={row.link === "sgsa" ? "success" : "accent"}
                                  icon={
                                    row.link === "sgsa" ? (
                                      <Link2 size={11} />
                                    ) : row.link === "telefono" ? (
                                      <Phone size={11} />
                                    ) : (
                                      <UserRound size={11} />
                                    )
                                  }
                                >
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

      {panelClient && (
        <ClientPanel
          customer={panelClient}
          onClose={() => setPanelClient(null)}
          onGoToConstructor={(c) => {
            setConstructorFijo(c);
            setPanelClient(null);
            setTab("constructor");
          }}
          onMandarMensaje={() => sendPanelMessage(panelClient)}
        />
      )}

      {/* 044b-B15 — baúl de análisis de IA (módulos y clientes). */}
      <InsightVault
        open={vaultOpen}
        onClose={() => setVaultOpen(false)}
        onReforward={reforwardFromVault}
      />

      {/* 045b-r3 — paneles de entidad: empleado / oficina / compañía / producto. */}
      {equipoDetalle && data?.team && (
        <EquipoPanel
          detalle={equipoDetalle}
          team={data.team}
          onNavigate={setEquipoDetalle}
          onClose={() => setEquipoDetalle(null)}
        />
      )}

      {catalogoDetalle && data?.catalog && (
        <CatalogoPanel
          detalle={catalogoDetalle}
          catalog={data.catalog}
          companies={data?.companies ?? []}
          currentProducts={data?.currentProducts ?? []}
          historicProducts={data?.historicProducts ?? []}
          onNavigate={setCatalogoDetalle}
          onClose={() => setCatalogoDetalle(null)}
        />
      )}
    </div>
    </div>
  );
}
