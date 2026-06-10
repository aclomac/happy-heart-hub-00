import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client used by sale-invoices.ts. We capture every
// insert / update / select call against an in-memory store so we can assert
// the side-effects (stock_movements, cash_transactions, parties.balance,
// items.stock) that the helper SHOULD produce.

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {
  sales: [],
  sale_items: [],
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
  let pending: { kind: "insert" | "update" | "delete"; values?: any } | null = null;
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
      const r = rows.filter((x) => filters.every((f) => f(x)))[0] ?? null;
      return Promise.resolve({ data: r, error: null });
    },
    single() {
      const r = rows.filter((x) => filters.every((f) => f(x)))[0] ?? null;
      return Promise.resolve({ data: r, error: r ? null : { message: "not found" } });
    },
    then(onF: any, onR?: any) {
      const matched = rows.filter((x) => filters.every((f) => f(x)));
      return Promise.resolve({ data: matched, error: null }).then(onF, onR);
    },
    insert(values: any) {
      pending = { kind: "insert", values };
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
      pending = { kind: "update", values };
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
      pending = { kind: "delete" };
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

// Avoid hitting the audit log in tests
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import {
  saveSaleInvoice,
  reverseSaleInvoiceImpacts,
  repostSaleInvoiceImpacts,
  parseSaleMeta,
  stringifySaleMeta,
} from "@/lib/sale-invoices";

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
    name: "Acme",
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

describe("sale-invoices meta helpers", () => {
  it("round-trips meta through notes", () => {
    const tagged = stringifySaleMeta("hello", {
      payment_method: "bank",
      bank_account_id: "bk-1",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
    });
    const parsed = parseSaleMeta(tagged);
    expect(parsed.payment_method).toBe("bank");
    expect(parsed.bank_account_id).toBe("bk-1");
    expect(parsed.affect_stock).toBe(-1);
    expect(parsed.payment_direction).toBe("in");
    expect(parsed.receivable_sign).toBe(1);
  });
});

describe("saveSaleInvoice (invoice, fully paid in cash)", () => {
  beforeEach(() => reset("co-1"));

  it("decrements stock, writes a movement, posts cash, leaves receivable at 0", async () => {
    await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-1",
      invoice_date: "2026-01-01",
      due_date: null,
      party_id: "pa-1",
      subtotal: 100,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
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

    // Stock decreased
    expect(tables.items[0].stock).toBe(95);
    // Movement recorded
    expect(tables.stock_movements).toHaveLength(1);
    expect(tables.stock_movements[0].direction).toBe("out");
    expect(tables.stock_movements[0].qty).toBe(5);
    // Cash transaction posted (in)
    expect(tables.cash_transactions).toHaveLength(1);
    expect(tables.cash_transactions[0].direction).toBe("in");
    expect(tables.cash_transactions[0].amount).toBe(100);
    // Payment row recorded
    expect(tables.payments).toHaveLength(1);
    expect(tables.payments[0].direction).toBe("in");
    // Receivable = total - paid = 0 → party balance unchanged
    expect(tables.parties[0].balance).toBe(0);
  });
});

describe("saveSaleInvoice (invoice, partial bank payment)", () => {
  beforeEach(() => reset("co-1"));

  it("increases receivable by unpaid balance and debits the bank balance", async () => {
    await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-2",
      invoice_date: "2026-01-02",
      due_date: null,
      party_id: "pa-1",
      subtotal: 200,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 200,
      paid: 50,
      balance: 150,
      status: "partial",
      notes: null,
      payment_method: "bank",
      bank_account_id: "bk-1",
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
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
    // Bank increased by inflow of 50
    expect(tables.bank_accounts[0].current_balance).toBe(1050);
    expect(tables.cash_transactions[0].bank_account_id).toBe("bk-1");
  });
});

describe("reverse + repost impacts are symmetrical", () => {
  beforeEach(() => reset("co-1"));

  it("returns the world to its pre-invoice state and then restores it once", async () => {
    const id = await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-3",
      invoice_date: "2026-01-03",
      due_date: null,
      party_id: "pa-1",
      subtotal: 60,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 60,
      paid: 60,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
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

    expect(tables.items[0].stock).toBe(97);

    await reverseSaleInvoiceImpacts(id);
    // Stock back to 100
    expect(tables.items[0].stock).toBe(100);
    // Cash txn reversed (still present, status flipped)
    const cashTxn = tables.cash_transactions[0];
    expect(cashTxn.status).toBe("reversed");

    await repostSaleInvoiceImpacts(id);
    expect(tables.items[0].stock).toBe(97);
    // Repost is dedup-safe — no second cash txn for the same reference.
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});

describe("credit note flow", () => {
  beforeEach(() => reset("co-1"));

  it("increases stock, posts cash out, decreases receivable", async () => {
    tables.parties[0].balance = 500;
    await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "CN-1",
      invoice_date: "2026-01-04",
      due_date: null,
      party_id: "pa-1",
      subtotal: 40,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 40,
      paid: 40,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "credit_note",
      affect_stock: 1,
      payment_direction: "out",
      receivable_sign: -1,
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 2,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 40,
        },
      ],
    });

    expect(tables.items[0].stock).toBe(102);
    expect(tables.cash_transactions[0].direction).toBe("out");
    // Receivable unchanged because (total - paid) = 0
    expect(tables.parties[0].balance).toBe(500);
  });
});

describe("edit sale invoice (saveSaleInvoice with editingId)", () => {
  beforeEach(() => reset("co-1"));

  it("reverses old impact and re-applies new impact exactly once — no duplicate ledger rows", async () => {
    const id = await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-E1",
      invoice_date: "2026-02-01",
      due_date: null,
      party_id: "pa-1",
      subtotal: 100,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
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
    expect(tables.items[0].stock).toBe(95);

    // Edit: qty 5→10, price stays, paid bumps to 200 (still cash)
    await saveSaleInvoice(
      {
        company_id: "co-1",
        invoice_no: "INV-E1",
        invoice_date: "2026-02-01",
        due_date: null,
        party_id: "pa-1",
        subtotal: 200,
        discount: 0,
        tax: 0,
        delivery_charge: 0,
        total: 200,
        paid: 200,
        balance: 0,
        status: "paid",
        notes: null,
        payment_method: "cash",
        bank_account_id: null,
        doc_type: "invoice",
        affect_stock: -1,
        payment_direction: "in",
        receivable_sign: 1,
        items: [
          {
            item_id: "it-1",
            item_name: "Widget",
            qty: 10,
            unit: "PCS",
            price: 20,
            discount_pct: 0,
            tax_pct: 0,
            amount: 200,
          },
        ],
      },
      { editingId: id },
    );

    // Stock reflects new quantity only (100 - 10 = 90)
    expect(tables.items[0].stock).toBe(90);

    // Exactly one posted cash txn for this sale, amount = new paid
    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
    expect(posted[0].amount).toBe(200);

    // The old txn lives on as reversed — never deleted
    const reversed = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "reversed",
    );
    expect(reversed).toHaveLength(1);
    expect(reversed[0].amount).toBe(100);

    // Receivable still 0 (paid in full both times)
    expect(tables.parties[0].balance).toBe(0);

    // sale_items rows wiped + reinserted — exactly one current line
    const items = tables.sale_items.filter((r) => r.sale_id === id);
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(10);
  });

  it("headerOnly edit updates header fields without touching items/stock/cash", async () => {
    const id = await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-HO1",
      invoice_date: "2026-02-01",
      due_date: null,
      party_id: "pa-1",
      subtotal: 100,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
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
    const stockAfterCreate = tables.items[0].stock;
    const itemsAfterCreate = tables.sale_items.filter((r) => r.sale_id === id).length;
    const cashAfterCreate = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    ).length;

    // Edit header only — notes, po_no, po_date, billing_name — no items array change
    const returned = await saveSaleInvoice(
      {
        company_id: "co-1",
        invoice_no: "INV-HO1",
        invoice_date: "2026-02-01",
        due_date: null,
        party_id: "pa-1",
        subtotal: 100,
        discount: 0,
        tax: 0,
        delivery_charge: 0,
        total: 100,
        paid: 100,
        balance: 0,
        status: "paid",
        notes: "edited remarks",
        payment_method: "cash",
        bank_account_id: null,
        doc_type: "invoice",
        affect_stock: -1,
        payment_direction: "in",
        receivable_sign: 1,
        po_no: "PO-42",
        po_date: "2026-02-02",
        billing_name: "Acme Ltd",
        items: [],
      },
      { editingId: id, headerOnly: true },
    );

    expect(returned).toBe(id);
    // Stock untouched
    expect(tables.items[0].stock).toBe(stockAfterCreate);
    // Items untouched
    expect(tables.sale_items.filter((r) => r.sale_id === id).length).toBe(itemsAfterCreate);
    // No new posted cash txn
    expect(
      tables.cash_transactions.filter((t) => t.reference_id === id && t.status === "posted").length,
    ).toBe(cashAfterCreate);

    // Header fields updated; invoice number unchanged
    const updated = tables.sales.find((r) => r.id === id)!;
    expect(updated.invoice_no).toBe("INV-HO1");
    expect(updated.po_no).toBe("PO-42");
    expect(updated.po_date).toBe("2026-02-02");
    expect(updated.billing_name).toBe("Acme Ltd");
    expect(String(updated.notes || "")).toContain("edited remarks");

    // (audit emission is fire-and-forget via supabase.rpc; not asserted here)
  });
});

describe("delete → restore lifecycle (soft-delete pipeline)", () => {
  beforeEach(() => reset("co-1"));

  it("delete reverses once, restore reposts once with cash dedup", async () => {
    const id = await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "INV-D1",
      invoice_date: "2026-02-02",
      due_date: null,
      party_id: "pa-1",
      subtotal: 80,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 80,
      paid: 80,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 4,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 80,
        },
      ],
    });
    expect(tables.items[0].stock).toBe(96);

    // Delete (simulated): reverse impacts once
    await reverseSaleInvoiceImpacts(id);
    expect(tables.items[0].stock).toBe(100);
    const postedAfterDel = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(postedAfterDel).toHaveLength(0);

    // Restore: repost once for stock, then once more to prove cash postOnce dedup
    await repostSaleInvoiceImpacts(id);
    expect(tables.items[0].stock).toBe(96);
    await repostSaleInvoiceImpacts(id);
    const postedAfterRestore = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(postedAfterRestore).toHaveLength(1);
    expect(postedAfterRestore[0].amount).toBe(80);
  });

  it("POS-created walk-in sale (party_id=null) delete/restore is symmetric", async () => {
    const id = await saveSaleInvoice({
      company_id: "co-1",
      invoice_no: "POS-1",
      invoice_date: "2026-02-03",
      due_date: null,
      party_id: null,
      subtotal: 40,
      discount: 0,
      tax: 0,
      delivery_charge: 0,
      total: 40,
      paid: 40,
      balance: 0,
      status: "paid",
      notes: null,
      payment_method: "cash",
      bank_account_id: null,
      doc_type: "invoice",
      affect_stock: -1,
      payment_direction: "in",
      receivable_sign: 1,
      items: [
        {
          item_id: "it-1",
          item_name: "Widget",
          qty: 2,
          unit: "PCS",
          price: 20,
          discount_pct: 0,
          tax_pct: 0,
          amount: 40,
        },
      ],
    });
    expect(tables.items[0].stock).toBe(98);

    await reverseSaleInvoiceImpacts(id);
    expect(tables.items[0].stock).toBe(100);

    await repostSaleInvoiceImpacts(id);
    expect(tables.items[0].stock).toBe(98);

    const posted = tables.cash_transactions.filter(
      (t) => t.reference_id === id && t.status === "posted",
    );
    expect(posted).toHaveLength(1);
  });
});
