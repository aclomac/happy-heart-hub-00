import { describe, it, expect, beforeEach, beforeAll } from "vitest";

beforeAll(() => {
  const g = globalThis as unknown as {
    localStorage?: Storage;
    window?: {
      addEventListener: () => void;
      removeEventListener: () => void;
      dispatchEvent: () => boolean;
    };
  };
  if (!g.localStorage) {
    const s = new Map<string, string>();
    g.localStorage = {
      getItem: (k: string) => (s.has(k) ? (s.get(k) as string) : null),
      setItem: (k: string, v: string) => void s.set(k, String(v)),
      removeItem: (k: string) => void s.delete(k),
      clear: () => s.clear(),
      key: (i: number) => Array.from(s.keys())[i] ?? null,
      get length() {
        return s.size;
      },
    } as Storage;
  }
  if (!g.window) {
    g.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  }
});

import { looksLikeMoney } from "@/components/erp/MoneyText";
import { maskAmount, setPrivacyMode, getPrivacyMode } from "@/lib/use-privacy";
import { DICTIONARY } from "@/lib/i18n";

describe("Privacy Mode app-wide masking", () => {
  beforeEach(() => {
    localStorage.clear();
    setPrivacyMode(false);
  });

  describe("looksLikeMoney heuristic", () => {
    it.each([
      ["৳ 1,234", true],
      ["$1,234.00", true],
      ["₹500", true],
      ["€99", true],
      ["£10", true],
    ])("treats %s as money", (v, exp) => {
      expect(looksLikeMoney(v as string)).toBe(exp);
    });

    it.each([
      ["12"],
      ["3 items"],
      ["INV-001"],
      ["2026-01-01"],
      ["SKU-AB-12"],
      ["+8801711000000"],
      ["35%"],
      ["5 pcs"],
    ])("does NOT treat %s as money (non-amount safety)", (v) => {
      expect(looksLikeMoney(v)).toBe(false);
    });
  });

  describe("maskAmount + privacy state", () => {
    it("returns real value when privacy off", () => {
      expect(getPrivacyMode()).toBe(false);
      expect(maskAmount("৳ 1,234.00", false)).toBe("৳ 1,234.00");
    });

    it("returns mask when privacy on", () => {
      setPrivacyMode(true);
      expect(getPrivacyMode()).toBe(true);
      expect(maskAmount("৳ 1,234.00", true)).toBe("•••••");
    });

    it("maintains stable mask string for any input", () => {
      // Layout stability: mask is always the same width-ish placeholder.
      expect(maskAmount("৳ 1", true)).toBe(maskAmount("৳ 999,999,999.00", true));
    });
  });

  describe("Bangla i18n", () => {
    it("Privacy Mode Active is localised", () => {
      const e = DICTIONARY["Privacy Mode Active"];
      expect(e).toBeDefined();
      expect(e.bn).toBe("প্রাইভেসি মোড চালু");
    });
  });
});
