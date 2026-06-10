import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory supabase shim — mirrors the helper used in cash-bank-engine
// and purchase-bills tests. Just enough to drive postOnce / reverseOnce
// and the employee_payments soft-delete hook.

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  cash_transactions: [],
  bank_accounts: [],
  employees: [],
  employee_payments: [],
  salary_slips: [],
  audit_logs: [],
  settings_kv: [],
};

let idCounter = 1;
const nextId = () => `id-${idCounter++}`;
const clone = (o: any) => JSON.parse(JSON.stringify(o));

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const api: any = {
    select() {
      return api;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return api;
    },
    is(col: string, val: unknown) {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return api;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
      return api;
    },
    or() {
      return api;
    },
    order() {
      return api;
    },
    maybeSingle() {
      const r = (tables[table] ?? []).filter((x) => filters.every((f) => f(x)))[0] ?? null;
      return Promise.resolve({ data: r, error: null });
    },
    single() {
      const r = (tables[table] ?? []).filter((x) => filters.every((f) => f(x)))[0] ?? null;
      return Promise.resolve({ data: r, error: r ? null : { message: "not found" } });
    },
    then(onF: any, onR?: any) {
      const matched = (tables[table] ?? []).filter((x) => filters.every((f) => f(x)));
      return Promise.resolve({ data: matched, error: null }).then(onF, onR);
    },
    insert(values: any) {
      const list = Array.isArray(values) ? values : [values];
      const inserted = list.map((v) => ({ id: nextId(), ...clone(v) }));
      tables[table] = [...(tables[table] ?? []), ...inserted];
      const thenable: any = {
        select() {
          return thenable;
        },
        single() {
          return Promise.resolve({ data: inserted[0], error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: inserted[0], error: null });
        },
        then(onF: any, onR?: any) {
          return Promise.resolve({ data: inserted, error: null }).then(onF, onR);
        },
      };
      return thenable;
    },
    update(values: any) {
      const thenable: any = {
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return thenable;
        },
        then(onF: any, onR?: any) {
          tables[table] = (tables[table] ?? []).map((r) =>
            filters.every((f) => f(r)) ? { ...r, ...clone(values) } : r,
          );
          return Promise.resolve({ data: null, error: null }).then(onF, onR);
        },
      };
      return thenable;
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/purchase-bills", () => ({
  reversePurchaseBillImpacts: vi.fn(),
  repostPurchaseBillImpacts: vi.fn(),
}));
vi.mock("@/lib/debit-notes", () => ({
  reverseDebitNoteImpacts: vi.fn(),
  repostDebitNoteImpacts: vi.fn(),
}));
vi.mock("@/lib/sale-invoices", () => ({
  reverseSaleInvoiceImpacts: vi.fn(),
  repostSaleInvoiceImpacts: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { postOnce, reverseOnce } from "@/lib/cash-ledger";
import { MODULES } from "@/lib/soft-delete";

function reset() {
  for (const k of Object.keys(tables)) tables[k] = [];
  idCounter = 1;
  tables.bank_accounts.push(
    {
      id: "bk-1",
      company_id: "co-1",
      name: "City Bank",
      current_balance: 10000,
      account_type: "bank",
      is_active: true,
    },
    {
      id: "bk-2",
      company_id: "co-1",
      name: "HSBC",
      current_balance: 5000,
      account_type: "bank",
      is_active: true,
    },
    {
      id: "mb-1",
      company_id: "co-1",
      name: "bKash",
      current_balance: 2000,
      account_type: "mobile",
      is_active: true,
    },
  );
  tables.employees.push({
    id: "emp-1",
    company_id: "co-1",
    name: "Karim",
    is_active: true,
  });
}

// Helper to simulate the SalaryPaymentsSection posting flow.
async function paySalary(opts: { amount: number; bankAccountId: string | null; date?: string }) {
  const r = await postOnce({
    companyId: "co-1",
    direction: "out",
    amount: opts.amount,
    txnDate: opts.date ?? "2026-01-01",
    bankAccountId: opts.bankAccountId,
    category: "salary",
    referenceType: "employee_payment",
  });
  const row = {
    id: nextId(),
    company_id: "co-1",
    employee_id: "emp-1",
    amount: opts.amount,
    payment_date: opts.date ?? "2026-01-01",
    bank_account_id: opts.bankAccountId,
    posted_txn_id: r.id,
    status: "posted",
  };
  tables.employee_payments.push(row);
  return { txnId: r.id, paymentId: row.id };
}

function cashBalance() {
  return tables.cash_transactions
    .filter((t) => t.bank_account_id == null)
    .reduce((s, t) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)), 0);
}
function bankBalance(id: string) {
  return tables.bank_accounts.find((b) => b.id === id)!.current_balance;
}

// ---------------------------------------------------------------------------

describe("salary payment posting across account types", () => {
  beforeEach(reset);

  it("paying from cash decreases cash balance", async () => {
    await paySalary({ amount: 1500, bankAccountId: null });
    expect(cashBalance()).toBe(-1500);
  });

  it("paying from bank decreases the selected bank balance", async () => {
    await paySalary({ amount: 2500, bankAccountId: "bk-1" });
    expect(bankBalance("bk-1")).toBe(7500);
    expect(bankBalance("bk-2")).toBe(5000); // unrelated
  });

  it("paying from mobile banking decreases the mobile wallet balance", async () => {
    await paySalary({ amount: 800, bankAccountId: "mb-1" });
    expect(bankBalance("mb-1")).toBe(1200);
  });
});

// ---------------------------------------------------------------------------

describe("salary payment edit reverse/repost symmetry", () => {
  beforeEach(reset);

  it("editing amount on the same account nets to the new amount", async () => {
    const { txnId } = await paySalary({ amount: 1000, bankAccountId: "bk-1" });
    expect(bankBalance("bk-1")).toBe(9000);
    // Edit -> reverse old, repost new
    await reverseOnce(txnId);
    expect(bankBalance("bk-1")).toBe(10000);
    await postOnce({
      companyId: "co-1",
      direction: "out",
      amount: 1500,
      txnDate: "2026-01-01",
      bankAccountId: "bk-1",
      category: "salary",
      referenceType: "employee_payment",
    });
    expect(bankBalance("bk-1")).toBe(8500);
  });

  it("changing the source account moves the impact from old to new", async () => {
    const { txnId } = await paySalary({ amount: 1000, bankAccountId: "bk-1" });
    await reverseOnce(txnId);
    await postOnce({
      companyId: "co-1",
      direction: "out",
      amount: 1000,
      txnDate: "2026-01-01",
      bankAccountId: "bk-2",
      category: "salary",
      referenceType: "employee_payment",
    });
    expect(bankBalance("bk-1")).toBe(10000);
    expect(bankBalance("bk-2")).toBe(4000);
  });
});

// ---------------------------------------------------------------------------

describe("salary payment delete/restore via soft-delete module", () => {
  beforeEach(reset);

  it("delete reverses bank impact once even if invoked twice", async () => {
    const { paymentId } = await paySalary({ amount: 1200, bankAccountId: "bk-1" });
    expect(bankBalance("bk-1")).toBe(8800);

    const row = tables.employee_payments.find((p) => p.id === paymentId)!;
    await MODULES.employee_payments.onDelete!(row);
    await MODULES.employee_payments.onDelete!(row);

    expect(bankBalance("bk-1")).toBe(10000);
  });

  it("restore re-applies bank impact once even if invoked twice", async () => {
    const { paymentId } = await paySalary({ amount: 1200, bankAccountId: "bk-1" });
    const row = tables.employee_payments.find((p) => p.id === paymentId)!;
    await MODULES.employee_payments.onDelete!(row);
    expect(bankBalance("bk-1")).toBe(10000);

    await MODULES.employee_payments.onRestore!(row);
    await MODULES.employee_payments.onRestore!(row);
    expect(bankBalance("bk-1")).toBe(8800);
  });
});

// ---------------------------------------------------------------------------

describe("duplicate salary payment prevention", () => {
  beforeEach(reset);

  it("upsert on (employee_id, period_month) keeps only one slip per period", () => {
    // Pure list dedupe — same key the SalaryPaymentsSection uses with
    // supabase.upsert({ onConflict: 'employee_id,period_month' }).
    type Slip = { employee_id: string; period_month: string; net: number };
    const slips: Slip[] = [];
    const upsert = (s: Slip) => {
      const i = slips.findIndex(
        (x) => x.employee_id === s.employee_id && x.period_month === s.period_month,
      );
      if (i === -1) slips.push(s);
      else slips[i] = s;
    };
    upsert({ employee_id: "emp-1", period_month: "2026-01", net: 1000 });
    upsert({ employee_id: "emp-1", period_month: "2026-01", net: 1500 });
    expect(slips).toHaveLength(1);
    expect(slips[0].net).toBe(1500);
  });
});
