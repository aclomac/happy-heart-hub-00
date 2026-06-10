import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/lib/pdf/build-cash-entry.ts"), "utf8");

describe("buildCashEntryData PDF hardening", () => {
  it("uses a safeStr helper for nullable fields", () => {
    expect(src).toMatch(/safeStr\s*=/);
    expect(src).toMatch(/const DASH = "—"/);
  });

  it("falls back to defaults for method, reference, notes, date, category, id", () => {
    expect(src).toMatch(/safeStr\(txn\.method \?\? txn\.payment_method \?\? "CASH"/);
    expect(src).toMatch(/safeStr\(txn\.reference_no \?\? txn\.ref_no, DASH\)/);
    expect(src).toMatch(/safeStr\(txn\.notes \?\? txn\.note, ""\)/);
    expect(src).toMatch(/txn\.txn_date \?\? new Date\(\)/);
    expect(src).toMatch(/safeStr\(txn\.category, "Cash Entry"\)/);
    expect(src).toMatch(/safeStr\(txn\.id, "00000000"\)/);
  });

  it("guards against missing transaction or company rows", () => {
    expect(src).toMatch(/Transaction not found/);
    expect(src).toMatch(/Company not found/);
  });

  it("coerces amount safely so NaN cannot reach the PDF", () => {
    expect(src).toMatch(/Number\(txn\.amount \?\? 0\) \|\| 0/);
  });

  it("falls back to currency code when no symbol is mapped", () => {
    expect(src).toMatch(/SYMBOLS\[currency\] \?\? currency/);
  });
});
