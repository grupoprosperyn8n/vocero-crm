"use client";

/*
 * 042 — Tablero maestro de campañas 360 (propietario, dueño y gerente).
 *
 * El macro de TODAS las publicidades comerciales de la organización: embudo,
 * por empleado, por tipo, últimos 14 días y la lista completa con acceso a la
 * página pública y al panel de control del cliente (Cliente 360°).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  Megaphone,
  RefreshCcw,
  Send,
  Users,
} from "lucide-react";
import type { CampaignOverview, CampaignOverviewRow } from "@/server/proposals/overview";
import { kindTag, proposalStatusChip, type PanelCustomer } from "./client-panel";

const ESTADOS: { id: string; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "borrador", label: "Borradores" },
  { id: "derivada", label: "Derivadas" },
  { id: "enviada", label: "Enviadas" },
  { id: "vista", label: "Vistas" },
  { id: "respondio", label: "Respondidas" },
  { id: "archivada", label: "Archivadas" },
];

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

export function CampaignsPanel({
  onOpenPanel,
}: {
  onOpenPanel: (customer: PanelCustomer) => void;
}) {
  const [data, setData] = useState<CampaignOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState("todas");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/proposals/overview", { cache: "no-store" }).catch(() => null);
    const body = res
      ? ((await res.json().catch(() => ({}))) as { overview?: CampaignOverview; error?: { message?: string } })
      : null;
    setLoading(false);
    if (!res?.ok || !body?.overview) {
      setError(body?.error?.message ?? "No se pudo cargar el tablero de campañas");
      return;
    }
    setData(body.overview);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filas = useMemo(() => {
    if (!data) return [] as CampaignOverviewRow[];
    const q = search.trim().toLowerCase();
    return data.recent.filter((r) => {
      if (q && !r.clientName.toLowerCase().includes(q)) return false;
      switch (estado) {
        case "borrador":
          return r.status === "borrador" && !r.archived;
        case "derivada":
          return r.status === "derivada" && !r.archived;
        case "enviada":
          return r.status === "enviada" && !r.archived;
        case "vista":
          return r.views > 0 && !r.archived;
        case "respondio":
          return r.responded;
        case "archivada":
          return r.archived;
        default:
          return true;
      }
    });
  }, [data, estado, search]);

  if (!data && loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-10 text-[12.5px] text-text-2">
        <Loader2 size={15} className="animate-spin" /> Armando el macro de las campañas…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2 rounded-lg border bg-card px-4 py-8 text-center">
        <p className="text-[12.5px] font-semibold text-text-2">
          {error ?? "Sin datos todavía"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-subtle px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-accent"
        >
          <RefreshCcw size={13} /> Reintentar
        </button>
      </div>
    );
  }

  const t = data.totals;
  const embudo = [
    { label: "Creadas", value: t.total, className: "bg-neutral-400" },
    { label: "Derivadas+", value: t.total - t.borradores, className: "bg-amber-400" },
    { label: "Enviadas", value: t.enviadas, className: "bg-brand" },
    { label: "Con vistas", value: t.vistas, className: "bg-sky-500" },
    { label: "Respondieron", value: t.respondidas, className: "bg-emerald-500" },
  ];
  const maxEmbudo = Math.max(1, ...embudo.map((e) => e.value));
  const maxDia = Math.max(1, ...data.byDay.map((d) => d.creadas + d.enviadas));

  return (
    <div className="space-y-3">
      <section className="rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-text-1">
            <Megaphone size={15} className="text-brand" /> Macro de campañas 360
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-subtle px-2.5 py-1 text-[11.5px] font-semibold text-text-2 hover:bg-accent"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            Actualizar
          </button>
        </div>

        {/* Embudo */}
        <div className="mt-3 space-y-1.5">
          {embudo.map((e) => (
            <div key={e.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] font-semibold text-text-2 sm:w-28">
                {e.label}
              </span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-subtle">
                <div
                  className={`h-full rounded-full ${e.className} transition-all`}
                  style={{ width: `${Math.round((e.value / maxEmbudo) * 100)}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-text-1">
                {e.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold text-text-2">
          <span className="rounded-full border bg-subtle/60 px-2 py-0.5">
            👁️ {t.vistasTotal} vistas en total
          </span>
          <span className="rounded-full border bg-subtle/60 px-2 py-0.5">🖼️ {t.conMedios} con medios</span>
          <span className="rounded-full border bg-subtle/60 px-2 py-0.5">🗄️ {t.archivadas} archivadas</span>
          <span className="rounded-full border bg-subtle/60 px-2 py-0.5">⏸️ {t.fueraDeLinea} fuera de línea</span>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Por empleado */}
        <section className="rounded-xl border bg-card p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-text-1">
            <Users size={14} className="text-brand" /> Cómo va cada uno
          </p>
          <ul className="mt-2 space-y-2">
            {data.byAssignee.map((a) => (
              <li key={a.name}>
                <div className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="min-w-0 truncate font-semibold text-text-2">{a.name}</span>
                  <span className="shrink-0 tabular-nums text-text-3">
                    {a.total} · ✓{a.respondidas}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round((a.respondidas / Math.max(1, a.total)) * 100)}%` }}
                    title={`${a.respondidas} respondieron de ${a.total}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Por tipo + días */}
        <section className="space-y-3">
          <div className="rounded-xl border bg-card p-3 sm:p-4">
            <p className="text-[12.5px] font-bold text-text-1">Por tipo de campaña</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.byKind.map((k) => {
                const tag = kindTag(k.kind);
                return (
                  <span
                    key={k.kind}
                    className="rounded-full border bg-subtle/60 px-2.5 py-1 text-[11.5px] font-semibold text-text-2"
                  >
                    {tag.emoji} {k.label}: <strong>{k.total}</strong>
                    {k.respondidas > 0 && (
                      <span className="text-emerald-600"> · ✓{k.respondidas}</span>
                    )}
                  </span>
                );
              })}
              {data.byKind.length === 0 && (
                <p className="text-[11.5px] text-text-3">Todavía no hay campañas creadas.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-3 sm:p-4">
            <p className="text-[12.5px] font-bold text-text-1">Últimos 14 días</p>
            <div className="mt-2 flex h-20 items-end gap-1">
              {data.byDay.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className="w-full rounded-t bg-brand/70"
                    style={{ height: `${Math.max(3, Math.round(((d.creadas + d.enviadas) / maxDia) * 64))}px` }}
                    title={`${d.day}: ${d.creadas} creadas · ${d.enviadas} enviadas`}
                  />
                  <span className="text-[8.5px] text-text-3">{d.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Lista completa */}
      <section className="rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12.5px] font-bold text-text-1">
            Campañas ({filas.length}
            {filas.length !== data.recent.length ? ` de ${data.recent.length}` : ""})
          </p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente…"
            className="ml-auto w-full rounded-lg border bg-card px-3 py-1.5 text-[12px] sm:w-56"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEstado(e.id)}
              className={
                estado === e.id
                  ? "rounded-full border border-brand bg-brand px-2.5 py-1 text-[11px] font-bold text-brand-fg"
                  : "rounded-full border bg-subtle/60 px-2.5 py-1 text-[11px] font-semibold text-text-2 hover:bg-accent"
              }
            >
              {e.label}
            </button>
          ))}
        </div>

        <ul className="mt-3 divide-y">
          {filas.map((r) => {
            const chip = proposalStatusChip({
              status: r.status as "borrador" | "derivada" | "enviada",
              respondedAt: r.responded ? r.createdAt : null,
              views: r.views,
              sentAt: r.sentAt,
            });
            const tag = kindTag(r.kind);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-[12.5px] text-text-1">{r.clientName}</strong>
                    <span className="rounded-full border bg-subtle/60 px-1.5 py-px text-[10px] font-semibold text-text-2">
                      {tag.emoji} {tag.label}
                    </span>
                    <span className={`rounded-full border px-1.5 py-px text-[10px] font-semibold ${chip.className}`}>
                      {chip.label}
                    </span>
                    {r.archived && (
                      <span className="rounded-full border bg-subtle px-1.5 py-px text-[10px] font-semibold text-text-3">
                        🗄️ Archivada
                      </span>
                    )}
                    {r.sentAt && !r.online && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-semibold text-amber-600">
                        ⏸️ Fuera de línea
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-text-3">
                    {r.assigneeName ? `🗣️ ${r.assigneeName}` : "🤖 IA primero"} · creada{" "}
                    {fechaCorta(r.createdAt)}
                    {r.sentAt ? ` · enviada ${fechaCorta(r.sentAt)}` : ""}
                    {r.mediaCount > 0 ? ` · ${r.mediaCount} medio${r.mediaCount > 1 ? "s" : ""}` : ""}
                    {r.views > 0 ? ` · ${r.views} vista${r.views > 1 ? "s" : ""}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className="hidden items-center gap-1 text-[10.5px] text-text-3 sm:inline-flex"
                    title={`${r.views} vistas`}
                  >
                    <Eye size={11} /> {r.views}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPanel({
                        id: r.clientRef,
                        name: r.clientName,
                        recommendation: r.kindLabel,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-brand-soft bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand-text hover:opacity-90"
                    title="Panel de control del cliente (Cliente 360°): métricas y todas sus campañas"
                  >
                    <LayoutDashboard size={11} /> Panel 360
                  </button>
                  <a
                    href={r.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-text-2 hover:bg-accent"
                    title="Abrir la página pública de esta campaña"
                  >
                    <ExternalLink size={11} /> Ver
                  </a>
                </div>
              </li>
            );
          })}
          {filas.length === 0 && (
            <li className="py-6 text-center text-[12px] text-text-3">
              Nada con ese filtro. Probá «Todas» u otra búsqueda.
            </li>
          )}
        </ul>
        {data.recent.length === 80 && (
          <p className="mt-2 text-[10.5px] text-text-3">
            Se muestran las 80 más recientes de {t.total}.
          </p>
        )}
      </section>

      <p className="flex items-center gap-1.5 px-1 text-[10.5px] text-text-3">
        <Send size={11} /> Cada fila abre su página pública o el panel del cliente — de ahí se
        deriva, se manda y se sigue todo.
      </p>
    </div>
  );
}
