"use client";

/**
 * 041 — PANEL DE CONTROL del cliente (Cliente 360°).
 *
 * Primero: métricas y gráficas que potencian el entendimiento (prima por
 * producto, vencimientos, gestiones por mes, actividad WhatsApp).
 * Después: la gestión SUGERIDA según score + inteligencia (retención, venta
 * cruzada, renovación, reactivación…) con sus acciones, y el circuito de
 * PROPUESTAS: se arma la pieza (imagen + logo + compañía auspiciada + oferta
 * + beneficio + CTA), se DERIVA al empleado con prioridad (aviso al chat) y
 * se envía con el link público a un clic.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bell,
  CalendarClock,
  ClipboardCopy,
  ClipboardList,
  ExternalLink,
  FileText,
  History as HistoryIcon,
  Loader2,
  MessageCircle,
  PanelRightOpen,
  PauseCircle,
  Pencil,
  Phone,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PROPOSAL_KINDS,
  type ClientFichaDto,
  type ClientMonitoreoDto,
  type ClientPiezaRespuestaDto,
  type ClientPiezaVoucherDto,
  type ProposalDto,
  type ProposalPriority,
} from "@/lib/types";
import type { ClienteFijoWizard } from "./constructor-panel";
import {
  ProposalEditModal,
  ProposalHistoryModal,
  proposalLifecycle,
  type LifecycleAction,
} from "./proposal-actions";

export type PanelCustomer = {
  id: string;
  name: string;
  dni?: string | null;
  phone?: string | null;
  score?: number | null;
  recommendation?: string | null;
  recommendationWhy?: string | null;
  recommendationSteps?: string[];
  office?: string | null;
  backendUrl?: string | null;
};

type Props = {
  customer: PanelCustomer;
  onClose: () => void;
  /** Usa el flujo de IA del tablero para «Mandar mensaje» (devuelve el error, si hubo). */
  onMandarMensaje?: () => Promise<string | null> | void;
  /** 044b B9b — armar la publicación en EL Constructor (Marketing) con este cliente. */
  onGoToConstructor?: (cliente: ClienteFijoWizard) => void;
};

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n || 0);

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const names = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const idx = Number(mo) - 1;
  return `${names[idx] ?? mo} ${String(y).slice(2)}`;
};

const PIE_COLORS = ["#4f7cff", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#84cc16", "#f97316"];

function scoreTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return "border bg-subtle text-text-2";
  if (score >= 70) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
  if (score >= 40) return "border-amber-500/30 bg-amber-500/10 text-amber-600";
  return "border-rose-500/30 bg-rose-500/10 text-rose-600";
}

export function proposalStatusChip(p: Pick<ProposalDto, "status" | "respondedAt" | "views" | "sentAt">): {
  label: string;
  className: string;
} {
  if (p.respondedAt)
    return { label: "Respondió", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" };
  if (p.views > 0)
    return { label: "Vista", className: "border-sky-500/30 bg-sky-500/10 text-sky-600" };
  if (p.status === "enviada")
    return { label: "Enviada", className: "border-brand-soft bg-brand-tint text-brand-text" };
  if (p.status === "derivada")
    return { label: "Derivada", className: "border-amber-500/30 bg-amber-500/10 text-amber-600" };
  return { label: "Borrador", className: "border bg-subtle text-text-3" };
}

export function priorityChip(pr: ProposalPriority): { label: string; className: string } {
  if (pr === "alta")
    return { label: "Prioridad alta", className: "border-rose-500/30 bg-rose-500/10 text-rose-600" };
  if (pr === "baja")
    return { label: "Prioridad baja", className: "border bg-subtle text-text-3" };
  return { label: "Prioridad media", className: "border-amber-500/30 bg-amber-500/10 text-amber-600" };
}

export function kindTag(kind: string): { label: string; emoji: string } {
  const k = PROPOSAL_KINDS.find((x) => x.id === kind);
  return k ? { label: k.label, emoji: k.emoji } : { label: kind, emoji: "🎯" };
}

/** Tipo sugerido según score + inteligencia del tablero + estado real. */
export function suggestKind(customer: PanelCustomer, ficha: ClientFichaDto | null): string {
  const rec = `${customer.recommendation ?? ""} ${customer.recommendationWhy ?? ""}`.toLowerCase();
  if (/venta cruzada|ampliar|sumar|complement/.test(rec)) return "venta_cruzada";
  if (/fuga|retener|retenci|rescatar/.test(rec)) return "retencion";
  if (/reactiv|recuperar|volver/.test(rec)) return "reactivacion";
  if (/renov|vence|vencimiento/.test(rec)) return "renovacion";
  if (/sano|fiel|saludable/.test(rec)) return "fidelizacion";
  const activas = ficha?.polizas.activas ?? 0;
  if ((ficha?.polizas.vence7 ?? 0) > 0) return "renovacion";
  if (activas === 0) return "reactivacion";
  if (activas === 1) return "venta_cruzada";
  return "retencion";
}

export function ClientPanel({ customer, onClose, onMandarMensaje, onGoToConstructor }: Props) {
  const [ficha, setFicha] = useState<ClientFichaDto | null>(null);
  const [loadingFicha, setLoadingFicha] = useState(true);
  const [fichaError, setFichaError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadFicha = useCallback(
    async (refresh = false) => {
      setLoadingFicha(true);
      setFichaError(null);
      try {
        const res = await fetch(
          `/api/clients/ficha?recordId=${encodeURIComponent(customer.id)}${refresh ? "&refresh=1" : ""}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ficha?: ClientFichaDto;
          message?: string;
        };
        if (!res.ok || !data.ficha) {
          setFichaError(data.message ?? "No se pudo cargar la ficha del cliente");
        } else {
          setFicha(data.ficha);
        }
      } catch {
        setFichaError("No se pudo cargar la ficha del cliente");
      } finally {
        setLoadingFicha(false);
      }
    },
    [customer.id]
  );

  useEffect(() => {
    void loadFicha();
  }, [loadFicha]);

  const kindDefault = useMemo(() => suggestKind(customer, ficha), [customer, ficha]);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-3 backdrop-blur-[2px] sm:p-6">
      <div className="my-2 w-full max-w-[1080px] overflow-hidden rounded-2xl border bg-card shadow-2xl">
        {/* Encabezado */}
        <header className="flex flex-wrap items-center gap-3 border-b bg-subtle/40 px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[16px] font-bold text-brand-text">
            {customer.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[16px] font-bold">{customer.name}</h2>
              {ficha?.estado && (
                <span className="rounded-full border bg-subtle px-2 py-0.5 text-[11px] font-semibold text-text-2">
                  {ficha.estado}
                </span>
              )}
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums ${scoreTone(customer.score)}`}>
                score {customer.score ?? "—"}
              </span>
            </div>
            <p className="truncate text-[12px] text-text-3">
              {[
                ficha?.dni ? `DNI ${ficha.dni}` : null,
                ficha?.oficina ? `Oficina ${ficha.oficina}` : customer.office,
                ficha?.idUnico ? ficha.idUnico : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadFicha(true)}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-subtle"
              title="Actualizar datos"
            >
              <RefreshCw size={13} className={loadingFicha ? "animate-spin" : ""} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border bg-card p-1.5 text-text-3 transition-colors hover:bg-subtle hover:text-text-1"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {loadingFicha && !ficha ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-[13px] text-text-3">
            <Loader2 size={16} className="animate-spin" /> Armando el panel de {customer.name.split(" ")[0]}…
          </div>
        ) : fichaError && !ficha ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <p className="text-[13.5px] font-semibold text-text-1">{fichaError}</p>
            <button
              type="button"
              onClick={() => void loadFicha(true)}
              className="rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
            >
              Reintentar
            </button>
          </div>
        ) : ficha ? (
          <PanelBody
            customer={customer}
            ficha={ficha}
            kindDefault={kindDefault}
            onMandarMensaje={onMandarMensaje}
            onGoToConstructor={onGoToConstructor}
            onFichaChange={(f) => setFicha(f)}
            copied={copied}
            setCopied={setCopied}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function KpiChip({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "border bg-card text-text-1",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    bad: "border-rose-500/30 bg-rose-500/10 text-rose-700",
  };
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <span className="text-text-3">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold tracking-wide text-text-3 uppercase">{label}</p>
        <p className="truncate text-[13px] font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function SectionTitle({ icon, children, extra }: { icon: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-text-2 uppercase">
        {icon}
        {children}
      </h3>
      {extra}
    </div>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="mb-1 text-[11.5px] font-bold text-text-2">{title}</p>
      <div className="h-[170px]">
        {empty ? (
          <div className="flex h-full items-center justify-center text-[11.5px] text-text-3">Sin datos todavía</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* 044b-B14 — pestañas del dashboard individual del cliente. */
const TABS_CLIENTE = [
  { id: "resumen", label: "Resumen", icon: <TrendingUp size={13} /> },
  { id: "monitoreo", label: "Monitoreo", icon: <Bell size={13} /> },
  { id: "piezas", label: "Piezas y ventas", icon: <FileText size={13} /> },
  { id: "historial", label: "Historial", icon: <HistoryIcon size={13} /> },
] as const;

function PanelBody({
  customer,
  ficha,
  kindDefault,
  onMandarMensaje,
  onGoToConstructor,
  onFichaChange,
  copied,
  setCopied,
}: {
  customer: PanelCustomer;
  ficha: ClientFichaDto;
  kindDefault: string;
  onMandarMensaje?: () => Promise<string | null> | void;
  onGoToConstructor?: (cliente: ClienteFijoWizard) => void;
  onFichaChange: (f: ClientFichaDto) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const [iaBusy, setIaBusy] = useState(false);
  const [iaError, setIaError] = useState("");
  // 041e — quién soy (para los permisos de la lista) y modales de gestión.
  const [viewerRole, setViewerRole] = useState("member");
  const [editing, setEditing] = useState<ProposalDto | null>(null);
  const [historyFor, setHistoryFor] = useState<ProposalDto | null>(null);
  /* 044b-B14 — pestañas del dashboard individual del cliente. */
  const [tab, setTab] = useState<"resumen" | "monitoreo" | "piezas" | "historial">(
    "resumen"
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return;
      const data = (await res.json().catch(() => ({}))) as { viewer?: { role?: string } };
      if (data.viewer?.role) setViewerRole(data.viewer.role);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshFicha = async () => {
    const res = await fetch(
      `/api/clients/ficha?recordId=${encodeURIComponent(customer.id)}&refresh=1`,
      { cache: "no-store" }
    ).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as { ficha?: ClientFichaDto })
      : null;
    if (data?.ficha) onFichaChange(data.ficha);
  };

  const handleLifecycle = async (p: ProposalDto, action: LifecycleAction) => {
    if (
      action === "delete" &&
      !window.confirm(`¿Eliminar «${p.title}»? No se puede deshacer.`)
    ) {
      return;
    }

    const r = await proposalLifecycle(p.id, action);

    if (!r.ok) {
      window.alert(r.message ?? "No se pudo completar la acción");
      return;
    }

    await refreshFicha();
  };

  const wa = ficha.whatsapp;
  const gestiones12m = ficha.gestionesByMonth.reduce((a, m) => a + m.total, 0);
  const siniestros12m = ficha.gestionesByMonth.reduce((a, m) => a + m.siniestros, 0);
  const tipoSugerido = kindTag(kindDefault);

  const copyLink = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* sin clipboard: no rompemos nada */
    }
  };

  return (
    <div className="max-h-[calc(92vh-70px)] overflow-y-auto px-5 py-4">
      {/* 044b-B14 — pestañas: Resumen · Monitoreo · Piezas y ventas · Historial */}
      <div className="sticky top-0 z-20 -mx-5 -mt-4 mb-5 border-b bg-card/95 px-5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1 py-2">
          {TABS_CLIENTE.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                tab === option.id
                  ? "border-brand bg-brand text-white"
                  : "bg-card text-text-2 hover:bg-subtle"
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" && (
      <div className="space-y-5">
      {/* 1 · Métricas */}
      <section>
        <SectionTitle icon={<TrendingUp size={13} />}>Métricas del cliente</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <KpiChip icon={<FileText size={15} />} label="Pólizas activas" value={String(ficha.polizas.activas)} tone={ficha.polizas.activas > 0 ? "good" : "bad"} />
          <KpiChip icon={<TrendingUp size={15} />} label="Prima activa" value={money(ficha.premiumActiva)} />
          <KpiChip icon={<Archive size={15} />} label="Pólizas en sistema" value={String(ficha.polizas.total)} />
          <KpiChip icon={<Archive size={15} />} label="Anulaciones" value={String(ficha.polizas.anuladas)} tone={ficha.polizas.anuladas > 0 ? "warn" : "default"} />
          <KpiChip icon={<Archive size={15} />} label="Siniestros 12m" value={String(siniestros12m)} />
          <KpiChip icon={<CalendarClock size={15} />} label="Vencen ≤7 días" value={String(ficha.polizas.vence7)} tone={ficha.polizas.vence7 > 0 ? "bad" : "default"} />
          <KpiChip icon={<Target size={15} />} label="Gestiones 12m" value={String(gestiones12m)} />
          <KpiChip
            icon={<MessageCircle size={15} />}
            label="WhatsApp 30d"
            value={wa ? `${wa.messages30.inbound}↓ ${wa.messages30.outbound}↑` : "sin vínculo"}
            tone={wa?.lastInboundAt ? "good" : "default"}
          />
        </div>
      </section>

      {/* 2 · Gráficas */}
      <section>
        <SectionTitle icon={<PanelRightOpen size={13} />}>Entendimiento en gráficas</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <ChartCard title="Prima activa por producto" empty={ficha.premiumByProduct.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={ficha.premiumByProduct}
                  dataKey="prima"
                  nameKey="nombre"
                  innerRadius={34}
                  outerRadius={62}
                  paddingAngle={2}
                >
                  {ficha.premiumByProduct.map((s, i) => (
                    <Cell
                      key={s.productId ?? `${s.nombre}-${i}`}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: unknown, _n: unknown, item: unknown) => [
                    money(Number(v)),
                    ((item as { payload?: { nombre?: string } })?.payload?.nombre ?? ""),
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Vencimientos próximos 12 meses" empty={ficha.expirationsByMonth.every((m) => m.count === 0)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ficha.expirationsByMonth} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: unknown) => [String(v), "pólizas"]}
                  labelFormatter={(l: unknown) => monthLabel(String(l))}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Bar dataKey="count" fill="#4f7cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Gestiones por mes (12m)" empty={ficha.gestionesByMonth.every((m) => m.total === 0)}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ficha.gestionesByMonth} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l: unknown) => monthLabel(String(l))}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Bar dataKey="altas" stackId="g" fill="#22c55e" name="Altas" />
                <Bar dataKey="cotizaciones" stackId="g" fill="#4f7cff" name="Cotizaciones" />
                <Bar dataKey="anulaciones" stackId="g" fill="#ef4444" name="Anulaciones" />
                <Bar dataKey="siniestros" stackId="g" fill="#f59e0b" name="Siniestros" />
                <Bar dataKey="otros" stackId="g" fill="#94a3b8" name="Otras" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>
      </div>
      )}

      {tab === "monitoreo" && <MonitoreoDelCliente customer={customer} dni={ficha.dni} />}

      {tab === "piezas" && (
      <div className="space-y-5">
      {/* 3 · Gestión sugerida */}
      <section className="rounded-xl border bg-subtle/40 p-4">
        <SectionTitle
          icon={<Sparkles size={13} />}
          extra={
            <span className="flex items-center gap-1 rounded-full border border-brand-soft bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand-text">
              {tipoSugerido.emoji} {tipoSugerido.label}
            </span>
          }
        >
          Gestión sugerida
        </SectionTitle>
        <p className="text-[13.5px] font-semibold text-text-1">
          {customer.recommendation ?? "Sin sugerencia del motor todavía"}
        </p>
        {customer.recommendationWhy && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-2">{customer.recommendationWhy}</p>
        )}
        {(customer.recommendationSteps?.length ?? 0) > 0 && (
          <ol className="mt-2 space-y-1 pl-1">
            {customer.recommendationSteps!.slice(0, 5).map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-text-2">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[10px] font-bold text-brand-text">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onGoToConstructor && (
            <button
              type="button"
              onClick={() =>
                onGoToConstructor({
                  recordId: customer.id,
                  nombre: customer.name,
                  apellido: null,
                  dni: ficha.dni ?? customer.dni ?? null,
                  telefono: ficha.telefono ?? customer.phone ?? null,
                })
              }
              title="Abre el Constructor de publicidad con este cliente cargado"
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
            >
              <Target size={14} /> Armar publicación
            </button>
          )}
          {onMandarMensaje && (
            <button
              type="button"
              disabled={iaBusy}
              onClick={async () => {
                setIaBusy(true);
                setIaError("");
                const r = await Promise.resolve(onMandarMensaje());
                if (typeof r === "string" && r) setIaError(r);
                setIaBusy(false);
              }}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:bg-subtle disabled:opacity-60"
            >
              {iaBusy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              {iaBusy ? "Redactando…" : "Mandar mensaje (IA)"}
            </button>
          )}
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 transition-colors hover:bg-subtle"
            >
              <Phone size={14} /> Llamar
            </a>
          )}
        </div>
        {iaError && (
          <p className="mt-2 text-[12px] font-semibold text-rose-600">{iaError}</p>
        )}

      </section>

      {/* 4 · Propuestas del cliente */}
      <section>
        <SectionTitle
          icon={<FileText size={13} />}
          extra={copied ? <span className="text-[11px] font-semibold text-emerald-600">Link copiado ✓</span> : undefined}
        >
          Propuestas comerciales del cliente
          {ficha.proposals.length > 0 && (
            <span className="ml-1 rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-semibold text-text-3">
              {ficha.proposals.length}
            </span>
          )}
        </SectionTitle>
        {ficha.proposals.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-4 py-5 text-center text-[12.5px] text-text-3">
            Todavía no hay propuestas para {customer.name.split(" ")[0]} — creá la primera desde la gestión sugerida.
          </p>
        ) : (
          <div className="space-y-2">
            {ficha.proposals.map((p) => (
              <ProposalRow
                key={p.id}
                proposal={p}
                viewerRole={viewerRole}
                onCopy={(url) => void copyLink(url)}
                onOpen={() => window.open(p.publicUrl, "_blank", "noopener")}
                onLifecycle={(prop, action) => void handleLifecycle(prop, action)}
                onEdit={(prop) => setEditing(prop)}
                onHistory={(prop) => setHistoryFor(prop)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 044b-B13 — el dashboard individual: respuestas y vouchers */}
      <section>
        <SectionTitle icon={<ClipboardList size={13} />}>
          Respuestas y vouchers del cliente
        </SectionTitle>
        <PiezasDelCliente customer={customer} />
      </section>
      </div>
      )}

      {tab === "historial" && (
      <div className="space-y-5">
      {/* 5 · Historial de gestiones */}
      <section>
        <SectionTitle icon={<Archive size={13} />}>
          Historial de gestiones
          {ficha.gestiones.length > 0 && (
            <span className="ml-1 rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-semibold text-text-3">
              últimas {Math.min(ficha.gestiones.length, 12)}
            </span>
          )}
        </SectionTitle>
        {ficha.gestiones.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-4 py-4 text-center text-[12.5px] text-text-3">
            Sin gestiones registradas en el sistema.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-subtle/60 text-[10.5px] font-bold tracking-wide text-text-3 uppercase">
                <tr>
                  <th className="px-3 py-1.5">Fecha</th>
                  <th className="px-3 py-1.5">Motivo</th>
                  <th className="px-3 py-1.5">Estado</th>
                  <th className="px-3 py-1.5 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {ficha.gestiones.slice(0, 12).map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="px-3 py-1.5 text-text-2 tabular-nums">{g.fecha ?? "—"}</td>
                    <td className="px-3 py-1.5 font-semibold text-text-1">{g.motivo ?? g.tipoSolicitud ?? "—"}</td>
                    <td className="px-3 py-1.5 text-text-2">{g.estado ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-text-2">
                      {g.importe !== null ? money(g.importe) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Whatsapp detalle */}
      {wa && (
        <section className="rounded-xl border bg-card px-4 py-3">
          <SectionTitle icon={<MessageCircle size={13} />}>Contactabilidad WhatsApp</SectionTitle>
          <p className="text-[12.5px] text-text-2">
            {wa.assigneeName ? `Atiende ${wa.assigneeName}. ` : ""}
            Último mensaje entrante:{" "}
            <span className="font-semibold text-text-1">
              {wa.lastInboundAt ? new Date(wa.lastInboundAt).toLocaleDateString("es-AR") : "nunca"}
            </span>
            {wa.lastInboundAt && Date.now() - new Date(wa.lastInboundAt).getTime() < 30 * 86400_000
              ? " · responde (suma al score) ✓"
              : ""}
          </p>
        </section>
      )}
      </div>
      )}

      {/* 041e — editar / historial de una gestión */}
      {editing && (
        <ProposalEditModal
          proposal={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            onFichaChange({
              ...ficha,
              proposals: ficha.proposals.map((pp) =>
                pp.id === updated.id ? updated : pp
              ),
            });
            setEditing(null);
          }}
        />
      )}
      {historyFor && (
        <ProposalHistoryModal
          proposal={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}

    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 044b-B13 — DASHBOARD INDIVIDUAL: lo que este cliente respondió en las
 * piezas del Constructor (formularios y encuestas) y los vouchers que tiene
 * emitidos. Misma vista para todos los accesos: ficha, cola, retención,
 * reactivación y venta cruzada — «misma información, dos puertas de entrada».
 */
function PiezasDelCliente({ customer }: { customer: PanelCustomer }) {
  const [respuestas, setRespuestas] = useState<ClientPiezaRespuestaDto[] | null>(null);
  const [vouchers, setVouchers] = useState<ClientPiezaVoucherDto[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const params = new URLSearchParams({ ref: customer.id });
      if (customer.name) params.set("name", customer.name);
      if (customer.phone) params.set("phone", customer.phone);
      const res = await fetch(`/api/clients/piezas?${params.toString()}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!alive) return;
      if (!res?.ok) {
        setRespuestas([]);
        setVouchers([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        respuestas?: ClientPiezaRespuestaDto[];
        vouchers?: ClientPiezaVoucherDto[];
      };
      setRespuestas(data.respuestas ?? []);
      setVouchers(data.vouchers ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [customer.id, customer.name, customer.phone]);

  const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR");

  if (respuestas === null || vouchers === null) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-4 text-[12.5px] text-text-3">
        <Loader2 size={14} className="animate-spin" /> Buscando respuestas y vouchers…
      </p>
    );
  }

  const total = respuestas.length + vouchers.length;
  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card px-4 py-4 text-center text-[12.5px] text-text-3">
        Todavía no hay respuestas ni vouchers de {customer.name.split(" ")[0]} — cuando
        complete un formulario o encuesta que le mandes (o use un cupón), aparece acá.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Respuestas */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
          📝 Respuestas {respuestas.length > 0 && `(${respuestas.length})`}
        </p>
        {respuestas.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-3 py-3 text-[12px] text-text-3">
            Sin respuestas todavía.
          </p>
        ) : (
          respuestas.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[12px] font-bold text-text-1">
                  {r.proposalKind === "survey" || r.kind === "survey" ? "📊" : "📝"}{" "}
                  {r.proposalTitle}
                </p>
                <span className="text-[10.5px] text-text-3">{fecha(r.createdAt)}</span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {r.data.slice(0, 8).map((f, i) => (
                  <li key={i} className="text-[11.5px] text-text-2">
                    <span className="font-semibold text-text-3">{f.label}:</span>{" "}
                    {f.value || "—"}
                  </li>
                ))}
              </ul>
              {r.proposalToken && (
                <a
                  href={`/p/${r.proposalToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  <ExternalLink size={10} /> Ver la pieza
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {/* Vouchers */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
          🎟️ Vouchers {vouchers.length > 0 && `(${vouchers.length})`}
        </p>
        {vouchers.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-3 py-3 text-[12px] text-text-3">
            Sin vouchers emitidos todavía.
          </p>
        ) : (
          vouchers.map((v) => (
            <div key={v.id} className="rounded-xl border bg-card px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="font-mono text-[13px] font-bold tracking-wide text-text-1">
                  {v.token}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                    v.status === "canjeado"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700"
                  }`}
                >
                  {v.status === "canjeado"
                    ? `Canjeado${v.redeemedAt ? ` el ${fecha(v.redeemedAt)}` : ""}`
                    : "Emitido (sin canjear)"}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-text-2">
                🎁 {v.proposalTitle}
                {v.issuedToName ? ` · para ${v.issuedToName}` : ""} · emitido el{" "}
                {fecha(v.createdAt)}
              </p>
              {v.proposalToken && (
                <a
                  href={`/p/${v.proposalToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  <ExternalLink size={10} /> Ver el cupón
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 044b-B14 — MONITOREO del cliente: lo que el sistema de gestión (SGSA) dejó
 * en Airtable para este cliente — alertas y calificaciones — con sus gráficos.
 * Misma vista en cualquier puerta de entrada al cliente.
 */
function MonitoreoDelCliente({ customer, dni }: { customer: PanelCustomer; dni?: string | null }) {
  const [data, setData] = useState<ClientMonitoreoDto | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      const params = new URLSearchParams({ recordId: customer.id });
      if (customer.name) params.set("name", customer.name);
      if (dni) params.set("dni", dni);
      const res = await fetch(`/api/clients/monitoreo?${params.toString()}`, {
        cache: "no-store",
      }).catch(() => null);
      if (!alive) return;
      if (!res?.ok) {
        const body = res
          ? ((await res.json().catch(() => ({}))) as { message?: string })
          : null;
        setError(body?.message ?? "No se pudo leer el monitoreo del cliente.");
        setLoading(false);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        monitoreo?: ClientMonitoreoDto;
      };
      setData(
        body.monitoreo ?? {
          alertas: [],
          calificaciones: [],
          generatedAt: new Date().toISOString(),
        }
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [customer.id, customer.name, dni, refreshKey]);

  const alertas = useMemo(() => data?.alertas ?? [], [data]);
  const calificaciones = useMemo(() => data?.calificaciones ?? [], [data]);

  const alertasPorMes = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-AR", { month: "short" }),
        count: 0,
      });
    }
    for (const a of alertas) {
      const iso = a.createdAt;
      if (!iso) continue;
      const m = months.find((mm) => mm.key === iso.slice(0, 7));
      if (m) m.count += 1;
    }
    return months;
  }, [alertas]);

  const alertasPorEstado = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of alertas) {
      const estado = a.estado ?? "SIN ESTADO";
      map.set(estado, (map.get(estado) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([estado, count]) => ({
        estado:
          estado === "SIN ESTADO"
            ? "Sin estado"
            : estado.charAt(0).toUpperCase() +
              estado.slice(1).toLowerCase().replace(/_/g, " "),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [alertas]);

  const estrellas = useMemo(() => {
    const hist = [5, 4, 3, 2, 1].map((n) => ({ n: `${n}★`, count: 0 }));
    let sum = 0;
    let total = 0;
    for (const c of calificaciones) {
      const e = Math.round(c.estrellas);
      if (e >= 1 && e <= 5) {
        const bucket = hist[5 - e];
        if (bucket) bucket.count += 1;
        sum += e;
        total += 1;
      }
    }
    return { hist, promedio: total > 0 ? (sum / total).toFixed(1) : null, total };
  }, [calificaciones]);

  const pendientes = alertas.filter(
    (a) => a.estado === "PENDIENTE" || a.estado === "EN_PROGRESO"
  ).length;
  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-AR") : "—";
  const primer = customer.name.split(" ")[0];

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-5 text-[12.5px] text-text-3">
        <Loader2 size={14} className="animate-spin" /> Buscando alertas y calificaciones de{" "}
        {primer} en SGSA…
      </p>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-6 text-center">
        <p className="text-[12.5px] font-semibold text-text-2">{error}</p>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <section>
        <SectionTitle
          icon={<Bell size={13} />}
          extra={
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              title="Volver a leer las alertas y calificaciones de SGSA"
              className="flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-text-2 transition-colors hover:bg-subtle"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Actualizar
            </button>
          }
        >
          Monitoreo de {primer} — alertas y calificaciones
        </SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KpiChip icon={<Bell size={15} />} label="Alertas SGSA" value={String(alertas.length)} />
          <KpiChip
            icon={<Bell size={15} />}
            label="Pendientes"
            value={String(pendientes)}
            tone={pendientes > 0 ? "warn" : "default"}
          />
          <KpiChip icon={<Star size={15} />} label="Calificaciones" value={String(calificaciones.length)} />
          <KpiChip
            icon={<Star size={15} />}
            label="Promedio"
            value={estrellas.promedio ? `${estrellas.promedio} / 5` : "sin datos"}
            tone={
              estrellas.promedio
                ? Number(estrellas.promedio) < 3
                  ? "bad"
                  : "good"
                : "default"
            }
          />
        </div>
      </section>

      {/* Gráficas */}
      <section>
        <SectionTitle icon={<PanelRightOpen size={13} />}>Monitoreo en gráficas</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-3">
          <ChartCard title="Alertas por mes (6m)" empty={alertas.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertasPorMes} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: unknown) => [String(v), "alertas"]}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Alertas por estado" empty={alertas.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertasPorEstado} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="estado" tick={{ fontSize: 9 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: unknown) => [String(v), "alertas"]}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Bar dataKey="count" fill="#4f7cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Calificaciones (estrellas)" empty={calificaciones.length === 0}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={estrellas.hist}
                layout="vertical"
                margin={{ top: 6, right: 12, left: -6, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="n" tick={{ fontSize: 10 }} width={30} />
                <Tooltip
                  formatter={(v: unknown) => [String(v), "clientes"]}
                  contentStyle={{ fontSize: 12, borderRadius: 10 }}
                />
                <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </section>

      {/* Listas */}
      <section>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
              🔔 Alertas del sistema {alertas.length > 0 && `(${alertas.length})`}
            </p>
            {alertas.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card px-3 py-4 text-center text-[12px] text-text-3">
                SGSA no registra alertas para {primer}.
              </p>
            ) : (
              alertas.map((a) => (
                <div key={a.id} className="rounded-xl border bg-card px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-[12px] font-bold text-text-1">{a.titulo}</p>
                    <span className="text-[10.5px] text-text-3">{fecha(a.createdAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.estado && (
                      <span className="rounded-full border bg-subtle px-2 py-0.5 text-[10px] font-bold text-text-2">
                        {a.estado.replace(/_/g, " ")}
                      </span>
                    )}
                    {a.prioridad && (
                      <span className="rounded-full border bg-subtle px-2 py-0.5 text-[10px] font-semibold text-text-2">
                        {a.prioridad}
                      </span>
                    )}
                    {a.tipo && (
                      <span className="text-[10px] text-text-3">{a.tipo.replace(/_/g, " ")}</span>
                    )}
                  </div>
                  {a.detalle && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11.5px] leading-relaxed text-text-2">
                      {a.detalle}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
              ⭐ Calificaciones recibidas {calificaciones.length > 0 && `(${calificaciones.length})`}
            </p>
            {calificaciones.length === 0 ? (
              <p className="rounded-xl border border-dashed bg-card px-3 py-4 text-center text-[12px] text-text-3">
                Todavía no hay calificaciones de {primer} en SGSA.
              </p>
            ) : (
              calificaciones.map((c) => (
                <div key={c.id} className="rounded-xl border bg-card px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-[13px] font-bold text-amber-500">
                      {"★".repeat(Math.max(0, Math.min(5, Math.round(c.estrellas))))}
                      <span className="text-text-3">
                        {"☆".repeat(Math.max(0, 5 - Math.round(c.estrellas)))}
                      </span>
                      <span className="ml-1 text-[10.5px] font-semibold text-text-3">
                        {c.estrellas}/5
                      </span>
                    </p>
                    <span className="text-[10.5px] text-text-3">{fecha(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-3">
                    {c.servicio ?? "Atención"}
                    {c.urgencia ? ` · ${c.urgencia}` : ""}
                  </p>
                  {c.comentario && (
                    <p className="mt-1 text-[11.5px] italic leading-relaxed text-text-2">
                      “{c.comentario}”
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <p className="text-[10.5px] text-text-3">
        Datos de SGSA (Airtable) leídos en vivo con el permiso del sistema · el monitor se
        actualiza solo cada 5 minutos.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProposalRow({
  proposal,
  viewerRole,
  onCopy,
  onOpen,
  onLifecycle,
  onEdit,
  onHistory,
}: {
  proposal: ProposalDto;
  viewerRole: string;
  onCopy: (url: string) => void;
  onOpen: () => void;
  onLifecycle: (p: ProposalDto, action: LifecycleAction) => void;
  onEdit: (p: ProposalDto) => void;
  onHistory: (p: ProposalDto) => void;
}) {
  const st = proposalStatusChip(proposal);
  const pr = priorityChip(proposal.priority);
  const k = kindTag(proposal.kind);
  // 041e — quién puede qué: eliminar solo dueño/propietario; archivar y
  // pausar el gerente para arriba; editar todos.
  const canManage = viewerRole === "owner" || viewerRole === "admin" || viewerRole === "manager";
  const canDelete = viewerRole === "owner" || viewerRole === "admin";
  const actionBtn =
    "rounded-lg border bg-card p-1.5 text-text-3 transition-colors hover:bg-subtle hover:text-text-1";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
      <span className="text-[15px]">{k.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-bold text-text-1">{proposal.title}</p>
        <p className="truncate text-[11px] text-text-3">
          {k.label}
          {proposal.assigneeName ? ` · ${proposal.assigneeName}` : ""} ·{" "}
          {new Date(proposal.createdAt).toLocaleDateString("es-AR")}
          {proposal.views > 0 ? ` · ${proposal.views} vista${proposal.views === 1 ? "" : "s"}` : ""}
          {proposal.status === "enviada" ? (proposal.online ? " · online" : " · pausada") : ""}
        </p>
      </div>
      {proposal.archivedAt && (
        <span className="rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-bold text-text-3">
          Archivada
        </span>
      )}
      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${st.className}`}>{st.label}</span>
      {proposal.status !== "borrador" && (
        <span className={`hidden rounded-full border px-2 py-0.5 text-[10.5px] font-semibold sm:inline ${pr.className}`}>
          {pr.label.replace("Prioridad ", "")}
        </span>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(proposal)}
          className={actionBtn}
          title="Editar los textos (queda registrado quién)"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => onHistory(proposal)}
          className={actionBtn}
          title="Historial: quién la creó, editó, envió…"
        >
          <HistoryIcon size={13} />
        </button>
        {canManage && (
          <>
            <button
              type="button"
              onClick={() => onLifecycle(proposal, proposal.archivedAt ? "restore" : "archive")}
              className={actionBtn}
              title={proposal.archivedAt ? "Sacar del archivo" : "Archivar (gerente y arriba)"}
            >
              {proposal.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
            <button
              type="button"
              onClick={() => onLifecycle(proposal, proposal.online ? "offline" : "online")}
              className={actionBtn}
              title={proposal.online ? "Pausar la publicidad (offline)" : "Volver a ponerla online"}
            >
              {proposal.online ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
            </button>
          </>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onLifecycle(proposal, "delete")}
            className="rounded-lg border bg-card p-1.5 text-rose-500 transition-colors hover:bg-rose-50"
            title="Eliminar (solo dueño/propietario)"
          >
            <Trash2 size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className={actionBtn}
          title="Abrir página pública"
        >
          <ExternalLink size={13} />
        </button>
        <button
          type="button"
          onClick={() => onCopy(proposal.publicUrl)}
          className={actionBtn}
          title="Copiar link"
        >
          <ClipboardCopy size={13} />
        </button>
      </div>
    </div>
  );
}


