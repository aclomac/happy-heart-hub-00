import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { numberToWords } from "@/lib/number-to-words";
import type { InvoiceData } from "@/lib/pdf/invoice-pdf";
import type { PrintSettings, RegularTemplateId } from "@/lib/settings/companySettings";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/settings/companySettings";
import { getPdfLabels, localizeDocTitle } from "@/lib/pdf-i18n";
import type { RegularTemplateConfig } from "./types";

/* ---------- helpers ---------- */
const CURRENCY_NAMES: Record<string, { name: string; fraction: string; symbol: string }> = {
  BDT: { name: "Taka", fraction: "Paisa", symbol: "Tk" },
  USD: { name: "Dollars", fraction: "Cents", symbol: "$" },
  EUR: { name: "Euros", fraction: "Cents", symbol: "EUR" },
  INR: { name: "Rupees", fraction: "Paise", symbol: "Rs" },
  GBP: { name: "Pounds", fraction: "Pence", symbol: "GBP" },
  AED: { name: "Dirhams", fraction: "Fils", symbol: "AED" },
};

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

async function loadImage(url: string): Promise<string | null> {
  try {
    if (typeof fetch === "undefined") return null;
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ---------- template configs ---------- */
export const REGULAR_TEMPLATES: Record<RegularTemplateId, RegularTemplateConfig> = {
  classic: {
    id: "classic",
    name: "Classic",
    description: "Slate-dark header band with structured columns. The trusted default.",
    header: "dark-band",
    primary: [15, 23, 42],
    accent: [100, 116, 139],
    font: "helvetica",
    density: "comfortable",
    bandHeader: true,
    serifHeading: false,
  },
  modern: {
    id: "modern",
    name: "Modern",
    description: "Bold indigo accent with a clean split layout.",
    header: "split",
    primary: [79, 70, 229],
    accent: [129, 140, 248],
    font: "helvetica",
    density: "comfortable",
    bandHeader: true,
    serifHeading: false,
  },
  compact: {
    id: "compact",
    name: "Compact",
    description: "Dense layout — more rows per page, smaller margins.",
    header: "minimal",
    primary: [30, 41, 59],
    accent: [148, 163, 184],
    font: "helvetica",
    density: "compact",
    bandHeader: false,
    serifHeading: false,
  },
  professional: {
    id: "professional",
    name: "Professional",
    description: "Serif headings, double-rule borders, formal tone.",
    header: "double-rule",
    primary: [17, 24, 39],
    accent: [107, 114, 128],
    font: "times",
    density: "comfortable",
    bandHeader: false,
    serifHeading: true,
  },
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Typography-driven, no color bands. Letterhead-style.",
    header: "minimal",
    primary: [23, 23, 23],
    accent: [115, 115, 115],
    font: "helvetica",
    density: "comfortable",
    bandHeader: false,
    serifHeading: false,
  },
  tax_invoice: {
    id: "tax_invoice",
    name: "Tax Invoice",
    description: "Bordered VAT layout emphasizing tax columns and TIN/BIN.",
    header: "bordered-box",
    primary: [5, 95, 70],
    accent: [16, 122, 91],
    font: "helvetica",
    density: "comfortable",
    bandHeader: true,
    serifHeading: false,
    emphasizeTax: true,
  },
};

export function getRegularTemplate(id?: RegularTemplateId | null): RegularTemplateConfig {
  return REGULAR_TEMPLATES[id ?? "classic"] ?? REGULAR_TEMPLATES.classic;
}

/* ---------- paper format ---------- */
function jsPdfFormat(paper: PrintSettings["paperSize"]): string | [number, number] {
  switch (paper) {
    case "a4":
      return "a4";
    case "a5":
      return "a5";
    case "letter":
      return "letter";
    case "thermal_58":
      return [58, 200];
    case "thermal_80":
      return [80, 200];
    default:
      return "a4";
  }
}

/* ---------- main renderer ---------- */
export async function renderRegularInvoice(
  data: InvoiceData,
  cfgOverride?: Partial<RegularTemplateConfig>,
): Promise<jsPDF> {
  const ps: PrintSettings = {
    ...DEFAULT_PRINT_SETTINGS,
    ...(data.printSettings ?? {}),
  } as PrintSettings;

  const cfg = { ...getRegularTemplate(ps.regularTemplate), ...(cfgOverride ?? {}) };
  const paper =
    ps.paperSize === "thermal_58" || ps.paperSize === "thermal_80" ? "a4" : ps.paperSize;

  const doc = new jsPDF({
    unit: "mm",
    format: jsPdfFormat(paper),
    orientation: ps.orientation === "landscape" ? "landscape" : "portrait",
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = cfg.density === "compact" ? 10 : 14;
  const cur = CURRENCY_NAMES[data.currency || "BDT"] || CURRENCY_NAMES.BDT;
  const symbol = data.currencySymbol || cur.symbol;
  const L = getPdfLabels();

  const baseFont = ps.fontSize === "sm" ? 7.5 : ps.fontSize === "lg" ? 9.5 : 8.5;
  const headingFont = cfg.serifHeading ? "times" : cfg.font;

  /* ===== Header ===== */
  const headerH = cfg.bandHeader ? (cfg.density === "compact" ? 26 : 32) : 24;

  if (cfg.bandHeader) {
    doc.setFillColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    doc.rect(0, 0, W, headerH, "F");
  }

  // Logo
  let cursorX = M;
  if (ps.showLogo && data.company.logo_url) {
    const img = await loadImage(data.company.logo_url);
    if (img) {
      try {
        doc.addImage(img, "PNG", M, 6, 20, 20);
        cursorX = M + 24;
      } catch {
        /* ignore */
      }
    }
  }

  // Company name
  if (ps.showCompanyName) {
    if (cfg.bandHeader) doc.setTextColor(255, 255, 255);
    else doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    doc.setFont(headingFont, "bold");
    doc.setFontSize(cfg.density === "compact" ? 15 : 18);
    safeText(doc, data.company.name || "ERPOVO", cursorX, 14);
  }

  // Sub-header lines
  doc.setFont(cfg.font, "normal");
  doc.setFontSize(baseFont - 0.5);
  const headerLines: string[] = [];
  if (ps.showAddress && data.company.address) headerLines.push(data.company.address);
  const contactBits: string[] = [];
  if (ps.showPhone && data.company.phone) contactBits.push(`${L.tel}: ${data.company.phone}`);
  if (ps.showEmail && data.company.email) contactBits.push(`${L.email}: ${data.company.email}`);
  if (contactBits.length) headerLines.push(contactBits.join("  ·  "));
  if (ps.showTaxNumber && data.company.gst_number)
    headerLines.push(`${L.tin_bin}: ${data.company.gst_number}`);
  if (data.company.business_type) headerLines.push(data.company.business_type);
  if (headerLines.length) safeText(doc, headerLines, cursorX, 19);

  // Title block (right)
  if (cfg.bandHeader) doc.setTextColor(255, 255, 255);
  else doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
  doc.setFont(headingFont, "bold");
  doc.setFontSize(cfg.density === "compact" ? 17 : 22);
  safeText(doc, localizeDocTitle(data.title || "TAX INVOICE").toUpperCase(), W - M, 16, {
    align: "right",
  });
  doc.setFont(cfg.font, "normal");
  doc.setFontSize(baseFont);
  safeText(doc, `# ${data.number}`, W - M, 22, { align: "right" });
  safeText(doc, `${L.date}: ${data.date}`, W - M, 26, { align: "right" });

  // Bordered box variant draws extra outline
  if (cfg.header === "bordered-box") {
    doc.setDrawColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    doc.setLineWidth(0.4);
    doc.rect(M - 2, 4, W - (M - 2) * 2, headerH);
    doc.setLineWidth(0.2);
  } else if (cfg.header === "double-rule") {
    doc.setDrawColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    doc.setLineWidth(0.6);
    doc.line(M, headerH - 1, W - M, headerH - 1);
    doc.setLineWidth(0.2);
    doc.line(M, headerH + 1, W - M, headerH + 1);
  }

  /* ===== Bill-To & invoice details ===== */
  doc.setTextColor(0, 0, 0);
  let y = headerH + 10;
  doc.setFontSize(baseFont - 0.5);
  doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
  safeText(doc, L.bill_to, M, y);
  safeText(doc, L.invoice_details, W / 2 + 10, y);
  y += 1;
  doc.setDrawColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
  doc.line(M, y, M + 70, y);
  doc.line(W / 2 + 10, y, W - M, y);
  y += 4;
  doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
  doc.setFont(headingFont, "bold");
  doc.setFontSize(baseFont + 2.5);
  safeText(doc, data.party?.name || L.walk_in_customer, M, y);
  doc.setFont(cfg.font, "normal");
  doc.setFontSize(baseFont);
  const partyLines = [
    data.party?.address,
    data.party?.phone && `${L.phone}: ${data.party.phone}`,
    data.party?.gst_number && `${L.tin_bin}: ${data.party.gst_number}`,
  ].filter(Boolean) as string[];
  if (partyLines.length) safeText(doc, partyLines, M, y + 4);

  const rightX = W / 2 + 10;
  doc.setFont(cfg.font, "normal");
  doc.setFontSize(baseFont);
  const details: [string, string][] = [
    [L.invoice_no, data.number],
    [L.date, data.date],
    ...(data.dueDate ? [[L.due, data.dueDate] as [string, string]] : []),
    ...(data.paymentMethod
      ? [[L.payment, data.paymentMethod.toUpperCase()] as [string, string]]
      : []),
  ];
  details.forEach((row, i) => {
    doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    safeText(doc, row[0], rightX, y + i * 4.5);
    doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    safeText(doc, String(row[1]), W - M, y + i * 4.5, { align: "right" });
  });

  const itemsStartY = Math.max(y + partyLines.length * 4 + 8, y + details.length * 4.5 + 6);

  /* ===== Items table ===== */
  const cols = ps.itemColumns;
  const head: string[] = [];
  if (cols.sno) head.push("#");
  head.push(L.item);
  if (cols.hsn) head.push(L.hsn);
  if (cols.qty) head.push(L.qty);
  if (cols.unit) head.push(L.unit);
  if (cols.rate) head.push(L.price);
  if (cols.discount) head.push(L.discount_pct);
  if (cols.tax) head.push(cfg.emphasizeTax ? L.vat_pct : L.tax_pct);
  if (cols.amount) head.push(L.amount);

  const body = data.lines.map((l, i) => {
    const row: string[] = [];
    if (cols.sno) row.push(String(i + 1));
    row.push(l.name + (l.description ? `\n${l.description}` : ""));
    if (cols.hsn) row.push("-");
    if (cols.qty) row.push(String(l.qty));
    if (cols.unit) row.push(l.unit || "PCS");
    if (cols.rate) row.push(fmt(l.price));
    if (cols.discount) row.push(l.discount_pct ? `${l.discount_pct}%` : "-");
    if (cols.tax) row.push(l.tax_pct ? `${l.tax_pct}%` : "-");
    if (cols.amount) row.push(`${symbol} ${fmt(l.amount)}`);
    return row;
  });

  autoTable(doc, {
    startY: itemsStartY,
    head: [head],
    body,
    theme: cfg.header === "bordered-box" ? "grid" : "striped",
    showHead: ps.repeatHeader ? "everyPage" : "firstPage",
    headStyles: {
      fillColor: cfg.primary,
      textColor: 255,
      fontSize: baseFont,
      fontStyle: "bold",
    },
    bodyStyles: { fontSize: baseFont, textColor: cfg.primary },
    margin: { left: M, right: M },
  });

  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* ===== Totals box ===== */
  const boxW = cfg.density === "compact" ? 68 : 75;
  const boxX = W - M - boxW;
  const rows: [string, string, boolean?][] = [[L.subtotal, `${symbol} ${fmt(data.subtotal)}`]];
  if (data.discount) rows.push([L.discount, `- ${symbol} ${fmt(data.discount)}`]);
  if (data.tax) rows.push([cfg.emphasizeTax ? L.vat : L.tax_vat, `${symbol} ${fmt(data.tax)}`]);
  if (data.deliveryCharge) rows.push([L.delivery, `${symbol} ${fmt(data.deliveryCharge)}`]);
  if (data.laborCost) rows.push([L.labor, `${symbol} ${fmt(data.laborCost)}`]);
  if (data.roundOff) rows.push([L.round_off, `${symbol} ${fmt(data.roundOff)}`]);
  rows.push([L.grand_total, `${symbol} ${fmt(data.total)}`, true]);
  if (data.paid != null) rows.push([L.paid, `${symbol} ${fmt(data.paid)}`]);
  if (data.balance != null && data.balance > 0)
    rows.push([L.balance_due, `${symbol} ${fmt(data.balance)}`, true]);

  let ty = endY;
  rows.forEach(([label, val, bold]) => {
    if (bold) {
      doc.setFillColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
      doc.rect(boxX, ty, boxW, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont(cfg.font, "bold");
    } else {
      doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
      doc.setFont(cfg.font, "normal");
    }
    doc.setFontSize(baseFont + 0.5);
    safeText(doc, label, boxX + 2, ty + 5);
    safeText(doc, val, boxX + boxW - 2, ty + 5, { align: "right" });
    ty += 7;
    if (!bold) {
      doc.setDrawColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
      doc.line(boxX, ty - 0.2, boxX + boxW, ty - 0.2);
    }
  });

  /* ===== Amount in words ===== */
  if (ps.showAmountInWords) {
    doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    doc.setFont(cfg.font, "bold");
    doc.setFontSize(baseFont - 0.5);
    safeText(doc, L.amount_in_words, M, endY + 4);
    doc.setFont(cfg.font, "italic");
    doc.setFontSize(baseFont);
    const words = numberToWords(data.total, cur.name, cur.fraction);
    const wrapped = doc.splitTextToSize(words, boxX - M - 4);
    safeText(doc, wrapped, M, endY + 9);
  }

  /* ===== Terms / Notes ===== */
  let footerY = Math.max(ty, endY + 28) + 10;
  const termsBody = ps.showTerms && data.terms && data.terms.trim() ? data.terms.trim() : "";
  if (termsBody) {
    doc.setFont(cfg.font, "bold");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    safeText(doc, L.terms_and_conditions, M, footerY);
    doc.setDrawColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    doc.line(M, footerY + 1, W - M, footerY + 1);
    doc.setFont(cfg.font, "normal");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    const tw = doc.splitTextToSize(termsBody, W - M * 2);
    safeText(doc, tw, M, footerY + 5);
    footerY += 5 + Math.max(1, tw.length) * 3;
  }
  const notesBody = data.notes && data.notes.trim() ? data.notes.trim() : "";
  if (notesBody) {
    doc.setFont(cfg.font, "bold");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    safeText(doc, L.notes, M, footerY + 4);
    doc.setDrawColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    doc.line(M, footerY + 5, W - M, footerY + 5);
    doc.setFont(cfg.font, "normal");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    const nw = doc.splitTextToSize(notesBody, W - M * 2);
    safeText(doc, nw, M, footerY + 9);
    footerY += 9 + Math.max(1, nw.length) * 3;
  }

  /* ===== Attachments (filenames only by default) ===== */
  if (data.attachments && data.attachments.items.length > 0) {
    doc.setFont(cfg.font, "bold");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    safeText(doc, `Attachments (${data.attachments.items.length})`, M, footerY + 4);
    if (data.attachments.showFilenames) {
      doc.setFont(cfg.font, "normal");
      doc.setFontSize(baseFont - 1);
      doc.setTextColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
      const names = data.attachments.items.map((a) => `• ${a.file_name}`).join("\n");
      const lines = doc.splitTextToSize(names, W - M * 2);
      safeText(doc, lines, M, footerY + 8);
      footerY += 8 + Math.max(1, lines.length) * 3;
    } else {
      footerY += 6;
    }
  }

  const extras: string[] = [];
  if (ps.showBankDetails && ps.bankDetailsText) extras.push(`${L.bank}: ${ps.bankDetailsText}`);
  if (ps.showQr && ps.qrText) extras.push(`${L.pay}: ${ps.qrText}`);
  if (data.footerNote) extras.push(data.footerNote);
  if (extras.length > 0) {
    doc.setFont(cfg.font, "normal");
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(80, 90, 110);
    const wrap = doc.splitTextToSize(extras.join("\n"), W - M * 2);
    safeText(doc, wrap, M, footerY + 4);
  }

  /* ===== Signature ===== */
  if (ps.showSignature) {
    const sigY = H - 20;
    if (data.company.signature_url) {
      const sigImg = await loadImage(data.company.signature_url);
      if (sigImg) {
        try {
          doc.addImage(sigImg, "PNG", W - M - 45, sigY - 16, 40, 14);
        } catch {
          /* ignore */
        }
      }
    }
    doc.setDrawColor(cfg.primary[0], cfg.primary[1], cfg.primary[2]);
    doc.line(W - M - 50, sigY, W - M, sigY);
    doc.setFontSize(baseFont - 0.5);
    doc.setTextColor(cfg.accent[0], cfg.accent[1], cfg.accent[2]);
    safeText(doc, data.signatureLabel || L.authorized_signature, W - M - 25, sigY + 4, {
      align: "center",
    });
  }

  return doc;
}
