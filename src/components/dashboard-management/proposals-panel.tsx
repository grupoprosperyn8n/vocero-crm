"use client";

/**
 * 041 — Pestaña «Propuestas» del tablero: el embudo completo de la
 * publicidad comercial (creada → derivada → enviada → vista → respondió),
 * con filtro por empleado asignado y por estado. Cada fila abre la página
 * pública, copia el link o salta al panel de control del cliente.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  ExternalLink,
  History as HistoryIcon,
  Loader2,
  ListChecks,
  PauseCircle,
  Pencil,
  PlayCircle,
  Send,
  Ticket,
  RefreshCcw,
  Trash2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type {
  PiezaResultsSummaryDto,
  ProposalDto,
  TeamGroupLiteDto,
  TeamMemberLiteDto,
} from "@/lib/types";
import { kindTag, priorityChip, proposalStatusChip, type PanelCustomer } from "./client-panel";
import { WidgetResultsModal } from "./widget-results";
import {
  ProposalEditModal,
  ProposalHistoryModal,
  proposalLifecycle,
  type LifecycleAction,
} from "./proposal-actions";

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
  const [groups, setGroups] = useState<TeamGroupLiteDto[]>([]);
  /** "u:<id>" = empleado, "g:<id>" = grupo, "" = todos (041b). */
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");
  /** 041e — "" activas · "1" con archivadas · "only" solo archivadas. */
  const [archived, setArchived] = useState<"" | "1" | "only">("");
  const [viewerRole, setViewerRole] = useState("member");
  const [editing, setEditing] = useState<ProposalDto | null>(null);
  const [historyFor, setHistoryFor] = useState<ProposalDto | null>(null);
  /* 044b-B11 — respuestas/tokens de la pieza. */
  const [resultsFor, setResultsFor] = useState<Pick<
    ProposalDto,
    "id" | "title" | "token" | "widget"
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /* 044b-B13 — «Propuestas» (el embudo y la lista) y «Resultados» (el general
     de piezas con respuestas/vouchers: misma información, otra puerta). */
  const [vista, setVista] = useState<"propuestas" | "resultados">("propuestas");
  const [resultados, setResultados] = useState<PiezaResultsSummaryDto[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /* 044b-B16 — «Enviar al cliente»: fila con el envío en curso. */
  const [sendingId, setSendingId] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(
    async (dirLoaded: boolean) => {
      setLoading(true);
      setError("");
      const qs = new URLSearchParams();
      if (assignee.startsWith("g:")) qs.set("assigneeGroup", assignee.slice(2));
      else if (assignee.startsWith("u:")) qs.set("assignee", assignee.slice(2));
      if (status) qs.set("status", status);
      if (archived === "1") qs.set("archived", "1");
      if (archived === "only") qs.set("archivedOnly", "1");
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
          viewer?: { role?: string };
          message?: string;
        };
        if (!pRes.ok || !pData.proposals || !pData.funnel) {
          throw new Error(pData.message ?? "No se pudieron cargar las propuestas");
        }
        setProposals(pData.proposals);
        setFunnel(pData.funnel);
        if (pData.viewer?.role) setViewerRole(pData.viewer.role);
        if (dRes) {
          const dData = (await dRes.json().catch(() => ({}))) as {
            members?: TeamMemberLiteDto[];
            groups?: TeamGroupLiteDto[];
          };
          setDirectory(dData.members ?? []);
          setGroups(dData.groups ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las propuestas");
      } finally {
        setLoading(false);
      }
    },
    [assignee, status, archived]
  );

  useEffect(() => {
    void load(directory.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignee, status, archived]);

  /* 044b-B13 — el general de Resultados se carga la primera vez que se abre. */
  useEffect(() => {
    if (vista !== "resultados" || resultados !== null) return;
    void (async () => {
      const res = await fetch("/api/proposals/results", { cache: "no-store" }).catch(
        () => null
      );
      if (!res?.ok) {
        setResultados([]);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        piezas?: PiezaResultsSummaryDto[];
      };
      setResultados(data.piezas ?? []);
    })();
  }, [vista, resultados]);

  const handleLifecycle = async (p: ProposalDto, action: LifecycleAction) => {
    if (
      action === "delete" &&
      !window.confirm(`¿Eliminar «${p.title}»? No se puede deshacer.`)
    ) {
      return;
    }

    const r = await proposalLifecycle(p.id, action);

    if (!r.ok) {
      setError(r.message ?? "No se pudo completar la acción");
      return;
    }

    await load(false);
  };

  const copy = async (p: ProposalDto) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${p.publicUrl}`);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* sin clipboard */
    }
  };

  /**
   * 044b-B16 — «Enviar al cliente»: registra el envío en el embudo (marca la
   * pieza como enviada y garantiza contacto/conversación) y abre el chat del
   * cliente con el mensaje + el link ya cargados, listos para revisar y
   * mandar. Si el cliente no tiene teléfono, queda enviada y se copia el link.
   */
  const handleSend = async (p: ProposalDto) => {
    if (sendingId) return;
    setSendingId(p.id);
    setError("");
    try {
      const res = await fetch(`/api/proposals/${p.id}/send`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { proposal?: ProposalDto & { contactId?: string | null }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.proposal) {
        throw new Error(body?.error?.message ?? "No se pudo registrar el envío");
      }
      const updated = body.proposal;
      setProposals((prev) =>
        prev
          ? prev.map((x) =>
              x.id === p.id ? { ...x, status: "enviada" as ProposalDto["status"] } : x
            )
          : prev
      );
      const contactId = updated.contactId ?? null;
      if (contactId) {
        const first = (p.clientName || "").trim().split(/\s+/)[0] ?? "";
        const salute = first ? `Hola ${first}!` : "Hola!";
        const draft = `${salute} ${p.title || "Te dejo una propuesta"}${
          p.offer ? ` — ${p.offer}` : ""
        }\n${window.location.origin}${p.publicUrl}`;
        router.push(`/inbox?contact=${contactId}&draft=${encodeURIComponent(draft)}`);
      } else {
        await copy(p);
        setError(
          "El cliente no tiene teléfono en el sistema: la pieza quedó marcada como enviada y el link está copiado para mandarlo por otra vía."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la pieza");
    } finally {
      setSendingId(null);
    }
  };

  /** B9 — aceptar la gestión derivada al grupo: queda marcado quién la toma. */
  const handleAccept = async (p: ProposalDto) => {
    const res = await fetch(`/api/proposals/${p.id}/accept`, { method: "POST" }).catch(
      () => null
    );
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? "No se pudo aceptar la gestión");
      return;
    }
    await load(true);
  };

  const tasaRespuesta =
    funnel && funnel.enviada > 0 ? Math.round((funnel.respondidas / funnel.enviada) * 100) : null;

  return (
    <div className="space-y-4">
      {/* 044b-B13 — dos puertas: la lista de propuestas y el general de resultados */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setVista("propuestas")}
          aria-pressed={vista === "propuestas"}
          className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors ${
            vista === "propuestas"
              ? "border-brand bg-brand text-brand-fg"
              : "border-border-strong bg-card text-text-2 hover:bg-accent"
          }`}
        >
          📋 Propuestas
        </button>
        <button
          type="button"
          onClick={() => setVista("resultados")}
          aria-pressed={vista === "resultados"}
          className={`inline-flex h-8 items-center rounded-full border px-3.5 text-[12px] font-semibold transition-colors ${
            vista === "resultados"
              ? "border-brand bg-brand text-brand-fg"
              : "border-border-strong bg-card text-text-2 hover:bg-accent"
          }`}
        >
          📊 Resultados
        </button>
        <span className="text-[11.5px] text-text-3">
          {vista === "resultados"
            ? "Todas las piezas con respuestas o vouchers — tocá una para ver su dashboard."
            : "El embudo completo y cada pieza con sus acciones."}
        </span>
      </div>

      {vista === "resultados" ? (
        <ResultadosGenerales piezas={resultados} onOpen={(p) => setResultsFor(p)} />
      ) : (
        <>
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
          <UserRound size={13} /> Gestiona:
        </span>
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
        >
          <option value="">Todo el equipo</option>
          <optgroup label="Empleados">
            {directory.map((m) => (
              <option key={m.userId} value={`u:${m.userId}`}>
                {m.name}
              </option>
            ))}
          </optgroup>
          {groups.length > 0 && (
            <optgroup label="Grupos del chat">
              {groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          )}
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
        <select
          value={archived}
          onChange={(e) => setArchived(e.target.value as "" | "1" | "only")}
          className="rounded-lg border bg-card px-2 py-1.5 text-[12.5px]"
          title="041e — las archivadas salen del trabajo activo pero se pueden revisar siempre"
        >
          <option value="">Activas</option>
          <option value="1">Activas + archivadas</option>
          <option value="only">Solo archivadas</option>
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
                    {p.widget
                      ? ` · ${
                          p.widget.type === "form"
                            ? "📝 Formulario"
                            : p.widget.type === "survey"
                              ? "📊 Encuesta"
                              : "🎟️ Cupón"
                        }`
                      : ""}
                    {p.assigneeName
                      ? ` · ${p.assigneeKind === "group" ? "👥 " : ""}${p.assigneeName}`
                      : " · sin derivar"}
                    {" · "}
                    {new Date(p.createdAt).toLocaleDateString("es-AR")}
                    {p.views > 0 ? ` · ${p.views} vista${p.views === 1 ? "" : "s"}` : ""}
                    {p.respondedAt ? " · respondió ✓" : ""}
                  </p>
                </div>
                {p.archivedAt && (
                  <span className="rounded-full border bg-subtle px-2 py-0.5 text-[10.5px] font-bold text-text-3">
                    Archivada
                  </span>
                )}
                {/* B9 — gestión de un grupo: aceptar / quién la tomó */}
                {p.assigneeGroupId && !p.acceptedBy ? (
                  <button
                    type="button"
                    onClick={() => void handleAccept(p)}
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 hover:bg-amber-500/20"
                    title="La gestión está asignada al grupo: aceptala y queda registrado que la tomás vos"
                  >
                    👥 Sin aceptar — Aceptar
                  </button>
                ) : p.acceptedByName ? (
                  <span
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700"
                    title={`Gestión aceptada por ${p.acceptedByName}`}
                  >
                    ✓ {p.acceptedByName}
                  </span>
                ) : null}
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${pr.className}`}>
                  {pr.label.replace("Prioridad ", "")}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${st.className}`}>{st.label}</span>
                <div className="flex items-center gap-1">
                  {/* 044b-B16 — Enviar al cliente: registra el envío y abre el chat cargado. */}
                  <button
                    type="button"
                    onClick={() => void handleSend(p)}
                    disabled={sendingId === p.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-soft bg-brand-tint px-2 py-1.5 text-[11px] font-semibold text-brand-text transition-colors hover:opacity-90 disabled:opacity-50"
                    title="Enviar al cliente: registra el envío y abre el chat con el mensaje y el link listos para revisar y mandar"
                  >
                    {sendingId === p.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Send size={12} />
                    )}
                    Enviar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                    title="Editar los textos (queda registrado quién)"
                  >
                    <Pencil size={13} />
                  </button>
                  {p.widget && (
                    <button
                      type="button"
                      onClick={() => setResultsFor(p)}
                      className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                      title={
                        p.widget.type === "coupon"
                          ? "Dashboard del cupón: control y tokens"
                          : "Dashboard de respuestas"
                      }
                    >
                      {p.widget.type === "coupon" ? <Ticket size={13} /> : <ListChecks size={13} />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setHistoryFor(p)}
                    className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                    title="Historial de la gestión"
                  >
                    <HistoryIcon size={13} />
                  </button>
                  {(viewerRole === "owner" || viewerRole === "admin" || viewerRole === "manager") && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleLifecycle(p, p.archivedAt ? "restore" : "archive")}
                        className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                        title={p.archivedAt ? "Sacar del archivo" : "Archivar (gerente y arriba)"}
                      >
                        {p.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleLifecycle(p, p.online ? "offline" : "online")}
                        className="rounded-lg border bg-card p-1.5 text-text-3 hover:bg-subtle hover:text-text-1"
                        title={p.online ? "Pausar la publicidad (offline)" : "Volver a ponerla online"}
                      >
                        {p.online ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                      </button>
                    </>
                  )}
                  {(viewerRole === "owner" || viewerRole === "admin") && (
                    <button
                      type="button"
                      onClick={() => void handleLifecycle(p, "delete")}
                      className="rounded-lg border bg-card p-1.5 text-rose-500 hover:bg-rose-50"
                      title="Eliminar (solo dueño/propietario)"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
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
        </>
      )}

      {/* 041e — editar / historial */}
      {editing && (
        <ProposalEditModal
          proposal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load(false);
          }}
        />
      )}
      {historyFor && (
        <ProposalHistoryModal
          proposal={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
      {resultsFor && (
        <WidgetResultsModal proposal={resultsFor} onClose={() => setResultsFor(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 044b-B13 — el dashboard GENERAL de Resultados: todas las piezas que tienen
 * respuestas (formularios/encuestas) o vouchers (cupones). Es «misma
 * información, dos puertas de entrada»: acá el conjunto; en cada pieza, su
 * dashboard completo.
 */
function ResultadosGenerales({
  piezas,
  onOpen,
}: {
  piezas: PiezaResultsSummaryDto[] | null;
  onOpen: (p: Pick<ProposalDto, "id" | "title" | "token" | "widget">) => void;
}) {
  if (piezas === null) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card px-4 py-8 text-[12.5px] text-text-3">
        <Loader2 size={15} className="animate-spin" /> Cargando resultados…
      </p>
    );
  }
  if (piezas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-[12.5px] text-text-3">
        Todavía no hay respuestas ni vouchers. Armá un formulario, encuesta o cupón en el
        Constructor y compartilo: acá vas a ver los resultados de todas las piezas juntas.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {piezas.map((p) => {
        const esCupon = p.widget?.type === "coupon";
        const esEncuesta = p.widget?.type === "survey";
        return (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              onOpen({ id: p.id, title: p.title, token: p.token, widget: p.widget })
            }
            className="w-full rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold text-text-1">
                  {esCupon ? "🎟️" : esEncuesta ? "📊" : "📝"} {p.title}
                </p>
                <p className="text-[11px] text-text-3">
                  {esCupon ? "Cupón / voucher" : esEncuesta ? "Encuesta" : "Formulario"} ·
                  creada el {new Date(p.createdAt).toLocaleDateString("es-AR")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {esCupon ? (
                  <>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      {p.tokensEmitidos} emitidos
                    </span>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {p.tokensCanjeados} canjeados
                    </span>
                  </>
                ) : (
                  <span className="rounded-full border border-brand-soft bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-text">
                    {p.respuestas} {p.respuestas === 1 ? "respuesta" : "respuestas"}
                  </span>
                )}
                <span className="text-[11px] font-semibold text-brand">
                  Ver dashboard →
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
