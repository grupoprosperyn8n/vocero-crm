"use client";

/**
 * 044b-B13 — el VISOR DEMO multiformato del Constructor.
 *
 * La vista demo es la MISMA pieza que ve el cliente (mismo diseño) y se puede
 * ver «en vivo» mientras se escribe, en los formatos reales:
 *   Celular 390×844 (a escala 1:1), Tablet 768×1024, Web 1280×800 y
 *   Pantalla completa (tamaño real, con su barra de formatos).
 * También ofrece «Abrir en pantalla original» (la pieza pública real) y
 * «Descargar voucher (PDF)» cuando la pieza es un cupón.
 */

import { useState } from "react";
import { Download, ExternalLink, Loader2, Maximize2, X } from "lucide-react";
import { descargarVoucherPdf, type VoucherPdfData } from "@/lib/voucher-pdf";
import type { BuilderCampo, BuilderCupon, WidgetTipo } from "./constructor-widgets";

const FORMATOS = [
  { id: "celular", label: "Celular", emoji: "📱", w: 390, h: 844 },
  { id: "tablet", label: "Tablet", emoji: "📲", w: 768, h: 1024 },
  { id: "web", label: "Web", emoji: "💻", w: 1280, h: 800 },
] as const;

type FormatoId = (typeof FORMATOS)[number]["id"];

export function DevicePreview({
  children,
  originalUrl,
  voucher,
}: {
  children: React.ReactNode;
  /** URL de la pieza pública real (si ya existe). */
  originalUrl?: string | null;
  /** Datos del voucher para el botón «Descargar voucher (PDF)». */
  voucher?: VoucherPdfData | null;
}) {
  const [fmt, setFmt] = useState<FormatoId>("celular");
  const [full, setFull] = useState(false);
  const [bajando, setBajando] = useState(false);
  const formato = FORMATOS.find((f) => f.id === fmt) ?? FORMATOS[0];

  // En el panel, el celular va a escala 1:1 (real); tablet y web se escalan
  // para encajar en la columna sin mentir la proporción.
  const maxPanelW = 404;
  const scale = Math.min(1, maxPanelW / formato.w);
  const marcoW = Math.round(formato.w * scale) + 8;
  const marcoH = Math.min(Math.round(formato.h * scale), 660);

  async function bajarVoucher() {
    if (!voucher || bajando) return;
    setBajando(true);
    try {
      await descargarVoucherPdf(voucher);
    } finally {
      setBajando(false);
    }
  }

  const barra = (
    <div className="flex flex-wrap items-center gap-1">
      {FORMATOS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFmt(f.id)}
          aria-pressed={fmt === f.id}
          title={`Ver en ${f.label.toLowerCase()} (${f.w}×${f.h})`}
          className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-semibold transition-colors ${
            fmt === f.id
              ? "border-brand bg-brand text-brand-fg"
              : "border-border-strong bg-card text-text-2 hover:bg-accent"
          }`}
        >
          <span aria-hidden>{f.emoji}</span> {f.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFull(true)}
        title="Ver a tamaño real en pantalla completa"
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border-strong bg-card px-2.5 text-[10.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
      >
        <Maximize2 size={10} /> Pantalla completa
      </button>
    </div>
  );

  return (
    <aside className="rounded-lg border bg-card p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold tracking-wide text-text-3 uppercase">
          Vista demo · en vivo
        </p>
        {barra}
      </div>
      <p className="mb-3 text-[10.5px] text-text-3">
        Así lo va a ver el cliente — la demo es la misma pieza que la página real, a su
        escala. El celular se muestra tamaño real (390×844).
      </p>

      {/* Marco del dispositivo en el panel */}
      <div
        className="relative mx-auto overflow-hidden rounded-[26px] border-[7px] border-neutral-800 bg-white shadow-2xl"
        style={{ width: marcoW, height: marcoH }}
      >
        <div
          className="overflow-y-auto overscroll-contain bg-gradient-to-b from-sky-50 via-white to-indigo-50"
          style={{
            width: formato.w,
            height: formato.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {voucher && (
          <button
            type="button"
            onClick={() => void bajarVoucher()}
            disabled={bajando}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {bajando ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            Descargar voucher (PDF)
          </button>
        )}
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-card px-3 text-[11.5px] font-semibold text-text-2 transition-colors hover:bg-accent"
          >
            <ExternalLink size={12} /> Abrir en pantalla original
          </a>
        )}
      </div>
      <p className="mt-2 text-center text-[10.5px] text-text-3">
        La pieza final (la que abre el cliente con el link) respeta este contenido.
      </p>

      {/* Pantalla completa — TAMAÑO REAL */}
      {full && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a1730]/95 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-1">
              {FORMATOS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFmt(f.id)}
                  aria-pressed={fmt === f.id}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-semibold transition-colors ${
                    fmt === f.id
                      ? "border-white bg-white text-neutral-900"
                      : "border-white/30 bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  <span aria-hidden>{f.emoji}</span> {f.label}
                  <span className="text-[10px] opacity-70">
                    {f.w}×{f.h}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {voucher && (
                <button
                  type="button"
                  onClick={() => void bajarVoucher()}
                  disabled={bajando}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-brand px-3 text-[11.5px] font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-60"
                >
                  <Download size={12} /> Descargar voucher (PDF)
                </button>
              )}
              {originalUrl && (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 text-[11.5px] font-semibold text-white hover:bg-white/20"
                >
                  <ExternalLink size={12} /> Abrir en pantalla original
                </a>
              )}
              <button
                type="button"
                onClick={() => setFull(false)}
                aria-label="Cerrar pantalla completa"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 text-[11.5px] font-semibold text-white hover:bg-white/20"
              >
                <X size={12} /> Cerrar
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden px-4 pb-4">
            <div
              className="mx-auto overflow-y-auto overscroll-contain rounded-[30px] border-[10px] border-neutral-800 bg-white shadow-2xl"
              style={{
                width: formato.w,
                height: `min(${formato.h}px, calc(100vh - 120px))`,
              }}
            >
              {children}
            </div>
            <p className="mt-2 text-center text-[11px] text-white/60">
              {formato.label} a tamaño real · {formato.w}×{formato.h} · scroll dentro del marco
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ============================================================
 * PiezaDemo — la pieza como la ve el cliente (misma que la real).
 * ============================================================ */

export type PiezaDemoForm = {
  title: string;
  subtitle: string;
  body: string;
  benefit: string;
  offer: string;
  productName: string;
  companyName: string;
  ctaLabel: string;
  ctaKind: string;
};

export function PiezaDemo({
  tipo,
  form,
  clienteNombre,
  portada,
  campos,
  preguntas,
  cupon,
  logoPreview,
}: {
  tipo: WidgetTipo;
  form: PiezaDemoForm;
  clienteNombre?: string | null;
  portada?: { url: string; mime: string } | null;
  campos?: BuilderCampo[];
  preguntas?: BuilderCampo[];
  cupon?: BuilderCupon;
  logoPreview?: string | null;
}) {
  const titulo =
    form.title ||
    (tipo === "formulario"
      ? "Formulario para completar"
      : tipo === "encuesta"
        ? "Contanos tu experiencia"
        : tipo === "cupon"
          ? "Tu cupón de regalo"
          : "Título de la publicación");
  const camposDemo = (campos ?? []).filter((c) => c.label.trim()).slice(0, 4);
  const preguntasDemo = (preguntas ?? []).filter((p) => p.label.trim()).slice(0, 3);
  const hayCupon = Boolean(cupon?.beneficio?.trim()) || tipo === "cupon";

  return (
    <div className="min-h-full px-3 py-4">
      <article className="mx-auto w-full max-w-xl">
        {/* Encabezado de vidrio (igual que la página real) */}
        <header className="flex items-center justify-between gap-3 rounded-t-3xl border border-white/70 border-b-0 bg-white/70 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="h-9 max-w-[130px] object-contain"
                src={logoPreview}
                alt="Logo"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[13px] font-bold text-white shadow-md">
                {(form.companyName || "R").slice(0, 2).toUpperCase()}
              </span>
            )}
            <p className="truncate text-[12.5px] font-bold text-neutral-800">
              {form.companyName || "Tu equipo de asesoramiento"}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-2.5 py-0.5 text-[10.5px] font-bold text-sky-700">
            Para {clienteNombre || "el cliente"}
          </span>
        </header>

        {/* Portada */}
        {portada &&
          (portada.mime.startsWith("video/") ? (
            <video
              className="max-h-[300px] w-full border-x border-white/70 bg-black/90 object-contain"
              src={portada.url}
              muted
              playsInline
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="max-h-[300px] w-full border-x border-white/70 object-cover"
              src={portada.url}
              alt=""
            />
          ))}

        <div
          className={`space-y-3 border border-white/70 bg-white/70 px-4 py-4 backdrop-blur-xl ${
            portada ? "" : "rounded-t-3xl"
          }`}
        >
          <div>
            <h1 className="text-[19px] leading-tight font-bold text-neutral-900">
              {titulo}
            </h1>
            {form.subtitle && (
              <p className="mt-1 text-[12.5px] text-neutral-600">{form.subtitle}</p>
            )}
          </div>

          {form.benefit && (
            <div className="flex items-center gap-2 rounded-2xl border border-cyan-200/80 bg-gradient-to-r from-cyan-50 to-sky-100/80 px-3.5 py-2.5">
              <span className="text-[18px]">🎁</span>
              <p className="text-[13px] font-bold text-sky-800">{form.benefit}</p>
            </div>
          )}

          {form.productName && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1 text-[11.5px] font-semibold text-neutral-600">
              🛡️ {form.productName}
            </p>
          )}

          {form.body && (
            <p className="text-[12.5px] leading-relaxed whitespace-pre-line text-neutral-600">
              {form.body}
            </p>
          )}

          {form.offer && (
            <div className="rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5">
              <p className="text-[10.5px] font-bold tracking-wide text-neutral-400 uppercase">
                La oferta
              </p>
              <p className="mt-0.5 text-[12.5px] text-neutral-800">{form.offer}</p>
            </div>
          )}

          {/* Formulario demo */}
          {tipo === "formulario" && (
            <div className="space-y-3 rounded-3xl border border-sky-200/70 bg-gradient-to-b from-white/90 to-sky-50/80 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[20px]">📝</span>
                <p className="text-[13.5px] font-bold text-neutral-900">
                  Completá tus datos
                </p>
              </div>
              {camposDemo.map((c) => (
                <div key={c.id} className="space-y-1">
                  <p className="text-[11.5px] font-semibold text-neutral-700">
                    {c.label}
                    {c.requerido && <span className="ml-0.5 text-rose-500">*</span>}
                  </p>
                  {c.tipo === "parrafo" || c.tipo === "textarea" ? (
                    <div className="h-14 rounded-xl border bg-white/80" />
                  ) : (
                    <div className="h-8 rounded-xl border bg-white/80" />
                  )}
                </div>
              ))}
              <div className="flex h-9 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-[12.5px] font-bold text-white">
                Enviar
              </div>
            </div>
          )}

          {/* Encuesta demo */}
          {tipo === "encuesta" && (
            <div className="space-y-3 rounded-3xl border border-violet-200/70 bg-gradient-to-b from-white/90 to-violet-50/80 px-4 py-4">
              <div className="flex items-center gap-2.5">
                <span className="text-[20px]">📊</span>
                <p className="text-[13.5px] font-bold text-neutral-900">
                  Tu opinión nos ayuda a mejorar
                </p>
              </div>
              {preguntasDemo.map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <p className="text-[11.5px] font-semibold text-neutral-700">
                    {p.label}
                  </p>
                  {p.tipo === "opciones" && p.opciones.filter(Boolean).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {p.opciones.filter(Boolean).map((o, i) => (
                        <span
                          key={i}
                          className="rounded-full border bg-white/80 px-2.5 py-0.5 text-[11px] text-neutral-600"
                        >
                          {o}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="h-8 rounded-xl border bg-white/80" />
                  )}
                </div>
              ))}
              <div className="flex h-9 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-[12.5px] font-bold text-white">
                Enviar respuestas
              </div>
            </div>
          )}

          {/* Cupón demo */}
          {tipo === "cupon" && (
            <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/80 px-4 py-3.5">
              <p className="text-[10.5px] font-bold tracking-wide text-amber-600 uppercase">
                🎟️ Cupón de regalo
              </p>
              <p className="mt-1 text-[14.5px] font-extrabold text-neutral-900">
                {cupon?.beneficio?.trim() || "Tu beneficio va acá"}
              </p>
              {hayCupon && (
                <div className="mt-2.5 rounded-2xl border border-dashed border-amber-400/80 bg-white/85 px-3.5 py-2.5 text-center">
                  <p className="text-[10.5px] font-semibold tracking-wide text-neutral-400 uppercase">
                    Código para canjear
                  </p>
                  <p className="mt-0.5 font-mono text-[18px] font-bold tracking-[0.15em] text-neutral-900">
                    {cupon?.prefijo?.trim() || "VCH"}-XXXX-XXXX
                  </p>
                </div>
              )}
              {(cupon?.desde || cupon?.hasta) && (
                <p className="mt-1.5 text-[10.5px] text-neutral-500">
                  {cupon?.desde && <>Válido desde el {cupon.desde} </>}
                  {cupon?.hasta && <>hasta el {cupon.hasta}.</>}
                </p>
              )}
              {cupon?.condiciones && (
                <p className="mt-0.5 text-[10.5px] text-neutral-500">
                  {cupon.condiciones}
                </p>
              )}
            </div>
          )}

          {/* CTA demo */}
          <div className="space-y-2 pt-0.5">
            <div className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2.5 text-center text-[13px] font-bold text-white">
              💬{" "}
              {tipo === "cupon"
                ? "Mostrá este cupón para canjearlo"
                : form.ctaLabel || "Hablar por WhatsApp"}
            </div>
            {tipo !== "cupon" && (
              <div className="flex min-h-[36px] w-full items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-4 py-2 text-center text-[12.5px] font-bold text-sky-800">
                {form.ctaKind === "agenda"
                  ? "Agendar videollamada →"
                  : form.ctaKind === "pdf"
                    ? "Descargar más información →"
                    : "Quiero más información →"}
              </div>
            )}
          </div>

          {form.companyName && (
            <div className="flex items-center justify-center gap-2 border-t border-neutral-200/70 pt-3">
              <span className="text-[10.5px] font-semibold tracking-wide text-neutral-400 uppercase">
                Auspicia
              </span>
              <span className="text-[12px] font-bold text-neutral-600">
                {form.companyName}
              </span>
            </div>
          )}
        </div>

        <footer className="rounded-b-3xl border border-white/70 border-t-0 bg-white/50 px-4 py-2.5 backdrop-blur-xl">
          <p className="text-[10.5px] text-neutral-500">
            Pieza para {clienteNombre || "el cliente"} · Hecha para vos 💙
          </p>
        </footer>
      </article>
    </div>
  );
}
