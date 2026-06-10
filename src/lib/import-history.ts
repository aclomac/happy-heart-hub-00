// Lightweight client-side import history (per company, localStorage).
// Stores only sanitized metadata — no PII, no row content.

import type { ImportReport, ImportReportRow } from "@/lib/vyapar-import";

export type ImportHistoryStatus = "previewed" | "imported" | "failed" | "cancelled";

export type ImportHistoryEntry = {
  batchId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  at: string;
  status: ImportHistoryStatus;
  source: "vyapar" | "erpovo";
  reports: { module: string; inserted: number; skipped: number; errorCount: number }[];
  totals: { inserted: number; skipped: number; errors: number };
  message?: string;
};

const KEY = (companyId: string) => `erpovo.import.history.${companyId}`;
const MAX = 25;

const memStore = new Map<string, string>();

function getStore(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const g = globalThis as unknown as { localStorage?: Storage };
  if (g.localStorage) return g.localStorage;
  return {
    getItem: (k) => memStore.get(k) ?? null,
    setItem: (k, v) => {
      memStore.set(k, v);
    },
  };
}

export function loadHistory(companyId: string): ImportHistoryEntry[] {
  try {
    const raw = getStore().getItem(KEY(companyId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ImportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(companyId: string, entry: ImportHistoryEntry): ImportHistoryEntry[] {
  const cur = loadHistory(companyId);
  const next = [entry, ...cur].slice(0, MAX);
  try {
    getStore().setItem(KEY(companyId), JSON.stringify(next));
  } catch {
    // quota — drop silently
  }
  return next;
}

export function newBatchId(): string {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function summarize(reports: ImportReport[]): ImportHistoryEntry["totals"] {
  return reports.reduce(
    (acc, r) => ({
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
      errors: acc.errors + r.errors.length,
    }),
    { inserted: 0, skipped: 0, errors: 0 },
  );
}

export function toReportFile(entry: ImportHistoryEntry, fullReports: ImportReport[]): Blob {
  const body = {
    batchId: entry.batchId,
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    fileType: entry.fileType,
    at: entry.at,
    status: entry.status,
    source: entry.source,
    totals: entry.totals,
    modules: fullReports.map((r) => ({
      module: r.module,
      inserted: r.inserted,
      skipped: r.skipped,
      errors: r.errors,
      cancelled: !!r.cancelled,
      rows: r.rows ?? [],
    })),
  };
  return new Blob([JSON.stringify(body, null, 2)], { type: "application/json" });
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function toReportCsv(entry: ImportHistoryEntry, fullReports: ImportReport[]): Blob {
  const lines: string[] = [];
  lines.push(["batch_id", "module", "row_ref", "action", "reason"].join(","));
  for (const r of fullReports) {
    const rows: ImportReportRow[] = r.rows ?? [
      // legacy fallback: synthesize from counts
      ...Array.from({ length: r.inserted }, () => ({
        module: r.module,
        ref: null,
        action: "inserted" as const,
      })),
    ];
    for (const row of rows) {
      lines.push(
        [
          csvCell(entry.batchId),
          csvCell(row.module),
          csvCell(row.ref ?? ""),
          csvCell(row.action),
          csvCell(row.reason ?? ""),
        ].join(","),
      );
    }
  }
  return new Blob([lines.join("\n")], { type: "text/csv" });
}

export type HistoryFilter = {
  status?: ImportHistoryStatus | "all";
  fileType?: string | "all";
  from?: string; // ISO
  to?: string; // ISO
  search?: string;
};

export function filterHistory(
  entries: ImportHistoryEntry[],
  f: HistoryFilter,
): ImportHistoryEntry[] {
  return entries.filter((e) => {
    if (f.status && f.status !== "all" && e.status !== f.status) return false;
    if (
      f.fileType &&
      f.fileType !== "all" &&
      (e.fileType || "").toLowerCase() !== f.fileType.toLowerCase()
    )
      return false;
    if (f.from && new Date(e.at) < new Date(f.from)) return false;
    if (f.to && new Date(e.at) > new Date(f.to)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      if (!e.batchId.toLowerCase().includes(q) && !(e.fileName || "").toLowerCase().includes(q))
        return false;
    }
    return true;
  });
}

export function inferFileType(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
