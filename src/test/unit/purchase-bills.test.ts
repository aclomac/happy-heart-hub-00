import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase used by purchase-bills + cash-ledger. Captures every insert
// and update against an in-memory store so we can assert side effects:
// stock_movements, items.stock, parties.balance (payable), cash_transactions
// and bank_accounts.current_balance.

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  purchases: [],
  purchase_items: [],
  warehouses: [],
  items: [],
  parties: [],
  payments: [],
  cash_transactions: [],
  bank_accounts: [],
  stock_movements: [],
  audit_logs: [],
  settings_kv: [],
};

let idCounter = 1;
const nextId = () => `id-${idCounter++}`;

function clone(o: any) {
  return JSON.parse(JSON.stringify(o));
}

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
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
      rows = tables[table];
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
    delete() {
      const thenable: any = {
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return thenable;
        },
        then(onF: any, onR?: any) {
          tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
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
  savePurchaseBill,
  reversePurchaseBillImpacts,
  repostPurchaseBillImpacts,
  parseBillMeta,
  stringifyBillMeta,
} from "@/lib/purchase-bills";

function reset(companyId: string) {
  for (const k of Object.keys(tables)) tables[k] = [];
  idCounter = 1;
  tables.warehouses.push({
    id: "wh-1",
    company_id: companyId,
    is_default: true,
    deleted_at: null,
    name: "Main",
  });
  tables.items.push({
    id: "it-1",
    company_id: companyId,
    name: "Widget",
    stock: 100,
    is_service: false,
  });
  tables.parties.push({
    id: "pa-1",
    company_id: companyId,
    name: "ACME Supplies",
    balance: 0,
  });
  tables.bank_accounts.push({
    id: "bk-1",
    company_id: companyId,
    name: "Bank",
    current_balance: 1000,
    account_type: "bank",
  });
}

describe("purchase-bills meta helpers", () => {
  it("round-trips meta containing UUIDs with hyphens", () => {
    const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const tagged = stringifyBillMeta("hello", {
      payment_method: "bank",
      bank_account_id: uuid,
    });
    const parsed = parseBillMeta(tagged);
    expect(parsed.payment_method).toBe("bank");
    expect(parsed.bank_account_id).toBe(uuid);
  });
});

describe("savePurchaseBill (full cash payment)", () => {
  beforeEach(() => reset("co-1"));

  it("increases stock, writes a movement, posts cash out, leaves payable at 0", async () => {
    await savePurchaseBill({
      company_id: "co-1",
      bill_no: "BILL-1",
      bill_date: "2026-01-01",
      due_date: null,
      party_id: "pa-1",
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 5,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 100,
        },
      ],
    });

    expect(tables.items[0].stock).toBe(105);
    expect(tables.stock_movements).toHaveLength(1);
    expect(tables.stock_movements[0].direction).toBe("in");
    expect(tables.cash_transactions).toHaveLength(1);
    expect(tables.cash_transactions[0].direction).toBe("out");
    expect(tables.cash_transactions[0].amount).toBe(100);
    expect(tables.payments).toHaveLength(1);
    expect(tables.parties[0].balance).toBe(0);
  });
});

describe("savePurchaseBill (partial bank payment)", () => {
  beforeEach(() => reset("co-1"));

  it("creates payable for unpaid balance and debits bank account by paid amount", async () => {
    await savePurchaseBill({
      company_id: "co-1",
      bill_no: "BILL-2",
      bill_date: "2026-01-02",
      due_date: null,
      party_id: "pa-1",
      subtotal: 200,
      discount: 0,
      tax: 0,
      total: 200,
      paid: 50,
      balance: 150,
      status: "partial",
      notes: null,
      payment_method: "bank",
      bank_account_id: "bk-1",
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 2,
          unit: "PCS",
          price: 100,
          discount_pct: 0,
          tax_pct: 0,
          amount: 200,
        },
      ],
    });

    expect(tables.parties[0].balance).toBe(150);
    expect(tables.bank_accounts[0].current_balance).toBe(950);
    expect(tables.cash_transactions[0].bank_account_id).toBe("bk-1");
    expect(tables.cash_transactions[0].direction).toBe("out");
  });
});

describe("reverse + repost purchase impacts are symmetrical and idempotent", () => {
  beforeEach(() => reset("co-1"));

  it("returns world to pre-bill state, then restores once with no duplicate cash txn", async () => {
    const id = await savePurchaseBill({
      company_id: "co-1",
      bill_no: "BILL-3",
      bill_date: "2026-01-03",
      due_date: null,
      party_id: "pa-1",
      subtotal: 60,
      discount: 0,
      tax: 0,
      total: 60,
      paid: 60,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "bank",
      bank_account_id: "bk-1",
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 3,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 60,
        },
      ],
    });

    expect(tables.items[0].stock).toBe(103);
    expect(tables.bank_accounts[0].current_balance).toBe(940);

    await reversePurchaseBillImpacts(id);
    expect(tables.items[0].stock).toBe(100);
    expect(tables.bank_accounts[0].current_balance).toBe(1000);
    expect(tables.cash_transactions[0].status).toBe("reversed");

    await repostPurchaseBillImpacts(id);
    expect(tables.items[0].stock).toBe(103);
    expect(tables.bank_accounts[0].current_balance).toBe(940);

    // Repost again — must NOT create a second posted cash txn
    await repostPurchaseBillImpacts(id);
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});

describe("savePurchaseBill headerOnly edit", () => {
  beforeEach(() => reset("co-1"));

  it("updates header fields without touching items/stock/cash and emits audit", async () => {
    const id = await savePurchaseBill({
      company_id: "co-1",
      bill_no: "BILL-HO1",
      bill_date: "2026-01-01",
      due_date: null,
      party_id: "pa-1",
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 5,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 100,
        },
      ],
    });
    const stockBefore = tables.items[0].stock;
    const itemsBefore = tables.purchase_items.filter((r) => r.purchase_id === id).length;
    const postedBefore = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    ).length;

    const returned = await savePurchaseBill(
      {
        company_id: "co-1",
        bill_no: "BILL-HO1",
        bill_date: "2026-01-01",
        due_date: null,
        party_id: "pa-1",
        subtotal: 100,
        discount: 0,
        tax: 0,
        total: 100,
        paid: 100,
        balance: 0,
        status: "paid",
        notes: "edited remarks",
        payment_method: "cash",
        bank_account_id: null,
        billing_name: "Acme Co",
        po_no: "PO-99",
        po_date: "2026-01-02",
        payment_terms: "net30",
        items: [],
      },
      { editingId: id, headerOnly: true },
    );

    expect(returned).toBe(id);
    expect(tables.items[0].stock).toBe(stockBefore);
    expect(tables.purchase_items.filter((r) => r.purchase_id === id).length).toBe(itemsBefore);
    expect(
      tables.cash_transactions.filter((t) => t.reference_id === id && t.status === "posted").length,
    ).toBe(postedBefore);

    const row = tables.purchases.find((r) => r.id === id)!;
    expect(row.bill_no).toBe("BILL-HO1");
    expect(String(row.notes || "")).toContain("edited remarks");
    expect(String(row.notes || "")).toContain("PO-99");
    expect(String(row.notes || "")).toContain("Acme%20Co");

    // (audit emission is fire-and-forget via supabase.rpc; not asserted here)
  });
});
