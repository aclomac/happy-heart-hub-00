// Thin glue around buildReportPdf + printReportHtml that gives every report
// PDF + Print buttons consistent scoping, empty-state UX, filename, toasts
// and disabled-while-busy behavior.
//
// Two layers:
//   1. Pure runners (`runReportPdf`, `runReportPrint`) — testable, no React.
//   2. `useReportExport` — React hook that wires the pure runners into the
//      existing `useExport` / `usePrint` toast pipelines.

import { useCallback } from "react";
import { useExport } from "./useExport";
import { usePrint } from "./usePrint";
import {
  buildReportPdf,
  pdfFilename,
  assertReportNotEmpty,
  type BuildReportPdfArgs,
} from "./pdfReport";
import { printReportHtml, type PrintReportArgs } from "./printReport";
import { scopeActive, scopeCompany, EmptyExportError } from "./exportGuards";
import { logExportAudit } from "./exportAudit";
import { fetchPrintContext, hydratePrintContextAssets } from "@/lib/pdf/print-context";

export type ReportExportContext<Row> = Omit<BuildReportPdfArgs<Row>, "doc"> &
  Omit<PrintReportArgs<Row>, never> & {
    /** Used by scopeCompany() as a defensive boundary check. */
    companyId?: string | null;
    /** Override the slug used to build the PDF filename. */
    filenameSlug?: string;
  };

function buildPdfFilename<Row>(reportSlug: string, ctx: ReportExportContext<Row>): string {
  const slug = ctx.filenameSlug ?? reportSlug;
  return pdfFilename(slug, {
    from: ctx.period?.from ?? null,
    to: ctx.period?.to ?? null,
  });
}

function auditFilters<Row>(ctx: ReportExportContext<Row>): Record<string, unknown> | null {
  const f = (ctx.filters ?? null) as Record<string, unknown> | null;
  return f;
}

/** Pure: scope, assert-not-empty, build PDF, save with typed filename. */
export function runReportPdf<Row extends Record<string, unknown>>(
  reportSlug: string,
  ctx: ReportExportContext<Row>,
): void {
  const fileName = buildPdfFilename(reportSlug, ctx);
  const rawCount = (ctx.rows ?? []).length;
  try {
    const rows = assertReportNotEmpty(
      scopeActive(
        scopeCompany(
          (ctx.rows ?? []) as Array<
            Row & { deleted_at?: string | null; company_id?: string | null }
          >,
          ctx.companyId ?? null,
        ),
      ),
    );
    const doc = buildReportPdf({ ...ctx, rows });
    doc.save(fileName);
    void logExportAudit({
      companyId: ctx.companyId ?? null,
      reportSlug,
      action: "export_pdf",
      status: "success",
      rowCount: rows.length,
      fileName,
      filters: auditFilters(ctx),
    });
  } catch (e) {
    if (e instanceof EmptyExportError) {
      void logExportAudit({
        companyId: ctx.companyId ?? null,
        reportSlug,
        action: "export_pdf",
        status: "blocked_empty",
        rowCount: 0,
        fileName,
        filters: auditFilters(ctx),
      });
    } else {
      void logExportAudit({
        companyId: ctx.companyId ?? null,
        reportSlug,
        action: "export_pdf",
        status: "failed",
        rowCount: rawCount,
        fileName,
        filters: auditFilters(ctx),
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

/** Pure: scope, assert-not-empty, open print window. */
export function runReportPrint<Row extends Record<string, unknown>>(
  ctx: ReportExportContext<Row>,
  reportSlug?: string,
): void {
  const rawCount = (ctx.rows ?? []).length;
  const slug = reportSlug ?? ctx.filenameSlug ?? "report";
  try {
    const rows = assertReportNotEmpty(
      scopeActive(
        scopeCompany(
          (ctx.rows ?? []) as Array<
            Row & { deleted_at?: string | null; company_id?: string | null }
          >,
          ctx.companyId ?? null,
        ),
      ),
    );
    printReportHtml({ ...ctx, rows });
    void logExportAudit({
      companyId: ctx.companyId ?? null,
      reportSlug: slug,
      action: "print",
      status: "success",
      rowCount: rows.length,
      filters: auditFilters(ctx),
    });
  } catch (e) {
    if (e instanceof EmptyExportError) {
      void logExportAudit({
        companyId: ctx.companyId ?? null,
        reportSlug: slug,
        action: "print",
        status: "blocked_empty",
        rowCount: 0,
        filters: auditFilters(ctx),
      });
    } else {
      void logExportAudit({
        companyId: ctx.companyId ?? null,
        reportSlug: slug,
        action: "print",
        status: "failed",
        rowCount: rawCount,
        filters: auditFilters(ctx),
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
}

export type UseReportExportResult = {
  onPdf: () => void;
  onPrint: () => void;
  pdfBusy: boolean;
  printBusy: boolean;
  busy: boolean;
};

/**
 * Wire a report's PDF + Print buttons in one line:
 *
 *   const { onPdf, onPrint, busy } = useReportExport("sales-report", () => ({
 *     company, companyId, title, period, filters, columns, rows, totals,
 *   }));
 */
export function useReportExport<Row extends Record<string, unknown>>(
  reportSlug: string,
  getContext: () => ReportExportContext<Row>,
): UseReportExportResult {
  const { exporting: pdfBusy, run: runPdf } = useExport({
    emptyMessage: "No data to export for the selected filters.",
    successMessage: "PDF downloaded",
  });
  const { printing: printBusy, run: runPrint } = usePrint({
    emptyMessage: "No data to print for the selected filters.",
  });

  const onPdf = useCallback(() => {
    void runPdf(async () => {
      const ctx = await resolveCtxPrintContext(getContext());
      return runReportPdf(reportSlug, ctx);
    });
  }, [runPdf, getContext, reportSlug]);

  const onPrint = useCallback(() => {
    void runPrint(async () => {
      const ctx = await resolveCtxPrintContext(getContext());
      return runReportPrint(ctx, reportSlug);
    });
  }, [runPrint, getContext, reportSlug]);

  return { onPdf, onPrint, pdfBusy, printBusy, busy: pdfBusy || printBusy };
}

/**
 * Best-effort enrichment: if the caller didn't already attach a `printContext`
 * but provided a `companyId`, fetch the company + settings + branding assets
 * and inject them so PDFs / Print layouts pick up Company Profile + Print
 * Settings automatically.
 */
async function resolveCtxPrintContext<Row>(
  ctx: ReportExportContext<Row>,
): Promise<ReportExportContext<Row>> {
  if (ctx.printContext || !ctx.companyId) return ctx;
  try {
    const base = await fetchPrintContext(ctx.companyId);
    const hydrated = await hydratePrintContextAssets(base);
    return { ...ctx, printContext: hydrated };
  } catch {
    return ctx;
  }
}
