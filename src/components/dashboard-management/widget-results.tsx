"use client";

/**
 * 044b-B11 — resultados de una pieza del Constructor: respuestas de un
 * formulario/encuesta o los tokens (vouchers) de un cupón, con sus acciones
 * (emitir más, marcar canjeado, copiar el link de cada token). Se refresca
 * solo cada 15 segundos mientras está abierto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Loader2, Plus, RefreshCw, RotateCcw, Ticket, X } from "lucide-react";
import type { CouponTokenDto, ProposalDto, ProposalResponseDto } from "@/lib/types";

type TokensPayload = {
  tokens: CouponTokenDto[];
  summary: { total: number; emitidos: number; canjeados: number };
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

export function WidgetResultsModal({
  proposal,
  onClose,
}: {
  proposal: ProposalDto;
  onClose: () => void;
}) {
  const esCupon = proposal.widget?.type === "coupon";
  const [responses, setResponses] = useState<ProposalResponseDto[] | null>(null);
  const [tokens, setTokens] = useState<TokensPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [emitirCantidad, setEmitirCantidad] = useState(10);
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

  const emitir = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/tokens`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cantidad: emitirCantidad }),
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

  const titulo = esCupon
    ? "🎟️ Tokens del cupón"
    : proposal.widget?.type === "survey"
      ? "📊 Respuestas de la encuesta"
      : "📝 Respuestas del formulario";

  return (
    <div
      role="dialog"
      aria-label={titulo}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border bg-card p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
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

        {error && <p className="mb-2 text-[12.5px] text-rose-600">{error}</p>}

        {/* ===== Cupón: tokens ===== */}
        {esCupon && (
          <>
            {tokens && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-subtle px-3 py-2 text-[11.5px]">
                <span className="font-bold text-text-1">{tokens.summary.total} tokens</span>
                <span className="text-emerald-700">● {tokens.summary.emitidos} emitidos</span>
                <span className="text-amber-700">● {tokens.summary.canjeados} canjeados</span>
              </div>
            )}
            <div className="mb-3 flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={200}
                value={emitirCantidad}
                onChange={(e) => setEmitirCantidad(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="h-8 w-20 rounded-md border border-border-strong bg-background px-2 text-[12px] text-text"
                aria-label="Cantidad de tokens a emitir"
              />
              <button
                type="button"
                onClick={() => void emitir()}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong bg-card px-2.5 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent disabled:opacity-50"
              >
                <Plus size={12} /> Emitir tokens nuevos
              </button>
            </div>
            {tokens === null ? (
              <p className="flex items-center gap-2 py-4 text-[12.5px] text-text-3">
                <Loader2 size={14} className="animate-spin" /> Cargando…
              </p>
            ) : tokens.tokens.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-text-3">
                Todavía sin tokens. Emití los primeros y repartí sus links.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tokens.tokens.map((t) => (
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
                    {t.issuedToName && (
                      <span className="truncate text-[11px] text-text-3">{t.issuedToName}</span>
                    )}
                    {t.redeemedAt && (
                      <span className="text-[10.5px] text-text-3">· {fecha(t.redeemedAt)}</span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void copiarLink(t)}
                        className="rounded-md border bg-card p-1 text-text-3 hover:bg-subtle hover:text-text-1"
                        title="Copiar link del voucher (con su código)"
                      >
                        {copiado === t.token ? (
                          <Check size={12} className="text-emerald-600" />
                        ) : (
                          <ClipboardCopy size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleEstado(t)}
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
            <p className="mt-3 text-[11px] text-text-3">
              El link de cada token abre el cupón con ese código ya cargado (
              <span className="font-mono">/p/…?t=…</span>) — mandalo por WhatsApp a quien le
              regalás el voucher.
            </p>
          </>
        )}

        {/* ===== Formulario / encuesta: respuestas ===== */}
        {!esCupon && (
          <>
            {responses === null ? (
              <p className="flex items-center gap-2 py-4 text-[12.5px] text-text-3">
                <Loader2 size={14} className="animate-spin" /> Cargando…
              </p>
            ) : responses.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-text-3">
                Todavía sin respuestas. Compartí el link de la página para empezar a recibirlas.
              </p>
            ) : (
              <ul className="space-y-2">
                {responses.map((r) => (
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
                          <dt className="shrink-0 font-semibold text-text-3">{d.label}:</dt>
                          <dd className="min-w-0 text-text-1">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
