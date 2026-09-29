"use client";

import { useState } from "react";
import type { ProposalWidget, ProposalWidgetField } from "@/lib/types";

/**
 * 044b-B11 — formulario/encuesta de una pieza del Constructor, en la página
 * pública. El cliente completa y envía; la respuesta queda en el panel del
 * negocio. Sin sesión: el endpoint público limita la tasa por IP.
 */
export function PublicWidgetForm({
  token,
  widget,
}: {
  token: string;
  widget: Extract<ProposalWidget, { type: "form" | "survey" }>;
}) {
  const fields: ProposalWidgetField[] =
    widget.type === "form" ? widget.fields : widget.questions;
  const esEncuesta = widget.type === "survey";
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const missing = fields.filter((f) => f.requerido && !(values[f.id] ?? "").trim());
    if (missing.length > 0) {
      setError(`Completá: ${missing.map((m) => m.label).join(", ")}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/public/propuesta/${token}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: fields
            .map((f) => ({ label: f.label, value: (values[f.id] ?? "").trim() }))
            .filter((d) => d.value.length > 0),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "No se pudo enviar. Probá de nuevo.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div
        className="rounded-3xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50/80 px-4 py-6 text-center shadow-sm"
        style={{ animation: "rp-fade-up 0.4s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <p className="text-[30px]">✅</p>
        <p className="mt-1 text-[16px] font-extrabold text-neutral-900">
          ¡Listo, ya la recibimos!
        </p>
        <p className="mt-1 text-[12.5px] text-neutral-600">
          {esEncuesta
            ? "Gracias por tu respuesta 💙"
            : "El equipo te va a contactar a la brevedad."}
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-neutral-200/90 bg-white/85 px-3.5 py-2.5 text-[14px] text-neutral-800 shadow-sm outline-none backdrop-blur transition-colors placeholder:text-neutral-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-200";

  return (
    <form
      onSubmit={submit}
      className="space-y-3.5 rounded-3xl border border-sky-200/70 bg-gradient-to-b from-white/90 to-sky-50/80 px-4 py-4 shadow-sm backdrop-blur-xl"
      style={{ animation: "rp-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-[22px]">{esEncuesta ? "📊" : "📝"}</span>
        <div>
          <p className="text-[14.5px] font-extrabold text-neutral-900">
            {esEncuesta ? "Tu opinión nos ayuda" : "Completá y te contactamos"}
          </p>
          <p className="text-[11.5px] text-neutral-500">
            {esEncuesta ? "Responde en menos de un minuto" : "Te responde una persona del equipo"}
          </p>
        </div>
      </div>

      {fields.map((f) => (
        <div key={f.id} className="space-y-1">
          <label className="block text-[12.5px] font-semibold text-neutral-700">
            {f.label}
            {f.requerido && <span className="ml-0.5 text-rose-500">*</span>}
          </label>
          {f.tipo === "parrafo" ? (
            <textarea
              rows={3}
              value={values[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputCls}
            />
          ) : f.tipo === "seleccion" || f.tipo === "si_no" || f.tipo === "escala" ? (
            <select
              value={values[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputCls}
            >
              <option value="">Elegí una opción…</option>
              {f.tipo === "si_no" ? (
                <>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </>
              ) : f.tipo === "escala" ? (
                <>
                  <option value="1">1 · Muy malo</option>
                  <option value="2">2 · Malo</option>
                  <option value="3">3 · Normal</option>
                  <option value="4">4 · Bueno</option>
                  <option value="5">5 · Excelente</option>
                </>
              ) : (
                f.opciones.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              type={
                f.tipo === "email"
                  ? "email"
                  : f.tipo === "telefono"
                    ? "tel"
                    : f.tipo === "numero"
                      ? "number"
                      : "text"
              }
              inputMode={f.tipo === "telefono" ? "tel" : undefined}
              value={values[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              className={inputCls}
            />
          )}
        </div>
      ))}

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-[15px] font-bold text-white shadow-[0_14px_34px_-12px_rgba(0,132,255,0.7)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Enviando…" : esEncuesta ? "Enviar respuesta" : "Enviar"}
      </button>
      <p className="text-center text-[11px] text-neutral-400">
        Tus datos viajan seguros y solo los ve el equipo.
      </p>
    </form>
  );
}
