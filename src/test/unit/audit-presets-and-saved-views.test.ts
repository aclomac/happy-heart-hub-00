import { describe, it, expect } from "vitest";
import { DATE_PRESETS, detectPreset, rangeForPreset } from "@/lib/audit-date-presets";
import { sanitizeFilters } from "@/lib/audit-saved-views";

const today = new Date("2026-06-04T12:00:00Z");

describe("audit date presets", () => {
  it("today returns same day", () => {
    const r = rangeForPreset("today", today);
    expect(r).toEqual({ from: "2026-06-04", to: "2026-06-04" });
  });
  it("yesterday returns prev day", () => {
    const r = rangeForPreset("yesterday", today);
    expect(r).toEqual({ from: "2026-06-03", to: "2026-06-03" });
  });
  it("last7 spans 7 days inclusive", () => {
    const r = rangeForPreset("last7", today)!;
    expect(r.to).toBe("2026-06-04");
    expect(r.from).toBe("2026-05-29");
  });
  it("last30 spans 30 days inclusive", () => {
    const r = rangeForPreset("last30", today)!;
    expect(r.from).toBe("2026-05-06");
    expect(r.to).toBe("2026-06-04");
  });
  it("this_month starts at month start", () => {
    expect(rangeForPreset("this_month", today)).toEqual({
      from: "2026-06-01",
      to: "2026-06-04",
    });
  });
  it("last_month spans full previous month", () => {
    expect(rangeForPreset("last_month", today)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
  });
  it("custom returns null", () => {
    expect(rangeForPreset("custom", today)).toBeNull();
  });
  it("detectPreset round-trips for every non-custom preset", () => {
    for (const p of DATE_PRESETS) {
      if (p.key === "custom") continue;
      const r = rangeForPreset(p.key, today)!;
      expect(detectPreset(r, today)).toBe(p.key);
    }
  });
  it("detectPreset returns custom for arbitrary range", () => {
    expect(detectPreset({ from: "2026-01-01", to: "2026-02-15" }, today)).toBe("custom");
  });
});

describe("audit saved view filter sanitization (tenant isolation)", () => {
  it("strips companyId from app-scope filters", () => {
    const cleaned = sanitizeFilters("app", {
      module: "Sales",
      companyId: "other-tenant",
      company_id: "another-tenant",
    });
    expect(cleaned).toEqual({ module: "Sales" });
    expect("companyId" in cleaned).toBe(false);
    expect("company_id" in cleaned).toBe(false);
  });
  it("keeps companyId on platform-scope filters (super admin)", () => {
    const cleaned = sanitizeFilters("platform", {
      scope: "app",
      companyId: "abc",
      action: "approved",
    });
    expect(cleaned.companyId).toBe("abc");
    expect(cleaned.action).toBe("approved");
  });
});
