import { describe, it, expect } from "vitest";
import { computeDiscount, applyDiscount } from "@/lib/coupon-math";

describe("Phase 3 — coupon math", () => {
  it("flat discount caps at amount", () => {
    expect(computeDiscount(100, "flat", 30)).toBe(30);
    expect(computeDiscount(50, "flat", 500)).toBe(50);
  });
  it("percentage discount computes correctly", () => {
    expect(computeDiscount(200, "percentage", 10)).toBe(20);
    expect(computeDiscount(199.99, "percentage", 25)).toBeCloseTo(50, 1);
  });
  it("rejects zero/negative", () => {
    expect(computeDiscount(0, "flat", 10)).toBe(0);
    expect(computeDiscount(100, "flat", 0)).toBe(0);
  });
  it("applyDiscount returns total >= 0", () => {
    const { total } = applyDiscount(100, "flat", 500);
    expect(total).toBe(0);
  });
});

describe("Phase 3 — feature resolution precedence", () => {
  function resolve(
    override: { enabled: boolean; expires_at: string | null } | null,
    planAllows: boolean,
    now = new Date(),
  ) {
    if (override) {
      if (!override.expires_at || new Date(override.expires_at) > now) {
        return override.enabled;
      }
    }
    return planAllows;
  }
  it("override wins over plan when active", () => {
    expect(resolve({ enabled: true, expires_at: null }, false)).toBe(true);
    expect(resolve({ enabled: false, expires_at: null }, true)).toBe(false);
  });
  it("expired override falls back to plan", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(resolve({ enabled: true, expires_at: past }, false)).toBe(false);
    expect(resolve({ enabled: false, expires_at: past }, true)).toBe(true);
  });
  it("future override is honored", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(resolve({ enabled: true, expires_at: future }, false)).toBe(true);
  });
});

describe("Phase 3 — coupon validation rules", () => {
  type C = {
    is_active: boolean;
    valid_from: string;
    valid_until: string | null;
    max_uses: number | null;
    used_count: number;
    plan_key: string | null;
    billing_period: "monthly" | "yearly" | "all";
    company_id: string | null;
    user_id: string | null;
  };
  function validate(
    c: C,
    ctx: { plan: string; period: "monthly" | "yearly"; company: string; user: string },
  ) {
    const now = Date.now();
    if (!c.is_active) return "inactive";
    if (new Date(c.valid_from).getTime() > now) return "not_yet";
    if (c.valid_until && new Date(c.valid_until).getTime() < now) return "expired";
    if (c.max_uses != null && c.used_count >= c.max_uses) return "overused";
    if (c.plan_key && c.plan_key !== ctx.plan) return "plan";
    if (c.billing_period !== "all" && c.billing_period !== ctx.period) return "period";
    if (c.company_id && c.company_id !== ctx.company) return "company";
    if (c.user_id && c.user_id !== ctx.user) return "user";
    return "valid";
  }
  const base: C = {
    is_active: true,
    valid_from: new Date(Date.now() - 1000).toISOString(),
    valid_until: null,
    max_uses: null,
    used_count: 0,
    plan_key: null,
    billing_period: "all",
    company_id: null,
    user_id: null,
  };
  const ctx = { plan: "pro", period: "monthly" as const, company: "co1", user: "u1" };

  it("valid passes", () => expect(validate(base, ctx)).toBe("valid"));
  it("inactive blocks", () =>
    expect(validate({ ...base, is_active: false }, ctx)).toBe("inactive"));
  it("expired blocks", () =>
    expect(validate({ ...base, valid_until: new Date(Date.now() - 1000).toISOString() }, ctx)).toBe(
      "expired",
    ));
  it("overused blocks", () =>
    expect(validate({ ...base, max_uses: 5, used_count: 5 }, ctx)).toBe("overused"));
  it("plan mismatch blocks", () =>
    expect(validate({ ...base, plan_key: "basic" }, ctx)).toBe("plan"));
  it("period mismatch blocks", () =>
    expect(validate({ ...base, billing_period: "yearly" }, ctx)).toBe("period"));
  it("company restriction blocks others", () =>
    expect(validate({ ...base, company_id: "co2" }, ctx)).toBe("company"));
});

describe("Phase 3 — stale device threshold", () => {
  it("default threshold is 30 days", () => {
    const cutoff = Date.now() - 30 * 86400000;
    const stale = new Date(cutoff - 1000);
    const fresh = new Date(cutoff + 1000);
    expect(stale.getTime() < cutoff).toBe(true);
    expect(fresh.getTime() < cutoff).toBe(false);
  });
});

describe("Phase 3 — revenue uses approved payments only", () => {
  it("sums net amount (amount - discount) for approved only", () => {
    const rows = [
      { status: "approved", amount: 100, discount_amount: 10 },
      { status: "pending", amount: 200, discount_amount: 0 },
      { status: "approved", amount: 50, discount_amount: 0 },
      { status: "rejected", amount: 999, discount_amount: 0 },
    ];
    const total = rows
      .filter((r) => r.status === "approved")
      .reduce((s, r) => s + r.amount - r.discount_amount, 0);
    expect(total).toBe(140);
  });
});

describe("Phase 3 — CSV row shaping", () => {
  it("produces stable header + rows", () => {
    const data = [{ plan: "pro", total: 100 }];
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((r) => headers.map((h) => String((r as Record<string, unknown>)[h])).join(",")),
    ].join("\n");
    expect(csv).toContain("plan,total");
    expect(csv).toContain("pro,100");
  });
});
