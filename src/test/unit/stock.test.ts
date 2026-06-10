import { describe, it, expect } from "vitest";
import { computeAdjustmentDelta, validateTransferLines } from "@/lib/stock";

describe("computeAdjustmentDelta", () => {
  it("increase always returns positive magnitude", () => {
    expect(computeAdjustmentDelta("increase", 5, 10)).toBe(5);
    expect(computeAdjustmentDelta("increase", -5, 10)).toBe(5);
  });

  it("opening behaves like increase", () => {
    expect(computeAdjustmentDelta("opening", 7, 0)).toBe(7);
  });

  it("decrease and damage return negative magnitude", () => {
    expect(computeAdjustmentDelta("decrease", 3, 10)).toBe(-3);
    expect(computeAdjustmentDelta("damage", 4, 10)).toBe(-4);
  });

  it("set returns difference between target and current", () => {
    expect(computeAdjustmentDelta("set", 12, 10)).toBe(2);
    expect(computeAdjustmentDelta("set", 5, 10)).toBe(-5);
    expect(computeAdjustmentDelta("set", 10, 10)).toBe(0);
  });
});

describe("validateTransferLines", () => {
  it("rejects empty list", () => {
    expect(validateTransferLines([], false)).toMatch(/at least one/i);
  });

  it("rejects rows missing item", () => {
    expect(validateTransferLines([{ itemId: "", qty: 1, currentSourceStock: 10 }], false)).toMatch(
      /item/i,
    );
  });

  it("rejects zero or negative qty", () => {
    expect(validateTransferLines([{ itemId: "x", qty: 0, currentSourceStock: 10 }], false)).toMatch(
      /greater than zero/i,
    );
    expect(
      validateTransferLines([{ itemId: "x", qty: -1, currentSourceStock: 10 }], false),
    ).toMatch(/greater than zero/i);
  });

  it("blocks insufficient stock when negative stock is blocked", () => {
    expect(validateTransferLines([{ itemId: "x", qty: 5, currentSourceStock: 2 }], true)).toMatch(
      /insufficient/i,
    );
  });

  it("allows insufficient stock when block is off", () => {
    expect(
      validateTransferLines([{ itemId: "x", qty: 5, currentSourceStock: 2 }], false),
    ).toBeNull();
  });

  it("accepts a valid transfer", () => {
    expect(
      validateTransferLines(
        [
          { itemId: "a", qty: 3, currentSourceStock: 10 },
          { itemId: "b", qty: 1, currentSourceStock: 2 },
        ],
        true,
      ),
    ).toBeNull();
  });
});
