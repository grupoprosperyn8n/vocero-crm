"use client";

/**
 * 041 — Botón «Guardar PDF» de la página pública de una propuesta:
 * abre el diálogo de impresión del navegador (desde donde se guarda como
 * PDF), con estilos de impresión ya preparados en globals.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="shrink-0 rounded-lg border bg-card px-3 py-1.5 text-[12px] font-semibold text-text-2 transition-colors hover:bg-subtle"
    >
      ⬇️ Guardar PDF
    </button>
  );
}
