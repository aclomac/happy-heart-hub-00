import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture every downloadBlob call so we can assert on filename + CSV contents.
const downloadCalls: { filename: string; blob: Blob }[] = [];

vi.mock("@/lib/export/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/export/csv")>("@/lib/export/csv");
  return {
    ...actual,
    downloadBlob: (blob: Blob, filename: string) => {
      downloadCalls.push({ filename, blob });
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { exportCSV } from "@/lib/export-csv";
import { downloadCSV } from "@/lib/csv";
import { scopeActive, scopeCompany } from "@/lib/export/exportGuards";
import { toast } from "sonner";

async function lastCsv(): Promise<string> {
  const call = downloadCalls[downloadCalls.length - 1];
  expect(call, "expected a download to have been triggered").toBeDefined();
  const buf = new Uint8Array(await call.blob.arrayBuffer());
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
}

beforeEach(() => {
  downloadCalls.length = 0;
  (toast.success as ReturnType<typeof vi.fn>).mockClear();
  (toast.warning as ReturnType<typeof vi.fn>).mockClear();
  (toast.error as ReturnType<typeof vi.fn>).mockClear();
});

describe("exportCSV rich pipeline", () => {
  it("derives a report filename and emits header lines + UTF-8 BOM", async () => {
    exportCSV("sale-report", [{ Invoice: "INV-1", Total: 100 }], {
      title: "Sale Report",
      slug: "sale-report",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(downloadCalls).toHaveLength(1);
    expect(downloadCalls[0].filename).toBe("erpovo-sale-report-2026-06-01_2026-06-30.csv");
    const text = await lastCsv();
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("Sale Report");
    expect(text).toContain("Period: 2026-06-01 → 2026-06-30");
    expect(text).toContain("Generated:");
    expect(text).toContain("Invoice,Total");
    expect(text).toContain("INV-1,100");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("warns and skips the download when there are no rows", () => {
    exportCSV("sale-report", [], { title: "Sale Report" });
    expect(downloadCalls).toHaveLength(0);
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("retains legacy filename when no options are supplied", () => {
    exportCSV("sale-report", [{ A: 1 }]);
    expect(downloadCalls[0].filename).toMatch(/^sale-report-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe("downloadCSV rich pipeline", () => {
  it("escapes Bangla and formula-injection inputs safely", async () => {
    downloadCSV(
      "x.csv",
      [
        { name: "বাংলা টেক্সট", note: "=SUM(A1)" },
        { name: 'with "quote"', note: "has, comma" },
      ],
      { title: "Demo" },
    );
    const text = await lastCsv();
    expect(text).toContain("বাংলা টেক্সট");
    expect(text).toContain("'=SUM(A1)");
    expect(text).toContain('"with ""quote"""');
    expect(text).toContain('"has, comma"');
  });

  it("uses CRLF line endings", async () => {
    downloadCSV("x.csv", [{ a: 1 }, { a: 2 }], { title: "T" });
    const text = await lastCsv();
    expect(text).toContain("\r\n");
  });
});

describe("scope helpers used at the export boundary", () => {
  it("scopeActive drops soft-deleted rows", () => {
    const rows = [
      { id: 1, deleted_at: null },
      { id: 2, deleted_at: "2026-01-01" },
    ];
    expect(scopeActive(rows).map((r) => r.id)).toEqual([1]);
  });

  it("scopeCompany filters by company_id", () => {
    const rows = [
      { id: 1, company_id: "a" },
      { id: 2, company_id: "b" },
    ];
    expect(scopeCompany(rows, "a")).toEqual([{ id: 1, company_id: "a" }]);
  });

  it("composes for an export pipeline", async () => {
    const rows = [
      { id: 1, company_id: "a", deleted_at: null, name: "ok" },
      { id: 2, company_id: "a", deleted_at: "x", name: "soft-deleted" },
      { id: 3, company_id: "b", deleted_at: null, name: "other co" },
    ];
    const safe = scopeActive(scopeCompany(rows, "a"));
    expect(safe).toEqual([{ id: 1, company_id: "a", deleted_at: null, name: "ok" }]);
    exportCSV("items", safe, { title: "Items" });
    const text = await lastCsv();
    expect(text).toContain("ok");
    expect(text).not.toContain("soft-deleted");
    expect(text).not.toContain("other co");
  });
});
