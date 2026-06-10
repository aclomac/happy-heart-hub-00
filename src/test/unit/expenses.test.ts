import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory supabase shim, mirroring the purchase-bills test harness so
// expense save/edit/reverse/repost can be exercised end-to-end without a
// real database. Tracks expenses, cash_transactions and bank_accounts so
// we can assert the cash ledger stays in sync.

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  expenses: [],
  cash_transactions: [],
  bank_accounts: [],
  settings_kv: [],
  audit_logs: [],
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

import {
  saveExpense,
  updateExpense,
  reverseExpenseImpact,
  repostExpenseImpact,
  parseExpenseMeta,
  stringifyExpenseMeta,
} from "@/lib/expenses";

function reset() {
  for (const k of Object.keys(tables)) tables[k] = [];
  idCounter = 1;
  tables.bank_accounts.push({
    id: "bk-1",
    company_id: "co-1",
    name: "City Bank",
    current_balance: 1000,
    account_type: "bank",
    is_active: true,
  });
}

function basePayload(over: Partial<Parameters<typeof saveExpense>[0]> = {}) {
  return {
    company_id: "co-1",
    expense_no: "EXP-0001",
    expense_date: "2026-01-01",
    category: "Rent",
    category_id: "cat-1",
    vendor: null,
    store: null,
    amount: 100,
    tax: 0,
    payment_method: "cash",
    bank_account_id: null,
    notes: null,
    attachment_url: null,
    is_recurring: false,
    recurrence: null,
    ...over,
  };
}

describe("expense meta helpers", () => {
  it("round-trips meta containing UUIDs with hyphens", () => {
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const s = stringifyExpenseMeta("note", { payment_method: "bank", bank_account_id: uuid });
    const m = parseExpenseMeta(s);
    expect(m.payment_method).toBe("bank");
    expect(m.bank_account_id).toBe(uuid);
  });
});

describe("saveExpense cash/bank/mobile impact", () => {
  beforeEach(reset);

  it("cash expense posts cash-out and stores posted_txn_id", async () => {
    const id = await saveExpense(basePayload({ amount: 50, tax: 5, payment_method: "cash" }));
    expect(tables.cash_transactions).toHaveLength(1);
    const t = tables.cash_transactions[0];
    expect(t.direction).toBe("out");
    expect(t.amount).toBe(55);
    expect(t.bank_account_id).toBeNull();
    expect(t.reference_type).toBe("expense");
    expect(t.reference_id).toBe(id);
    expect(tables.expenses[0].posted_txn_id).toBe(t.id);
  });

  it("bank expense debits the selected bank account once", async () => {
    await saveExpense(
      basePayload({ amount: 200, payment_method: "bank", bank_account_id: "bk-1" }),
    );
    expect(tables.bank_accounts[0].current_balance).toBe(800);
    expect(tables.cash_transactions).toHaveLength(1);
    expect(tables.cash_transactions[0].bank_account_id).toBe("bk-1");
  });

  it("mobile expense debits the selected mobile account once", async () => {
    tables.bank_accounts.push({
      id: "mb-1",
      company_id: "co-1",
      name: "bKash",
      current_balance: 500,
      account_type: "mobile",
      is_active: true,
    });
    await saveExpense(
      basePayload({ amount: 75, payment_method: "mobile", bank_account_id: "mb-1" }),
    );
    expect(tables.bank_accounts.find((b) => b.id === "mb-1")!.current_balance).toBe(425);
  });
});

describe("updateExpense reverse + repost symmetry", () => {
  beforeEach(reset);

  it("editing amount/account does not double-debit the bank", async () => {
    const id = await saveExpense(
      basePayload({ amount: 100, payment_method: "bank", bank_account_id: "bk-1" }),
    );
    expect(tables.bank_accounts[0].current_balance).toBe(900);

    await updateExpense(
      id,
      basePayload({ amount: 150, payment_method: "bank", bank_account_id: "bk-1" }),
    );
    // Old 100 reversed (+100), new 150 posted (-150) => net 950.
    expect(tables.bank_accounts[0].current_balance).toBe(850);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
    expect(posted[0].amount).toBe(150);
  });
});

describe("reverse + repost expense impact is idempotent", () => {
  beforeEach(reset);

  it("delete reverses once, restore reposts once even if called twice", async () => {
    const id = await saveExpense(
      basePayload({ amount: 80, payment_method: "bank", bank_account_id: "bk-1" }),
    );
    expect(tables.bank_accounts[0].current_balance).toBe(920);

    await reverseExpenseImpact(id);
    await reverseExpenseImpact(id);
    expect(tables.bank_accounts[0].current_balance).toBe(1000);
    expect(tables.cash_transactions[0].status).toBe("reversed");

    await repostExpenseImpact(id);
    await repostExpenseImpact(id);
    expect(tables.bank_accounts[0].current_balance).toBe(920);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});
