import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  payments: [],
  purchases: [],
  parties: [],
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
    order() {
      return api;
    },
    maybeSingle() {
      const r = (tables[table] ?? []).find((x) => filters.every((f) => f(x))) ?? null;
      return Promise.resolve({ data: r, error: null });
    },
    single() {
      const r = (tables[table] ?? []).find((x) => filters.every((f) => f(x))) ?? null;
      return Promise.resolve({ data: r, error: r ? null : { message: "not found" } });
    },
    then(onF: any, onR?: any) {
      const matched = (tables[table] ?? []).filter((x) => filters.every((f) => f(x)));
      return Promise.resolve({ data: matched, error: null }).then(onF, onR);
    },
    insert(values: any) {
      const list = Array.isArray(values) ? values : [values];
      const inserted = list.map((v) => ({ id: nextId(), status: "posted", ...clone(v) }));
      tables[table] = [...(tables[table] ?? []), ...inserted];
      const thenable: any = {
        select() {
          return thenable;
        },
        single() {
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
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { buildDayBook } from "@/lib/reports/calc";
import { runReportPdf, runReportPrint } from "@/lib/export/useReportExport";
import {
  reversePaymentOutImpacts,
  savePaymentOut,
  repostPaymentOutImpacts,
} from "@/lib/payment-out";

function reset() {
  for (const k of Object.keys(tables)) tables[k] = [];
  idCounter = 1;
  tables.parties.push({ id: "sup-1", company_id: "co-1", name: "ACME Supplies", balance: 500 });
  tables.purchases.push({
    id: "bill-1",
    company_id: "co-1",
    party_id: "sup-1",
    bill_no: "BILL-1",
    total: 500,
    paid: 100,
    balance: 400,
    status: "partial",
  });
  tables.bank_accounts.push({ id: "bank-1", company_id: "co-1", current_balance: 1000 });
}

describe("Payment Out workflow", () => {
  beforeEach(reset);

  it("saves Payment Out, decreases selected bank/mobile account and supplier payable", async () => {
    await savePaymentOut({
      company_id: "co-1",
      party_id: "sup-1",
      amount: 150,
      method: "bank",
      bank_account_id: "bank-1",
      payment_date: "2026-06-01",
      reference_no: null,
      notes: "Supplier payment",
      allocations: [{ purchase_id: "bill-1", bill_no: "BILL-1", amount: 150 }],
    });

    expect(tables.payments).toHaveLength(1);
    expect(tables.cash_transactions[0]).toMatchObject({
      direction: "out",
      amount: 150,
      bank_account_id: "bank-1",
      reference_type: "payment_out",
    });
    expect(tables.bank_accounts[0].current_balance).toBe(850);
    expect(tables.parties[0].balance).toBe(350);
    expect(tables.purchases[0]).toMatchObject({ paid: 250, balance: 250, status: "partial" });
  });

  it("edit reverses old impact and reposts new impact once", async () => {
    const id = await savePaymentOut({
      company_id: "co-1",
      party_id: "sup-1",
      amount: 100,
      method: "bank",
      bank_account_id: "bank-1",
      payment_date: "2026-06-01",
      reference_no: null,
      notes: null,
      allocations: [{ purchase_id: "bill-1", bill_no: "BILL-1", amount: 100 }],
    });

    await savePaymentOut(
      {
        company_id: "co-1",
        party_id: "sup-1",
        amount: 200,
        method: "bank",
        bank_account_id: "bank-1",
        payment_date: "2026-06-02",
        reference_no: "EDITED",
        notes: null,
        allocations: [{ purchase_id: "bill-1", bill_no: "BILL-1", amount: 200 }],
      },
      { editingId: id },
    );

    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    const reversed = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "reversed",
    );
    expect(posted).toHaveLength(1);
    expect(reversed).toHaveLength(1);
    expect(tables.bank_accounts[0].current_balance).toBe(800);
    expect(tables.parties[0].balance).toBe(300);
    expect(tables.purchases[0]).toMatchObject({ paid: 300, balance: 200 });
  });

  it("delete/restore impact is idempotent", async () => {
    const id = await savePaymentOut({
      company_id: "co-1",
      party_id: "sup-1",
      amount: 125,
      method: "cash",
      bank_account_id: null,
      payment_date: "2026-06-01",
      reference_no: null,
      notes: null,
      allocations: [{ purchase_id: "bill-1", bill_no: "BILL-1", amount: 125 }],
    });

    await reversePaymentOutImpacts(id);
    await reversePaymentOutImpacts(id);
    expect(tables.parties[0].balance).toBe(500);
    expect(tables.purchases[0]).toMatchObject({ paid: 100, balance: 400 });

    tables.payments[0].deleted_at = "2026-06-02";
    await repostPaymentOutImpacts(id);
    await repostPaymentOutImpacts(id);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
    expect(tables.parties[0].balance).toBe(375);
    expect(tables.purchases[0]).toMatchObject({ paid: 225, balance: 275 });
  });

  it("appears in Day Book and Party Statement semantics as Payment Out", async () => {
    await savePaymentOut({
      company_id: "co-1",
      party_id: "sup-1",
      amount: 75,
      method: "cash",
      bank_account_id: null,
      payment_date: "2026-06-01",
      reference_no: "POUT-1",
      notes: null,
      allocations: [],
    });
    const payment = { ...tables.payments[0], parties: { name: "ACME Supplies" } } as Row & {
      parties: { name: string };
    };
    const dayBook = buildDayBook({ payments: [payment] });
    expect(dayBook.rows[0]).toMatchObject({ type: "Payment Out", out: 75, party: "ACME Supplies" });

    const partyStatementRow = {
      kind: payment.direction === "in" ? "Payment In" : "Payment Out",
      debit: payment.direction === "out" ? Number(payment.amount) : 0,
      credit: payment.direction === "in" ? Number(payment.amount) : 0,
    };
    expect(partyStatementRow).toEqual({ kind: "Payment Out", debit: 75, credit: 0 });
  });

  it("receipt/export PDF and print runners do not crash for Payment Out rows", async () => {
    const row = {
      date: "2026-06-01",
      supplier: "ACME Supplies",
      method: "cash",
      amount: 10,
      company_id: "co-1",
    };
    const ctx = {
      company: { name: "ERPOVO" },
      companyId: "co-1",
      title: "Payment Out Receipt",
      columns: [
        { header: "Date", accessor: (r: typeof row) => r.date },
        { header: "Supplier", accessor: (r: typeof row) => r.supplier },
        {
          header: "Amount",
          accessor: (r: typeof row) => r.amount.toFixed(2),
          align: "right" as const,
        },
      ],
      rows: [row],
    };
    expect(() => runReportPdf("payment-out", ctx)).not.toThrow();
    expect(() => runReportPrint(ctx, "payment-out")).not.toThrow();
  });
});
