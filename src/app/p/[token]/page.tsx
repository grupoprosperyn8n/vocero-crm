import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { kindLabel, loadPublicProposal } from "@/server/proposals/service";
import { getBranding } from "@/server/branding";
import { PrintButton } from "./print-button";

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
 * 041 — Página PÚBLICA de una propuesta comercial: se abre desde cualquier
 * computadora (celular incluido), sin sesión, con la foto de la publicidad,
 * el logo del emisor, la compañía auspiciada, la oferta/beneficio y el CTA.
 * Cada visita queda contada para el embudo del tablero.
 */
export default async function ProposalPage({ params }: Props) {
  const { token } = await params;
  const proposal = await loadPublicProposal(token);
  if (!proposal) notFound();
  const branding = await getBranding().catch(() => null);
  const img = (id: string | null, label: string) =>
    id ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/public/propuesta/img/${id}`}
        alt={label}
        className="max-h-full max-w-full object-contain"
      />
    ) : null;

  const ctaHref = proposal.ctaUrl ?? null;
  const paragraphs = proposal.body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <main className="min-h-screen bg-subtle/60 px-4 py-8 sm:py-12">
      <article className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Emisor: logo cargado (Rafael Allende) o el nombre de la marca */}
        <header className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {proposal.logoAssetId ? (
              <div className="flex h-12 max-w-[180px] items-center">
                {img(proposal.logoAssetId, branding?.name ?? "Logo")}
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-tint text-[15px] font-bold text-brand-text">
                {(branding?.name ?? "R").slice(0, 2).toUpperCase()}
              </div>
            )}
            {!proposal.logoAssetId && (
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold">
                  {branding?.name ?? "Asesor de seguros"}
                </p>
                <p className="text-[11.5px] text-text-3">
                  {kindLabel(proposal.kind)}
                </p>
              </div>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-brand-soft bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand-text">
            Para {proposal.clientName.split(" ")[0] || "vos"}
          </span>
        </header>

        {/* Foto de la publicidad */}
        {proposal.assetId && (
          <div className="flex max-h-[280px] min-h-[150px] items-center justify-center overflow-hidden bg-subtle sm:max-h-[360px]">
            {img(proposal.assetId, "Publicidad")}
          </div>
        )}

        <div className="space-y-4 px-4 py-5 sm:px-6 sm:py-6">
          <div>
            <h1 className="font-serif text-[21px] leading-tight font-normal sm:text-[24px]">
              {proposal.title}
            </h1>
            {proposal.subtitle && (
              <p className="mt-1 text-[13.5px] text-text-2">{proposal.subtitle}</p>
            )}
          </div>

          {/* Descuento o beneficio: lo primero que se ve */}
          {proposal.benefit && (
            <div className="flex items-center gap-2 rounded-xl border border-brand-soft bg-brand-tint px-4 py-3">
              <span className="text-[20px]">🎁</span>
              <p className="text-[14px] font-bold text-brand-text">
                {proposal.benefit}
              </p>
            </div>
          )}

          {proposal.productName && (
            <p className="inline-flex items-center gap-1.5 rounded-full border bg-subtle/70 px-3 py-1 text-[12px] font-semibold text-text-2">
              🛡️ {proposal.productName}
            </p>
          )}

          {paragraphs.map((p, i) => (
            <p key={i} className="text-[13.5px] leading-relaxed text-text-2">
              {p}
            </p>
          ))}

          {proposal.offer && (
            <div className="rounded-xl border bg-subtle/50 px-4 py-3">
              <p className="text-[11px] font-bold tracking-wide text-text-3 uppercase">
                La oferta
              </p>
              <p className="mt-1 text-[13.5px] text-text-1">{proposal.offer}</p>
            </div>
          )}

          {ctaHref && (
            <a
              href={ctaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
            >
              {proposal.ctaLabel ?? "Quiero más información"}
              <span aria-hidden>→</span>
            </a>
          )}

          {/* Compañía de seguro auspiciada */}
          {proposal.companyName && (
            <div className="flex items-center justify-center gap-3 border-t pt-4">
              <span className="text-[11px] font-semibold tracking-wide text-text-3 uppercase">
                Auspicia
              </span>
              {proposal.companyAssetId ? (
                <div className="flex h-8 max-w-[140px] items-center">
                  {img(proposal.companyAssetId, proposal.companyName)}
                </div>
              ) : (
                <span className="text-[12.5px] font-bold text-text-2">
                  {proposal.companyName}
                </span>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t bg-subtle/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] text-text-3">
            Propuesta para {proposal.clientName} · Hecha para vos 💙
          </p>
          <PrintButton />
        </footer>
      </article>
      <p className="mx-auto mt-4 max-w-xl text-center text-[11px] text-text-3">
        Si no esperabas este mensaje, ignorá esta página.
      </p>
    </main>
  );
}
