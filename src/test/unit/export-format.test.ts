import { describe, it, expect } from "vitest";
import { fmtDate, fmtDateTime, fmtAmount, fmtQty, fmtPct } from "@/lib/export/format";

describe("format helpers", () => {
  it("formats dates as YYYY-MM-DD", () => {
    expect(fmtDate("2026-06-02T15:00:00Z")).toBe("2026-06-02");
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("not-a-date")).toBe("");
  });

  it("formats datetimes as YYYY-MM-DD HH:MM:SS", () => {
    expect(fmtDateTime("2026-06-02T15:30:45Z")).toBe("2026-06-02 15:30:45");
  });

  it("formats amounts with 2 decimal places", () => {
    expect(fmtAmount(1500)).toMatch(/1,?500\.00/);
    expect(fmtAmount("not-a-number")).toBe("0.00");
    expect(fmtAmount(null)).toBe("0.00");
  });

  it("formats quantities trimming trailing zeros", () => {
    expect(fmtQty(10)).toBe("10");
    expect(fmtQty(10.5)).toBe("10.5");
    expect(fmtQty(10.123)).toBe("10.123");
    expect(fmtQty(null)).toBe("0");
  });

  it("formats percentages", () => {
    expect(fmtPct(12.5)).toBe("12.50%");
    expect(fmtPct(null)).toBe("0.00%");
  });
});
