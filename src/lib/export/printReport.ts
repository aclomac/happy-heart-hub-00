// Shared Print helper. Builds a self-contained HTML document suitable for
// `window.print()` from a new tab, with A4-friendly CSS and no app chrome.
// The builder is pure so it can be unit-tested without a DOM.

import type { CompanyInfo, ReportColumn } from "./pdfReport";
import { summarizeFilters, type ReportFilterSummaryInput } from "./filterSummary";
import { fmtDate } from "./format";
import type { PrintContext } from "@/lib/pdf/print-context";
import { getPdfLabels } from "@/lib/pdf-i18n";

export type PrintReportArgs<Row> = {
  company?: CompanyInfo | null;
  printContext?: PrintContext | null;
  title: string;
  period?: { from?: string | Date | null; to?: string | Date | null };
  filters?: ReportFilterSummaryInput;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totals?: (string | number | null | undefined)[];
  signature?: string | null;
};

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function periodLabel(p?: PrintReportArgs<unknown>["period"]): string | undefined {
  if (!p) return undefined;
  const f = fmtDate(p.from ?? null);
  const t = fmtDate(p.to ?? null);
  if (f && t) return `${f} → ${t}`;
  if (f) return `From ${f}`;
  if (t) return `Until ${t}`;
  return undefined;
}

export function buildPrintReportHtml<Row>(args: PrintReportArgs<Row>): string {
  const ctxCompany = args.printContext?.company ?? null;
  const company: CompanyInfo | null = ctxCompany
    ? {
        name: ctxCompany.name,
        address: ctxCompany.address,
        phone: ctxCompany.phone,
        email: ctxCompany.email,
        taxNumber: ctxCompany.taxNumber,
        businessType: ctxCompany.businessType,
        logoDataUrl: args.printContext?.logoDataUrl ?? null,
      }
    : (args.company ?? null);
  const print = args.printContext?.print ?? null;
  const filters = args.filters ? summarizeFilters(args.filters) : [];
  const period = periodLabel(args.period);
  const generated = new Date().toISOString().slice(0, 19).replace("T", " ");

  const L = getPdfLabels();
  const metaLine = [company?.address, company?.phone, company?.email]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map(escapeHtml)
    .join(" · ");
  const taxLine = company?.taxNumber ? `${L.tin_gst}: ${escapeHtml(company.taxNumber)}` : "";

  const thead = `<tr>${args.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"}">${escapeHtml(c.header)}</th>`)
    .join("")}</tr>`;

  const tbody = args.rows
    .map(
      (row) =>
        `<tr>${args.columns
          .map((c) => {
            const v = c.accessor(row);
            return `<td style="text-align:${c.align ?? "left"}">${escapeHtml(v)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  const totalsRow =
    args.totals && args.totals.length > 0
      ? `<tfoot><tr>${args.totals
          .map(
            (v, i) =>
              `<td style="text-align:${args.columns[i]?.align ?? "left"};font-weight:600;background:#e8f0fe">${escapeHtml(v)}</td>`,
          )
          .join("")}</tr></tfoot>`
      : "";

  const showLogo = print ? print.showLogo : true;
  const showSignature = print ? print.showSignature : true;
  const logoHtml =
    showLogo && company?.logoDataUrl
      ? `<img src="${escapeHtml(company.logoDataUrl)}" alt="logo" style="max-height:36px;margin-right:10px;object-fit:contain;" />`
      : "";

  const extraBlocks: string[] = [];
  if (print?.showTerms && print.termsText) {
    extraBlocks.push(`<div class="block"><b>${L.terms}:</b> ${escapeHtml(print.termsText)}</div>`);
  }
  if (print?.showBankDetails && print.bankDetailsText) {
    extraBlocks.push(
      `<div class="block"><b>${L.bank}:</b> ${escapeHtml(print.bankDetailsText)}</div>`,
    );
  }
  if (print?.showQr && print.qrText) {
    extraBlocks.push(`<div class="block"><b>${L.pay}:</b> ${escapeHtml(print.qrText)}</div>`);
  }

  const paperSize =
    print?.paperSize === "thermal_58" || print?.paperSize === "thermal_80"
      ? print.paperSize === "thermal_58"
        ? "58mm auto"
        : "80mm auto"
      : "A4 landscape";
  const baseFont = print?.fontSize === "sm" ? "8pt" : print?.fontSize === "lg" ? "10pt" : "9pt";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(args.title)}</title>
<style>
  @page { size: ${paperSize}; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Bengali", sans-serif; color: #111; margin: 0; padding: 0; font-size: ${baseFont}; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 10px; }
  .hdr .co-block { display: flex; align-items: flex-start; }
  .hdr .co-name { font-weight: 700; font-size: 14pt; }
  .hdr .co-meta { color: #555; font-size: 9pt; margin-top: 2px; }
  .hdr .co-tax { color: #555; font-size: 9pt; margin-top: 1px; }
  .hdr .title { font-weight: 700; font-size: 13pt; text-align: center; flex: 1; }
  .hdr .period { font-size: 9pt; color: #333; text-align: right; min-width: 30%; }
  .filters { font-size: 9pt; color: #555; margin: 4px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: inherit; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td { border: 1px solid #d0d4dc; padding: 4px 6px; vertical-align: top; }
  th { background: #212529; color: #fff; font-weight: 600; }
  tbody tr:nth-child(even) td { background: #f5f7fa; }
  tr { page-break-inside: avoid; }
  .extra { margin-top: 10px; font-size: 8pt; color: #444; }
  .extra .block { margin-bottom: 2px; }
  .ftr { margin-top: 16px; display: flex; justify-content: space-between; font-size: 8pt; color: #666; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="hdr">
    <div class="co-block">
      ${logoHtml}
      <div>
        <div class="co-name">${escapeHtml(company?.name ?? "ERPOVO")}</div>
        ${metaLine ? `<div class="co-meta">${metaLine}</div>` : ""}
        ${taxLine ? `<div class="co-tax">${taxLine}</div>` : ""}
      </div>
    </div>
    <div class="title">${escapeHtml(args.title)}</div>
    <div class="period">${period ? escapeHtml(period) : ""}</div>
  </div>
  ${filters.length ? `<div class="filters">${filters.map(escapeHtml).join(" &nbsp;|&nbsp; ")}</div>` : ""}
  <table>
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
    ${totalsRow}
  </table>
  ${extraBlocks.length ? `<div class="extra">${extraBlocks.join("")}</div>` : ""}
  <div class="ftr">
    <div>${L.generated}: ${escapeHtml(generated)}</div>
    <div>${showSignature ? escapeHtml(args.signature ?? "") : ""}</div>
  </div>
  <script>window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 150); window.addEventListener('afterprint', function(){ window.close(); }); });</script>
</body>
</html>`;
}

/** Opens the printable report in a new window. No-op in non-browser env. */
export function printReportHtml<Row>(args: PrintReportArgs<Row>): void {
  if (typeof window === "undefined") return;
  const html = buildPrintReportHtml(args);
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) {
    throw new Error("Popup blocked — allow popups to print this report.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
