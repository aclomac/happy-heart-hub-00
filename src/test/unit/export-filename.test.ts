import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportFilename } from "@/lib/export/filename";

describe("reportFilename", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T10:30:45Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds slug + date range filename", () => {
    expect(
      reportFilename("Sales Report", { from: "2026-06-01", to: "2026-06-30", ext: "csv" }),
    ).toBe("erpovo-sales-report-2026-06-01_2026-06-30.csv");
  });

  it("falls back to a timestamp when no date range is provided", () => {
    expect(reportFilename("Audit", { ext: "pdf" })).toBe("erpovo-audit-20260602103045.pdf");
  });

  it("kebab-cases and strips unsafe characters", () => {
    expect(
      reportFilename("Profit & Loss / 2026", { ext: "csv", from: "2026-01-01", to: "2026-12-31" }),
    ).toBe("erpovo-profit-loss-2026-2026-01-01_2026-12-31.csv");
  });

  it("respects custom prefix and extension", () => {
    expect(
      reportFilename("Stock Movement", {
        prefix: "Acme Co",
        ext: "xlsx",
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).toBe("acme-co-stock-movement-2026-01-01_2026-01-31.xlsx");
  });
});
