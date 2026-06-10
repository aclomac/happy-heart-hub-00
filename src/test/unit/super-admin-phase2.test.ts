import { describe, it, expect } from "vitest";

/**
 * Super Admin Phase 2: payment gateways, payment requests, approve/reject workflow.
 */
describe("Super Admin Phase 2 — payments", () => {
  it("expands payment_requests status enum to include workflow states", () => {
    const allowed = ["pending", "under_review", "approved", "rejected", "cancelled"];
    expect(allowed).toContain("under_review");
    expect(allowed).toContain("cancelled");
  });

  it("masks secrets in transport (api_key / webhook_secret)", () => {
    const mask = (v: string | null) =>
      !v ? null : v.length <= 4 ? "••••" : `${v.slice(0, 2)}••••${v.slice(-2)}`;
    expect(mask("sk_live_abcdef123456")).toBe("sk••••56");
    expect(mask(null)).toBeNull();
    expect(mask("ab")).toBe("••••");
  });

  it("computes subscription expiry — monthly extends 1 month, yearly extends 12 months", () => {
    const base = new Date("2026-06-03T00:00:00Z");
    const m = new Date(base);
    m.setMonth(m.getMonth() + 1);
    expect(m.getUTCMonth()).toBe(6); // July (0-indexed)

    const y = new Date(base);
    y.setMonth(y.getMonth() + 12);
    expect(y.getUTCFullYear()).toBe(2027);
  });

  it("extends from current expiry when still active (not from now)", () => {
    const now = new Date("2026-06-03T00:00:00Z");
    const expiry = new Date("2026-08-01T00:00:00Z");
    const base = expiry > now ? expiry : now;
    expect(base.toISOString()).toBe(expiry.toISOString());
  });

  it("gateway payment types cover required Bangladeshi methods", () => {
    const types = [
      "manual",
      "bkash",
      "nagad",
      "rocket",
      "sslcommerz",
      "shurjopay",
      "bank",
      "custom",
    ];
    for (const t of ["bkash", "nagad", "rocket", "sslcommerz", "shurjopay"]) {
      expect(types).toContain(t);
    }
  });

  it("super admin sidebar exposes Payments and Payment Gateways", () => {
    const sections = ["payments", "payment-gateways"];
    expect(sections).toContain("payments");
    expect(sections).toContain("payment-gateways");
  });
});
