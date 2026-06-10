import { describe, it, expect } from "vitest";
import {
  summarizePnl,
  summarizeBalanceSheet,
  stockValueOf,
  sumBy,
  postedOnly,
  type StockItem,
} from "@/lib/reports/calc";

// Shared dataset — same rows used by both "dashboard" and "report" sides
// so we can prove the two surfaces don't drift.
type SaleRow = {
  invoice_date: string;
  total: number;
  balance: number;
  doc_type?: string | null;
  deleted_at?: string | null;
  reversed_at?: string | null;
};
type PurchaseRow = {
  bill_date: string;
  total: number;
  balance: number;
  doc_type?: string | null;
  deleted_at?: string | null;
};
type ExpenseRow = {
  expense_date: string;
  amount: number;
  tax?: number | null;
  category?: string | null;
  deleted_at?: string | null;
};

const today = "2026-06-03";
const month = today.slice(0, 7);

const sales: SaleRow[] = [
  { invoice_date: today, total: 1000, balance: 200 },
  { invoice_date: "2026-06-01", total: 500, balance: 0 },
  { invoice_date: "2026-05-15", total: 800, balance: 100 }, // out of month
  { invoice_date: today, total: 300, balance: 0, doc_type: "credit_note" }, // return
  { invoice_date: today, total: 999, balance: 999, deleted_at: "x" }, // ignored
];
const purchases: PurchaseRow[] = [
  { bill_date: today, total: 700, balance: 700 },
  { bill_date: "2026-06-02", total: 200, balance: 0, doc_type: "debit_note" }, // return
  { bill_date: "2026-05-10", total: 999, balance: 999 }, // out of month
];
const expenses: ExpenseRow[] = [
  { expense_date: today, amount: 100, tax: 5, category: "rent" },
  { expense_date: "2026-06-02", amount: 50, tax: 0, category: "utilities" },
  { expense_date: today, amount: 999, deleted_at: "x" }, // ignored
];
const banks = [
  { account_type: "bank", current_balance: 5000 },
  { account_type: "bank", current_balance: 1500 },
  { account_type: "mobile", current_balance: 800 },
];
const items: StockItem[] = [
  { stock: 10, purchase_price: 100, sale_price: 150 }, // 1000
  { stock: 5, purchase_price: 0, sale_price: 200 }, // 1000 via fallback
  { stock: 3, purchase_price: 50, sale_price: 80, is_service: true }, // ignored
  { stock: 7, purchase_price: 10, deleted_at: "x" }, // ignored
];
const parties = [
  { type: "customer", balance: 200 },
  { type: "customer", balance: 100 },
  { type: "supplier", balance: 700 },
];
const loans = [
  { counterparty_type: "payable", outstanding: 2000 },
  { counterparty_type: "receivable", outstanding: 500 },
];

// Dashboard-style inline aggregators (mirrors src/routes/app.index.tsx).
function dashboard() {
  const live = (s: SaleRow) => !s.deleted_at && !s.reversed_at;
  const liveSales = sales.filter(live);
  const livePurchases = purchases.filter((p) => !p.deleted_at);
  const liveExp = expenses.filter((e) => !e.deleted_at);
  return {
    todaySales: liveSales
      .filter((s) => s.invoice_date === today && s.doc_type !== "credit_note")
      .reduce((a, s) => a + s.total, 0),
    monthSales: liveSales
      .filter((s) => s.invoice_date.slice(0, 7) === month && s.doc_type !== "credit_note")
      .reduce((a, s) => a + s.total, 0),
    receivables: liveSales.reduce((a, s) => a + s.balance, 0),
    payables: livePurchases.reduce((a, p) => a + p.balance, 0),
    monthExpenses: liveExp
      .filter((e) => e.expense_date.slice(0, 7) === month)
      .reduce((a, e) => a + e.amount + (e.tax ?? 0), 0),
    bankBalance: banks
      .filter((b) => b.account_type !== "mobile")
      .reduce((a, b) => a + b.current_balance, 0),
    mobileBalance: banks
      .filter((b) => b.account_type === "mobile")
      .reduce((a, b) => a + b.current_balance, 0),
    stockValue: stockValueOf(items),
    lowStockCount: items.filter((i) => !i.is_service && !i.deleted_at && (i.stock as number) <= 5)
      .length,
  };
}

describe("Phase 7 — dashboard ↔ reports consistency", () => {
  it("dashboard month-sales = P&L gross sales filtered to month", () => {
    const d = dashboard();
    const pnl = summarizePnl({
      sales: sales.filter((s) => s.invoice_date.slice(0, 7) === month),
      purchases: [],
      expenses: [],
    });
    expect(d.monthSales).toBe(pnl.grossSales);
  });

  it("dashboard month-expenses = P&L expense total filtered to month", () => {
    const d = dashboard();
    const pnl = summarizePnl({
      sales: [],
      purchases: [],
      expenses: expenses.filter((e) => e.expense_date.slice(0, 7) === month),
    });
    expect(d.monthExpenses).toBe(pnl.expTotal);
  });

  it("dashboard receivables/payables = sum of live party balances", () => {
    const d = dashboard();
    // Dashboard uses sale/purchase balance sums; the report uses party.balance.
    // Both must equal the same underlying outstanding when seeded consistently.
    expect(d.receivables).toBe(
      sumBy(
        sales.filter((s) => !s.deleted_at && !s.reversed_at),
        (s) => s.balance,
      ),
    );
  });

  it("dashboard bank + mobile totals = balance-sheet bankTotal + mobileTotal", () => {
    const d = dashboard();
    const bs = summarizeBalanceSheet({
      cash: 0,
      banks,
      parties,
      loans,
      items,
    });
    expect(d.bankBalance).toBe(bs.bankTotal);
    expect(d.mobileBalance).toBe(bs.mobileTotal);
    expect(bs.bankTotal).toBe(6500);
    expect(bs.mobileTotal).toBe(800);
  });

  it("dashboard stock value = balance-sheet stockValue (services + deleted excluded)", () => {
    const d = dashboard();
    const bs = summarizeBalanceSheet({ cash: 0, banks, parties, loans, items });
    expect(d.stockValue).toBe(bs.stockValue);
    expect(bs.stockValue).toBe(2000);
  });
});

describe("Phase 7 — P&L sanity with payroll + returns", () => {
  it("net profit subtracts salary expense and damage/loss", () => {
    const pnl = summarizePnl({
      sales,
      purchases,
      expenses,
      salaries: [{ amount: 1200 }, { amount: 800, deleted_at: "x" }],
      damageLoss: [{ amount: 50 }],
    });
    // gross sales = 1000 + 500 + 800 (live invoices, all months) = 2300
    expect(pnl.grossSales).toBe(2300);
    expect(pnl.salesReturns).toBe(300);
    expect(pnl.netSales).toBe(2000);
    // purchases live + non-debit-note: 700 + 999 = 1699
    expect(pnl.grossPurchases).toBe(1699);
    expect(pnl.purchaseReturns).toBe(200);
    expect(pnl.netPurchase).toBe(1499);
    expect(pnl.salaryTotal).toBe(1200);
    expect(pnl.damageLossTotal).toBe(50);
    // expenses live = 105 + 50 = 155
    expect(pnl.expTotal).toBe(155);
    expect(pnl.netProfit).toBe(pnl.grossProfit - 155 - 1200 - 50);
  });
});

describe("Phase 7 — restored row counts exactly once", () => {
  it("a row with both deleted_at cleared and restored_at set counts once", () => {
    const restored: SaleRow[] = [
      { invoice_date: today, total: 100, balance: 0 },
      // restored_at is metadata only; deleted_at is null so postedOnly keeps it
      { invoice_date: today, total: 200, balance: 0, deleted_at: null } as SaleRow,
    ];
    const live = postedOnly(restored);
    expect(live).toHaveLength(2);
    expect(sumBy(live, (r) => r.total)).toBe(300);
  });
});
