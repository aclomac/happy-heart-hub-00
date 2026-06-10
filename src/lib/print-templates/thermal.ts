import jsPDF from "jspdf";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import type { PrintSettings, ThermalTemplateId } from "@/lib/settings/companySettings";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/settings/companySettings";
import { getPdfLabels } from "@/lib/pdf-i18n";
import type { ThermalTemplateConfig } from "./types";

function fmt(n: number) {
  return Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function asciiFallback(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xff]/g, "?");
}

function safeText(
  doc: jsPDF,
  text: string | string[],
  x: number,
  y: number,
  opts?: Parameters<jsPDF["text"]>[3],
): void {
  try {
    doc.text(text, x, y, opts);
  } catch {
    try {
      const fallback = Array.isArray(text) ? text.map(asciiFallback) : asciiFallback(text);
      doc.text(fallback, x, y, opts);
    } catch {
      /* swallow */
    }
  }
}

export const THERMAL_TEMPLATES: Record<ThermalTemplateId, ThermalTemplateConfig> = {
  thermal_58: {
    id: "thermal_58",
    name: "58mm Thermal",
    description: "Narrow 58mm receipt for mini thermal printers.",
    width: 58,
    fullHeader: true,
    density: "compact",
    showItemDesc: false,
    showPayDetails: true,
  },
  thermal_80: {
    id: "thermal_80",
    name: "80mm Thermal",
    description: "Standard 80mm receipt — the POS default.",
    width: 80,
    fullHeader: true,
    density: "comfortable",
    showItemDesc: true,
    showPayDetails: true,
  },
  thermal_compact: {
    id: "thermal_compact",
    name: "Compact Receipt",
    description: "80mm minimal receipt — totals only, no item descriptions.",
    width: 80,
    fullHeader: false,
    density: "compact",
    showItemDesc: false,
    showPayDetails: false,
  },
  thermal_detailed: {
    id: "thermal_detailed",
    name: "Detailed Receipt",
    description: "80mm full breakdown — descriptions, tax, payment, terms.",
    width: 80,
    fullHeader: true,
    density: "comfortable",
    showItemDesc: true,
    showPayDetails: true,
  },
};

export function getThermalTemplate(id?: ThermalTemplateId | null): ThermalTemplateConfig {
  return THERMAL_TEMPLATES[id ?? "thermal_80"] ?? THERMAL_TEMPLATES.thermal_80;
}

export function renderThermalReceipt(
  data: InvoiceData,
  templateOverride?: ThermalTemplateId,
): jsPDF {
  const ps: PrintSettings = {
    ...DEFAULT_PRINT_SETTINGS,
    ...(data.printSettings ?? {}),
  } as PrintSettings;
  const cfg = getThermalTemplate(templateOverride ?? ps.thermalTemplate);
  const W = cfg.width;
  const symbol = data.currencySymbol || "Tk";
  const L = getPdfLabels();

  // estimate height
  const lineH = cfg.density === "compact" ? 3.2 : 4;
  const estimatedH =
    50 +
    data.lines.length * (cfg.showItemDesc ? 9 : 6) +
    (ps.showTerms && data.terms ? 14 : 0) +
    (cfg.showPayDetails ? 12 : 0);
  const doc = new jsPDF({ unit: "mm", format: [W, estimatedH] });
  let y = 6;

  /* Header */
  if (ps.showCompanyName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(W <= 58 ? 10 : 12);
    safeText(doc, data.company.name || "ERPOVO", W / 2, y, { align: "center" });
    y += 4;
  }

  if (cfg.fullHeader) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(W <= 58 ? 6.5 : 7);
    if (ps.showAddress && data.company.address) {
      const a = doc.splitTextToSize(data.company.address, W - 6);
      safeText(doc, a, W / 2, y, { align: "center" });
      y += a.length * 3;
    }
    if (ps.showPhone && data.company.phone) {
      safeText(doc, `${L.tel}: ${data.company.phone}`, W / 2, y, { align: "center" });
      y += 3;
    }
    if (ps.showEmail && data.company.email) {
      safeText(doc, data.company.email, W / 2, y, { align: "center" });
      y += 3;
    }
    if (ps.showTaxNumber && data.company.gst_number) {
      safeText(doc, `${L.bin}: ${data.company.gst_number}`, W / 2, y, { align: "center" });
      y += 3;
    }
  }

  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(3, y, W - 3, y);
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(W <= 58 ? 7 : 8);
  safeText(doc, `${L.receipt}: ${data.number}`, 3, y);
  safeText(doc, data.date, W - 3, y, { align: "right" });
  y += 4;
  if (data.party?.name) {
    safeText(doc, `${L.customer}: ${data.party.name}`, 3, y);
    y += 3;
  }
  if (cfg.showPayDetails && data.paymentMethod) {
    safeText(doc, `${L.payment}: ${data.paymentMethod.toUpperCase()}`, 3, y);
    y += 3;
  }
  doc.line(3, y, W - 3, y);
  y += 4;

  /* Items */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(W <= 58 ? 6.5 : 7);
  const qtyX = W <= 58 ? 28 : 42;
  const priceX = W <= 58 ? 40 : 56;
  safeText(doc, L.item, 3, y);
  safeText(doc, L.qty, qtyX, y, { align: "right" });
  if (W > 58) safeText(doc, L.price, priceX, y, { align: "right" });
  safeText(doc, L.total_col, W - 3, y, { align: "right" });
  y += 1;
  doc.line(3, y, W - 3, y);
  y += 3;
  doc.setFont("helvetica", "normal");
  data.lines.forEach((l) => {
    const name = doc.splitTextToSize(l.name, W <= 58 ? 22 : 38);
    safeText(doc, name, 3, y);
    safeText(doc, String(l.qty), qtyX, y, { align: "right" });
    if (W > 58) safeText(doc, fmt(l.price), priceX, y, { align: "right" });
    safeText(doc, fmt(l.amount), W - 3, y, { align: "right" });
    y += Math.max(3, name.length * 3) + 1;
    if (cfg.showItemDesc && l.description) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      const dl = doc.splitTextToSize(l.description, W - 6);
      safeText(doc, dl, 3, y);
      y += dl.length * 2.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(W <= 58 ? 6.5 : 7);
    }
  });
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(3, y, W - 3, y);
  y += 4;

  /* Totals */
  const row = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? (W <= 58 ? 9 : 10) : W <= 58 ? 7 : 8);
    safeText(doc, label, 3, y);
    safeText(doc, val, W - 3, y, { align: "right" });
    y += bold ? 5 : lineH;
  };
  row(L.subtotal, `${symbol} ${fmt(data.subtotal)}`);
  if (data.discount) row(L.discount, `- ${symbol} ${fmt(data.discount)}`);
  if (data.tax) row(L.tax_vat, `${symbol} ${fmt(data.tax)}`);
  if (data.deliveryCharge) row(L.delivery, `${symbol} ${fmt(data.deliveryCharge)}`);
  row(L.total, `${symbol} ${fmt(data.total)}`, true);
  if (cfg.showPayDetails) {
    if (data.paid != null) row(L.paid, `${symbol} ${fmt(data.paid)}`);
    if (data.balance != null && data.balance !== 0)
      row(
        data.balance > 0 ? L.balance : L.change,
        `${symbol} ${fmt(Math.abs(data.balance))}`,
        true,
      );
  }

  y += 3;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(W <= 58 ? 6.5 : 7);
  safeText(doc, L.thank_you, W / 2, y, { align: "center" });
  y += 4;
  if (ps.showTerms && data.terms) {
    const t = doc.splitTextToSize(data.terms, W - 6);
    safeText(doc, t, W / 2, y, { align: "center" });
  }
  return doc;
}
