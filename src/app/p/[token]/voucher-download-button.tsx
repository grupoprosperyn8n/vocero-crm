"use client";

import { useState } from "react";
import { descargarVoucherPdf, type VoucherPdfData } from "@/lib/voucher-pdf";

/**
 * 044b-B13 — «Descargar voucher (PDF)» en la página pública del cupón:
 * el cliente guarda su voucher en PDF desde el mismo link.
 */
export function VoucherDownloadButton({ data }: { data: VoucherPdfData }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await descargarVoucherPdf(data);
        } finally {
          setBusy(false);
        }
      }}
      className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/90 bg-white/90 px-5 py-3 text-[14px] font-bold text-amber-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white disabled:opacity-60"
    >
      {busy ? "Generando PDF…" : "📥 Descargar voucher (PDF)"}
    </button>
  );
}
