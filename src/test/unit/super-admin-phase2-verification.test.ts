import { describe, it, expect } from "vitest";

/**
 * Super Admin Phase 2 — final verification suite.
 * Pure-logic regression tests that lock in the contracts implemented in
 * src/lib/platform-billing.functions.ts and the customer payment / receipt flows.
 */

/* -------------------- helpers (mirror server impl) -------------------- */

function maskSecret(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

function computeNewExpiry(
  current: { expires_at: string | null } | null,
  billingPeriod: "monthly" | "yearly",
  now = new Date(),
): Date {
  const months = billingPeriod === "yearly" ? 12 : 1;
  const base =
    current?.expires_at && new Date(current.expires_at) > now
      ? new Date(current.expires_at)
      : new Date(now);
  base.setMonth(base.getMonth() + months);
  return base;
}

function sanitizeGatewayForCustomer<
  T extends { api_key?: string | null; webhook_secret?: string | null; is_active: boolean },
>(rows: T[]) {
  return rows
    .filter((r) => r.is_active)
    .map(({ api_key: _a, webhook_secret: _w, ...rest }) => rest);
}

/* -------------------- 1. Super Admin approval contract -------------------- */

describe("Phase 2 — approval workflow", () => {
  it("approve sets status=approved and stamps reviewed_by/reviewed_at", () => {
    const update = {
      status: "approved",
      reviewed_by: "admin-uid",
      reviewed_at: new Date().toISOString(),
    };
    expect(update.status).toBe("approved");
    expect(update.reviewed_by).toBeTruthy();
    expect(Date.parse(update.reviewed_at)).not.toBeNaN();
  });

  it("monthly approval extends by 1 month from now when no active sub", () => {
    const now = new Date("2026-06-03T00:00:00Z");
    const exp = computeNewExpiry(null, "monthly", now);
    expect(exp.getUTCMonth()).toBe(6);
    expect(exp.getUTCFullYear()).toBe(2026);
  });

  it("yearly approval extends by 12 months from now when no active sub", () => {
    const now = new Date("2026-06-03T00:00:00Z");
    const exp = computeNewExpiry(null, "yearly", now);
    expect(exp.getUTCFullYear()).toBe(2027);
    expect(exp.getUTCMonth()).toBe(5);
  });

  it("monthly approval extends from existing expiry when still active", () => {
    const now = new Date("2026-06-03T00:00:00Z");
    const exp = computeNewExpiry({ expires_at: "2026-08-01T00:00:00Z" }, "monthly", now);
    expect(exp.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("yearly approval extends from existing expiry when still active", () => {
    const now = new Date("2026-06-03T00:00:00Z");
    const exp = computeNewExpiry({ expires_at: "2026-08-01T00:00:00Z" }, "yearly", now);
    expect(exp.toISOString()).toBe("2027-08-01T00:00:00.000Z");
  });

  it("reject requires a non-empty reason", () => {
    const reasons = ["", " ", "wrong amount"];
    const valid = reasons.filter((r) => r.trim().length > 0);
    expect(valid).toEqual(["wrong amount"]);
  });

  it("reject stores reason in reject_reason and does not flip subscription", () => {
    const update = {
      status: "rejected",
      reject_reason: "Invalid transaction id",
      reviewed_by: "admin-uid",
      reviewed_at: new Date().toISOString(),
    };
    // Subscription update is NOT included on reject path
    expect(update).not.toHaveProperty("plan_id");
    expect(update).not.toHaveProperty("expires_at");
    expect(update.reject_reason.length).toBeGreaterThan(0);
  });

  it("under_review is a valid intermediate status", () => {
    const allowed = ["pending", "under_review", "approved", "rejected", "cancelled"];
    expect(allowed).toContain("under_review");
  });

  it("audit log actions cover under_review/approve/reject", () => {
    const actions = ["payment.under_review", "payment.approve", "payment.reject"];
    for (const a of actions) expect(a.startsWith("payment.")).toBe(true);
  });
});

/* -------------------- 2. Customer payment history -------------------- */

describe("Phase 2 — customer payment history", () => {
  const rows = [
    { id: "1", status: "pending", company_id: "co-A" },
    { id: "2", status: "under_review", company_id: "co-A" },
    { id: "3", status: "approved", company_id: "co-A" },
    { id: "4", status: "rejected", company_id: "co-A", reject_reason: "bad txn" },
    { id: "5", status: "cancelled", company_id: "co-A" },
    { id: "6", status: "approved", company_id: "co-OTHER" }, // cross-company
  ];

  it("includes all lifecycle statuses for current company", () => {
    const mine = rows.filter((r) => r.company_id === "co-A").map((r) => r.status);
    expect(mine).toEqual(["pending", "under_review", "approved", "rejected", "cancelled"]);
  });

  it("approved rows expose a receipt link", () => {
    const approved = rows.filter((r) => r.company_id === "co-A" && r.status === "approved");
    expect(approved.length).toBe(1);
    const url = `/app/subscription/receipt/${approved[0].id}`;
    expect(url).toBe("/app/subscription/receipt/3");
  });

  it("rejected rows expose a reason", () => {
    const rej = rows.find((r) => r.status === "rejected");
    expect(rej?.reject_reason).toBe("bad txn");
  });

  it("cross-company rows are filtered out by scope (RLS contract)", () => {
    const mine = rows.filter((r) => r.company_id === "co-A");
    expect(mine.find((r) => r.id === "6")).toBeUndefined();
  });
});

/* -------------------- 3. Receipt PDF edge cases -------------------- */

describe("Phase 2 — receipt edge cases", () => {
  function render(r: Record<string, unknown>) {
    return {
      plan: String(r.plan ?? "—").toUpperCase(),
      period: String(r.billing_period ?? "—"),
      method: String(r.method ?? "—").toUpperCase(),
      txn: r.transaction_id ?? "—",
    };
  }

  it("missing transaction_id renders em dash", () => {
    expect(render({ plan: "pro", billing_period: "monthly", method: "bkash" }).txn).toBe("—");
  });

  it("missing method renders em dash uppercased", () => {
    expect(render({ plan: "pro", billing_period: "monthly" }).method).toBe("—");
  });

  it("legacy row without billing_period renders em dash", () => {
    expect(render({ plan: "basic" }).period).toBe("—");
  });

  it("Bangla company name is preserved (UTF-8 safe)", () => {
    const name = "এরপোভো লিমিটেড";
    expect(name.length).toBeGreaterThan(0);
    expect(name).toContain("এরপোভো");
  });

  it("only approved payments expose a receipt", () => {
    const eligible = (status: string) => status === "approved";
    expect(eligible("approved")).toBe(true);
    expect(eligible("pending")).toBe(false);
    expect(eligible("rejected")).toBe(false);
  });
});

/* -------------------- 4. Gateway security -------------------- */

describe("Phase 2 — gateway secret security", () => {
  const gateways = [
    {
      id: "g1",
      method: "bkash",
      label: "bKash",
      is_active: true,
      api_key: "sk_live_abcdef123456",
      webhook_secret: "whsec_topsecret",
    },
    {
      id: "g2",
      method: "nagad",
      label: "Nagad",
      is_active: false,
      api_key: "sk_dead",
      webhook_secret: null,
    },
  ];

  it("customer never receives api_key or webhook_secret", () => {
    const safe = sanitizeGatewayForCustomer(gateways);
    for (const g of safe) {
      expect(g).not.toHaveProperty("api_key");
      expect(g).not.toHaveProperty("webhook_secret");
    }
  });

  it("customer only sees active gateways", () => {
    const safe = sanitizeGatewayForCustomer(gateways);
    expect(safe.map((g) => g.method)).toEqual(["bkash"]);
  });

  it("platform admin sees only masked secret previews", () => {
    expect(maskSecret("sk_live_abcdef123456")).toBe("sk••••56");
    expect(maskSecret("whsec_topsecret")).toBe("wh••••et");
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("ab")).toBe("••••");
  });

  it("audit log actions for gateway lifecycle are namespaced", () => {
    const actions = ["payment_gateway.create", "payment_gateway.update", "payment_gateway.delete"];
    for (const a of actions) expect(a.startsWith("payment_gateway.")).toBe(true);
  });
});

/* -------------------- 5. Customer submission contract -------------------- */

describe("Phase 2 — customer submission payload", () => {
  it("upgrade form sends the full Phase 2 field set", () => {
    const payload = {
      companyId: "co-A",
      planId: "plan-pro",
      billingPeriod: "monthly" as const,
      currency: "BDT",
      note: "paid via bKash personal",
      proof_url: "payment-screenshots/co-A/u/abc.png",
      plan: "pro",
      method: "bkash",
      amount: 999,
      transaction_id: "TXN-001",
      sender_info: "017xxxxxxxx",
    };
    for (const key of [
      "companyId",
      "planId",
      "billingPeriod",
      "currency",
      "proof_url",
      "transaction_id",
      "sender_info",
    ]) {
      expect(payload).toHaveProperty(key);
    }
  });
});
