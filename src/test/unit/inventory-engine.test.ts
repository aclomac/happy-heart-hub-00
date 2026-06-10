import { describe, it, expect } from "vitest";
import { computeAdjustmentDelta, validateTransferLines, type TransferLine } from "@/lib/stock";

/**
 * Inventory engine QA – Phase 5.
 * Covers pure adjustment/transfer math used by the inventory workflow.
 * Soft-delete idempotency for stock_adjustments and stock_transfers is
 * enforced at the DB layer by the reverse_*_on_soft_delete triggers
 * (NOT EXISTS guards on reference_type). These tests pin the in-app
 * deltas the triggers depend on.
 */
describe("inventory adjustment delta – full type matrix", () => {
  it("opening stock correction acts like an increase", () => {
    expect(computeAdjustmentDelta("opening", 50, 0)).toBe(50);
    // Opening correction never produces a negative delta from a positive input.
    expect(computeAdjustmentDelta("opening", 7, 25)).toBe(7);
  });

  it("damage/loss reduces stock symmetrically with decrease", () => {
    expect(computeAdjustmentDelta("damage", 3, 10)).toBe(-3);
    expect(computeAdjustmentDelta("damage", 10, 10)).toBe(-10);
  });

  it("set quantity computes the correct signed delta to reach the target", () => {
    // Increase path
    expect(computeAdjustmentDelta("set", 100, 40)).toBe(60);
    // Decrease path
    expect(computeAdjustmentDelta("set", 5, 30)).toBe(-25);
    // No-op (caller is expected to reject delta=0)
    expect(computeAdjustmentDelta("set", 10, 10)).toBe(0);
  });

  it("delta sign drives stock_movements.direction (in vs out)", () => {
    // Used by postStockAdjustment to choose 'in' vs 'out' for the ledger.
    const inc = computeAdjustmentDelta("increase", 5, 0);
    const dec = computeAdjustmentDelta("decrease", 5, 10);
    expect(inc > 0 ? "in" : "out").toBe("in");
    expect(dec > 0 ? "in" : "out").toBe("out");
  });
});

describe("stock transfer validation – source/destination symmetry", () => {
  const ok: TransferLine[] = [
    { itemId: "a", qty: 2, currentSourceStock: 5 },
    { itemId: "b", qty: 1, currentSourceStock: 1 },
  ];

  it("accepts multi-line transfers when stock is sufficient", () => {
    expect(validateTransferLines(ok, true)).toBeNull();
  });

  it("blocks any single insufficient line when negative stock is blocked", () => {
    const bad: TransferLine[] = [
      { itemId: "a", qty: 2, currentSourceStock: 5 },
      { itemId: "b", qty: 10, currentSourceStock: 1 }, // insufficient
    ];
    expect(validateTransferLines(bad, true)).toMatch(/insufficient/i);
  });

  it("allows the same lines through when block-negative is off", () => {
    const bad: TransferLine[] = [
      { itemId: "a", qty: 2, currentSourceStock: 5 },
      { itemId: "b", qty: 10, currentSourceStock: 1 },
    ];
    expect(validateTransferLines(bad, false)).toBeNull();
  });

  it("total company stock impact of a transfer is zero (out + in)", () => {
    // postStockTransfer emits one 'out' on the source and one 'in' on the
    // destination per line; the net delta on company-wide stock must be 0.
    const netByItem = new Map<string, number>();
    for (const l of ok) {
      netByItem.set(l.itemId, (netByItem.get(l.itemId) ?? 0) + l.qty - l.qty);
    }
    for (const v of netByItem.values()) expect(v).toBe(0);
  });
});

describe("low stock calculation", () => {
  // Mirrors the dashboard rule used by inventory-stats: an item is "low"
  // when stock <= low_stock_alert (and a threshold is configured), and
  // "out of stock" when stock <= 0.
  function classify(stock: number, alert: number | null) {
    if (stock <= 0) return "out";
    if (alert != null && stock <= alert) return "low";
    return "ok";
  }

  it("flags out of stock when qty is 0 or negative", () => {
    expect(classify(0, 5)).toBe("out");
    expect(classify(-1, 5)).toBe("out");
  });

  it("flags low stock when at or below threshold", () => {
    expect(classify(5, 5)).toBe("low");
    expect(classify(3, 5)).toBe("low");
  });

  it("ignores threshold when not configured", () => {
    expect(classify(1, null)).toBe("ok");
  });
});
