import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { getPdfLabels, localizeDocTitle, getPdfLang } from "@/lib/pdf-i18n";

// Minimal window+localStorage shim so pdf-i18n can read its persisted lang.
beforeAll(() => {
  const store = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
});

function setLang(l: "en" | "bn" | null) {
  if (l === null) window.localStorage.removeItem("erpovo.lang");
  else window.localStorage.setItem("erpovo.lang", l);
}

afterEach(() => setLang(null));

describe("pdf-i18n", () => {
  it("defaults to English when no localStorage value is set", () => {
    expect(getPdfLang()).toBe("en");
    expect(getPdfLabels().bill_to).toBe("BILL TO");
  });

  it("switches to Bangla when localStorage is set", () => {
    setLang("bn");
    expect(getPdfLang()).toBe("bn");
    const L = getPdfLabels();
    expect(L.bill_to).toBe("বিল প্রাপক");
    expect(L.invoice_no).toBe("ইনভয়েস নং");
    expect(L.amount).toBe("টাকা");
    expect(L.terms_and_conditions).toBe("শর্তাবলী");
    expect(L.signature).toBe("স্বাক্ষর");
    expect(L.title_salary_slip).toBe("বেতন স্লিপ");
  });

  it("translates canonical document titles", () => {
    setLang("bn");
    expect(localizeDocTitle("TAX INVOICE")).toBe("ট্যাক্স ইনভয়েস");
    expect(localizeDocTitle("PURCHASE BILL")).toBe("ক্রয় বিল");
    expect(localizeDocTitle("EXPENSE VOUCHER")).toBe("খরচ ভাউচার");
    expect(localizeDocTitle("SALARY SLIP")).toBe("বেতন স্লিপ");
    expect(localizeDocTitle("STOCK TRANSFER CHALLAN")).toBe("স্টক ট্রান্সফার চালান");
  });

  it("passes unknown / user-supplied titles through unchanged", () => {
    setLang("bn");
    expect(localizeDocTitle("CUSTOM REPORT")).toBe("CUSTOM REPORT");
    expect(localizeDocTitle("")).toBe("");
  });

  it("English mode preserves canonical English titles", () => {
    setLang("en");
    expect(localizeDocTitle("TAX INVOICE")).toBe("TAX INVOICE");
    expect(localizeDocTitle("PURCHASE BILL")).toBe("PURCHASE BILL");
  });

  it("provides every required PDF label key in both languages", () => {
    setLang("en");
    const en = getPdfLabels();
    setLang("bn");
    const bn = getPdfLabels();
    // Spot-check coverage on labels listed in the spec.
    for (const key of [
      "bill_to",
      "invoice_no",
      "date",
      "due_date",
      "qty",
      "rate",
      "discount",
      "tax_vat",
      "amount",
      "subtotal",
      "grand_total",
      "paid",
      "balance",
      "terms_and_conditions",
      "bank",
      "signature",
      "thank_you",
      "generated",
      "page",
    ] as const) {
      expect(en[key]).toBeTruthy();
      expect(bn[key]).toBeTruthy();
      expect(bn[key]).not.toBe(en[key]);
    }
  });
});
