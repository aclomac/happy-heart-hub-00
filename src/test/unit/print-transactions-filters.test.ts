import { describe, it, expect, beforeAll, beforeEach } from "vitest";

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

import {
  filterTxnRows,
  shouldOpenTransactionPrint,
  TXN_TYPE_OPTIONS,
  type TxnRow,
  type TxnType,
} from "@/lib/print-transactions";
import { looksLikeMoney } from "@/components/erp/MoneyText";
import { maskAmount, setPrivacyMode } from "@/lib/use-privacy";
import { translate } from "@/lib/i18n";

const row = (over: Partial<TxnRow> & { id: string; type: TxnType }): TxnRow => ({
  date: "2026-06-01",
  refNo: "REF-001",
  party: "Acme",
  typeLabel: TXN_TYPE_OPTIONS.find((o) => o.value === over.type)?.label ?? over.type,
  total: 1000,
  paid: 500,
  balance: 500,
  ...over,
});

const SAMPLE: TxnRow[] = [
  row({ id: "s1", type: "sale_invoice", refNo: "INV-1", party: "Acme", date: "2026-05-01" }),
  row({ id: "so1", type: "sale_order", refNo: "SO-1", party: "Acme", date: "2026-05-10" }),
  row({ id: "p1", type: "purchase_bill", refNo: "BILL-1", party: "Vendor X", date: "2026-05-15" }),
  row({ id: "pin", type: "payment_in", refNo: "PAY-IN-1", party: "Acme", date: "2026-06-01" }),
  row({
    id: "pout",
    type: "payment_out",
    refNo: "PAY-OUT-1",
    party: "Vendor X",
    date: "2026-06-02",
  }),
  row({ id: "e1", type: "expense", refNo: "EXP-1", party: "Rent", date: "2026-06-03" }),
  row({ id: "cn1", type: "credit_note", refNo: "CN-1", party: "Acme", date: "2026-06-04" }),
  row({ id: "dn1", type: "debit_note", refNo: "DN-1", party: "Vendor X", date: "2026-06-05" }),
];

describe("Transaction Print — type filter", () => {
  it("All Transactions returns every supported row", () => {
    expect(filterTxnRows(SAMPLE, { type: "all" })).toHaveLength(SAMPLE.length);
  });

  it.each([
    ["sale_invoice", "INV-1"],
    ["sale_order", "SO-1"],
    ["purchase_bill", "BILL-1"],
    ["payment_in", "PAY-IN-1"],
    ["payment_out", "PAY-OUT-1"],
    ["expense", "EXP-1"],
    ["credit_note", "CN-1"],
    ["debit_note", "DN-1"],
  ] as const)("type=%s isolates to its own row (%s)", (type, refNo) => {
    const out = filterTxnRows(SAMPLE, { type: type as TxnType });
    expect(out).toHaveLength(1);
    expect(out[0].refNo).toBe(refNo);
  });
});

describe("Transaction Print — date range filter", () => {
  it("from-date filters older transactions out", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", from: "2026-06-01" });
    expect(out.every((r) => r.date >= "2026-06-01")).toBe(true);
    expect(out).toHaveLength(5);
  });

  it("to-date filters newer transactions out", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", to: "2026-05-31" });
    expect(out.every((r) => r.date <= "2026-05-31")).toBe(true);
    expect(out).toHaveLength(3);
  });

  it("combined from/to range works", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", from: "2026-05-10", to: "2026-06-02" });
    expect(out.map((r) => r.id).sort()).toEqual(["p1", "pin", "pout", "so1"]);
  });

  it("inverted range returns empty (safe state)", () => {
    expect(filterTxnRows(SAMPLE, { type: "all", from: "2026-06-30", to: "2026-06-01" })).toEqual(
      [],
    );
  });
});

describe("Transaction Print — party filter", () => {
  it("selecting a party filters by exact party name", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", partyName: "Acme" });
    expect(out.every((r) => r.party === "Acme")).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it("clearing party (empty string/null) restores all rows", () => {
    const out1 = filterTxnRows(SAMPLE, { type: "all", partyName: "" });
    const out2 = filterTxnRows(SAMPLE, { type: "all", partyName: null });
    expect(out1).toHaveLength(SAMPLE.length);
    expect(out2).toHaveLength(SAMPLE.length);
  });
});

describe("Transaction Print — search", () => {
  it("matches by ref no", () => {
    expect(filterTxnRows(SAMPLE, { type: "all", search: "INV-1" }).map((r) => r.id)).toEqual([
      "s1",
    ]);
  });
  it("matches by party name", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", search: "vendor" });
    expect(out.every((r) => r.party === "Vendor X")).toBe(true);
  });
  it("matches by transaction type label", () => {
    const out = filterTxnRows(SAMPLE, { type: "all", search: "credit note" });
    expect(out.map((r) => r.id)).toEqual(["cn1"]);
  });
  it("partial keyword match works", () => {
    expect(filterTxnRows(SAMPLE, { type: "all", search: "pay-in" }).map((r) => r.id)).toEqual([
      "pin",
    ]);
  });
  it("no match returns empty (drives empty state)", () => {
    expect(filterTxnRows(SAMPLE, { type: "all", search: "no-such-thing" })).toEqual([]);
  });
});

describe("Transaction Print — privacy mode masking", () => {
  beforeEach(() => {
    localStorage.clear();
    setPrivacyMode(false);
  });

  it("amount strings are recognised as money", () => {
    expect(looksLikeMoney("৳ 1,000.00")).toBe(true);
    expect(looksLikeMoney("INV-1")).toBe(false);
  });

  it("Privacy ON masks formatted amount; OFF reveals it", () => {
    const formatted = "৳ 1,000.00";
    expect(maskAmount(formatted, false)).toBe(formatted);
    expect(maskAmount(formatted, true)).toBe("•••••");
  });
});

describe("Transaction Print — Topbar routing predicate", () => {
  it("opens the transaction print screen from main app pages", () => {
    expect(shouldOpenTransactionPrint("/app")).toBe(true);
    expect(shouldOpenTransactionPrint("/app/items")).toBe(true);
    expect(shouldOpenTransactionPrint("/app/parties")).toBe(true);
    expect(shouldOpenTransactionPrint("/app/pos")).toBe(true);
    expect(shouldOpenTransactionPrint("/app/reports")).toBe(true);
  });

  it("document detail/edit pages keep their existing print behavior", () => {
    expect(shouldOpenTransactionPrint("/app/sales/abc/edit")).toBe(false);
    expect(shouldOpenTransactionPrint("/app/purchases/abc/edit")).toBe(false);
    expect(shouldOpenTransactionPrint("/app/expenses/abc/edit")).toBe(false);
  });

  it("does not trigger when already on the print page", () => {
    expect(shouldOpenTransactionPrint("/app/print-transactions")).toBe(false);
  });
});

describe("Transaction Print — print-only scope", () => {
  it("route file scopes print to #txn-print-area and hides everything else", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/routes/app.print-transactions.tsx", "utf8");
    expect(src).toContain("@media print");
    expect(src).toContain("#txn-print-area");
    expect(src).toMatch(/body \*\s*{\s*visibility:\s*hidden/);
    expect(src).toMatch(/#txn-print-area,\s*#txn-print-area \*\s*{\s*visibility:\s*visible/);
  });

  it("Topbar and sidebar opt out of print via print:hidden", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("src/components/erp/Topbar.tsx", "utf8")).toContain("print:hidden");
  });

  it("report header includes filter summary fields", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/routes/app.print-transactions.tsx", "utf8");
    expect(src).toContain('t("Firm")');
    expect(src).toContain('t("Transaction Type")');
    expect(src).toContain('t("From")');
    expect(src).toContain('t("To")');
    expect(src).toContain('t("Party")');
  });

  it("amount columns render through MoneyText", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/routes/app.print-transactions.tsx", "utf8");
    expect(src).toContain("<MoneyText value={fmt(r.total)} />");
    expect(src).toContain("<MoneyText value={fmt(r.paid)} />");
    expect(src).toContain("<MoneyText value={fmt(r.balance)} />");
  });
});

describe("Transaction Print — Bangla i18n", () => {
  it.each([
    ["Transactions", "ট্রানজেকশন"],
    ["Search Transactions", "ট্রানজেকশন খুঁজুন"],
    ["All Transactions", "সব ট্রানজেকশন"],
    ["From", "শুরু"],
    ["To", "শেষ"],
    ["Party", "পার্টি"],
    ["Ref No", "রেফারেন্স নং"],
    ["Received/Paid", "গ্রহণ/পরিশোধ"],
    ["Balance", "বাকি"],
    ["No transactions to show", "দেখানোর মতো কোনো ট্রানজেকশন নেই"],
    ["Print Transactions", "ট্রানজেকশন প্রিন্ট"],
  ])("%s → %s", (en, bn) => {
    expect(translate(en, "bn")).toBe(bn);
  });
});
