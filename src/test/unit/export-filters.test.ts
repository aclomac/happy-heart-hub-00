import { describe, it, expect } from "vitest";
import {
  scopeActive,
  scopeCompany,
  assertNotEmpty,
  EmptyExportError,
} from "@/lib/export/exportGuards";
import { summarizeFilters, reportHeaderLines } from "@/lib/export/filterSummary";

describe("scopeActive", () => {
  it("removes soft-deleted rows", () => {
    const rows = [{ id: 1, deleted_at: null }, { id: 2, deleted_at: "2026-01-01" }, { id: 3 }];
    expect(scopeActive(rows).map((r) => r.id)).toEqual([1, 3]);
  });
});

describe("scopeCompany", () => {
  it("filters to matching company_id", () => {
    const rows = [
      { id: 1, company_id: "a" },
      { id: 2, company_id: "b" },
      { id: 3, company_id: "a" },
    ];
    expect(scopeCompany(rows, "a").map((r) => r.id)).toEqual([1, 3]);
  });
  it("is a no-op when companyId is null", () => {
    const rows = [{ id: 1, company_id: "a" }];
    expect(scopeCompany(rows, null)).toEqual(rows);
  });
});

describe("assertNotEmpty", () => {
  it("throws EmptyExportError on empty array", () => {
    expect(() => assertNotEmpty([])).toThrow(EmptyExportError);
  });
  it("returns the input on non-empty array", () => {
    expect(assertNotEmpty([1, 2])).toEqual([1, 2]);
  });
});

describe("summarizeFilters", () => {
  it("formats period range", () => {
    expect(summarizeFilters({ from: "2026-01-01", to: "2026-01-31" })).toEqual([
      "Period: 2026-01-01 → 2026-01-31",
    ]);
  });

  it("emits each active filter on its own line", () => {
    expect(
      summarizeFilters({
        warehouse: "Main",
        category: "Beverages",
        party: "Acme",
        type: "Sale",
        status: "Posted",
        search: "abc",
      }),
    ).toEqual([
      "Warehouse: Main",
      "Category: Beverages",
      "Party: Acme",
      "Type: Sale",
      "Status: Posted",
      "Search: abc",
    ]);
  });

  it("skips empty/undefined fields", () => {
    expect(summarizeFilters({ warehouse: "", category: undefined, party: null })).toEqual([]);
  });
});

describe("reportHeaderLines", () => {
  it("includes title, company, filters and generated timestamp", () => {
    const lines = reportHeaderLines({
      title: "Stock Summary",
      companyName: "ERPOVO Ltd",
      filters: { from: "2026-01-01", to: "2026-01-31", warehouse: "Main" },
      generatedAt: new Date("2026-02-01T09:00:00Z"),
    });
    expect(lines[0]).toBe("Stock Summary");
    expect(lines[1]).toBe("ERPOVO Ltd");
    expect(lines[2]).toBe("Period: 2026-01-01 → 2026-01-31");
    expect(lines[3]).toBe("Warehouse: Main");
    expect(lines[4]).toBe("Generated: 2026-02-01 09:00:00");
  });
});
