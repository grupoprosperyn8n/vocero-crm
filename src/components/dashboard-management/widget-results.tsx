"use client";

/**
 * 044b-B12 — Dashboard de resultados de una pieza del Constructor.
 *
 * Formulario/encuesta: «General» (indicadores + gráficas por pregunta y por
 * día) e «Individual» (la contestación completa de cada cliente, con búsqueda).
 * Cupón/voucher: «Control» (emitidos, canjeados, tasa + gráficas) y «Tokens»
 * (el control de cada voucher: canjear, revertir, copiar su link).
 *
 * Se refresca solo cada 15 segundos mientras está abierto.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  ClipboardCopy,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Ticket,
  X,
} from "lucide-react";
import type {
  CouponTokenDto,
  ProposalDto,
  ProposalResponseDto,
  ProposalWidget,
  ProposalWidgetField,
} from "@/lib/types";

/* ————— Gráficos: estilo común (igual al resto del dashboard) ————— */
const CHART = {
  net: "#0d5bff",
  altas: "#1fb35b",
  anulado: "#d94a4a",
  series: ["#0d5bff", "#1fb35b", "#f2a71b", "#8b5cf6", "#e11d48", "#0ea5e9"],
};
const CHART_GRID = "#e5e9f2";
const CHART_TICK = { fontSize: 11, fill: "#7b879c" } as const;

const ESCALA_LABEL: Record<string, string> = {
  "1": "Muy malo",
  "2": "Malo",
  "3": "Normal",
  "4": "Bueno",
  "5": "Excelente",
};

function fecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/* ————— Estadísticas (client-side, sobre las respuestas ya traídas) ————— */

type FilaDist = { key: string; label: string; total: number; pct: number; texto: string };

type CampoStats = {
  field: ProposalWidgetField;
  total: number;
  graficable: boolean;
  filas?: FilaDist[];
  promedio?: number;
  respuestaCorta?: string;
};

function esGraficable(f: ProposalWidgetField): boolean {
  return f.tipo === "seleccion" || f.tipo === "si_no" || f.tipo === "escala";
}

function calcularStats(widget: ProposalWidget | null, responses: ProposalResponseDto[]): CampoStats[] {
  if (!widget || widget.type === "coupon") return [];
  const fields = widget.type === "form" ? widget.fields : widget.questions;
  return fields.map((f) => {
    const vals = responses
      .map((r) => r.data.find((d) => d.label === f.label)?.value)
      .filter((v): v is string => Boolean(v));
    if (esGraficable(f)) {
      const base =
        f.tipo === "escala"
          ? ["1", "2", "3", "4", "5"]
          : f.tipo === "si_no"
            ? ["Sí", "No"]
            : f.opciones;
      const counts = new Map<string, number>();
      for (const k of base) counts.set(k, 0);
      for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
      const total = vals.length;
      const filas: FilaDist[] = [...counts.entries()].map(([key, n]) => {
        const pct = total ? Math.round((n / total) * 100) : 0;
        return {
          key,
          label: f.tipo === "escala" ? (ESCALA_LABEL[key] ?? key) : key,
          total: n,
          pct,
          texto: `${n} · ${pct}%`,
        };
      });
      return { field: f, total, graficable: true, filas };
    }
    if (f.tipo === "numero") {
      const nums = vals.map((v) => Number(v.replace(",", "."))).filter((n) => Number.isFinite(n));
      const promedio = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
      return { field: f, total: vals.length, graficable: false, promedio };
    }
    return { field: f, total: vals.length, graficable: false };
  });
}

function timeline(dates: string[], dias = 14): Array<{ dia: string; total: number }> {
  const hoy = new Date();
  const out: Array<{ dia: string; total: number }> = [];
  const porDia = new Map<string, number>();
  for (const iso of dates) {
    const key = iso.slice(0, 10);
    porDia.set(key, (porDia.get(key) ?? 0) + 1);
  }
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({
      dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      total: porDia.get(key) ?? 0,
    });
  }
  return out;
}

/* ————— Piezas visuales ————— */

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-text-3">{label}</p>
      <p
        className={`mt-0.5 text-[17px] font-bold ${
          tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-text-1"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DistBar({ filas }: { filas: FilaDist[] }) {
  const height = Math.max(96, filas.length * 36 + 16);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={filas} layout="vertical" margin={{ top: 2, right: 88, bottom: 2, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={104} tick={CHART_TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(13,91,255,0.05)" }}
            formatter={(v) => [`${v ?? 0}`, "respuestas"]}
          />
          <Bar dataKey="total" barSize={18} radius={[0, 8, 8, 0]}>
            {filas.map((f, i) => (
              <Cell key={f.key} fill={CHART.series[i % CHART.series.length]} />
            ))}
            <LabelList dataKey="texto" position="right" style={{ fontSize: 11, fill: "#42506b", fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimelineBar({ datos, color }: { datos: Array<{ dia: string; total: number }>; color?: string }) {
  return (
    <div style={{ width: "100%", height: 132 }}>
      <ResponsiveContainer>
        <BarChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
          <XAxis dataKey="dia" tick={CHART_TICK} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={CHART_TICK} width={26} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(13,91,255,0.05)" }}
            formatter={(v) => [`${v ?? 0}`, "respuestas"]}
            labelFormatter={(l) => `Día ${l}`}
          />
          <Bar dataKey="total" fill={color ?? CHART.net} radius={[6, 6, 0, 0]} barSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type TokensPayload = {
  tokens: CouponTokenDto[];
  summary: { total: number; emitidos: number; canjeados: number };
};

function ControlCupon({ payload }: { payload: TokensPayload }) {
  const { emitidos, canjeados, total } = payload.summary;
  const pendientes = emitidos;
  const tasa = total ? Math.round((canjeados / total) * 100) : 0;
  const torta = [
    { name: "Pendientes", value: pendientes, fill: CHART.net },
    { name: "Canjeados", value: canjeados, fill: CHART.altas },
  ];
  const timelineCreacion = timeline(payload.tokens.map((t) => t.createdAt));
  const timelineCanje = timeline(
    payload.tokens.filter((t) => t.redeemedAt).map((t) => t.redeemedAt as string)
  );
  const merged = timelineCreacion.map((d, i) => ({
    dia: d.dia,
    emitidos: d.total,
    canjeados: timelineCanje[i]?.total ?? 0,
  }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Vouchers emitidos" value={String(total)} />
        <Kpi label="Canjeados" value={String(canjeados)} tone="ok" />
        <Kpi label="Pendientes" value={String(pendientes)} tone="warn" />
        <Kpi label="Tasa de canje" value={`${tasa}%`} />
      </div>
      {total === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[12.5px] text-text-3">
          Todavía sin tokens. Emitilos desde la pestaña «Tokens» y repartí sus links.
        </p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <div className="rounded-lg border bg-background p-2">
              <p className="px-1 text-[11px] font-semibold text-text-2">Canjes vs pendientes</p>
              <div style={{ width: "100%", height: 148 }}>
                <ResponsiveContainer>
                  <PieChart margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <Pie
                      data={torta}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={38}
                      outerRadius={56}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {torta.map((t) => (
                        <Cell key={t.name} fill={t.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v ?? 0}`, ""]} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                    <text
                      x="50%"
                      y="42%"
                      textAnchor="middle"
                      fontSize={20}
                      fontWeight={700}
                      fill="#0f1c2e"
                    >
                      {tasa}%
                    </text>
                    <text x="50%" y="50%" textAnchor="middle" fontSize={9.5} fill="#7b879c">
                      canjeado
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-2">
              <p className="px-1 text-[11px] font-semibold text-text-2">
                Emisiones y canjes — últimos 14 días
              </p>
              <div style={{ width: "100%", height: 148 }}>
                <ResponsiveContainer>
                  <BarChart data={merged} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                    <XAxis dataKey="dia" tick={CHART_TICK} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={CHART_TICK} width={26} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(13,91,255,0.05)" }} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="emitidos" name="Emitidos" fill={CHART.net} radius={[5, 5, 0, 0]} barSize={11} />
                    <Bar dataKey="canjeados" name="Canjeados" fill={CHART.altas} radius={[5, 5, 0, 0]} barSize={11} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-text-3">
            El link de cada token abre el cupón con ese código ya cargado (
            <span className="font-mono">/p/…?t=…</span>) — mandalo por WhatsApp a quien le regalás
            el voucher.
          </p>
        </>
      )}
    </div>
  );
}

function ListaTokens({
  proposal,
  payload,
  busy,
  onEmitir,
  onToggle,
  copiado,
  onCopiar,
}: {
  /** Solo el token para el link de canje (044b-B13). */
  proposal: Pick<ProposalDto, "token">;
  payload: TokensPayload;
  busy: boolean;
  onEmitir: (cantidad: number, nombre: string) => void;
  onToggle: (t: CouponTokenDto) => void;
  copiado: string | null;
  onCopiar: (t: CouponTokenDto) => void;
}) {
  const [cantidad, setCantidad] = useState(10);
  const [nombre, setNombre] = useState("");
  const [busca, setBusca] = useState("");
  const filtrados = payload.tokens.filter((t) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      t.token.toLowerCase().includes(q) || (t.issuedToName ?? "").toLowerCase().includes(q)
    );
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={200}
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
          className="h-8 w-16 rounded-md border border-border-strong bg-background px-2 text-[12px] text-text"
          aria-label="Cantidad de tokens a emitir"
        />
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Para quién? (opcional)"
          className="h-8 w-44 rounded-md border border-border-strong bg-background px-2 text-[12px] text-text"
          aria-label="Nombre de a quién se le entrega"
        />
        <button
          type="button"
          onClick={() => {
            onEmitir(cantidad, nombre.trim());
            setNombre("");
          }}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
        >
          <Plus size={12} /> Emitir tokens
        </button>
        <span className="ml-auto flex items-center gap-1.5 rounded-md border border-border-strong bg-background px-2 py-1">
          <Search size={12} className="text-text-3" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar código o nombre…"
            className="h-6 w-40 bg-transparent text-[11.5px] text-text outline-none"
            aria-label="Buscar token"
          />
        </span>
      </div>
      {filtrados.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-text-3">
          {payload.tokens.length === 0
            ? "Todavía sin tokens. Emití los primeros y repartí sus links."
            : "Ningún token coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {filtrados.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2.5 py-2"
            >
              <span className="flex items-center gap-1.5 font-mono text-[12.5px] font-bold text-text-1">
                <Ticket size={13} className="text-text-3" />
                {t.token}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${
                  t.status === "canjeado"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                }`}
              >
                {t.status === "canjeado" ? "Canjeado" : "Emitido"}
              </span>
              {t.issuedToName && <span className="truncate text-[11px] text-text-3">{t.issuedToName}</span>}
              {t.redeemedAt && <span className="text-[10.5px] text-text-3">· {fecha(t.redeemedAt)}</span>}
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onCopiar(t)}
                  className="rounded-md border bg-card p-1 text-text-3 hover:bg-subtle hover:text-text-1"
                  title="Copiar link del voucher (con su código)"
                >
                  {copiado === t.token ? <Check size={12} className="text-emerald-600" /> : <ClipboardCopy size={12} />}
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(t)}
                  disabled={busy}
                  className="rounded-md border bg-card p-1 text-text-3 hover:bg-subtle hover:text-text-1 disabled:opacity-50"
                  title={t.status === "canjeado" ? "Volver a emitido (si fue un error)" : "Marcar como canjeado"}
                >
                  {t.status === "canjeado" ? <RotateCcw size={12} /> : <Check size={12} />}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-text-3">
        {payload.summary.total} tokens · {payload.summary.emitidos} emitidos ·{" "}
        {payload.summary.canjeados} canjeados — el link de cada uno:{" "}
        <span className="font-mono">/p/{proposal.token.slice(0, 6)}…?t=CÓDIGO</span>
      </p>
    </div>
  );
}

/* ————— Modal principal ————— */

export function WidgetResultsModal({
  proposal,
  onClose,
}: {
  /** Solo necesita identidad + tipo de widget: el resto lo trae por API. */
  proposal: Pick<ProposalDto, "id" | "title" | "token" | "widget">;
  onClose: () => void;
}) {
  const esCupon = proposal.widget?.type === "coupon";
  const esEncuesta = proposal.widget?.type === "survey";
  const [responses, setResponses] = useState<ProposalResponseDto[] | null>(null);
  const [tokens, setTokens] = useState<TokensPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [tab, setTab] = useState<"general" | "individual" | "tokens">("general");
  const [buscaResp, setBuscaResp] = useState("");
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      if (esCupon) {
        const res = await fetch(`/api/proposals/${proposal.id}/tokens`, { cache: "no-store" });
        if (!res.ok) throw new Error("no");
        const body = (await res.json()) as TokensPayload;
        if (alive.current) setTokens(body);
      } else {
        const res = await fetch(`/api/proposals/${proposal.id}/responses`, { cache: "no-store" });
        if (!res.ok) throw new Error("no");
        const body = (await res.json()) as { responses: ProposalResponseDto[] };
        if (alive.current) setResponses(body.responses);
      }
      if (alive.current) setError(null);
    } catch {
      if (alive.current) setError("No se pudieron cargar los datos");
    }
  }, [esCupon, proposal.id]);

  useEffect(() => {
    alive.current = true;
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load]);

  const emitir = async (cantidad: number, nombre: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cantidad, issuedToName: nombre || null }),
      });
      if (!res.ok) throw new Error("no");
      const body = (await res.json()) as TokensPayload;
      setTokens(body);
    } catch {
      setError("No se pudieron emitir los tokens");
    } finally {
      setBusy(false);
    }
  };

  const toggleEstado = async (t: CouponTokenDto) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/tokens`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenId: t.id,
          status: t.status === "canjeado" ? "emitido" : "canjeado",
        }),
      });
      if (!res.ok) throw new Error("no");
      const body = (await res.json()) as TokensPayload;
      setTokens(body);
    } catch {
      setError("No se pudo actualizar el token");
    } finally {
      setBusy(false);
    }
  };

  const copiarLink = async (t: CouponTokenDto) => {
    const url = `${window.location.origin}/p/${proposal.token}?t=${t.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(t.token);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      window.prompt("Copiá el link del voucher:", url);
    }
  };

  /* ————— Datos derivados ————— */
  const stats = useMemo(
    () => calcularStats(proposal.widget, responses ?? []),
    [proposal.widget, responses]
  );
  const respFiltradas = useMemo(() => {
    const q = buscaResp.trim().toLowerCase();
    const all = responses ?? [];
    if (!q) return all;
    return all.filter(
      (r) =>
        (r.clientName ?? "").toLowerCase().includes(q) ||
        (r.clientPhone ?? "").toLowerCase().includes(q) ||
        (r.clientEmail ?? "").toLowerCase().includes(q) ||
        r.data.some((d) => d.value.toLowerCase().includes(q))
    );
  }, [responses, buscaResp]);

  const titulo = esCupon
    ? "🎟️ Dashboard del cupón"
    : esEncuesta
      ? "📊 Dashboard de la encuesta"
      : "📝 Dashboard del formulario";
  const total = responses?.length ?? 0;
  const ultima = responses?.[0]?.createdAt;
  const hoy = responses?.filter((r) => r.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length ?? 0;
  const cargando = esCupon ? tokens === null : responses === null;

  const tabs: Array<{ id: "general" | "individual" | "tokens"; label: string }> = esCupon
    ? [
        { id: "general", label: "🎛️ Control" },
        { id: "tokens", label: `🎫 Tokens (${tokens?.summary.total ?? 0})` },
      ]
    : [
        { id: "general", label: "📊 General" },
        { id: "individual", label: `👥 Individual (${total})` },
      ];
  const tabActiva = tabs.some((t) => t.id === tab) ? tab : "general";

  return (
    <div
      role="dialog"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-text-1">{titulo}</p>
            <p className="truncate text-[11.5px] text-text-3">{proposal.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Actualizar"
              className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
              title="Actualizar"
            >
              <RefreshCw size={14} />
            </button>
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

        {/* Pestañas */}
        <div className="mb-3 flex flex-wrap gap-1.5 border-b pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tabActiva === t.id}
              className={`inline-flex h-7 items-center rounded-full border px-3 text-[11.5px] font-semibold transition-colors ${
                tabActiva === t.id
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border-strong bg-card text-text-2 hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="mb-2 text-[12.5px] text-rose-600">{error}</p>}

        {cargando ? (
          <p className="flex items-center gap-2 py-6 text-[12.5px] text-text-3">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : esCupon && tokens ? (
          tabActiva === "tokens" ? (
            <ListaTokens
              proposal={proposal}
              payload={tokens}
              busy={busy}
              onEmitir={(c, n) => void emitir(c, n)}
              onToggle={(t) => void toggleEstado(t)}
              copiado={copiado}
              onCopiar={(t) => void copiarLink(t)}
            />
          ) : (
            <ControlCupon payload={tokens} />
          )
        ) : !esCupon && responses ? (
          tabActiva === "individual" ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 rounded-md border border-border-strong bg-background px-2.5 py-1.5">
                <Search size={13} className="text-text-3" />
                <input
                  value={buscaResp}
                  onChange={(e) => setBuscaResp(e.target.value)}
                  placeholder="Buscar por nombre, teléfono, email o respuesta…"
                  className="h-6 flex-1 bg-transparent text-[12px] text-text outline-none"
                  aria-label="Buscar respuesta"
                />
                {buscaResp && <span className="text-[10.5px] text-text-3">{respFiltradas.length} de {total}</span>}
              </div>
              {total === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-3">
                  Todavía sin respuestas. Compartí el link de la página para empezar a recibirlas.
                </p>
              ) : respFiltradas.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-text-3">
                  Ninguna respuesta coincide con la búsqueda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {respFiltradas.map((r) => (
                    <li key={r.id} className="rounded-lg border bg-background px-3 py-2.5">
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-text-3">
                        <span className="font-bold text-text-2">
                          {r.clientName || r.clientPhone || r.clientEmail || "Anónimo"}
                        </span>
                        {r.clientPhone && <span>📱 {r.clientPhone}</span>}
                        {r.clientEmail && <span>✉️ {r.clientEmail}</span>}
                        <span className="ml-auto">{fecha(r.createdAt)}</span>
                      </p>
                      <dl className="mt-1.5 space-y-1">
                        {r.data.map((d, i) => (
                          <div key={i} className="flex gap-2 text-[12px]">
                            <dt className="w-40 shrink-0 truncate font-semibold text-text-3">{d.label}</dt>
                            <dd className="min-w-0 text-text-1">{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <Kpi label="Respuestas" value={String(total)} />
                <Kpi label="Hoy" value={String(hoy)} />
                <Kpi label="Última" value={ultima ? hace(ultima) : "—"} />
              </div>
              {total === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-[12.5px] text-text-3">
                  Todavía sin respuestas. Compartí el link de la página para empezar a recibirlas.
                </p>
              ) : (
                <>
                  {stats.map((s) => (
                    <div key={s.field.id} className="rounded-lg border bg-background p-3">
                      <p className="mb-1.5 text-[12px] font-semibold text-text-2">{s.field.label}</p>
                      {s.graficable && s.filas ? (
                        <DistBar filas={s.filas} />
                      ) : s.promedio !== undefined ? (
                        <p className="text-[12.5px] text-text-3">
                          Promedio: <span className="font-bold text-text-1">{s.promedio.toFixed(1)}</span> ·{" "}
                          {s.total} respuestas
                        </p>
                      ) : (
                        <p className="text-[12px] text-text-3">
                          Respuesta abierta — {s.total} respuestas. Se leen una por una en «👥 Individual».
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="rounded-lg border bg-background p-3">
                    <p className="mb-1.5 text-[12px] font-semibold text-text-2">
                      Respuestas por día — últimos 14 días
                    </p>
                    <TimelineBar datos={timeline(responses.map((r) => r.createdAt))} />
                  </div>
                </>
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
