// Lightweight CSV import/export helpers.
// Export path delegates to the hardened shared helpers in src/lib/export.
// `downloadCSV` accepts an optional rich-options 3rd argument identical to
// the one consumed by `exportCSV` (title, company, filters, period, toasts).

import { toast } from "sonner";
import { csvBlob, downloadBlob, escapeCsvField, toCsv } from "./export/csv";
import { reportFilename } from "./export/filename";
import { reportHeaderLines } from "./export/filterSummary";
import type { RichExportOptions } from "./export-csv";

export function downloadCSV(
  filename: string,
  rows: Record<string, unknown>[],
  options?: RichExportOptions,
) {
  try {
    if (!rows || rows.length === 0) {
      if (options?.emptyMessage !== null) {
        toast.warning(options?.emptyMessage ?? "No data to export for the selected filters.");
      }
      // Keep legacy behaviour: empty file when no options are supplied so older
      // callers that downloaded a "headers only" placeholder still work.
      if (!options) {
        downloadBlob(csvBlob(""), filename);
      }
      return;
    }

    const useRich = !!(options?.title || options?.filters || options?.from || options?.to);

    const fname = options
      ? options.slug || options.from || options.to
        ? reportFilename(options.slug ?? filename.replace(/\.csv$/i, ""), {
            from: options.from ?? null,
            to: options.to ?? null,
            ext: "csv",
          })
        : filename
      : filename;

    const headers = Object.keys(rows[0]);
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
      const columns = options?.columns ?? headers.map((k) => ({ key: k, label: k }));
      csv = toCsv(rows, columns, headerLines);
    } else {
      csv = [
        headers.map((h) => escapeCsvField(h)).join(","),
        ...rows.map((r) => headers.map((h) => escapeCsvField(r[h])).join(",")),
      ].join("\r\n");
    }

    downloadBlob(csvBlob(csv), fname);

    if (options && options.successMessage !== null) {
      toast.success(options.successMessage ?? "Export complete");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Export failed";
    if (options?.errorMessage !== null) {
      toast.error(options?.errorMessage ?? msg);
    }
  }
}

export { parseCSV, readFileAsText } from "./csv-parse";
