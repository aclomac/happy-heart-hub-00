// RFC 4180-compliant CSV builder with UTF-8 BOM and formula-injection guard.
// Used by every ERPOVO report export to guarantee Excel/Bangla compatibility.

export type CsvColumn<T> = {
  key: keyof T | string;
  label: string;
  // Optional formatter. Receives the raw value and the full row.
  format?: (value: unknown, row: T) => string | number | null | undefined;
};

export type CsvHeaderLine = string;

/** Escapes a single CSV field according to RFC 4180 + spreadsheet safety. */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "string" ? value : String(value);

  // Formula injection guard — prefix risky leading chars with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }

  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV string from rows + column definitions.
 * Optional `headerLines` are emitted as plain rows above the column header (useful for
 * report title / company / period / filters).
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
  headerLines: CsvHeaderLine[] = [],
): string {
  const out: string[] = [];

  for (const line of headerLines) {
    out.push(escapeCsvField(line));
  }
  if (headerLines.length > 0) out.push(""); // blank separator row

  out.push(columns.map((c) => escapeCsvField(c.label)).join(","));

  for (const row of rows) {
    const cells = columns.map((c) => {
      const raw = (row as Record<string, unknown>)[c.key as string];
      const value = c.format ? c.format(raw, row) : raw;
      return escapeCsvField(value);
    });
    out.push(cells.join(","));
  }

  // CRLF line ending — Excel-friendly.
  return out.join("\r\n");
}

/** Always returns a Blob that starts with the UTF-8 BOM (\uFEFF) so Bangla
 *  and other non-ASCII text renders correctly in Microsoft Excel. */
export function csvBlob(csv: string): Blob {
  const BOM = "\uFEFF";
  return new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
}

/** Trigger a download in the browser. No-op in SSR. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** Convenience: build CSV → wrap in BOM blob → download. */
export function downloadCsvFile<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
  headerLines: CsvHeaderLine[] = [],
): void {
  const csv = toCsv(rows, columns, headerLines);
  downloadBlob(csvBlob(csv), filename);
}
