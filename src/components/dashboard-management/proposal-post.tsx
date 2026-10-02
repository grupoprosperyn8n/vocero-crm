"use client";

/**
 * B9 — EL FLUJO DE LA PUBLICACIÓN CREADA, EN UN SOLO LUGAR.
 *
 * Lo usan la pestaña «Constructor» (Marketing) y el Cliente 360°: apenas se
 * crea la pieza se puede
 *   · COMPARTIRLA a un cliente directo —del sistema o un contacto del CRM—,
 *   · DERIVAR la gestión a la IA, un empleado o un grupo del chat interno
 *     (el aviso con el link les llega por el chat),
 *   · si va a un GRUPO, cualquier integrante la ACEPTA y queda marcado quién
 *     la tomó (acceptedBy / acceptedAt),
 *   · escribir el MENSAJE con IA por tono y enviarlo por WhatsApp (abre el
 *     chat con el borrador y la imagen listos) o copiarlo.
 *
 * El panel es autosuficiente: recibe el id y carga el DTO por su cuenta
 * (GET /api/proposals/:id), así el Constructor no necesita más que el id.
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  UserCheck,
  Users,
  Wand2,
} from "lucide-react";

import type {
  ProposalDto,
  ProposalPriority,
  SystemClientSearchResultDto,
  TeamGroupLiteDto,
  TeamMemberLiteDto,
} from "@/lib/types";
import { systemClientName } from "@/lib/utils";
import { TONES, TONE_IDS, type ProposalToneId } from "@/lib/proposals/copy";
import { Select } from "@/components/ui/select";

type CrmContactLite = { id: string; name: string; phone: string | null };

export function ProposalPostPanel({
  proposalId,
  customerName,
  onOpenInbox,
  onChanged,
  onNew,
}: {
  proposalId: string;
  /** Nombre para el mensaje (si no viene, se usa el destinatario de la pieza). */
  customerName?: string | null;
  /** Abrir el chat con el borrador y la imagen (dashboard). */
  onOpenInbox?: (input: {
    contactId: string | null;
    draft: string;
    attach?: string | null;
  }) => void;
  /** Avisar al padre que la pieza cambió (refrescar ficha/lista). */
  onChanged?: () => void;
  /** Volver a empezar: crear otra publicación. */
  onNew?: () => void;
}) {
  const [p, setP] = useState<ProposalDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "derive" | "send" | "accept">(null);

  const [directory, setDirectory] = useState<TeamMemberLiteDto[] | null>(null);
  const [groups, setGroups] = useState<TeamGroupLiteDto[]>([]);
  const [viewerRole, setViewerRole] = useState<string>("member");

  const [deriveOpen, setDeriveOpen] = useState(false);
  const [targetKind, setTargetKind] = useState<"ia" | "employee" | "group">("ia");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<ProposalPriority>("media");
  const [note, setNote] = useState("");
  const [derived, setDerived] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareModo, setShareModo] = useState<"sistema" | "crm">("sistema");
  const [shareQ, setShareQ] = useState("");
  const [shareResults, setShareResults] = useState<SystemClientSearchResultDto[]>([]);
  const [shareCrm, setShareCrm] = useState<CrmContactLite[]>([]);
  const [shareSearching, setShareSearching] = useState(false);
  const [shareDone, setShareDone] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [msgTone, setMsgTone] = useState<ProposalToneId>("cercana");
  const [aiBusy, setAiBusy] = useState<null | "mensaje">(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState<null | "link" | "mensaje">(null);
  const angle = "beneficio" as const;

  // Derivar: propietario, administrador y gerente (igual que las alertas).
  const canDerive =
    viewerRole === "owner" || viewerRole === "admin" || viewerRole === "manager";

  /* Carga del DTO (el panel es autosuficiente). */
  useEffect(() => {
    let alive = true;
    setP(null);
    setLoadError(null);
    void fetch(`/api/proposals/${proposalId}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          proposal?: ProposalDto;
          error?: { message?: string };
        };
        if (!alive) return;
        if (!res.ok || !body.proposal) {
          setLoadError(body.error?.message ?? "No se pudo abrir la publicación");
          return;
        }
        setP(body.proposal);
      })
      .catch(() => {
        if (alive) setLoadError("No se pudo abrir la publicación");
      });
    return () => {
      alive = false;
    };
  }, [proposalId]);

  /* Directorio del equipo + grupos del chat + mi rol (para derivar). */
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

  /* Compartir: búsqueda con debounce (sistema o CRM, según el modo). */
  useEffect(() => {
    const term = shareQ.trim();
    if (!shareOpen || term.length < 2) {
      setShareResults([]);
      setShareCrm([]);
      return;
    }
    setShareSearching(true);
    const t = setTimeout(async () => {
      if (shareModo === "sistema") {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(term)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        setShareResults(
          ((res as { results?: SystemClientSearchResultDto[] } | null)?.results ?? []).slice(0, 8)
        );
      } else {
        const res = await fetch(`/api/contacts?q=${encodeURIComponent(term)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        setShareCrm(
          (
            (res as { contacts?: CrmContactLite[] } | null)?.contacts ?? []
          ).slice(0, 8)
        );
      }
      setShareSearching(false);
    }, 450);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [shareQ, shareModo, shareOpen]);

  const absUrl = (url: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}${url}`;

  const customer = customerName?.trim() || p?.clientName || "el cliente";

  /* ————— Acciones ————— */

  const doShare = async (target: {
    clientRef?: string;
    contactId?: string;
    nombre: string;
    telefono?: string | null;
  }) => {
    setBusy(null);
    setError(null);
    const res = await fetch(`/api/proposals/${proposalId}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRef: target.clientRef ?? null,
        contactId: target.contactId ?? null,
        clientName: target.nombre,
        clientPhone: target.telefono ?? null,
      }),
    }).catch(() => null);
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          proposal?: ProposalDto;
          error?: { message?: string };
        })
      : null;
    if (!res?.ok || !data?.proposal) {
      setError(data?.error?.message ?? "No se pudo compartir la publicación");
      return;
    }
    setP(data.proposal);
    setShareDone(target.nombre);
    setShareOpen(false);
    setShareQ("");
    setShareResults([]);
    setShareCrm([]);
    onChanged?.();
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
    if (!p) return;
    if (targetKind !== "ia" && !assignee) return;
    setBusy("derive");
    setError(null);
    const res = await fetch(`/api/proposals/${p.id}/derive`, {
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
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          proposal?: ProposalDto;
          error?: { message?: string };
        })
      : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.error?.message ?? "No se pudo derivar la propuesta");
      return;
    }
    setP(data.proposal);
    const who =
      targetKind === "ia"
        ? "la IA"
        : targetKind === "group"
          ? groups.find((g) => g.id === assignee)?.name ?? "el grupo"
          : directory?.find((m) => m.userId === assignee)?.name ?? "el empleado";
    setDerived(who);
    setDeriveOpen(false);
    onChanged?.();
  };

  /** B9 — aceptar la gestión del grupo: queda marcado quién la tomó. */
  const accept = async () => {
    if (!p) return;
    setBusy("accept");
    setError(null);
    const res = await fetch(`/api/proposals/${p.id}/accept`, { method: "POST" }).catch(
      () => null
    );
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          proposal?: ProposalDto;
          error?: { message?: string };
        })
      : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.error?.message ?? "No se pudo aceptar la gestión");
      return;
    }
    setP(data.proposal);
    onChanged?.();
  };

  const rewriteMessage = async (targetTone: ProposalToneId) => {
    if (!p) return;
    setAiBusy("mensaje");
    setError(null);
    const res = await fetch("/api/proposals/copy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target: "mensaje",
        tone: targetTone,
        angle,
        instructions: null,
        clientName: customer,
        kind: p.kind,
        productName: p.productName ?? "",
        companyName: p.companyName ?? "",
        title: p.title ?? "",
        subtitle: p.subtitle ?? "",
        body: p.body ?? "",
        offer: p.offer ?? "",
        benefit: p.benefit ?? "",
        ctaLabel: p.ctaLabel ?? "",
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
    setDraftText(`${data.copy.message}\n\nMiralá acá 👉 ${absUrl(p.publicUrl)}`);
    setMsgTone(targetTone);
    setAiNotes(data.copy.notes ?? null);
  };

  const baseDraft = () =>
    `¡Hola ${customer}! 👋 Te preparé una propuesta pensada para vos${p?.benefit ? `: ${p.benefit}` : ""}. Miralá acá 👉 ${absUrl(p!.publicUrl)}`;

  const sendNow = async () => {
    if (!p) return;
    setBusy("send");
    setError(null);
    const res = await fetch(`/api/proposals/${p.id}/send`, { method: "POST" }).catch(
      () => null
    );
    const data = res
      ? ((await res.json().catch(() => ({}))) as {
          proposal?: ProposalDto & { conversationId: string | null; contactId: string | null };
          error?: { message?: string };
        })
      : null;
    setBusy(null);
    if (!res?.ok || !data?.proposal) {
      setError(data?.error?.message ?? "No se pudo registrar el envío");
      return;
    }
    setP(data.proposal);
    setSent(true);
    setPreviewOpen(false);
    onOpenInbox?.({
      contactId: data.proposal.contactId ?? null,
      draft: draftText.trim(),
      attach: data.proposal.imageUrl,
    });
    onChanged?.();
  };

  const copy = async (what: "link" | "mensaje") => {
    if (!p) return;
    const text =
      what === "link"
        ? absUrl(p.publicUrl)
        : draftText.trim() || `${baseDraft()}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* sin clipboard no pasa nada */
    }
  };

  /* ————— Render ————— */

  if (loadError) {
    return (
      <div className="space-y-2 rounded-xl border border-danger-soft bg-card p-4">
        <p className="text-[12.5px] font-semibold text-danger-text">{loadError}</p>
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
          >
            Volver a intentar
          </button>
        )}
      </div>
    );
  }
  if (!p) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-[12.5px] text-text-3">
        <Loader2 size={14} className="animate-spin" /> Abriendo la publicación…
      </div>
    );
  }

  const groupName = p.assigneeGroupId
    ? groups.find((g) => g.id === p.assigneeGroupId)?.name ?? "el grupo"
    : null;
  const destinoChip = p.contactId
    ? `🎯 Contacto del CRM: ${p.clientName}`
    : p.clientRef
      ? `🎯 Cliente: ${p.clientName}`
      : `👥 Para: ${p.clientName}`;

  return (
    <div className="space-y-3 rounded-xl border border-brand-soft bg-brand-tint/40 p-3">
      <p className="text-[12.5px] font-bold text-text-1">
        ✓ Publicación creada — página pública lista para abrir desde cualquier computadora
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-text-2">
        <span className="rounded-full border bg-card px-2 py-0.5">{destinoChip}</span>
        <span className="rounded-full border bg-card px-2 py-0.5">🌐 Página pública</span>
        <span className="rounded-full border bg-card px-2 py-0.5">
          🖼️{" "}
          {(p.mediaIds?.length ?? 0)
            ? `${p.mediaIds?.length ?? 0} medio${(p.mediaIds?.length ?? 0) > 1 ? "s" : ""}`
            : "sin medios"}
        </span>
        <span className="rounded-full border bg-card px-2 py-0.5">
          {p.ctaUrl ? "🔗 con botón CTA" : "🔗 sin CTA — se carga en Ajustes → Propuestas"}
        </span>
        <span className="rounded-full border bg-card px-2 py-0.5">📲 mensaje con tono a elección</span>
      </div>
      {error && (
        <p className="rounded-md border border-danger-soft bg-card px-3 py-2 text-[11.5px] text-danger-text">
          {error}
        </p>
      )}
      {aiNotes && <p className="text-[11px] text-text-3">{aiNotes}</p>}
      {shareDone && (
        <p className="text-[12px] font-semibold text-emerald-700">
          🤝 Compartida con {shareDone} — ahora podés derivarla para que la gestionen y enviarla.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={p.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          <ExternalLink size={13} /> Abrir página
        </a>
        <button
          type="button"
          onClick={() => void copy("link")}
          className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-subtle"
        >
          <ClipboardCopy size={13} /> {copied === "link" ? "Copiado" : "Copiar link"}
        </button>
        {/* B9 — compartir directo: cliente del sistema o contacto del CRM */}
        <button
          type="button"
          onClick={() => {
            setShareOpen((v) => !v);
            setDeriveOpen(false);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-brand-soft bg-card px-3 py-1.5 text-[12px] font-bold text-brand hover:bg-subtle"
        >
          <Share2 size={13} /> Compartir a un cliente
        </button>
        {!derived && !p.derivedAt && canDerive && (
          <button
            type="button"
            onClick={() => {
              void openDerive();
              setShareOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
          >
            <UserCheck size={13} /> Derivar: IA, empleado o grupo
          </button>
        )}
        {(derived || p.derivedAt) && (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
            <UserCheck size={13} /> Derivada a {derived ?? p.assigneeName ?? "gestión"}
            {derived === "la IA" || (!derived && !p.assigneeName)
              ? " · atiende al instante por WhatsApp"
              : " · aviso enviado al chat"}
          </span>
        )}
        {p.acceptedByName && (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
            <Check size={13} /> Gestión aceptada por {p.acceptedByName}
          </span>
        )}
      </div>

      {/* B9 — la gestión va a un GRUPO: falta que alguien la acepte. */}
      {p.assigneeGroupId && !p.acceptedBy && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-[12px] font-semibold text-amber-800">
            <Users size={12} className="mr-1 inline" />
            Asignada a {groupName}: el primero del grupo que la acepte queda a cargo — y
            queda registrado quién fue.
          </p>
          <button
            type="button"
            onClick={() => void accept()}
            disabled={busy === "accept"}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "accept" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <UserCheck size={13} />
            )}
            Aceptar la gestión
          </button>
        </div>
      )}

      {/* Compartir: destinatario del sistema o del CRM */}
      {shareOpen && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-bold text-text-2">Compartir a:</span>
            {(
              [
                { k: "sistema" as const, l: "🏢 Cliente del sistema" },
                { k: "crm" as const, l: "💬 Contacto del CRM" },
              ]
            ).map(({ k, l }) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setShareModo(k);
                  setShareQ("");
                }}
                className={
                  shareModo === k
                    ? "rounded-full border border-brand bg-brand-veil px-3 py-1 font-bold text-brand"
                    : "rounded-full border border-border-strong px-3 py-1 font-semibold text-text-2 hover:bg-accent"
                }
              >
                {l}
              </button>
            ))}
            <span className="text-[11px] text-text-3">
              {shareModo === "sistema"
                ? "Buscá en el sistema por nombre o DNI."
                : "Prospectos que escribieron por WhatsApp (sin ficha)."}
            </span>
          </div>
          <input
            value={shareQ}
            onChange={(e) => setShareQ(e.target.value)}
            placeholder={
              shareModo === "sistema"
                ? "Buscar cliente por nombre, apellido o DNI…"
                : "Buscar prospecto por nombre o teléfono…"
            }
            className="w-full rounded-lg border bg-card px-3 py-2 text-[12.5px] outline-none focus:border-brand"
          />
          {shareSearching && (
            <p className="flex items-center gap-2 text-[11.5px] text-text-3">
              <Loader2 size={12} className="animate-spin" /> Buscando…
            </p>
          )}
          {shareModo === "sistema" && shareResults.length > 0 && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border">
              {shareResults.map((r) => (
                <li key={r.client.recordId}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                    onClick={() =>
                      void doShare({
                        clientRef: r.client.recordId,
                        nombre: systemClientName(r.client),
                        telefono: r.client.telefono,
                      })
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold">
                        {systemClientName(r.client)}
                      </span>
                      <span className="block text-[11px] text-text-3">
                        {r.client.dni ? `DNI ${r.client.dni}` : "sin DNI"}
                        {r.client.telefono ? ` · ${r.client.telefono}` : ""}
                        {r.client.oficina ? ` · ${r.client.oficina}` : ""}
                      </span>
                    </span>
                    <ArrowRight size={13} className="shrink-0 text-text-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shareModo === "crm" && shareCrm.length > 0 && (
            <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border">
              {shareCrm.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                    onClick={() =>
                      void doShare({ contactId: c.id, nombre: c.name, telefono: c.phone })
                    }
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold">{c.name}</span>
                      <span className="block text-[11px] text-text-3">
                        {c.phone ? `📱 ${c.phone}` : "sin teléfono"}
                      </span>
                    </span>
                    <ArrowRight size={13} className="shrink-0 text-text-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-text-3">
            La publicación queda vinculada a esa persona: al enviarla, el chat y el
            seguimiento la siguen a ella.
          </p>
        </div>
      )}

      {/* Derivar: IA / empleado / grupo */}
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
                🛡️ Si al cliente le interesa, seguís vos. La IA atiende y avisa qué pasó.
              </p>
            ) : targetKind === "employee" ? (
              <Select
                value={assignee}
                onChange={setAssignee}
                ariaLabel="Elegir el empleado"
                className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
                options={[
                  { value: "", label: "Elegí el empleado…" },
                  ...(directory ?? []).map((m) => ({
                    value: m.userId,
                    label: `${m.name}${m.locality ? ` — ${m.locality}` : ""}`,
                  })),
                ]}
              />
            ) : (
              <Select
                value={assignee}
                onChange={setAssignee}
                ariaLabel="Elegir el grupo del chat"
                className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
                options={[
                  { value: "", label: "Elegí el grupo del chat…" },
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                ]}
              />
            )}
            <Select
              value={priority}
              onChange={(v) => setPriority(v as ProposalPriority)}
              ariaLabel="Prioridad"
              className="rounded-lg border bg-card px-2 py-2 text-[12.5px]"
              options={[
                { value: "alta", label: "Prioridad alta" },
                { value: "media", label: "Prioridad media" },
                { value: "baja", label: "Prioridad baja" },
              ]}
            />
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

      {/* Mensaje: tonos con IA + vista previa + envío */}
      {!previewOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDraftText(baseDraft());
              setPreviewOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
          >
            <Send size={14} />
            Enviar por WhatsApp — con vista previa
          </button>
          <span className="flex items-center gap-1 text-[11.5px] font-bold text-text-2">
            <Wand2 size={12} /> Tono del mensaje:
          </span>
          {TONE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (!previewOpen) {
                  setDraftText(baseDraft());
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
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.imageUrl}
                alt="Imagen de la propuesta"
                className="h-32 w-32 shrink-0 self-start rounded-lg border object-cover"
              />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
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
                <span className="block text-right text-[10px] text-emerald-950/60">ahora ✓</span>
              </div>
              <p className="text-[11px] text-text-3">
                {onOpenInbox
                  ? p.imageUrl
                    ? "Va con la primera foto de la publicación adjunta y el link a la página. Queda cargado en el chat sin enviar."
                    : "Queda cargado en el chat sin enviar: lo revisás y lo mandás desde ahí."
                  : "Copialo y mandalo por WhatsApp (o derivá la gestión y la envía el asignado)."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onOpenInbox ? (
              <button
                type="button"
                onClick={() => void sendNow()}
                disabled={busy === "send" || !draftText.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Abrir el chat con esto listo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void copy("mensaje")}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-subtle"
            >
              <ClipboardCopy size={13} /> {copied === "mensaje" ? "Copiado" : "Copiar el mensaje"}
            </button>
            {p.clientPhone ? (
              <a
                href={`https://wa.me/${p.clientPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
                  `${draftText.trim() || baseDraft()}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-card px-3 py-2 text-[12.5px] font-semibold text-emerald-700 hover:bg-subtle"
              >
                <MessageCircle size={13} /> WhatsApp directo
              </a>
            ) : null}
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
      {sent && (
        <p className="text-[12px] font-semibold text-emerald-700">
          ✓ Marcada como enviada — el chat quedó abierto con el borrador y la imagen listos.
        </p>
      )}
      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className="text-[12px] font-bold text-brand underline-offset-2 hover:underline"
        >
          ＋ Crear otra publicación
        </button>
      )}
    </div>
  );
}
