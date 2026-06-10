/**
 * Pure accounting/report calculation helpers.
 *
 * These functions are intentionally side-effect free and take already-fetched
 * rows so they can be unit tested without a database. Every aggregator
 * applies the same safety filters: soft-delete exclusion, reversed/cancelled
 * exclusion, and restored-once semantics (a row with `restored_at` set is
 * still counted exactly once because it is the same physical row).
 *
 * Used by the reports in `src/routes/app.reports.tsx`, the dashboard cards,
 * and the corresponding unit tests.
 */

export type Soft = {
  deleted_at?: string | null;
  reversed_at?: string | null;
  status?: string | null;
  income_date?: string | null;
};

/** A row is "live" if it has not been soft-deleted. */
export function isLive<T extends Soft>(r: T): boolean {
  return !r.deleted_at;
}

/** A row counts toward monetary totals only if posted (not reversed/cancelled). */
export function isPosted<T extends Soft>(r: T): boolean {
  if (!isLive(r)) return false;
  if (r.reversed_at) return false;
  const s = (r.status ?? "").toLowerCase();
  if (s === "cancelled" || s === "reversed" || s === "void") return false;
  return true;
}

/** Filter to live + posted rows in one pass. */
export function postedOnly<T extends Soft>(rows: readonly T[] | null | undefined): T[] {
  return (rows ?? []).filter(isPosted);
}

/** Safe number coercion. */
export function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** Sum a numeric field across rows. */
export function sumBy<T>(rows: readonly T[], pick: (r: T) => unknown): number {
  let acc = 0;
  for (const r of rows) acc += n(pick(r));
  return acc;
}

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------

export interface PnlInput {
  /** sales rows with at least { total, doc_type, status?, deleted_at?, reversed_at? } */
  sales: ReadonlyArray<{ total?: unknown; doc_type?: string | null } & Soft>;
  /** purchases rows with { total, doc_type, status?, ... } */
  purchases: ReadonlyArray<{ total?: unknown; doc_type?: string | null } & Soft>;
  /** expense rows with { amount, tax?, category? } */
  expenses: ReadonlyArray<{ amount?: unknown; tax?: unknown; category?: string | null } & Soft>;
  /** salary/employee payment rows (counted as expense) */
  salaries?: ReadonlyArray<{ amount?: unknown } & Soft>;
  /** optional damage/loss stock adjustments (counted as expense) */
  damageLoss?: ReadonlyArray<{ amount?: unknown } & Soft>;
  /** other income rows with { amount, income_date, category_id, ... } */
  otherIncome?: ReadonlyArray<{ amount?: unknown; category_id?: string | null } & Soft>;
  /** marketing costs rows with { amount, date, status?, ... } */
  marketingCosts?: ReadonlyArray<{ amount?: unknown } & Soft>;
}

export interface PnlSummary {
  grossSales: number;
  salesReturns: number;
  netSales: number;
  grossPurchases: number;
  purchaseReturns: number;
  netPurchase: number;
  /** Alias for netPurchase – COGS is treated as net purchase when no separate valuation. */
  cogs: number;
  expTotal: number;
  salaryTotal: number;
  damageLossTotal: number;
  /** expenses grouped by category (excluding salary/damage which sit in their own buckets). */
  expByCat: Record<string, number>;
  otherIncomeTotal: number;
  grossProfit: number;
  netProfit: number;
}

export function summarizePnl(input: PnlInput): PnlSummary {
  const sales = postedOnly(input.sales);
  const purchases = postedOnly(input.purchases);
  const expenses = postedOnly(input.expenses);
  const salaries = postedOnly(input.salaries ?? []);
  const damage = postedOnly(input.damageLoss ?? []);
  const otherInc = postedOnly(input.otherIncome ?? []);
  const marketing = postedOnly(input.marketingCosts ?? []);

  const isInvoice = (r: { doc_type?: string | null }) => !r.doc_type || r.doc_type === "invoice";
  const isCreditNote = (r: { doc_type?: string | null }) => r.doc_type === "credit_note";
  const isBill = (r: { doc_type?: string | null }) => !r.doc_type || r.doc_type === "bill";
  const isDebitNote = (r: { doc_type?: string | null }) => r.doc_type === "debit_note";

  const grossSales = sumBy(sales.filter(isInvoice), (r) => r.total);
  const salesReturns = sumBy(sales.filter(isCreditNote), (r) => r.total);
  const netSales = grossSales - salesReturns;

  const grossPurchases = sumBy(purchases.filter(isBill), (r) => r.total);
  const purchaseReturns = sumBy(purchases.filter(isDebitNote), (r) => r.total);
  const netPurchase = grossPurchases - purchaseReturns;

  const expByCat: Record<string, number> = {};
  for (const e of expenses) {
    const key = (e.category ?? "uncategorised") as string;
    expByCat[key] = (expByCat[key] || 0) + n(e.amount) + n(e.tax);
  }
  
  const expTotal = Object.values(expByCat).reduce((s, v) => s + v, 0);
  const salaryTotal = sumBy(salaries, (r) => r.amount);
  const damageLossTotal = sumBy(damage, (r) => r.amount);
  const otherIncomeTotal = sumBy(otherInc, (r) => r.amount);

  const grossProfit = netSales - netPurchase;
  const netProfit = grossProfit + otherIncomeTotal - expTotal - salaryTotal - damageLossTotal;

  return {
    grossSales,
    salesReturns,
    netSales,
    grossPurchases,
    purchaseReturns,
    netPurchase,
    cogs: netPurchase,
    expTotal,
    salaryTotal,
    damageLossTotal,
    otherIncomeTotal,
    expByCat,
    grossProfit,
    netProfit,
  };
}

// ---------------------------------------------------------------------------
// Stock valuation (safe fallback)
// ---------------------------------------------------------------------------

export interface StockItem extends Soft {
  stock?: unknown;
  purchase_price?: unknown;
  sale_price?: unknown;
  is_service?: boolean | null;
}

/** Per-item value with `purchase_price → sale_price → 0` fallback. */
export function itemValue(i: StockItem): number {
  const qty = n(i.stock);
  const price = n(i.purchase_price) || n(i.sale_price);
  return qty * price;
}

export function stockValueOf(items: readonly StockItem[]): number {
  return items
    .filter(isLive)
    .filter((i) => !i.is_service)
    .reduce((s, i) => s + itemValue(i), 0);
}

// ---------------------------------------------------------------------------
// Balance Sheet & Trial Balance
// ---------------------------------------------------------------------------

export interface BalanceSheetInput {
  cash: number;
  banks: ReadonlyArray<{ account_type?: string | null; current_balance?: unknown } & Soft>;
  parties: ReadonlyArray<{ type?: string | null; balance?: unknown } & Soft>;
  loans: ReadonlyArray<{ counterparty_type?: string | null; outstanding?: unknown } & Soft>;
  items: readonly StockItem[];
  openingEquity?: number;
}

export interface BalanceSheetSummary {
  cash: number;
  bankTotal: number;
  mobileTotal: number;
  receivables: number;
  payables: number;
  stockValue: number;
  loanReceivable: number;
  loanPayable: number;
  openingEquity: number;
  totalAssets: number;
  totalLiabilities: number;
  /** netWorth = totalAssets − totalLiabilities. */
  netWorth: number;
}

export function summarizeBalanceSheet(input: BalanceSheetInput): BalanceSheetSummary {
  const banks = (input.banks ?? []).filter(isLive);
  const parties = (input.parties ?? []).filter(isLive);
  const loans = (input.loans ?? []).filter(isLive);

  const bankTotal = sumBy(
    banks.filter((b) => (b.account_type ?? "bank") !== "mobile"),
    (b) => b.current_balance,
  );
  const mobileTotal = sumBy(
    banks.filter((b) => b.account_type === "mobile"),
    (b) => b.current_balance,
  );

  const receivables = sumBy(
    parties.filter((p) => p.type === "customer" && n(p.balance) > 0),
    (p) => p.balance,
  );
  const payables = sumBy(
    parties.filter((p) => p.type === "supplier" && n(p.balance) > 0),
    (p) => p.balance,
  );

  const loanReceivable = sumBy(
    loans.filter((l) => l.counterparty_type === "receivable"),
    (l) => l.outstanding,
  );
  const loanPayable = sumBy(
    loans.filter((l) => l.counterparty_type !== "receivable"),
    (l) => l.outstanding,
  );

  const stockValue = stockValueOf(input.items ?? []);
  const openingEquity = n(input.openingEquity);

  const cash = n(input.cash);
  const totalAssets = cash + bankTotal + mobileTotal + receivables + loanReceivable + stockValue;
  const totalLiabilities = payables + loanPayable + openingEquity;

  return {
    cash,
    bankTotal,
    mobileTotal,
    receivables,
    payables,
    stockValue,
    loanReceivable,
    loanPayable,
    openingEquity,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}

export interface TrialRow {
  account: string;
  debit: number;
  credit: number;
}

export interface TrialBalanceSummary {
  rows: TrialRow[];
  totalDebit: number;
  totalCredit: number;
  /** True if |Σdebit − Σcredit| ≤ 0.01. */
  balanced: boolean;
}

export function summarizeTrialBalance(
  bs: BalanceSheetSummary,
  extras: { salaryExpense?: number; expenseTotal?: number; salesIncome?: number } = {},
): TrialBalanceSummary {
  const rows: TrialRow[] = [
    { account: "Cash In Hand", debit: bs.cash, credit: 0 },
    { account: "Bank Accounts", debit: bs.bankTotal, credit: 0 },
    { account: "Mobile Banking", debit: bs.mobileTotal, credit: 0 },
    { account: "Accounts Receivable", debit: bs.receivables, credit: 0 },
    { account: "Loans Receivable", debit: bs.loanReceivable, credit: 0 },
    { account: "Stock / Inventory", debit: bs.stockValue, credit: 0 },
    { account: "Accounts Payable", debit: 0, credit: bs.payables },
    { account: "Loans Payable", debit: 0, credit: bs.loanPayable },
    { account: "Equity / Net Worth", debit: 0, credit: bs.netWorth },
  ];
  const salary = n(extras.salaryExpense);
  const expense = n(extras.expenseTotal);
  const sales = n(extras.salesIncome);
  if (salary) rows.push({ account: "Salary Expense", debit: salary, credit: 0 });
  if (expense) rows.push({ account: "Other Expenses", debit: expense, credit: 0 });
  if (sales) rows.push({ account: "Sales Income", debit: 0, credit: sales });
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return { rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) <= 0.01 };
}

// ---------------------------------------------------------------------------
// Day Book
// ---------------------------------------------------------------------------

export interface DayBookRow {
  date: string;
  type: string;
  party: string;
  ref: string;
  method: string;
  in: number;
  out: number;
  /**
   * Drill-down hints. `refKind` is one of the kinds understood by
   * `resolveReportDrilldown`. `refId` is the source row id. Both are
   * optional — when missing the row is rendered as non-clickable.
   */
  refKind?:
    | "payment_in"
    | "payment_out"
    | "expense"
    | "cheque"
    | "loan_payment"
    | "cash_transfer"
    | "bank_transfer"
    | "mobile_transfer"
    | "salary_payment";
  refId?: string | null;
}

export interface DayBookInput {
  payments?: ReadonlyArray<
    {
      id?: string | null;
      payment_date?: string;
      direction?: "in" | "out";
      amount?: unknown;
      method?: string;
      reference_no?: string | null;
      parties?: { name?: string | null } | null;
    } & Soft
  >;
  expenses?: ReadonlyArray<
    {
      id?: string | null;
      expense_date?: string;
      amount?: unknown;
      tax?: unknown;
      category?: string | null;
      vendor?: string | null;
      payment_method?: string;
    } & Soft
  >;
  cashTxns?: ReadonlyArray<
    {
      id?: string | null;
      txn_date?: string;
      direction?: "in" | "out";
      amount?: unknown;
      category?: string | null;
      notes?: string | null;
      bank_account_id?: string | null;
      reference_type?: string | null;
    } & Soft
  >;
  loanPayments?: ReadonlyArray<
    {
      id?: string | null;
      payment_date?: string;
      amount?: unknown;
      method?: string;
      notes?: string | null;
    } & Soft
  >;
  cheques?: ReadonlyArray<
    {
      id?: string | null;
      cleared_at?: string | null;
      direction?: "in" | "out";
      amount?: unknown;
      cheque_number?: string;
      status?: string | null;
    } & Soft
  >;
  salaries?: ReadonlyArray<
    {
      id?: string | null;
      payment_date?: string;
      amount?: unknown;
      method?: string;
      notes?: string | null;
      employees?: { name?: string | null } | null;
    } & Soft
  >;
  otherIncomes?: ReadonlyArray<
    {
      id?: string | null;
      income_date?: string;
      amount?: unknown;
      notes?: string | null;
      other_income_categories?: { name?: string | null } | null;
      bank_account_id?: string | null;
    } & Soft
  >;
}

export function buildDayBook(input: DayBookInput): {
  rows: DayBookRow[];
  totalIn: number;
  totalOut: number;
} {
  const rows: DayBookRow[] = [];
  for (const p of postedOnly(input.payments ?? [])) {
    rows.push({
      date: p.payment_date ?? "",
      type: p.direction === "in" ? "Payment In" : "Payment Out",
      party: p.parties?.name ?? "—",
      ref: p.reference_no ?? "—",
      method: p.method ?? "",
      in: p.direction === "in" ? n(p.amount) : 0,
      out: p.direction === "out" ? n(p.amount) : 0,
      refKind: p.direction === "in" ? "payment_in" : "payment_out",
      refId: p.id ?? null,
    });
  }
  for (const e of postedOnly(input.expenses ?? [])) {
    rows.push({
      date: e.expense_date ?? "",
      type: "Expense",
      party: e.vendor ?? e.category ?? "—",
      ref: e.category ?? "—",
      method: e.payment_method ?? "",
      in: 0,
      out: n(e.amount) + n(e.tax),
      refKind: "expense",
      refId: e.id ?? null,
    });
  }
  for (const t of postedOnly(input.cashTxns ?? [])) {
    if (t.reference_type === "payment" || t.reference_type === "expense") continue;
    if (t.category === "payment" || t.category === "expense") continue;
    rows.push({
      date: t.txn_date ?? "",
      type: t.category || (t.direction === "in" ? "Cash In" : "Cash Out"),
      party: t.notes ?? "—",
      ref: t.bank_account_id ? "bank" : "cash",
      method: t.bank_account_id ? "bank" : "cash",
      in: t.direction === "in" ? n(t.amount) : 0,
      out: t.direction === "out" ? n(t.amount) : 0,
      // No detail route for cash/bank transfer rows yet — keep non-clickable.
      refKind: t.bank_account_id ? "bank_transfer" : "cash_transfer",
      refId: t.id ?? null,
    });
  }
  for (const lp of postedOnly(input.loanPayments ?? [])) {
    rows.push({
      date: lp.payment_date ?? "",
      type: "Loan Payment",
      party: lp.notes ?? "Loan",
      ref: "loan",
      method: lp.method ?? "",
      in: 0,
      out: n(lp.amount),
      refKind: "loan_payment",
      refId: lp.id ?? null,
    });
  }
  for (const c of postedOnly(input.cheques ?? [])) {
    if (c.status !== "cleared") continue;
    rows.push({
      date: c.cleared_at ?? "",
      type: c.direction === "in" ? "Cheque Cleared (In)" : "Cheque Cleared (Out)",
      party: `Cheque #${c.cheque_number ?? ""}`,
      ref: "cheque",
      method: "bank",
      in: c.direction === "in" ? n(c.amount) : 0,
      out: c.direction === "out" ? n(c.amount) : 0,
      refKind: "cheque",
      refId: c.id ?? null,
    });
  }
  for (const s of postedOnly(input.salaries ?? [])) {
    rows.push({
      date: s.payment_date ?? "",
      type: "Salary Payment",
      party: s.employees?.name ?? s.notes ?? "Employee",
      ref: "salary",
      method: s.method ?? "",
      in: 0,
      out: n(s.amount),
      refKind: "salary_payment",
      refId: s.id ?? null,
    });
  }
  for (const oi of postedOnly(input.otherIncomes ?? [])) {
    rows.push({
      date: oi.income_date ?? "",
      type: "Other Income",
      party: oi.other_income_categories?.name ?? "—",
      ref: oi.notes ?? "—",
      method: oi.bank_account_id ? "bank" : "cash",
      in: n(oi.amount),
      out: 0,
      refKind: "other_income" as any, // assuming navigation to other-income exists or will exist
      refId: oi.id ?? null,
    });
  }
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  const totalIn = rows.reduce((s, r) => s + r.in, 0);
  const totalOut = rows.reduce((s, r) => s + r.out, 0);
  return { rows, totalIn, totalOut };
}

// ---------------------------------------------------------------------------
// Statement helpers (party + cash/bank)
// ---------------------------------------------------------------------------

export interface LedgerRow {
  date: string;
  debit?: number;
  credit?: number;
}

/**
 * Compute closing balance from opening + Σdebit − Σcredit.
 * Returns { debit, credit, balance, sign } where `sign` is 'Dr' or 'Cr'.
 */
export function closeLedger(
  opening: number,
  rows: readonly LedgerRow[],
): {
  totalDebit: number;
  totalCredit: number;
  closing: number;
  sign: "Dr" | "Cr";
} {
  const totalDebit = sumBy(rows, (r) => r.debit);
  const totalCredit = sumBy(rows, (r) => r.credit);
  const closing = n(opening) + totalDebit - totalCredit;
  return { totalDebit, totalCredit, closing, sign: closing >= 0 ? "Dr" : "Cr" };
}

/** Running balance: opening + cumulative (in − out) for each row, in order. */
export function runningBalance<T extends { in?: number; out?: number }>(
  rows: readonly T[],
  opening = 0,
): (T & { balance: number })[] {
  let bal = n(opening);
  const out: (T & { balance: number })[] = [];
  for (const r of rows) {
    bal += n(r.in) - n(r.out);
    out.push({ ...r, balance: bal });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inventory movement
// ---------------------------------------------------------------------------

export interface StockMovementRow extends Soft {
  date: string;
  item_id: string;
  warehouse_id?: string | null;
  /** Positive for stock-in, negative for stock-out. */
  qty: number;
}

/**
 * Per (item, warehouse) running stock balance. Excludes deleted/reversed rows.
 * Sorted by date ascending within each bucket.
 */
export function inventoryRunningBalance(
  rows: readonly StockMovementRow[],
): Map<string, (StockMovementRow & { balance: number })[]> {
  const live = postedOnly(rows);
  const buckets = new Map<string, StockMovementRow[]>();
  for (const r of live) {
    const k = `${r.item_id}::${r.warehouse_id ?? ""}`;
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const out = new Map<string, (StockMovementRow & { balance: number })[]>();
  for (const [k, arr] of buckets) {
    arr.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
    let bal = 0;
    out.set(
      k,
      arr.map((r) => {
        bal += n(r.qty);
        return { ...r, balance: bal };
      }),
    );
  }
  return out;
}
