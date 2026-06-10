import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared in-memory supabase shim — same pattern as purchase-bills / expenses
// tests. Tracks cash_transactions + bank_accounts + a few read-back tables
// so we can drive postOnce / reverseOnce / soft-delete hooks end-to-end.

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  cash_transactions: [],
  bank_accounts: [],
  bank_transfers: [],
  cheques: [],
  loans: [],
  loan_payments: [],
  cash_reconciliations: [],
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
// soft-delete imports several heavy posting engines — stub them out so this
// test stays focused on the cash/bank hooks under test.
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
      current_balance: 1000,
      account_type: "bank",
      is_active: true,
    },
    {
      id: "bk-2",
      company_id: "co-1",
      name: "HSBC",
      current_balance: 500,
      account_type: "bank",
      is_active: true,
    },
    {
      id: "mb-1",
      company_id: "co-1",
      name: "bKash",
      current_balance: 300,
      account_type: "mobile",
      is_active: true,
    },
  );
}

// ---------------------------------------------------------------------------
// Cash + bank + mobile direct impact via postOnce.
// ---------------------------------------------------------------------------

describe("cash/bank/mobile postOnce balance impact", () => {
  beforeEach(reset);

  it("cash-in / cash-out / bank deposit / bank withdraw / mobile transfer all post once", async () => {
    await postOnce({
      companyId: "co-1",
      direction: "in",
      amount: 200,
      txnDate: "2026-01-01",
      bankAccountId: null,
      category: "cash-in",
      referenceType: "manual",
    });
    await postOnce({
      companyId: "co-1",
      direction: "out",
      amount: 50,
      txnDate: "2026-01-01",
      bankAccountId: null,
      category: "cash-out",
      referenceType: "manual",
    });
    await postOnce({
      companyId: "co-1",
      direction: "in",
      amount: 400,
      txnDate: "2026-01-01",
      bankAccountId: "bk-1",
      category: "deposit",
      referenceType: "manual",
    });
    await postOnce({
      companyId: "co-1",
      direction: "out",
      amount: 100,
      txnDate: "2026-01-01",
      bankAccountId: "bk-1",
      category: "withdraw",
      referenceType: "manual",
    });
    await postOnce({
      companyId: "co-1",
      direction: "in",
      amount: 75,
      txnDate: "2026-01-01",
      bankAccountId: "mb-1",
      category: "mobile-in",
      referenceType: "manual",
    });

    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1300);
    expect(tables.bank_accounts.find((b) => b.id === "mb-1")!.current_balance).toBe(375);
    const cash = tables.cash_transactions.filter((t) => t.bank_account_id == null);
    const cashNet = cash.reduce(
      (s, t) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)),
      0,
    );
    expect(cashNet).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// reverseOnce idempotency: balance must move at most once.
// ---------------------------------------------------------------------------

describe("reverseOnce is idempotent", () => {
  beforeEach(reset);

  it("double-reversing a posted txn only unwinds the bank balance once", async () => {
    const r = await postOnce({
      companyId: "co-1",
      direction: "out",
      amount: 200,
      txnDate: "2026-01-01",
      bankAccountId: "bk-1",
      referenceType: "manual",
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(800);
    await reverseOnce(r.id);
    await reverseOnce(r.id);
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Bank-transfer double-entry symmetry + delete/restore idempotency.
// Wraps the soft-delete onDelete / onRestore hooks added in this phase.
// ---------------------------------------------------------------------------

async function recordTransfer(opts: {
  fromBank: string | null;
  toBank: string | null;
  fromKind: string;
  toKind: string;
  amount: number;
}) {
  const xferId = nextId();
  tables.bank_transfers.push({
    id: xferId,
    company_id: "co-1",
    transfer_date: "2026-01-01",
    amount: opts.amount,
    from_kind: opts.fromKind,
    to_kind: opts.toKind,
    from_bank_id: opts.fromBank,
    to_bank_id: opts.toBank,
    status: "posted",
    notes: null,
  });
  await postOnce({
    companyId: "co-1",
    bankAccountId: opts.fromBank,
    direction: "out",
    amount: opts.amount,
    txnDate: "2026-01-01",
    category: "transfer",
    referenceType: "bank_transfer_from",
    referenceId: xferId,
  });
  await postOnce({
    companyId: "co-1",
    bankAccountId: opts.toBank,
    direction: "in",
    amount: opts.amount,
    txnDate: "2026-01-01",
    category: "transfer",
    referenceType: "bank_transfer_to",
    referenceId: xferId,
  });
  return xferId;
}

describe("bank transfer double-entry symmetry", () => {
  beforeEach(reset);

  it("c2b: cash decreases, bank increases by the same amount", async () => {
    await recordTransfer({
      fromBank: null,
      toBank: "bk-1",
      fromKind: "cash",
      toKind: "bank",
      amount: 100,
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1100);
    const cashNet = tables.cash_transactions
      .filter((t) => t.bank_account_id == null)
      .reduce((s, t) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)), 0);
    expect(cashNet).toBe(-100);
  });

  it("b2b: source down, destination up", async () => {
    await recordTransfer({
      fromBank: "bk-1",
      toBank: "bk-2",
      fromKind: "bank",
      toKind: "bank",
      amount: 250,
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(750);
    expect(tables.bank_accounts.find((b) => b.id === "bk-2")!.current_balance).toBe(750);
  });

  it("bank↔mobile keeps both account-type balances symmetric", async () => {
    await recordTransfer({
      fromBank: "bk-1",
      toBank: "mb-1",
      fromKind: "bank",
      toKind: "mobile",
      amount: 100,
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(900);
    expect(tables.bank_accounts.find((b) => b.id === "mb-1")!.current_balance).toBe(400);
  });
});

describe("bank_transfers soft-delete + restore is idempotent", () => {
  beforeEach(reset);

  it("delete reverses both legs once; restore re-applies both legs once even if called twice", async () => {
    const xferId = await recordTransfer({
      fromBank: "bk-1",
      toBank: "bk-2",
      fromKind: "bank",
      toKind: "bank",
      amount: 200,
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(800);
    expect(tables.bank_accounts.find((b) => b.id === "bk-2")!.current_balance).toBe(700);

    const row = tables.bank_transfers.find((t) => t.id === xferId)!;
    await MODULES.bank_transfers.onDelete!(row);
    await MODULES.bank_transfers.onDelete!(row); // second call must be a no-op
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1000);
    expect(tables.bank_accounts.find((b) => b.id === "bk-2")!.current_balance).toBe(500);

    await MODULES.bank_transfers.onRestore!(row);
    await MODULES.bank_transfers.onRestore!(row); // second restore must dedupe
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(800);
    expect(tables.bank_accounts.find((b) => b.id === "bk-2")!.current_balance).toBe(700);
    const postedLegs = tables.cash_transactions.filter(
      (t) =>
        t.reference_id === xferId &&
        t.status === "posted" &&
        (t.reference_type === "bank_transfer_from" || t.reference_type === "bank_transfer_to"),
    );
    expect(postedLegs).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cheque clear → bounce reverses bank balance exactly once.
// ---------------------------------------------------------------------------

describe("cheque clear + bounce reverse bank impact once", () => {
  beforeEach(reset);

  it("clearing an inbound cheque deposits to bank; bouncing it withdraws back to zero net", async () => {
    const chequeId = nextId();
    tables.cheques.push({
      id: chequeId,
      company_id: "co-1",
      direction: "in",
      amount: 500,
      bank_account_id: "bk-1",
      cheque_number: "CHQ-1",
      cheque_date: "2026-01-01",
      status: "pending",
    });

    // Clear
    const r = await postOnce({
      companyId: "co-1",
      bankAccountId: "bk-1",
      direction: "in",
      amount: 500,
      txnDate: "2026-01-02",
      category: "cheque-cleared",
      referenceType: "cheque_clear",
      referenceId: chequeId,
    });
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1500);

    // Bounce → reverse the clear leg
    await reverseOnce(r.id);
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1000);

    // Double-bounce is a no-op
    await reverseOnce(r.id);
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Loan payment outstanding update via soft-delete onDelete / onRestore.
// ---------------------------------------------------------------------------

describe("loan_payments delete/restore keeps outstanding balance correct", () => {
  beforeEach(reset);

  it("delete adds payment back to outstanding; restore subtracts again exactly once", async () => {
    tables.loans.push({
      id: "ln-1",
      company_id: "co-1",
      lender_name: "ABC",
      outstanding: 1000,
      status: "active",
    });
    const loanPaymentId = nextId();
    tables.loan_payments.push({
      id: loanPaymentId,
      loan_id: "ln-1",
      company_id: "co-1",
      amount: 200,
      payment_date: "2026-01-01",
      bank_account_id: "bk-1",
      method: "bank",
      status: "posted",
    });
    const r = await postOnce({
      companyId: "co-1",
      bankAccountId: "bk-1",
      direction: "out",
      amount: 200,
      txnDate: "2026-01-01",
      category: "loan-payment",
      referenceType: "loan_payment",
      referenceId: loanPaymentId,
    });
    tables.loan_payments.find((p) => p.id === loanPaymentId)!.posted_txn_id = r.id;
    // Simulate that the UI also reduced outstanding when the payment was made.
    tables.loans.find((l) => l.id === "ln-1")!.outstanding = 800;
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(800);

    const row = tables.loan_payments.find((p) => p.id === loanPaymentId)!;
    await MODULES.loan_payments.onDelete!(row);
    expect(tables.loans.find((l) => l.id === "ln-1")!.outstanding).toBe(1000);
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(1000);

    await MODULES.loan_payments.onRestore!(row);
    expect(tables.loans.find((l) => l.id === "ln-1")!.outstanding).toBe(800);
    expect(tables.bank_accounts.find((b) => b.id === "bk-1")!.current_balance).toBe(800);

    // Restore again → idempotent (postOnce dedupes by reference id; outstanding
    // would only drop again if we re-ran the subtraction, so we expect no change).
    await MODULES.loan_payments.onRestore!(row);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === loanPaymentId && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Reconciliation adjustment reverse + repost.
// ---------------------------------------------------------------------------

describe("cash_reconciliations delete/restore re-applies adjustment once", () => {
  beforeEach(reset);

  it("delete reverses the adjustment leg; restore re-posts it once", async () => {
    const reconId = nextId();
    const adj = await postOnce({
      companyId: "co-1",
      direction: "in",
      amount: 50,
      txnDate: "2026-01-01",
      category: "Reconciliation Adjustment",
      bankAccountId: null,
      referenceType: "reconciliation",
      referenceId: reconId,
    });
    tables.cash_reconciliations.push({
      id: reconId,
      company_id: "co-1",
      recon_date: "2026-01-01",
      difference: 50,
      status: "posted",
      adjustment_txn_id: adj.id,
    });
    // Cash net so far is +50 (recon adjustment).
    const cashNet = () =>
      tables.cash_transactions
        .filter((t) => t.bank_account_id == null && t.status === "posted")
        .reduce((s, t) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)), 0);
    expect(cashNet()).toBe(50);

    const row = tables.cash_reconciliations.find((r) => r.id === reconId)!;
    await MODULES.cash_reconciliations.onDelete!(row);
    expect(cashNet()).toBe(0);

    await MODULES.cash_reconciliations.onRestore!(row);
    await MODULES.cash_reconciliations.onRestore!(row);
    expect(cashNet()).toBe(50);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === reconId && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});
