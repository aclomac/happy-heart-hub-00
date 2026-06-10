import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_INVOICE_SERIES,
  formatInvoiceNumber,
  mergeInvoiceSeries,
  parseSeriesNumber,
} from "@/lib/sale-invoice-settings";

describe("invoice number series", () => {
  it("defaults generate INV-0001 style number", () => {
    expect(formatInvoiceNumber(DEFAULT_INVOICE_SERIES, 1)).toBe("INV-0001");
  });

  it("prefix change updates preview", () => {
    const s = mergeInvoiceSeries({ prefix: "SI/", start: 1, padding: 4 });
    expect(formatInvoiceNumber(s, s.start)).toBe("SI/0001");
  });

  it("padding change updates preview", () => {
    const s = mergeInvoiceSeries({ prefix: "INV-", start: 1, padding: 6 });
    expect(formatInvoiceNumber(s, s.start)).toBe("INV-000001");
    const s2 = mergeInvoiceSeries({ prefix: "INV-", start: 1, padding: 2 });
    expect(formatInvoiceNumber(s2, s2.start)).toBe("INV-01");
  });

  it("next invoice increments number", () => {
    const s = DEFAULT_INVOICE_SERIES;
    const existingMax = 7;
    const next = formatInvoiceNumber(s, existingMax + 1);
    expect(next).toBe("INV-0008");
  });

  it("parses series number only when prefix matches", () => {
    expect(parseSeriesNumber("INV-0042", "INV-")).toBe(42);
    expect(parseSeriesNumber("INV-ABC", "INV-")).toBeNull();
    expect(parseSeriesNumber("OTHER-0042", "INV-")).toBeNull();
    expect(parseSeriesNumber(null, "INV-")).toBeNull();
  });

  it("merge clamps invalid values to safe defaults", () => {
    const s = mergeInvoiceSeries({ start: -5, padding: 99 });
    expect(s.start).toBe(1);
    expect(s.padding).toBe(10);
  });

  it("ships Bangla labels for series settings", () => {
    const src = readFileSync(resolve(__dirname, "../../lib/i18n.tsx"), "utf8");
    expect(src).toContain('"Invoice Number Series"');
    expect(src).toContain("ইনভয়েস নম্বর সিরিজ");
    expect(src).toContain("প্রিফিক্স");
    expect(src).toContain("শুরুর নম্বর");
    expect(src).toContain("নম্বর প্যাডিং");
    expect(src).toContain("পরবর্তী নম্বর প্রিভিউ");
    expect(src).toContain("একই ইনভয়েস নম্বর আছে");
  });
});
