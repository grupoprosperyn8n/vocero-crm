"use client";

/**
 * 041 — Pestaña «Propuestas» del tablero: el embudo completo de la
 * publicidad comercial (creada → derivada → enviada → vista → respondió),
 * con filtro por empleado asignado y por estado. Cada fila abre la página
 * pública, copia el link o salta al panel de control del cliente.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { ProposalDto, TeamMemberLiteDto } from "@/lib/types";
import { kindTag, priorityChip, proposalStatusChip, type PanelCustomer } from "./client-panel";

type Funnel = {
  total: number;
  borrador: number;
  derivada: number;
  enviada: number;
  vistas: number;
  respondidas: number;
};

function FunnelChip({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "good" | "brand" | "warn" }) {
  const tones = {
    default: "border bg-card text-text-2",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    brand: "border-brand-soft bg-brand-tint text-brand-text",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  };
  return (
    <div className={`flex flex-col rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <span className="text-[10.5px] font-semibold tracking-wide uppercase opacity-80">{label}</span>
      <span className="text-[16px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

export function ProposalsPanel({ onOpenPanel }: { onOpenPanel: (c: PanelCustomer) => void }) {
  const [proposals, setProposals] = useState<ProposalDto[] | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [directory, setDirectory] = useState<TeamMemberLiteDto[]>([]);
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(
    async (dirLoaded: boolean) => {
      setLoading(true);
      setError("");
      const qs = new URLSearchParams();
      if (assignee) qs.set("assignee", assignee);
      if (status) qs.set("status", status);
      try {
        const [pRes, dRes] = await Promise.all([
          fetch(`/api/proposals?${qs.toString()}`, { cache: "no-store" }),
          dirLoaded
            ? Promise.resolve(null)
            : fetch("/api/staff/directory", { cache: "no-store" }).catch(() => null),
        ]);
        const pData = (await pRes.json().catch(() => ({}))) as {
          proposals?: ProposalDto[];
          funnel?: Funnel;
          message?: string;
        };
        if (!pRes.ok || !pData.proposals || !pData.funnel) {
          throw new Error(pData.message ?? "No se pudieron cargar las propuestas");
        }
        setProposals(pData.proposals);
        setFunnel(pData.funnel);
        if (dRes) {
          const dData = (await dRes.json().catch(() => ({}))) as { members?: TeamMemberLiteDto[] };
          setDirectory(dData.members ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las propuestas");
      } finally {
        setLoading(false);
      }
    },
    [assignee, status]
  );

  useEffect(() => {
    void load(directory.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignee, status]);

  const copy = async (p: ProposalDto) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${p.publicUrl}`);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* sin clipboard */
    }
  };

  const tasaRespuesta =
    funnel && funnel.enviada > 0 ? Math.round((funnel.respondidas / funnel.enviada) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Embudo */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <FunnelChip label="Creadas" value={funnel?.total ?? "—"} />
        <FunnelChip label="Derivadas" value={funnel?.derivada ?? "—"} tone="warn" />
        <FunnelChip label="Enviadas" value={funnel?.enviada ?? "—"} tone="brand" />
        <FunnelChip label="Vistas" value={funnel?.vistas ?? "—"} />
        <FunnelChip label="Respondidas" value={funnel?.respondidas ?? "—"} tone="good" />
        <FunnelChip label="Tasa respuesta" value={tasaRespuesta === null ? "—" : `${tasaRespuesta}%`} tone="good" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-text-2">
          <UserRound size={13} /> Empleado:
        </span>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
        >
          <option value="">Todo el equipo</option>
          {directory.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
        >
          <option value="">Todos los estados</option>
          <option value="borrador">Borrador</option>
          <option value="derivada">Derivada</option>
          <option value="enviada">Enviada</option>
        </select>
        <button
          type="button"
          onClick={() => void load(false)}
          className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          <RefreshCcw size={13} className={loading ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {error && <p className="text-[12.5px] font-semibold text-danger-text">{error}</p>}

      {/* Lista */}
      {proposals === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-card px-4 py-10 text-[13px] text-text-3">
          <Loader2 size={15} className="animate-spin" /> Cargando propuestas…
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-[12.5px] text-text-3">
          Todavía no hay propuestas con estos filtros. Armá la primera desde el panel de un cliente en{" "}
          <strong>Cliente 360°</strong>.
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => {
            const st = proposalStatusChip(p);
            const pr = priorityChip(p.priority);
            const k = kindTag(p.kind);
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
                <span className="text-[16px]">{k.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-text-1">{p.title}</p>
                  <p className="truncate text-[11.5px] text-text-3">
                    <button
                      type="button"
                      className="font-semibold text-brand-text hover:underline"
                      onClick={() => onOpenPanel({ id: p.clientRef, name: p.clientName })}
                      title="Abrir el panel de control de este cliente"
                    >
                      {p.clientName}
                    </button>
                    {" · "}
                    {k.label}
                    {p.assigneeName ? ` · ${p.assigneeName}` : " · sin derivar"}
                    {" · "}
                    {new Date(p.createdAt).toLocaleDateString("es-AR")}
                    {p.views > 0 ? ` · ${p.views} vista${p.views === 1 ? "" : "s"}` : ""}
                    {p.respondedAt ? " · respondió ✓" : ""}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${pr.className}`}>
                  {pr.label.replace("Prioridad ", "")}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${st.className}`}>{st.label}</span>
                <div className="flex items-center gap-1">
                  <a
                    href={p.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                    title="Abrir página pública"
                  >
                    <ExternalLink size={13} />
                  </a>
                  <button
                    type="button"
                    onClick={() => void copy(p)}
                    className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                    title="Copiar link público"
                  >
                    {copiedId === p.id ? <TrendingUp size={13} className="text-emerald-600" /> : <ClipboardCopy size={13} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
