"use client";

/**
 * 041e — Acciones y modales compartidos de una gestión (propuesta):
 *  · EDITAR los textos (puede todo el equipo; el historial registra quién).
 *  · HISTORIAL: quién la creó, editó, derivó, envió, archivó, pausó…
 *
 * Los usan el panel Cliente 360, la pestaña Propuestas y el Seguimiento.
 */

import { useEffect, useState } from "react";
import { History, Loader2, Pencil, X } from "lucide-react";

import type { ProposalDto } from "@/lib/types";

export type LifecycleAction = "archive" | "restore" | "delete" | "online" | "offline";

export async function proposalLifecycle(
  id: string,
  action: LifecycleAction
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/proposals/${id}/lifecycle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });

  if (res.ok) return { ok: true };

  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  return { ok: false, message: body?.error?.message ?? "No se pudo completar" };
}

type EventDto = {
  id: string;
  action: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

const EVENT_EMOJI: Record<string, string> = {
  creada: "✨",
  editada: "✏️",
  derivada: "🎯",
  enviada: "📤",
  archivada: "📥",
  restaurada: "📤",
  publicada: "▶️",
  pausada: "⏸️",
  eliminada: "🗑️",
};

/** Historial con quién hizo qué y cuándo. */
export function ProposalHistoryModal({
  proposal,
  onClose,
}: {
  proposal: ProposalDto;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void fetch(`/api/proposals/${proposal.id}/events`)
      .then(async (res) => {
        if (!res.ok) throw new Error("no");
        const body = (await res.json()) as { events: EventDto[] };
        if (alive) setEvents(body.events);
      })
      .catch(() => {
        if (!alive) return;
        setError("No se pudo cargar el historial");
        setEvents([]);
      });

    return () => {
      alive = false;
    };
  }, [proposal.id]);

  return (
    <div
      role="dialog"
      aria-label="Historial de la gestión"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-text-1">
              <History size={15} /> Historial de la gestión
            </p>
            <p className="truncate text-[11.5px] text-text-3">{proposal.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
          >
            <X size={16} />
          </button>
        </div>

        {error ? (
          <p className="text-[12.5px] text-rose-600">{error}</p>
        ) : events === null ? (
          <p className="flex items-center gap-2 py-4 text-[12.5px] text-text-3">
            <Loader2 size={14} className="animate-spin" /> Cargando…
          </p>
        ) : events.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-text-3">
            Todavía no hay movimientos registrados.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2.5">
                <span className="mt-0.5 text-[14px]">{EVENT_EMOJI[e.action] ?? "•"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-text-1 capitalize">
                    {e.action}
                    {e.actorName ? (
                      <span className="font-normal text-text-3"> · {e.actorName}</span>
                    ) : null}
                  </p>
                  {e.detail && (
                    <p className="text-[11.5px] text-text-3">{e.detail}</p>
                  )}
                  <p className="text-[10.5px] text-text-3">
                    {new Date(e.createdAt).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Editar los textos de la gestión. */
export function ProposalEditModal({
  proposal,
  onClose,
  onSaved,
}: {
  proposal: ProposalDto;
  onClose: () => void;
  onSaved: (updated: ProposalDto) => void;
}) {
  const [form, setForm] = useState({
    title: proposal.title,
    subtitle: proposal.subtitle ?? "",
    body: proposal.body ?? "",
    offer: proposal.offer ?? "",
    benefit: proposal.benefit ?? "",
    ctaLabel: proposal.ctaLabel ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (form.title.trim().length < 3) {
      setError("El título no puede quedar vacío");
      return;
    }

    setBusy(true);
    setError(null);

    const res = await fetch(`/api/proposals/${proposal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        subtitle: form.subtitle || null,
        body: form.body || null,
        offer: form.offer || null,
        benefit: form.benefit || null,
        ctaLabel: form.ctaLabel || null,
      }),
    });

    const body = (await res.json().catch(() => null)) as
      | { proposal?: ProposalDto; error?: { message?: string } }
      | null;

    setBusy(false);

    if (!res.ok || !body?.proposal) {
      setError(body?.error?.message ?? "No se pudieron guardar los cambios");
      return;
    }

    onSaved(body.proposal);
  };

  const field = (
    key: keyof typeof form,
    label: string,
    opts: { textarea?: boolean; placeholder?: string } = {}
  ) => (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
        {label}
      </span>
      {opts.textarea ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          rows={4}
          placeholder={opts.placeholder}
          className="w-full rounded-lg border bg-card px-3 py-2 text-[12.5px] leading-snug outline-none focus:border-brand"
        />
      ) : (
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={opts.placeholder}
          className="w-full rounded-lg border bg-card px-3 py-2 text-[12.5px] outline-none focus:border-brand"
        />
      )}
    </label>
  );

  return (
    <div
      role="dialog"
      aria-label="Editar la publicidad"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-text-1">
            <Pencil size={14} /> Editar la publicidad
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-text-2 hover:bg-subtle"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2.5">
          {field("title", "Título", { placeholder: "Título de la pieza" })}
          {field("subtitle", "Subtítulo", { placeholder: "Opcional" })}
          {field("body", "Mensaje", {
            textarea: true,
            placeholder: "Contale el beneficio al cliente…",
          })}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {field("offer", "Oferta", { placeholder: "20% de descuento…" })}
            {field("benefit", "Beneficio", { placeholder: "Tu auto protegido…" })}
          </div>
          {field("ctaLabel", "Botón (CTA)", { placeholder: "Quiero saber más" })}
        </div>

        {error && (
          <p className="mt-2 text-[12px] font-semibold text-rose-600">{error}</p>
        )}

        <p className="mt-2 text-[11px] text-text-3">
          Queda registrado en el historial quién y qué campos editó.
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border bg-card px-3 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-subtle"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
