// Backwards-compatible thin wrapper — delegates to the hardened shared helpers.
// Accepts an optional `RichExportOptions` to opt into the full report pipeline
// (title, company name, filter summary, formatted filename, toasts, empty guard).

import { toast } from "sonner";
import { csvBlob, downloadBlob, escapeCsvField, toCsv, type CsvColumn } from "./export/csv";
import { reportFilename } from "./export/filename";
import { reportHeaderLines, type ReportFilterSummaryInput } from "./export/filterSummary";
import { logExportAudit } from "./export/exportAudit";

export type RichExportOptions = {
  /** Human-readable report title, e.g. "Sales Report". Enables header lines. */
  title?: string;
  /** Company name printed under the title. */
  companyName?: string | null;
  /** Filter summary printed in the CSV header section. */
  filters?: ReportFilterSummaryInput;
  /** Slug used for `reportFilename` — defaults to the `filename` argument. */
  slug?: string;
  /** Date range used by `reportFilename` and `summarizeFilters`. */
  from?: string | Date | null;
  to?: string | Date | null;
  /** Optional explicit columns. When omitted, columns are derived from the
   *  keys of the first row (preserves legacy behaviour). */
  columns?: CsvColumn<Record<string, unknown>>[];
  /** Toast messages (set to `null` to suppress). */
  successMessage?: string | null;
  errorMessage?: string | null;
  emptyMessage?: string | null;
  /** Audit logging — when companyId is provided, an `export_csv` audit row
   *  is written for each success / blocked_empty / failed outcome. */
  auditCompanyId?: string | null;
  auditModule?: string;
};

function deriveColumns(rows: Record<string, unknown>[]): CsvColumn<Record<string, unknown>>[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
}

function legacyCsv(rows: Record<string, unknown>[]): string {
  const headers = Object.keys(rows[0]);
  return [
    headers.map((h) => escapeCsvField(h)).join(","),
    ...rows.map((r) => headers.map((h) => escapeCsvField(r[h])).join(",")),
  ].join("\r\n");
}

export function exportCSV(
  filename: string,
  rows: Record<string, unknown>[],
  options?: RichExportOptions,
): void {
  const slug = options?.slug ?? filename;
  const auditCompanyId = options?.auditCompanyId ?? null;
  const auditFilters = (options?.filters as Record<string, unknown> | undefined) ?? null;
  try {
    if (!rows || rows.length === 0) {
      if (options?.emptyMessage !== null) {
        toast.warning(options?.emptyMessage ?? "No data to export for the selected filters.");
      }
      if (auditCompanyId) {
        void logExportAudit({
          companyId: auditCompanyId,
          reportSlug: slug,
          action: "export_csv",
          status: "blocked_empty",
          rowCount: 0,
          module: options?.auditModule,
          filters: auditFilters,
        });
      }
      return;
    }

    const useRich = !!(options?.title || options?.filters || options?.from || options?.to);

    const fname = options
      ? reportFilename(slug, {
          from: options.from ?? null,
          to: options.to ?? null,
          ext: "csv",
        })
      : `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;

    let csv: string;
    if (useRich) {
      const headerLines = options?.title
        ? reportHeaderLines({
            title: options.title,
            companyName: options.companyName ?? null,
            filters: {
              ...(options.filters ?? {}),
              from: options.filters?.from ?? options.from ?? null,
              to: options.filters?.to ?? options.to ?? null,
            },
          })
        : [];
      const columns = options?.columns ?? deriveColumns(rows);
      csv = toCsv(rows, columns, headerLines);
    } else {
      csv = legacyCsv(rows);
    }

    downloadBlob(csvBlob(csv), fname);

    if (options?.successMessage !== null) {
      toast.success(options?.successMessage ?? "Export complete");
    }
    if (auditCompanyId) {
      void logExportAudit({
        companyId: auditCompanyId,
        reportSlug: slug,
        action: "export_csv",
        status: "success",
        rowCount: rows.length,
        fileName: fname,
        module: options?.auditModule,
        filters: auditFilters,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    if (options?.errorMessage !== null) {
      toast.error(options?.errorMessage ?? msg);
    }
    if (auditCompanyId) {
      void logExportAudit({
        companyId: auditCompanyId,
        reportSlug: slug,
        action: "export_csv",
        status: "failed",
        rowCount: rows?.length ?? 0,
        module: options?.auditModule,
        filters: auditFilters,
        error: msg,
      });
    }
  }
}
