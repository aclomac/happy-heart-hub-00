import { describe, it, expect } from "vitest";
import { reportHeaderLines, summarizeFilters } from "@/lib/export/filterSummary";
import {
  assertNotEmpty,
  EmptyExportError,
  scopeActive,
  scopeCompany,
} from "@/lib/export/exportGuards";
import { reportFilename } from "@/lib/export/filename";
import { escapeCsvField, toCsv } from "@/lib/export/csv";

describe("Phase 9 — Report header lines (PDF subtitle / CSV head)", () => {
  it("includes title, company name, period and filter summary", () => {
    const lines = reportHeaderLines({
      title: "Sales Report",
      companyName: "এরপোভো লিমিটেড",
      filters: {
        from: "2026-01-01",
        to: "2026-01-31",
        warehouse: "Main Store",
        party: "Acme",
      },
      generatedAt: new Date("2026-06-01T10:00:00Z"),
    });
    expect(lines[0]).toBe("Sales Report");
    expect(lines[1]).toBe("এরপোভো লিমিটেড");
    expect(lines.some((l) => /Period:/.test(l))).toBe(true);
    expect(lines.some((l) => l === "Warehouse: Main Store")).toBe(true);
    expect(lines.some((l) => l === "Party: Acme")).toBe(true);
    expect(lines.some((l) => /^Generated:/.test(l))).toBe(true);
  });

  it("summarizes extra filter keys but skips empty values", () => {
    const lines = summarizeFilters({ extra: { Method: "Cash", Note: "" } });
    expect(lines).toContain("Method: Cash");
    expect(lines.some((l) => l.startsWith("Note:"))).toBe(false);
  });
});

describe("Phase 9 — Export guards (empty / soft-delete / company scope)", () => {
  it("assertNotEmpty throws EmptyExportError on empty rows", () => {
    expect(() => assertNotEmpty([])).toThrow(EmptyExportError);
  });

  it("scopeActive strips soft-deleted rows", () => {
    const rows = [
      { id: "a", deleted_at: null },
      { id: "b", deleted_at: "2026-01-01" },
      { id: "c" },
    ];
    expect(scopeActive(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("scopeCompany strips foreign-company rows", () => {
    const rows = [
      { id: "a", company_id: "co-1" },
      { id: "b", company_id: "co-2" },
      { id: "c", company_id: null },
    ];
    expect(scopeCompany(rows, "co-1").map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("Phase 9 — Report filename safety", () => {
  it("strips unsafe characters and normalizes Bangla", () => {
    const name = reportFilename("বিক্রয় Report / Daily", {
      from: "2026-01-01",
      to: "2026-01-31",
      ext: "pdf",
    });
    expect(name.endsWith(".pdf")).toBe(true);
    expect(/[/\\?*:|"<>]/.test(name)).toBe(false);
    expect(name).toContain("2026-01-01_2026-01-31");
  });

  it("falls back to 'report' slug and timestamp when slug is unprintable", () => {
    const name = reportFilename("///", { ext: "csv" });
    expect(name).toMatch(/erpovo-report-\d{14}\.csv/);
  });
});

describe("Phase 9 — CSV injection & multi-line preservation", () => {
  it("guards all dangerous leading characters", () => {
    for (const bad of ["=cmd", "+1+1", "-2", "@SUM(1)", "\tTAB"]) {
      expect(escapeCsvField(bad).startsWith("'")).toBe(true);
    }
    // \r also triggers the guard but gets RFC-quoted; ensure the raw
    // leading char is no longer at position 0 of the unquoted payload.
    const cr = escapeCsvField("\rCR");
    expect(cr.startsWith('"')).toBe(true);
    expect(cr).toContain("'\rCR");
  });

  it("preserves embedded newlines via quoting", () => {
    const csv = toCsv(
      [{ note: "line1\nline2", n: 1 }],
      [
        { key: "note", label: "Note" },
        { key: "n", label: "N" },
      ],
    );
    // Field with newline must be wrapped in quotes
    expect(csv).toMatch(/"line1\nline2"/);
    // Row separator remains CRLF
    expect(csv.includes("\r\n")).toBe(true);
  });

  it("emits header lines above the column header row", () => {
    const csv = toCsv([{ a: 1 }], [{ key: "a", label: "A" }], ["Sales Report", "Acme Co"]);
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe("Sales Report");
    expect(rows[1]).toBe("Acme Co");
    expect(rows[2]).toBe(""); // blank separator
    expect(rows[3]).toBe("A");
  });
});
