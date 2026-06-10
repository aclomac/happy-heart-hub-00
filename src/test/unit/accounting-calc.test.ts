import { describe, it, expect } from "vitest";
import {
  isLive,
  isPosted,
  postedOnly,
  sumBy,
  summarizePnl,
  summarizeBalanceSheet,
  summarizeTrialBalance,
  stockValueOf,
  itemValue,
  buildDayBook,
  closeLedger,
  runningBalance,
  inventoryRunningBalance,
} from "@/lib/reports/calc";

describe("calc: soft-delete / posted guards", () => {
  it("isLive excludes deleted", () => {
    expect(isLive({ deleted_at: null })).toBe(true);
    expect(isLive({ deleted_at: "2025-01-01" })).toBe(false);
  });
  it("isPosted excludes reversed/cancelled", () => {
    expect(isPosted({ status: "posted" })).toBe(true);
    expect(isPosted({ status: "cancelled" })).toBe(false);
    expect(isPosted({ status: "reversed" })).toBe(false);
    expect(isPosted({ reversed_at: "2025-01-01" })).toBe(false);
    expect(isPosted({ deleted_at: "2025-01-01" })).toBe(false);
  });
  it("postedOnly handles null/undefined", () => {
    expect(postedOnly(null)).toEqual([]);
    expect(postedOnly(undefined)).toEqual([]);
    expect(postedOnly([{ status: "posted" }, { status: "cancelled" }])).toHaveLength(1);
  });
  it("restored row (restored_at set, deleted_at null) is counted once", () => {
    const rows = [
      { deleted_at: null, restored_at: "2025-01-02", status: "posted", amount: 100 },
      { deleted_at: null, restored_at: null, status: "posted", amount: 50 },
    ] as any[];
    expect(postedOnly(rows)).toHaveLength(2);
    expect(sumBy(postedOnly(rows), (r) => r.amount)).toBe(150);
  });
});

describe("calc: Profit & Loss", () => {
  const baseSales = [
    { total: 1000, doc_type: "invoice", status: "posted" },
    { total: 500, doc_type: "invoice", status: "posted" },
    { total: 200, doc_type: "credit_note", status: "posted" }, // sales return
    { total: 999, doc_type: "invoice", status: "cancelled" }, // excluded
    { total: 999, doc_type: "invoice", deleted_at: "x" }, // excluded
  ];
  const basePurchases = [
    { total: 400, doc_type: "bill", status: "posted" },
    { total: 100, doc_type: "debit_note", status: "posted" }, // purchase return
    { total: 999, doc_type: "bill", reversed_at: "x" }, // excluded
  ];
  const baseExpenses = [
    { amount: 50, tax: 10, category: "rent", status: "posted" },
    { amount: 30, tax: 0, category: "utilities", status: "posted" },
    { amount: 100, tax: 0, category: "rent", deleted_at: "x" }, // excluded
  ];
  const baseSalaries = [{ amount: 200, status: "posted" }];

  it("computes net sales / net purchase correctly", () => {
    const s = summarizePnl({
      sales: baseSales,
      purchases: basePurchases,
      expenses: baseExpenses,
      salaries: baseSalaries,
    });
    expect(s.grossSales).toBe(1500);
    expect(s.salesReturns).toBe(200);
    expect(s.netSales).toBe(1300);
    expect(s.grossPurchases).toBe(400);
    expect(s.purchaseReturns).toBe(100);
    expect(s.netPurchase).toBe(300);
    expect(s.cogs).toBe(300);
  });
  it("includes salary as expense and groups by category", () => {
    const s = summarizePnl({
      sales: baseSales,
      purchases: basePurchases,
      expenses: baseExpenses,
      salaries: baseSalaries,
    });
    expect(s.expByCat.rent).toBe(60);
    expect(s.expByCat.utilities).toBe(30);
    expect(s.expTotal).toBe(90);
    expect(s.salaryTotal).toBe(200);
  });
  it("computes gross profit and net profit", () => {
    const s = summarizePnl({
      sales: baseSales,
      purchases: basePurchases,
      expenses: baseExpenses,
      salaries: baseSalaries,
    });
    expect(s.grossProfit).toBe(1000); // 1300 - 300
    expect(s.netProfit).toBe(710); // 1000 - 90 - 200
  });
  it("damage/loss reduces net profit", () => {
    const s = summarizePnl({
      sales: baseSales,
      purchases: basePurchases,
      expenses: baseExpenses,
      salaries: [],
      damageLoss: [{ amount: 50, status: "posted" }],
    });
    expect(s.damageLossTotal).toBe(50);
    expect(s.netProfit).toBe(1000 - 90 - 50);
  });
  it("empty inputs produce zeros", () => {
    const s = summarizePnl({ sales: [], purchases: [], expenses: [] });
    expect(s.netSales).toBe(0);
    expect(s.netPurchase).toBe(0);
    expect(s.netProfit).toBe(0);
  });
});

describe("calc: stock valuation", () => {
  it("uses purchase_price first, then sale_price, then 0", () => {
    expect(itemValue({ stock: 5, purchase_price: 10 })).toBe(50);
    expect(itemValue({ stock: 5, purchase_price: 0, sale_price: 20 })).toBe(100);
    expect(itemValue({ stock: 5 })).toBe(0);
  });
  it("excludes services and deleted items", () => {
    const items = [
      { stock: 10, purchase_price: 5 },
      { stock: 10, purchase_price: 5, is_service: true },
      { stock: 10, purchase_price: 5, deleted_at: "x" },
    ];
    expect(stockValueOf(items as any)).toBe(50);
  });
});

describe("calc: Balance Sheet", () => {
  const input = {
    cash: 1000,
    banks: [
      { account_type: "bank", current_balance: 5000 },
      { account_type: "mobile", current_balance: 800 },
      { account_type: "bank", current_balance: 999, deleted_at: "x" },
    ],
    parties: [
      { type: "customer", balance: 300 },
      { type: "customer", balance: -50 }, // negative → ignored
      { type: "supplier", balance: 200 },
    ],
    loans: [
      { counterparty_type: "payable", outstanding: 1500 },
      { counterparty_type: "receivable", outstanding: 700 },
    ],
    items: [{ stock: 4, purchase_price: 25 }] as any,
  };
  it("aggregates cash, banks, mobile, receivables, payables, stock, loans", () => {
    const bs = summarizeBalanceSheet(input);
    expect(bs.cash).toBe(1000);
    expect(bs.bankTotal).toBe(5000);
    expect(bs.mobileTotal).toBe(800);
    expect(bs.receivables).toBe(300);
    expect(bs.payables).toBe(200);
    expect(bs.stockValue).toBe(100);
    expect(bs.loanReceivable).toBe(700);
    expect(bs.loanPayable).toBe(1500);
  });
  it("totalAssets = cash + bank + mobile + receivables + loansRec + stock", () => {
    const bs = summarizeBalanceSheet(input);
    expect(bs.totalAssets).toBe(1000 + 5000 + 800 + 300 + 700 + 100);
  });
  it("Assets = Liabilities + NetWorth (within tolerance)", () => {
    const bs = summarizeBalanceSheet(input);
    expect(Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.netWorth))).toBeLessThanOrEqual(
      0.01,
    );
  });
});

describe("calc: Trial Balance", () => {
  it("debit equals credit when extras balance", () => {
    const bs = summarizeBalanceSheet({
      cash: 100,
      banks: [],
      parties: [],
      loans: [],
      items: [],
    });
    const tb = summarizeTrialBalance(bs);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect(tb.balanced).toBe(true);
  });
  it("includes salary, expense and sales ledgers when given", () => {
    const bs = summarizeBalanceSheet({
      cash: 0,
      banks: [],
      parties: [],
      loans: [],
      items: [],
    });
    const tb = summarizeTrialBalance(bs, {
      salaryExpense: 100,
      expenseTotal: 50,
      salesIncome: 150,
    });
    const accts = tb.rows.map((r) => r.account);
    expect(accts).toContain("Salary Expense");
    expect(accts).toContain("Other Expenses");
    expect(accts).toContain("Sales Income");
    expect(tb.balanced).toBe(true);
  });
});

describe("calc: Day Book", () => {
  it("includes all transaction types and sorts ascending by date", () => {
    const db = buildDayBook({
      payments: [
        {
          payment_date: "2025-01-05",
          direction: "in",
          amount: 100,
          method: "cash",
          status: "posted",
        },
        {
          payment_date: "2025-01-06",
          direction: "out",
          amount: 50,
          method: "bank",
          status: "posted",
        },
      ],
      expenses: [
        {
          expense_date: "2025-01-04",
          amount: 20,
          tax: 5,
          category: "rent",
          payment_method: "cash",
          status: "posted",
        },
      ],
      cashTxns: [
        {
          txn_date: "2025-01-03",
          direction: "in",
          amount: 10,
          category: "owner_drawing",
          status: "posted",
        },
        {
          txn_date: "2025-01-03",
          direction: "out",
          amount: 5,
          category: "payment", // skipped (already in payments)
          status: "posted",
        },
      ],
      loanPayments: [{ payment_date: "2025-01-07", amount: 200, method: "bank", status: "posted" }],
      cheques: [
        {
          cleared_at: "2025-01-08",
          direction: "in",
          amount: 300,
          cheque_number: "123",
          status: "cleared",
        },
      ],
      salaries: [{ payment_date: "2025-01-09", amount: 500, method: "cash", status: "posted" }],
    });
    const types = db.rows.map((r) => r.type);
    expect(types).toContain("Payment In");
    expect(types).toContain("Payment Out");
    expect(types).toContain("Expense");
    expect(types).toContain("owner_drawing");
    expect(types).toContain("Loan Payment");
    expect(types).toContain("Cheque Cleared (In)");
    expect(types).toContain("Salary Payment");
    expect(types).not.toContain("payment"); // category=payment de-duplicated
    // sorted ascending
    const dates = db.rows.map((r) => r.date);
    expect([...dates]).toEqual([...dates].sort());
    expect(db.totalIn).toBe(100 + 10 + 300);
    expect(db.totalOut).toBe(50 + 25 + 200 + 500);
  });
  it("excludes deleted/cancelled across all sources", () => {
    const db = buildDayBook({
      payments: [
        {
          payment_date: "2025-01-01",
          direction: "in",
          amount: 999,
          deleted_at: "x",
          status: "posted",
        },
      ],
      salaries: [{ payment_date: "2025-01-02", amount: 999, status: "cancelled" }],
    });
    expect(db.rows).toHaveLength(0);
    expect(db.totalIn).toBe(0);
    expect(db.totalOut).toBe(0);
  });
});

describe("calc: Party Statement closing balance", () => {
  it("opening + Σdebit − Σcredit = closing", () => {
    const r = closeLedger(100, [
      { date: "2025-01-01", debit: 200 },
      { date: "2025-01-02", credit: 50 },
      { date: "2025-01-03", debit: 30 },
    ]);
    expect(r.totalDebit).toBe(230);
    expect(r.totalCredit).toBe(50);
    expect(r.closing).toBe(280);
    expect(r.sign).toBe("Dr");
  });
  it("returns Cr when negative", () => {
    const r = closeLedger(0, [{ date: "x", credit: 100 }]);
    expect(r.closing).toBe(-100);
    expect(r.sign).toBe("Cr");
  });
});

describe("calc: Cash/Bank running balance", () => {
  it("computes cumulative balance in order", () => {
    const rows = runningBalance(
      [
        { in: 100, out: 0 },
        { in: 0, out: 30 },
        { in: 20, out: 0 },
      ],
      50,
    );
    expect(rows.map((r) => r.balance)).toEqual([150, 120, 140]);
  });
  it("handles opening = 0", () => {
    const rows = runningBalance([{ in: 10, out: 5 }]);
    expect(rows[0].balance).toBe(5);
  });
});

describe("calc: Inventory running balance per item/warehouse", () => {
  it("buckets by item+warehouse and computes running balance", () => {
    const map = inventoryRunningBalance([
      { date: "2025-01-01", item_id: "A", warehouse_id: "W1", qty: 10, status: "posted" },
      { date: "2025-01-02", item_id: "A", warehouse_id: "W1", qty: -3, status: "posted" },
      { date: "2025-01-02", item_id: "A", warehouse_id: "W2", qty: 5, status: "posted" },
      { date: "2025-01-03", item_id: "B", warehouse_id: "W1", qty: 7, status: "posted" },
      { date: "2025-01-04", item_id: "A", warehouse_id: "W1", qty: 999, deleted_at: "x" },
    ]);
    const a1 = map.get("A::W1")!;
    expect(a1.map((r) => r.balance)).toEqual([10, 7]);
    expect(map.get("A::W2")!.map((r) => r.balance)).toEqual([5]);
    expect(map.get("B::W1")!.map((r) => r.balance)).toEqual([7]);
  });
});

describe("calc: deleted/restored records do not double-count", () => {
  it("P&L: restored row counted exactly once", () => {
    const s = summarizePnl({
      sales: [
        {
          total: 100,
          doc_type: "invoice",
          status: "posted",
          deleted_at: null,
          restored_at: "2025-01-05",
        } as any,
      ],
      purchases: [],
      expenses: [],
    });
    expect(s.netSales).toBe(100);
  });
  it("Day Book: deleted row excluded", () => {
    const db = buildDayBook({
      expenses: [
        {
          expense_date: "2025-01-01",
          amount: 9999,
          deleted_at: "x",
          status: "posted",
        } as any,
      ],
    });
    expect(db.rows).toHaveLength(0);
  });
  it("Balance Sheet: deleted bank ignored", () => {
    const bs = summarizeBalanceSheet({
      cash: 0,
      banks: [
        { account_type: "bank", current_balance: 100 },
        { account_type: "bank", current_balance: 999, deleted_at: "x" },
      ],
      parties: [],
      loans: [],
      items: [],
    });
    expect(bs.bankTotal).toBe(100);
  });
  it("Inventory: deleted movement excluded from balance", () => {
    const map = inventoryRunningBalance([
      { date: "2025-01-01", item_id: "X", qty: 50, status: "posted" },
      { date: "2025-01-02", item_id: "X", qty: 999, deleted_at: "x" },
    ]);
    const x = map.get("X::")!;
    expect(x[x.length - 1].balance).toBe(50);
  });
});
