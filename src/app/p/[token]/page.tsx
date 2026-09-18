import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { kindLabel, loadPublicProposal } from "@/server/proposals/service";
import { getBranding } from "@/server/branding";
import { PrintButton } from "./print-button";
import { MediaCarousel } from "./media-carousel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  // Metadatos sin contar la vista (el conteo es del render de la página).
  const proposal = await loadPublicProposal(token, { countView: false });
  if (!proposal) return { title: "Propuesta" };
  return {
    title: `${proposal.title}${proposal.companyName ? ` · ${proposal.companyName}` : ""}`,
    robots: { index: false, follow: false },
  };
}

/**
 * 042 — Página PÚBLICA de una publicidad, pensada para MARKETING (celular
 * primero): fondo claro con luz suave en movimiento, tarjetas de vidrio
 * (blur/traslúcidas), carrusel de fotos + video MP4 y un botón directo al
 * WhatsApp del equipo — si la gestión está derivada, atiende esa persona;
 * si no, responde el asistente al instante.
 */
export default async function ProposalPage({ params }: Props) {
  const { token } = await params;
  const proposal = await loadPublicProposal(token);
  if (!proposal) notFound();
  const branding = await getBranding().catch(() => null);

  if (!proposal.online) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-sky-50 via-white to-indigo-50 px-4 py-10">
        <article
          className="w-full max-w-md space-y-2 rounded-3xl border border-white/70 bg-white/70 p-6 text-center shadow-[0_18px_50px_-18px_rgba(30,64,175,0.35)] backdrop-blur-xl"
          style={{ animation: "rp-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <p className="text-[30px]">⏸️</p>
          <h1 className="text-[17px] font-bold text-neutral-800">
            Esta publicidad no está disponible por ahora
          </h1>
          <p className="text-[13px] text-neutral-500">
            Consultá con tu asesor
            {branding?.name ? ` de ${branding.name}` : ""}: se puede volver a
            activar en un momento.
          </p>
        </article>
      </main>
    );
  }

  const img = (id: string | null, label: string) =>
    id ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/public/propuesta/img/${id}`}
        alt={label}
        className="max-h-full max-w-full object-contain"
      />
    ) : null;

  const paragraphs = proposal.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const absoluteUrl = host ? `${proto}://${host}/p/${token}` : `/p/${token}`;

  const waText = encodeURIComponent(
    `¡Hola! Vi la propuesta que me armaron: «${proposal.title}». ¿Me cuentan un poco más?\n${absoluteUrl}`
  );
  const waHref = proposal.whatsappPhone
    ? `https://wa.me/${proposal.whatsappPhone}?text=${waText}`
    : null;

  const ctaHref = proposal.ctaUrl ?? null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-indigo-50 px-3 py-6 sm:px-4 sm:py-10">
      {/* Luz suave en movimiento: marketing vivo, sin ruido */}
      <style>{`
        @keyframes rp-fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rp-blob { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(26px, -20px) scale(1.08); } 66% { transform: translate(-18px, 16px) scale(0.95); } }
        @keyframes rp-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes rp-glow { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
      `}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-cyan-300/40 blur-3xl"
        style={{ animation: "rp-blob 18s ease-in-out infinite" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-28 h-96 w-96 rounded-full bg-indigo-300/35 blur-3xl"
        style={{ animation: "rp-blob 22s ease-in-out infinite reverse" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl"
        style={{ animation: "rp-blob 26s ease-in-out infinite" }}
      />

      <article className="relative mx-auto w-full max-w-xl">
        {/* Encabezado de vidrio */}
        <header
          className="flex items-center justify-between gap-3 rounded-t-3xl border border-white/70 border-b-0 bg-white/70 px-4 py-4 shadow-[0_-6px_30px_-18px_rgba(30,64,175,0.25)] backdrop-blur-xl sm:px-6"
          style={{ animation: "rp-fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {proposal.logoAssetId ? (
              <div className="flex h-12 max-w-[180px] items-center">{img(proposal.logoAssetId, branding?.name ?? "Logo")}</div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-[15px] font-bold text-white shadow-lg shadow-cyan-400/30">
                {(branding?.name ?? "R").slice(0, 2).toUpperCase()}
              </div>
            )}
            {!proposal.logoAssetId && (
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-neutral-800">{branding?.name ?? "Asesor de seguros"}</p>
                <p className="text-[11.5px] text-neutral-500">{kindLabel(proposal.kind)}</p>
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-[11px] font-bold text-sky-700 shadow-sm">
            Para {proposal.clientName}
          </span>
        </header>

        {/* Carrusel de fotos + video */}
        {proposal.media.length > 0 && (
          <div
            className="relative border-x border-white/70 bg-white/60 backdrop-blur-xl"
            style={{ animation: "rp-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 -top-2 h-4 rounded-full bg-gradient-to-r from-cyan-400/60 via-sky-400/50 to-indigo-500/60 blur-md"
              style={{ animation: "rp-glow 5s ease-in-out infinite" }}
            />
            <MediaCarousel media={proposal.media} altBase={proposal.title} />
          </div>
        )}

        <div
          className={`space-y-4 border border-white/70 bg-white/70 px-4 py-5 shadow-[0_24px_60px_-28px_rgba(30,64,175,0.35)] backdrop-blur-xl sm:px-6 sm:py-6 ${proposal.media.length > 0 ? "border-t-0" : "rounded-t-3xl"}`}
          style={{ animation: "rp-fade-up 0.55s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}
        >
          <div>
            <h1 className="font-serif text-[22px] leading-tight font-normal text-neutral-900 sm:text-[25px]">
              {proposal.title}
            </h1>
            {proposal.subtitle && <p className="mt-1 text-[13.5px] text-neutral-600">{proposal.subtitle}</p>}
          </div>

          {/* Descuento o beneficio: lo primero que se ve */}
          {proposal.benefit && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-cyan-200/80 bg-gradient-to-r from-cyan-50 to-sky-100/80 px-4 py-3 shadow-sm">
              <span className="text-[22px]" style={{ animation: "rp-dot 2.4s ease-in-out infinite" }}>
                🎁
              </span>
              <p className="text-[14.5px] font-bold text-sky-800">{proposal.benefit}</p>
            </div>
          )}

          {proposal.productName && (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white/80 px-3 py-1 text-[12px] font-semibold text-neutral-600 shadow-sm">
              🛡️ {proposal.productName}
            </p>
          )}

          {paragraphs.map((p, i) => (
            <p key={i} className="text-[13.5px] leading-relaxed text-neutral-600">
              {p}
            </p>
          ))}

          {proposal.offer && (
            <div className="rounded-2xl border border-white/80 bg-white/60 px-4 py-3 shadow-inner backdrop-blur">
              <p className="text-[11px] font-bold tracking-wide text-neutral-400 uppercase">La oferta</p>
              <p className="mt-1 text-[13.5px] text-neutral-800">{proposal.offer}</p>
            </div>
          )}

          {/* Botonera: WhatsApp directo + el CTA cargado en Ajustes */}
          <div className="space-y-2 pt-1">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-wa-cta
                className="group flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-3.5 text-center text-[15px] font-bold text-white shadow-[0_14px_34px_-10px_rgba(0,132,255,0.65)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-10px_rgba(0,132,255,0.75)]"
              >
                <MessageCircle size={18} className="transition-transform group-hover:scale-110" />
                {proposal.assigneeName ? `Hablar con ${proposal.assigneeName}` : "Hablar por WhatsApp"}
              </a>
            )}
            {waHref && (
              <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-neutral-500">
                <span
                  className="inline-block h-2 w-2 rounded-full bg-emerald-500"
                  style={{ animation: "rp-dot 1.8s ease-in-out infinite" }}
                />
                {proposal.assigneeName
                  ? `Te atiende ${proposal.assigneeName} · el equipo ${branding?.name ?? ""}`.trim()
                  : "Respuesta al instante de nuestro asistente virtual"}
              </p>
            )}
            {ctaHref && (
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-white/80 bg-white/80 px-5 py-3 text-center text-[14px] font-bold text-sky-800 shadow-md backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                {proposal.ctaLabel ?? "Quiero más información"}
                <span aria-hidden>→</span>
              </a>
            )}
          </div>

          {/* Compañía de seguro auspiciada */}
          {proposal.companyName && (
            <div className="flex items-center justify-center gap-3 border-t border-neutral-200/70 pt-4">
              <span className="text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">Auspicia</span>
              {proposal.companyAssetId ? (
                <div className="flex h-8 max-w-[140px] items-center">{img(proposal.companyAssetId, proposal.companyName)}</div>
              ) : (
                <span className="text-[12.5px] font-bold text-neutral-600">{proposal.companyName}</span>
              )}
            </div>
          )}
        </div>

        <footer
          className="flex flex-col gap-2 rounded-b-3xl border border-white/70 border-t-0 bg-white/50 px-4 py-3 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-6"
          style={{ animation: "rp-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.15s both" }}
        >
          <p className="text-[11px] text-neutral-500">Propuesta para {proposal.clientName} · Hecha para vos 💙</p>
          <PrintButton />
        </footer>
      </article>
      <p className="relative mx-auto mt-4 max-w-xl text-center text-[11px] text-neutral-400">
        Si no esperabas este mensaje, ignorá esta página.
      </p>
    </main>
  );
}
