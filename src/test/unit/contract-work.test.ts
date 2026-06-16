import { describe, it, expect } from "vitest";
import { calcTotal, statusFor } from "@/lib/contract-work";
import { allocateFIFO } from "@/lib/contract-payments";

describe("contract work calc", () => {
  it("qty × rate = total (rounded to 2dp)", () => {
    expect(calcTotal(10, 50)).toBe(500);
    expect(calcTotal(3, 33.333)).toBe(100);
    expect(calcTotal(0, 100)).toBe(0);
  });

  it("status reflects paid vs total", () => {
    expect(statusFor(500, 0)).toBe("unpaid");
    expect(statusFor(500, 200)).toBe("partial");
    expect(statusFor(500, 500)).toBe("paid");
    expect(statusFor(500, 600)).toBe("paid");
  });
});

describe("FIFO allocator", () => {
  const entries = [
    { id: "a", total: 100, paid_amount: 0 },
    { id: "b", total: 200, paid_amount: 50 }, // 150 due
    { id: "c", total: 300, paid_amount: 0 },
  ];

  it("fully pays first entries until amount runs out", () => {
    const out = allocateFIFO(entries, 220);
    expect(out).toEqual([
      { workEntryId: "a", amount: 100 },
      { workEntryId: "b", amount: 120 },
    ]);
  });

  it("creates a single partial allocation when amount < first due", () => {
    expect(allocateFIFO(entries, 40)).toEqual([{ workEntryId: "a", amount: 40 }]);
  });

  it("skips already-paid entries", () => {
    const out = allocateFIFO(
      [{ id: "x", total: 100, paid_amount: 100 }, ...entries],
      150,
    );
    expect(out[0].workEntryId).toBe("a");
    expect(out.reduce((s, a) => s + a.amount, 0)).toBe(150);
  });

  it("returns no allocations when amount is zero", () => {
    expect(allocateFIFO(entries, 0)).toEqual([]);
  });

  it("never over-allocates beyond outstanding due", () => {
    const out = allocateFIFO(entries, 99999);
    const total = out.reduce((s, a) => s + a.amount, 0);
    // total due = 100 + 150 + 300 = 550
    expect(total).toBe(550);
  });
});
