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
  Building2,
  CalendarClock,
  ClipboardCopy,
  ExternalLink,
  FileText,
  FolderOpen,
  History as HistoryIcon,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  MessageCircle,
  PanelRightOpen,
  PauseCircle,
  Pencil,
  Phone,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  Wand2,
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
  type ProposalDto,
  type ProposalPriority,
  type ProposalTemplateDto,
  type TeamGroupLiteDto,
  type TeamMemberLiteDto,
} from "@/lib/types";
import {
  ANGLES,
  ANGLE_IDS,
  TONES,
  TONE_IDS,
  type ProposalAngleId,
  type ProposalToneId,
} from "@/lib/proposals/copy";
import { LibraryPanel } from "./library-panel";
import { LibraryPicker, type PickerAsset } from "./library-picker";
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
  /** Navega al inbox con el borrador cargado (como «Mandar mensaje»). */
  onOpenInbox: (input: {
    contactId: string | null;
    draft: string;
    /** 041b — imagen de la publicación para dejar adjunta en el chat. */
    attach?: string | null;
  }) => void;
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

export function ClientPanel({ customer, onClose, onMandarMensaje, onOpenInbox }: Props) {
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
            onOpenInbox={onOpenInbox}
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

function PanelBody({
  customer,
  ficha,
  kindDefault,
  onMandarMensaje,
  onOpenInbox,
  onFichaChange,
  copied,
  setCopied,
}: {
  customer: PanelCustomer;
  ficha: ClientFichaDto;
  kindDefault: string;
  onMandarMensaje?: () => Promise<string | null> | void;
  onOpenInbox: (input: {
    contactId: string | null;
    draft: string;
    /** 041b — imagen de la publicación para dejar adjunta en el chat. */
    attach?: string | null;
  }) => void;
  onFichaChange: (f: ClientFichaDto) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
}) {
  const [proposalFlow, setProposalFlow] = useState(false);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaError, setIaError] = useState("");
  // 041e — quién soy (para los permisos de la lista) y modales de gestión.
  const [viewerRole, setViewerRole] = useState("member");
  const [editing, setEditing] = useState<ProposalDto | null>(null);
  const [historyFor, setHistoryFor] = useState<ProposalDto | null>(null);

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
    <div className="max-h-[calc(92vh-70px)] space-y-5 overflow-y-auto px-5 py-4">
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
          <button
            type="button"
            onClick={() => setProposalFlow((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <Target size={14} /> {proposalFlow ? "Cerrar propuesta" : "Crear propuesta comercial"}
          </button>
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

        {proposalFlow && (
          <ProposalFlow
            customer={customer}
            ficha={ficha}
            kindDefault={kindDefault}
            onOpenInbox={onOpenInbox}
            onProposalChange={() => void 0}
            onRefreshFicha={async () => {
              const res = await fetch(`/api/clients/ficha?recordId=${encodeURIComponent(customer.id)}&refresh=1`, {
                cache: "no-store",
              }).catch(() => null);
              const data = res ? ((await res.json().catch(() => ({}))) as { ficha?: ClientFichaDto }) : null;
              if (data?.ficha) onFichaChange(data.ficha);
            }}
          />
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

      {/* 4b · 041d — Contenedor universal de archivos (imágenes y videos) */}
      <LibraryPanel />

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

/* ------------------------------------------------------------------ */
/* Flujo de propuesta: crear → derivar → enviar                        */

function ProposalFlow({
  customer,
  ficha,
  kindDefault,
  onOpenInbox,
  onProposalChange,
  onRefreshFicha,
}: {
  customer: PanelCustomer;
  ficha: ClientFichaDto;
  kindDefault: string;
  onOpenInbox: (input: {
    contactId: string | null;
    draft: string;
    /** 041b — imagen de la publicación para dejar adjunta en el chat. */
    attach?: string | null;
  }) => void;
  onProposalChange: () => void;
  onRefreshFicha: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<ProposalTemplateDto[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [directory, setDirectory] = useState<TeamMemberLiteDto[] | null>(null);

  const [kind, setKind] = useState(kindDefault);
  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    body: "",
    productName: "",
    offer: "",
    benefit: "",
    ctaLabel: "",
    ctaUrl: "",
    ctaKind: "link" as "link" | "pdf",
    companyRef: "",
    assetId: null as string | null,
    logoAssetId: null as string | null,
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "derive" | "send">(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ProposalDto | null>(null);
  const [deriveOpen, setDeriveOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<ProposalPriority>("media");
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<{ derived?: string; sent?: boolean }>({});
  const [groups, setGroups] = useState<TeamGroupLiteDto[]>([]);
  const [viewerRole, setViewerRole] = useState<string>("member");
  // 042 — por defecto deriva a la IA: atiende primero; después se reasigna.
  const [targetKind, setTargetKind] = useState<"ia" | "employee" | "group">("ia");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  // 041c — asistente de redacción: tono + concepto de venta.
  const [tone, setTone] = useState<ProposalToneId>("cercana");
  const [angle, setAngle] = useState<ProposalAngleId | null>("beneficio");
  const [aiInstructions, setAiInstructions] = useState("");
  const [aiBusy, setAiBusy] = useState<null | "pieza" | "mensaje">(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [prevForm, setPrevForm] = useState<typeof form | null>(null);
  const [msgTone, setMsgTone] = useState<ProposalToneId>("cercana");
  // 041d — elegir la imagen desde el contenedor universal.
  // 042 — "media": el carrusel de fotos + video de la publicidad.
  const [pickerTarget, setPickerTarget] = useState<null | "media" | "logoAssetId">(null);
  // 042 — medios de la publicidad EN ORDEN (fotos y un video mp4/webm).
  const [media, setMedia] = useState<{ id: string; url: string; mime: string }[]>([]);
  const [mediaBusy, setMediaBusy] = useState(false);

  // 041b — derivan (y ven todo el seguimiento) propietario, administrador y
  // gerente, los mismos roles que en las alertas.
  const canDerive =
    viewerRole === "owner" || viewerRole === "admin" || viewerRole === "manager";

  const tpl = templates.find((t) => t.kind === kind);

  // Prefill desde la plantilla del tipo
  const applyTemplate = useCallback(
    (t: ProposalTemplateDto | undefined) => {
      if (!t) return;
      setForm((f) => ({
        ...f,
        title: t.title,
        subtitle: t.subtitle ?? "",
        body: t.body,
        productName: t.productName ?? "",
        offer: t.offer ?? "",
        benefit: t.benefit ?? "",
        ctaLabel: t.ctaLabel ?? "",
        ctaUrl: t.ctaUrl ?? "",
        ctaKind: t.ctaKind,
        assetId: null,
        logoAssetId: null,
      }));
      setMedia(
        t.assetId
          ? [{ id: t.assetId, url: `/api/public/propuesta/img/${t.assetId}`, mime: "image/*" }]
          : []
      );
      setLogoPreview(t.logoAssetId ? `/api/public/propuesta/img/${t.logoAssetId}` : null);
    },
    []
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/proposals/templates", { cache: "no-store" }).catch(() => null),
        fetch("/api/proposals/companies", { cache: "no-store" }).catch(() => null),
      ]);
      if (!alive) return;
      const tData = tRes ? ((await tRes.json().catch(() => ({}))) as { templates?: ProposalTemplateDto[] }) : {};
      const cData = cRes ? ((await cRes.json().catch(() => ({}))) as { companies?: { id: string; name: string }[] }) : {};
      setTemplates(tData.templates ?? []);
      setCompanies(cData.companies ?? []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (templates.length && !form.title) applyTemplate(templates.find((t) => t.kind === kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // 041b — directorio (empleados), grupos del chat y mi rol: quién deriva.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        members?: TeamMemberLiteDto[];
        groups?: TeamGroupLiteDto[];
        viewer?: { role?: string };
      };
      setDirectory((prev) => prev ?? data.members ?? []);
      setGroups(data.groups ?? []);
      if (data.viewer?.role) setViewerRole(data.viewer.role);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const uploadImage = async (file: File) => {
    setError(null);
    if (file.size > 8_000_000) {
      setError("La imagen no puede pasar de 8 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch("/api/proposals/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mime: file.type || "image/png", filename: file.name, data: base64 }),
      }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { id?: string; message?: string }) : null;
      if (!res?.ok || !data?.id) {
        setError(data?.message ?? "No se pudo subir la imagen");
        return;
      }
      setForm((f) => ({ ...f, logoAssetId: data.id! }));
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // 042 — medios de la publicidad: sube fotos y UN video (mp4/webm, hasta
  // 40 MB). Uno por uno para que el error sea del archivo puntual y el resto
  // entre igual. Quedan en orden: carrusel.
  const uploadMediaFiles = async (files: FileList) => {
    setError(null);
    setMediaBusy(true);
    const agregados: { id: string; url: string; mime: string }[] = [];
    const yaHayVideo = media.some((m) => m.mime.startsWith("video/"));
    let videoEnLote = false;
    for (const file of Array.from(files)) {
      const esVideo =
        file.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.name);
      if (esVideo && (yaHayVideo || videoEnLote)) {
        setError("La publicidad lleva UN video: quitá el que está para cambiarlo");
        continue;
      }
      const tope = esVideo ? 40 * 1024 * 1024 : 8 * 1024 * 1024;
      if (file.size > tope) {
        setError(
          esVideo
            ? "El video no puede pasar de 40 MB"
            : "La imagen no puede pasar de 8 MB"
        );
        continue;
      }
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/proposals/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mime: file.type || (esVideo ? "video/mp4" : "image/png"),
          filename: file.name,
          data: base64,
          purpose: "media",
        }),
      }).catch(() => null);
      const data = res
        ? ((await res.json().catch(() => ({}))) as { id?: string; mime?: string; message?: string })
        : null;
      if (!res?.ok || !data?.id) {
        setError(data?.message ?? "No se pudo subir el archivo");
        continue;
      }
      agregados.push({
        id: data.id,
        url: `/api/public/propuesta/img/${data.id}`,
        mime: data.mime ?? (file.type || "image/png"),
      });
      if (esVideo) videoEnLote = true;
    }
    setMediaBusy(false);
    if (agregados.length) {
      setMedia((prev) => [...prev, ...agregados].slice(0, 8));
      setError(null);
    }
  };

  const removeMedia = (id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  // 041c — la IA escribe la pieza con el tono y el concepto elegidos. Nunca
  // pisa el texto sin vuelta atrás: guarda el anterior para «Deshacer».
  const aiWrite = async () => {
    setAiBusy("pieza");
    setError(null);
    const companyName =
      companies.find((c) => c.id === form.companyRef)?.name ?? "";
    const res = await fetch("/api/proposals/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "pieza",
        tone,
        angle,
        instructions: aiInstructions.trim() || null,
        clientName: customer.name,
        kind,
        productName: form.productName,
        companyName,
        title: form.title,
        subtitle: form.subtitle,
        body: form.body,
        offer: form.offer,
        benefit: form.benefit,
        ctaLabel: form.ctaLabel,
      }),
    }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          copy?: {
            title?: string;
            subtitle?: string;
            body?: string;
            offer?: string;
            benefit?: string;
            ctaLabel?: string;
            notes?: string;
          };
          message?: string;
        })
      : null;
    setAiBusy(null);
    if (!res?.ok || !data?.copy) {
      setError(data?.message ?? "No se pudo escribir con IA");
      return;
    }
    const copy = data.copy;
    setPrevForm(form);
    setForm((f) => ({
      ...f,
      title: copy.title ?? f.title,
      subtitle: copy.subtitle ?? f.subtitle,
      body: copy.body ?? f.body,
      offer: copy.offer ?? f.offer,
      benefit: copy.benefit ?? f.benefit,
      ctaLabel: copy.ctaLabel ?? f.ctaLabel,
    }));
    setAiNotes(copy.notes ?? null);
  };

  // 041c — reescribir el mensaje de WhatsApp con otro tono, antes de mandarlo.
  const pickFromLibrary = async (asset: PickerAsset) => {
    if (!pickerTarget) return;

    setError(null);

    const esMedia = pickerTarget === "media";

    const res = await fetch("/api/proposals/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        libraryId: asset.id,
        purpose: esMedia ? "media" : "logo",
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: string; mime?: string; error?: { message?: string } }
      | null;

    if (!res.ok || !data?.id) {
      setError(
        data?.error?.message ??
          `No se pudo usar ${esMedia ? "el archivo" : "la imagen"} del contenedor`
      );
      setPickerTarget(null);
      return;
    }

    const copiada = data.id;

    if (esMedia) {
      const mime = data.mime ?? asset.mime;
      if (mime.startsWith("video/") && media.some((m) => m.mime.startsWith("video/"))) {
        setError("La publicidad lleva UN video: quitá el que está para cambiarlo");
        setPickerTarget(null);
        return;
      }
      setMedia((prev) => [
        ...prev,
        { id: copiada, url: `/api/public/propuesta/img/${copiada}`, mime },
      ]);
    } else {
      setForm((f) => ({ ...f, logoAssetId: copiada }));
      setLogoPreview(`/api/public/propuesta/img/${copiada}`);
    }

    setPickerTarget(null);
  };

  const rewriteMessage = async (targetTone: ProposalToneId) => {
    if (!created) return;
    setAiBusy("mensaje");
    setError(null);
    const companyName =
      companies.find((c) => c.id === form.companyRef)?.name ?? "";
    const res = await fetch("/api/proposals/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "mensaje",
        tone: targetTone,
        angle,
        instructions: aiInstructions.trim() || null,
        clientName: customer.name,
        kind,
        productName: form.productName,
        companyName,
        title: form.title,
        subtitle: form.subtitle,
        body: form.body,
        offer: form.offer,
        benefit: form.benefit,
        ctaLabel: form.ctaLabel,
        draftMessage: draftText,
      }),
    }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          copy?: { message?: string; notes?: string };
          message?: string;
        })
      : null;
    setAiBusy(null);
    if (!res?.ok || !data?.copy?.message) {
      setError(data?.message ?? "No se pudo reescribir el mensaje");
      return;
    }
    const absUrl = `${window.location.origin}${created.publicUrl}`;
    setDraftText(`${data.copy.message}\n\nMiralá acá 👉 ${absUrl}`);
    setMsgTone(targetTone);
    setAiNotes(data.copy.notes ?? null);
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    const res = await fetch("/api/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        clientRef: customer.id,
        clientName: customer.name,
        clientDni: ficha.dni ?? customer.dni ?? null,
        clientPhone: ficha.telefono ?? customer.phone ?? null,
        title: form.title,
        subtitle: form.subtitle || null,
        body: form.body,
        productName: form.productName || null,
        offer: form.offer || null,
        benefit: form.benefit || null,
        ctaLabel: form.ctaLabel || null,
        ctaUrl: form.ctaUrl || null,
        ctaKind: form.ctaKind,
        companyRef: form.companyRef || null,
        assetId: media.find((m) => m.mime.startsWith("image/"))?.id ?? null,
        mediaIds: media.map((m) => m.id),
        logoAssetId: form.logoAssetId,
        tone,
        angle,
      }),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { proposal?: ProposalDto; message?: string }) : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.message ?? "No se pudo crear la propuesta");
      return;
    }
    setCreated(data.proposal);
    onProposalChange();
  };

  const openDerive = async () => {
    setDeriveOpen(true);
    if (!directory) {
      const res = await fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null);
      const data = res
        ? ((await res.json().catch(() => ({}))) as {
            members?: TeamMemberLiteDto[];
            groups?: TeamGroupLiteDto[];
            viewer?: { role?: string };
          })
        : null;
      setDirectory(data?.members ?? []);
      setGroups(data?.groups ?? []);
      if (data?.viewer?.role) setViewerRole(data.viewer.role);
    }
  };

  const derive = async () => {
    if (!created) return;
    if (targetKind !== "ia" && !assignee) return;
    setBusy("derive");
    setError(null);
    const res = await fetch(`/api/proposals/${created.id}/derive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        targetKind === "ia"
          ? { assigneeKind: "ia", priority, note: note || null }
          : targetKind === "group"
            ? { assigneeGroupId: assignee, priority, note: note || null }
            : { assigneeUserId: assignee, priority, note: note || null }
      ),
    }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { proposal?: ProposalDto; message?: string }) : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.message ?? "No se pudo derivar la propuesta");
      return;
    }
    setCreated(data.proposal);
    const who =
      targetKind === "ia"
        ? "la IA"
        : targetKind === "group"
          ? groups.find((g) => g.id === assignee)?.name ?? "el grupo"
          : directory?.find((m) => m.userId === assignee)?.name ?? "el empleado";
    setStage((s) => ({ ...s, derived: who }));
    setDeriveOpen(false);
    onProposalChange();
  };

  const sendNow = async () => {
    if (!created) return;
    setBusy("send");
    setError(null);
    const res = await fetch(`/api/proposals/${created.id}/send`, { method: "POST" }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as { proposal?: ProposalDto & { conversationId: string | null; contactId: string | null }; message?: string })
      : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.message ?? "No se pudo registrar el envío");
      return;
    }
    setCreated(data.proposal);
    setStage((s) => ({ ...s, sent: true }));
    setPreviewOpen(false);
    onOpenInbox({
      contactId: data.proposal.contactId ?? null,
      draft: draftText.trim(),
      attach: data.proposal.imageUrl,
    });
    void onRefreshFicha();
  };

  return (
    <div className="mt-3 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11.5px] font-bold text-text-2">Tipo:</label>
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value;
            setKind(k);
            applyTemplate(templates.find((t) => t.kind === k));
          }}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px] font-semibold text-text-1"
        >
          {PROPOSAL_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.emoji} {k.label}
              {k.id === kindDefault ? " (sugerida)" : ""}
            </option>
          ))}
        </select>
        {tpl?.updatedAt === null && (
          <span className="text-[11px] text-text-3">usando textos base de fábrica</span>
        )}
        <span className="ml-auto text-[11px] text-text-3">
          La pieza pública se genera al guardar
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Título"
          className="rounded-lg border bg-card px-3 py-2 text-[13px] font-semibold"
        />
        <input
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
          placeholder="Subtítulo"
          className="rounded-lg border bg-card px-3 py-2 text-[13px]"
        />
      </div>
      {/* 041c — Escribir con IA: tono (cercana ↔ formal…) + concepto de venta */}
      <div className="space-y-2 rounded-xl border border-border-strong bg-subtle/60 p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[12px] font-bold text-text-2">
            <Wand2 size={13} /> Tono
          </span>
          {TONE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTone(id)}
              aria-pressed={tone === id}
              title={TONES[id].hint}
              className={
                tone === id
                  ? "rounded-full border border-brand bg-brand px-2.5 py-1 text-[12px] font-semibold text-white"
                  : "rounded-full border bg-card px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-subtle"
              }
            >
              {TONES[id].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[12px] font-bold text-text-2">
            <Lightbulb size={13} /> Concepto de venta
          </span>
          {ANGLE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setAngle((a) => (a === id ? null : id))}
              aria-pressed={angle === id}
              title={ANGLES[id].hint}
              className={
                angle === id
                  ? "rounded-full border border-brand bg-brand px-2.5 py-1 text-[12px] font-semibold text-white"
                  : "rounded-full border bg-card px-2.5 py-1 text-[12px] font-semibold text-text-2 hover:bg-subtle"
              }
            >
              {ANGLES[id].label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={aiInstructions}
            onChange={(e) => setAiInstructions(e.target.value)}
            placeholder="Indicaciones para la IA (opcional): «mencioná el 20%», «hablale de la familia»…"
            className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-[12.5px]"
          />
          <button
            type="button"
            onClick={() => void aiWrite()}
            disabled={aiBusy !== null || !form.title.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {aiBusy === "pieza" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Escribir con IA
          </button>
          {prevForm && (
            <button
              type="button"
              onClick={() => {
                setForm(prevForm);
                setPrevForm(null);
                setAiNotes(null);
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-subtle"
            >
              <RotateCcw size={13} /> Deshacer
            </button>
          )}
        </div>
        {aiNotes && <p className="text-[11.5px] text-text-3">💡 {aiNotes}</p>}
      </div>
      <textarea
        value={form.body}
        onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        rows={3}
        placeholder="Mensaje de la propuesta"
        className="w-full rounded-lg border bg-card px-3 py-2 text-[13px]"
      />
      <div className="grid gap-2 md:grid-cols-3">
        <input
          value={form.productName}
          onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
          placeholder="Tipo de producto"
          className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
        />
        <input
          value={form.offer}
          onChange={(e) => setForm((f) => ({ ...f, offer: e.target.value }))}
          placeholder="Oferta"
          className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
        />
        <input
          value={form.benefit}
          onChange={(e) => setForm((f) => ({ ...f, benefit: e.target.value }))}
          placeholder="Descuento o beneficio (CTA)"
          className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <input
          value={form.ctaLabel}
          onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
          placeholder="Texto del botón (CTA)"
          className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
        />
        <input
          value={form.ctaUrl}
          onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
          placeholder="URL del CTA (https://… o link a PDF)"
          className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
        />
        <select
          value={form.ctaKind}
          onChange={(e) => setForm((f) => ({ ...f, ctaKind: e.target.value as "link" | "pdf" }))}
          className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
        >
          <option value="link">Enlace web</option>
          <option value="pdf">URL de PDF</option>
        </select>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <Building2 size={14} className="text-text-3" />
          <select
            value={form.companyRef}
            onChange={(e) => setForm((f) => ({ ...f, companyRef: e.target.value }))}
            className="w-full bg-transparent text-[12.5px]"
          >
            <option value="">Compañía auspiciada (opcional)…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card px-3 py-2 text-[12px] font-semibold text-text-2 hover:bg-subtle">
          <ImageIcon size={14} />
          {media.length ? "Sumar fotos o video" : "Fotos o video (carrusel)"}
          <input
            type="file"
            accept="image/*,video/mp4,video/webm"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length) void uploadMediaFiles(list);
              e.target.value = "";
            }}
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card px-3 py-2 text-[12px] font-semibold text-text-2 hover:bg-subtle">
          <ImageIcon size={14} /> {logoPreview ? "Cambiar logo" : "Logo del emisor"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadImage(f);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => setPickerTarget("media")}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed bg-subtle/40 px-3 py-2 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          <FolderOpen size={14} /> Elegir del contenedor (fotos o video)
        </button>
      </div>

      {/* 042 — los medios en orden: así se ven el carrusel y el video */}
      {(media.length > 0 || logoPreview || mediaBusy) && (
        <div className="flex flex-wrap items-center gap-2">
          {logoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo" className="h-10 max-w-[140px] rounded border object-contain" />
          )}
          {media.map((m, i) => (
            <div key={m.id} className="relative">
              {m.mime.startsWith("video/") ? (
                <video
                  src={m.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-16 w-24 rounded border object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt={`Medio ${i + 1}`}
                  className="h-16 w-24 rounded border object-cover"
                />
              )}
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1 py-px text-[9px] font-bold text-white">
                {i + 1}
                {m.mime.startsWith("video/") ? " · VIDEO" : ""}
              </span>
              <button
                type="button"
                aria-label={`Quitar medio ${i + 1}`}
                onClick={() => removeMedia(m.id)}
                className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[11px] font-bold text-white shadow hover:bg-rose-700"
              >
                ×
              </button>
            </div>
          ))}
          {mediaBusy && (
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-text-2">
              <Loader2 size={13} className="animate-spin" /> Subiendo…
            </span>
          )}
          {media.length > 0 && (
            <span className="text-[11px] text-text-3">
              {media.length} medio{media.length > 1 ? "s" : ""} · carrusel
              {media.some((m) => m.mime.startsWith("video/")) ? " + video" : ""}
            </span>
          )}
        </div>
      )}

      {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}

      {pickerTarget !== null && (
        <LibraryPicker
          title={
            pickerTarget === "media"
              ? "Elegir fotos o video del contenedor"
              : "Elegir el logo del contenedor"
          }
          kind={pickerTarget === "media" ? "all" : "image"}
          onPick={pickFromLibrary}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {!created ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy === "save" || !form.title.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Generar propuesta
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-brand-soft bg-brand-tint/40 p-3">
          <p className="text-[12.5px] font-bold text-text-1">
            ✓ Propuesta creada — página pública lista para abrir desde cualquier computadora
          </p>
          {/* 042 — qué se le creó, de un vistazo */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-text-2">
            <span className="rounded-full border bg-card px-2 py-0.5">🌐 Página pública</span>
            <span className="rounded-full border bg-card px-2 py-0.5">
              🖼️{" "}
              {media.length
                ? `${media.length} medio${media.length > 1 ? "s" : ""}${media.some((m) => m.mime.startsWith("video/")) ? " (con video)" : ""}`
                : "sin medios"}
            </span>
            <span className="rounded-full border bg-card px-2 py-0.5">
              {form.ctaUrl ? "🔗 con botón CTA" : "🔗 sin CTA — se carga en Ajustes → Propuestas"}
            </span>
            <span className="rounded-full border bg-card px-2 py-0.5">📲 mensaje con tono a elección</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={created.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
            >
              <ExternalLink size={13} /> Abrir página
            </a>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(`${window.location.origin}${created.publicUrl}`).catch(() => {})}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
            >
              <ClipboardCopy size={13} /> Copiar link
            </button>
            {!stage.derived && canDerive && (
              <button
                type="button"
                onClick={() => void openDerive()}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
              >
                <UserCheck size={13} /> Derivar: IA, empleado o grupo
              </button>
            )}
            {stage.derived && (
              <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                <UserCheck size={13} /> Derivada a {stage.derived}
                {stage.derived === "la IA"
                  ? " · atiende al instante por WhatsApp"
                  : " · aviso enviado al chat"}
              </span>
            )}
          </div>

          {deriveOpen && (
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-bold text-text-2">Derivar a:</span>
                {(
                  [
                    { k: "ia" as const, l: "🤖 IA primero" },
                    { k: "employee" as const, l: "👤 Empleado" },
                    { k: "group" as const, l: "👥 Grupo" },
                  ]
                ).map(({ k, l }) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setTargetKind(k);
                      setAssignee("");
                    }}
                    className={
                      targetKind === k
                        ? "rounded-full border border-brand bg-brand-veil px-3 py-1 font-bold text-brand"
                        : "rounded-full border border-border-strong px-3 py-1 font-semibold text-text-2 hover:bg-accent"
                    }
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {targetKind === "ia" ? (
                  <p className="flex items-center rounded-lg border border-dashed bg-subtle/40 px-3 py-2 text-[11.5px] text-text-2 md:col-span-1">
                    🛡️ Si al cliente le interesa, seguís vos. La IA atiende y
                    avisa qué pasó.
                  </p>
                ) : targetKind === "employee" ? (
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
                  >
                    <option value="">Elegí el empleado…</option>
                    {(directory ?? []).map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name}
                        {m.locality ? ` — ${m.locality}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
                  >
                    <option value="">Elegí el grupo del chat…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ProposalPriority)}
                  className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
                >
                  <option value="alta">Prioridad alta</option>
                  <option value="media">Prioridad media</option>
                  <option value="baja">Prioridad baja</option>
                </select>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Nota para el empleado (opcional)"
                  className="rounded-lg border bg-card px-3 py-2 text-[12.5px]"
                />
              </div>
              <button
                type="button"
                onClick={() => void derive()}
                disabled={(targetKind !== "ia" && !assignee) || busy === "derive"}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "derive" ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                {targetKind === "ia"
                  ? "Derivar a la IA (atiende primero)"
                  : targetKind === "group"
                    ? "Derivar al grupo y avisar"
                    : "Derivar y avisar por el chat"}
              </button>
            </div>
          )}

          {!previewOpen && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const absUrl = `${window.location.origin}${created.publicUrl}`;
                  setDraftText(
                    `¡Hola ${customer.name}! 👋 Te preparé una propuesta pensada para vos${form.benefit ? `: ${form.benefit}` : ""}. Miralá acá 👉 ${absUrl}`
                  );
                  setPreviewOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
              >
                <Send size={14} />
                Enviar por WhatsApp — con vista previa
              </button>
              {/* 042 — el tono del mensaje, a mano desde el primer momento:
                  tocás uno, la IA lo reescribe y se abre la vista previa. */}
              <span className="flex items-center gap-1 text-[11.5px] font-bold text-text-2">
                <Wand2 size={12} /> Tono del mensaje:
              </span>
              {TONE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (!previewOpen) {
                      const absUrl = `${window.location.origin}${created.publicUrl}`;
                      setDraftText(
                        `¡Hola ${customer.name}! 👋 Te preparé una propuesta pensada para vos${form.benefit ? `: ${form.benefit}` : ""}. Miralá acá 👉 ${absUrl}`
                      );
                      setPreviewOpen(true);
                    }
                    setMsgTone(id);
                    void rewriteMessage(id);
                  }}
                  disabled={aiBusy !== null}
                  aria-pressed={msgTone === id}
                  title={TONES[id].hint}
                  className={
                    msgTone === id
                      ? "rounded-full border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
                      : "rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-semibold text-text-2 hover:bg-subtle disabled:opacity-60"
                  }
                >
                  {TONES[id].label}
                </button>
              ))}
              {aiBusy === "mensaje" && <Loader2 size={12} className="animate-spin text-text-3" />}
            </div>
          )}

          {previewOpen && (
            <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-[12.5px] font-bold text-text-1">
                Así le llega por WhatsApp — revisalo antes de abrir el chat
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {(media.find((m) => m.mime.startsWith("image/"))?.url ?? created.imageUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.find((m) => m.mime.startsWith("image/"))?.url ?? created.imageUrl ?? ""}
                    alt="Imagen de la propuesta"
                    className="h-32 w-32 shrink-0 self-start rounded-lg border object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* 041c — tocá un tono y el mensaje se reescribe; recién después va al chat */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11.5px] font-bold text-text-2">
                      <Wand2 size={12} /> Tono
                    </span>
                    {TONE_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void rewriteMessage(id)}
                        disabled={aiBusy !== null}
                        aria-pressed={msgTone === id}
                        title={TONES[id].hint}
                        className={
                          msgTone === id
                            ? "rounded-full border border-emerald-600 bg-emerald-600 px-2 py-0.5 text-[11.5px] font-semibold text-white disabled:opacity-60"
                            : "rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-semibold text-text-2 hover:bg-subtle disabled:opacity-60"
                        }
                      >
                        {TONES[id].label}
                      </button>
                    ))}
                    {aiBusy === "mensaje" && <Loader2 size={12} className="animate-spin text-text-3" />}
                  </div>
                  <div className="rounded-2xl rounded-tr-sm border border-emerald-600/20 bg-[#dcf8c6] px-3 py-2 text-[12.5px] leading-snug text-emerald-950 shadow-sm">
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={4}
                      aria-label="Mensaje para WhatsApp"
                      className="w-full resize-none bg-transparent text-[12.5px] leading-snug text-emerald-950 outline-none"
                    />
                    <span className="block text-right text-[10px] text-emerald-950/60">
                      ahora ✓
                    </span>
                  </div>
                  <p className="text-[11px] text-text-3">
                    {created.imageUrl
                      ? "Va con la primera foto de la publicación adjunta y el link a la página. Queda cargado en el chat sin enviar."
                      : "Queda cargado en el chat sin enviar: lo revisás y lo mandás desde ahí."}
                  </p>
                  {!stage.derived && canDerive && (
                    <p className="text-[11px] text-text-3">
                      Podés derivarla (arriba) a un empleado o a un grupo para
                      que la envíe y la gestione.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void sendNow()}
                  disabled={busy === "send" || !draftText.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Abrir el chat con esto listo
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-subtle"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
          {stage.sent && (
            <p className="text-[12px] font-semibold text-emerald-700">
              ✓ Marcada como enviada — el chat quedó abierto con el borrador y la imagen listos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
