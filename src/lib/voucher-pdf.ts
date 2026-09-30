/**
 * 044b-B13 — «Descargar voucher (PDF)»: genera el PDF del cupón/voucher.
 *
 * Se usa en dos lugares: en el Constructor (demo, con código de ejemplo) y en
 * la página pública del cupón (con el código emitido real, si lo hay).
 * jsPDF es sin dependencias nativas y se carga al vuelo (dynamic import) para
 * no pesar en el bundle principal.
 */

export type VoucherPdfData = {
  negocio: string;
  titulo: string;
  beneficio: string;
  condiciones?: string | null;
  desde?: string | null;
  hasta?: string | null;
  /** Código emitido (VCH-XXXX-XXXX). En la demo va uno de ejemplo. */
  codigo?: string | null;
  beneficiario?: string | null;
};

function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function descargarVoucherPdf(data: VoucherPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  // A6 vertical (105 × 148 mm): cómodo para imprimir o mostrar en el celular.
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [105, 148] });
  const W = 105;
  const M = 8;
  const innerW = W - M * 2;

  // Fondo suave y marco punteado
  doc.setFillColor(255, 252, 245);
  doc.rect(0, 0, W, 148, "F");
  doc.setDrawColor(217, 162, 61);
  doc.setLineDashPattern([1.4, 1.4], 0);
  doc.setLineWidth(0.7);
  doc.roundedRect(M - 2, 6, W - (M - 2) * 2, 148 - 12, 3, 3, "S");
  doc.setLineDashPattern([], 0);

  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(180, 120, 20);
  doc.text("CUPON DE REGALO", W / 2, y, { align: "center" });
  y += 5;

  doc.setFontSize(13);
  doc.setTextColor(30, 34, 48);
  doc.text(doc.splitTextToSize(data.negocio || "Voucher", innerW), W / 2, y, {
    align: "center",
  });
  y += 8;

  // Beneficio destacado
  doc.setFillColor(254, 243, 214);
  doc.setDrawColor(240, 200, 120);
  doc.setLineWidth(0.4);
  const beneficioLines = doc.splitTextToSize(data.beneficio || "Beneficio", innerW - 10);
  const boxH = Math.max(16, beneficioLines.length * 6 + 8);
  doc.roundedRect(M, y, innerW, boxH, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(146, 84, 10);
  doc.text(beneficioLines, W / 2, y + 9, { align: "center" });
  y += boxH + 8;

  // Código para canjear
  if (data.codigo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 130);
    doc.text("CODIGO PARA CANJEAR", W / 2, y, { align: "center" });
    y += 4;
    doc.setDrawColor(217, 162, 61);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.roundedRect(M + 6, y, innerW - 12, 14, 2.5, 2.5, "S");
    doc.setLineDashPattern([], 0);
    doc.setFont("courier", "bold");
    doc.setFontSize(17);
    doc.setTextColor(30, 34, 48);
    doc.text(data.codigo, W / 2, y + 9.5, { align: "center" });
    y += 20;
  } else {
    y += 2;
  }

  // Beneficiario
  if (data.beneficiario) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90, 94, 110);
    doc.text(`Para: ${data.beneficiario}`, W / 2, y, { align: "center" });
    y += 5;
  }

  // Validez
  const desde = fechaCorta(data.desde);
  const hasta = fechaCorta(data.hasta);
  if (desde || hasta) {
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 130);
    const txt = [desde ? `Valido desde el ${desde}` : null, hasta ? `hasta el ${hasta}` : null]
      .filter(Boolean)
      .join(" ");
    doc.text(txt, W / 2, y, { align: "center" });
    y += 5;
  }

  // Condiciones
  if (data.condiciones?.trim()) {
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 150);
    const lines = doc.splitTextToSize(data.condiciones.trim(), innerW);
    doc.text(lines.slice(0, 6), W / 2, y + 1, { align: "center" });
  }

  // Pie
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(180, 120, 20);
  doc.text("Mostra este voucher para canjear tu beneficio", W / 2, 138, {
    align: "center",
  });

  const slug = (data.codigo ?? "demo").toLowerCase().replace(/[^a-z0-9-]/g, "");
  doc.save(`voucher-${slug}.pdf`);
}
