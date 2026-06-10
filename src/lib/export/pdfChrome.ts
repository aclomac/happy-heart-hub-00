// Shared PDF header/footer chrome for ERPOVO report PDFs.
// Use with jsPDF + jspdf-autotable's `didDrawPage` hook.
//
// Bangla / Unicode safety: jsPDF's built-in helvetica font only covers
// Latin-1; any non-Latin glyph (Bangla, Hindi, Chinese, emoji) is silently
// substituted. We additionally guard every text() call with a try/catch and
// retry with an ASCII-only fallback so a future font-loader regression can
// never crash a multi-page report.

import type jsPDF from "jspdf";
import type { PrintSettings } from "@/lib/settings/companySettings";
import { getPdfLabels } from "@/lib/pdf-i18n";

export type PdfChromeHeader = {
  companyName: string;
  companyMeta?: string; // address / phone / email — single line
  taxLine?: string; // TIN/GST line
  title: string;
  period?: string;
  filters?: string[];
  logoDataUrl?: string | null;
  showLogo?: boolean;
};

export type PdfChromeFooter = {
  generatedAt?: Date;
  signature?: string | null;
  signatureLabel?: string | null;
  print?: Partial<PrintSettings> | null;
  footerNote?: string | null;
  showPageNumber?: boolean;
  showGeneratedAt?: boolean;
};

/** Replace characters outside the Latin-1 range with '?' for safe rendering. */
function asciiFallback(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xff]/g, "?");
}

type TextOpts = Parameters<jsPDF["text"]>[3];

function safeText(doc: jsPDF, text: string, x: number, y: number, opts?: TextOpts): void {
  try {
    doc.text(text, x, y, opts);
  } catch {
    try {
      doc.text(asciiFallback(text), x, y, opts);
    } catch {
      // last resort: swallow — chrome should never break the document
    }
  }
}

function safeAddImage(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  try {
    // jsPDF auto-detects format from the data URL.
    const fmt = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
    doc.addImage(dataUrl, fmt, x, y, w, h);
    return true;
  } catch {
    return false;
  }
}

export function drawReportHeader(doc: jsPDF, h: PdfChromeHeader): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 14;
  let textX = 14;

  // Optional logo (only when explicitly enabled and a data URL is provided).
  if (h.showLogo !== false && h.logoDataUrl) {
    const ok = safeAddImage(doc, h.logoDataUrl, 14, 8, 16, 16);
    if (ok) textX = 32;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  safeText(doc, h.companyName || "ERPOVO", textX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (h.companyMeta) {
    y += 5;
    safeText(doc, h.companyMeta, textX, y);
  }
  if (h.taxLine) {
    y += 4;
    safeText(doc, h.taxLine, textX, y);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  safeText(doc, h.title, pageWidth / 2, 14, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (h.period) safeText(doc, h.period, pageWidth / 2, 19, { align: "center" });

  if (h.filters && h.filters.length > 0) {
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(90);
    safeText(doc, h.filters.join("  |  "), 14, y, { maxWidth: pageWidth - 28 });
    doc.setTextColor(0);
  }

  // Return Y position where table content can start.
  return Math.max(y + 6, 30);
}

export function drawReportFooter(doc: jsPDF, f: PdfChromeFooter = {}): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = (f.generatedAt ?? new Date()).toISOString().slice(0, 19).replace("T", " ");
  const print = f.print ?? {};
  const showPageNumber = f.showPageNumber !== false;
  const showGenerated = f.showGeneratedAt !== false;

  // jsPDF: page numbering across pages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalPages = (doc as any).internal.getNumberOfPages?.() ?? 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPage = (doc as any).internal.getCurrentPageInfo?.().pageNumber ?? 1;

  const L = getPdfLabels();
  // Optional terms/bank/qr/footer note block above the chrome footer line.
  let blockY = pageHeight - 14;
  const block: string[] = [];
  if (print.showTerms && print.termsText) block.push(`${L.terms}: ${print.termsText}`);
  if (print.showBankDetails && print.bankDetailsText)
    block.push(`${L.bank}: ${print.bankDetailsText}`);
  if (print.showQr && print.qrText) block.push(`${L.pay}: ${print.qrText}`);
  if (f.footerNote) block.push(f.footerNote);
  if (block.length > 0) {
    doc.setFontSize(7);
    doc.setTextColor(90);
    for (let i = block.length - 1; i >= 0; i--) {
      safeText(doc, block[i], 14, blockY, { maxWidth: pageWidth - 28 });
      blockY -= 3.2;
    }
    doc.setTextColor(0);
  }

  doc.setFontSize(8);
  doc.setTextColor(120);
  if (showGenerated) safeText(doc, `${L.generated}: ${generated}`, 14, pageHeight - 8);
  if (showPageNumber) {
    safeText(doc, `${L.page} ${currentPage} / ${totalPages}`, pageWidth - 14, pageHeight - 8, {
      align: "right",
    });
  }
  if (f.signature) {
    const sig = f.signatureLabel ? `${f.signature} — ${f.signatureLabel}` : f.signature;
    safeText(doc, sig, pageWidth / 2, pageHeight - 8, { align: "center" });
  }
  doc.setTextColor(0);
}
