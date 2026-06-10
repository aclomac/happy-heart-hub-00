// High-level PDF builder shared by every ERPOVO report.
// Wraps jsPDF + jspdf-autotable with consistent header, footer, filter
// summary and totals rendering. Pure logic — no React, no DOM.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawReportHeader, drawReportFooter } from "./pdfChrome";
import { summarizeFilters, type ReportFilterSummaryInput } from "./filterSummary";
import { reportFilename, type ReportFilenameOptions } from "./filename";
import { EmptyExportError } from "./exportGuards";
import type { PrintContext } from "@/lib/pdf/print-context";
import { buildHeaderMeta, buildTaxLine } from "@/lib/pdf/print-context";
import { fmtDate } from "./format";

export type CompanyInfo = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxNumber?: string | null;
  businessType?: string | null;
  logoDataUrl?: string | null; // pre-fetched data URL; safe to omit
};

export type ReportColumn<Row> = {
  header: string;
  /** Right-align numeric columns. */
  align?: "left" | "right" | "center";
  /** Optional explicit width in mm (auto if omitted). */
  width?: number;
  accessor: (row: Row) => string | number | null | undefined;
};

export type BuildReportPdfArgs<Row> = {
  doc?: jsPDF;
  company?: CompanyInfo | null;
  /** Optional fully-resolved print context — overrides company + applies settings. */
  printContext?: PrintContext | null;
  title: string;
  period?: { from?: string | Date | null; to?: string | Date | null };
  filters?: ReportFilterSummaryInput;
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Optional totals row rendered after the table in bold. */
  totals?: (string | number | null | undefined)[];
  signature?: string | null;
  orientation?: "portrait" | "landscape";
};

function companyMeta(company?: CompanyInfo | null): string {
  if (!company) return "";
  const parts = [company.address, company.phone, company.email].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  return parts.join(" · ");
}

function periodLabel(p?: BuildReportPdfArgs<unknown>["period"]): string | undefined {
  if (!p) return undefined;
  const f = fmtDate(p.from ?? null);
  const t = fmtDate(p.to ?? null);
  if (f && t) return `${f} → ${t}`;
  if (f) return `From ${f}`;
  if (t) return `Until ${t}`;
  return undefined;
}

export function buildReportPdf<Row>(args: BuildReportPdfArgs<Row>): jsPDF {
  const doc =
    args.doc ??
    new jsPDF({
      orientation: args.orientation ?? "landscape",
      unit: "mm",
      format: "a4",
    });

  const filterLines = args.filters ? summarizeFilters(args.filters) : [];
  const period = periodLabel(args.period);

  // Merge company info from a (preferred) PrintContext or fall back to the
  // legacy `company` field. Either path safely defaults to "ERPOVO".
  const ctxCompany = args.printContext?.company;
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

  const headerHeight = drawReportHeader(doc, {
    companyName: company?.name ?? "ERPOVO",
    companyMeta: companyMeta(company),
    taxLine: company
      ? buildTaxLine({
          name: company.name ?? "",
          taxNumber: company.taxNumber ?? null,
          businessType: company.businessType ?? null,
        })
      : "",
    title: args.title,
    period,
    filters: filterLines,
    showLogo: print ? print.showLogo : true,
    logoDataUrl: company?.logoDataUrl ?? null,
  });

  const tableHead = [args.columns.map((c) => c.header)];
  const tableBody = args.rows.map((row) =>
    args.columns.map((c) => {
      const v = c.accessor(row);
      return v == null ? "" : String(v);
    }),
  );

  const columnStyles: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number }> =
    {};
  args.columns.forEach((c, i) => {
    columnStyles[i] = {
      halign: c.align ?? "left",
      ...(c.width ? { cellWidth: c.width } : {}),
    };
  });

  const baseFontSize = print?.fontSize === "sm" ? 8 : print?.fontSize === "lg" ? 10 : 9;

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: headerHeight,
    margin: { top: headerHeight, left: 10, right: 10, bottom: 14 },
    styles: { fontSize: baseFontSize, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [33, 37, 41], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles,
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: () => {
      drawReportFooter(doc, {
        signature: print && !print.showSignature ? null : (args.signature ?? null),
        print,
      });
    },
  });

  if (args.totals && args.totals.length > 0) {
    autoTable(doc, {
      body: [args.totals.map((v) => (v == null ? "" : String(v)))],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (doc as any).lastAutoTable?.finalY ?? headerHeight + 10,
      margin: { left: 10, right: 10 },
      styles: { fontSize: 10, cellPadding: 2, fontStyle: "bold" },
      bodyStyles: { fillColor: [232, 240, 254] },
      columnStyles,
    });
  }

  return doc;
}

/** Throws EmptyExportError when there is nothing to render. */
export function assertReportNotEmpty<T>(rows: T[]): T[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new EmptyExportError();
  return rows;
}

/** Convenience wrapper that pins `ext: "pdf"`. */
export function pdfFilename(slug: string, opts: Omit<ReportFilenameOptions, "ext"> = {}): string {
  return reportFilename(slug, { ...opts, ext: "pdf" });
}
