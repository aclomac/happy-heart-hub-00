import { describe, it, expect, beforeEach } from "vitest";
import { seedDemoData } from "@/lib/demo/seedDemo";

/**
 * Verifies that after seeding, the in-memory dataset would yield meaningful
 * (non-zero / non-empty) values for each dashboard tile and report driver.
 *
 * Mirrors the supabase mock used in demo-seed.test.ts but stays focused on
 * computing the metrics rather than asserting raw row counts.
 */
function makeMockClient() {
  const tables: Record<string, any[]> = {
    companies: [],
    subscriptions: [],
    party_groups: [],
    parties: [],
    warehouses: [],
    item_categories: [],
    items: [],
    sales: [],
    purchases: [],
    expenses: [],
    expense_categories: [],
    payments: [],
    employees: [],
    employee_payments: [],
    attendance: [],
    salary_slips: [],
    bank_accounts: [],
    cash_transactions: [],
    bank_transfers: [],
    cheques: [],
    loans: [],
    loan_payments: [],
    cash_reconciliations: [],
    stock_movements: [],
    item_store_stock: [],
  };
  let i = 1;
  const nextId = () => `id-${i++}`;
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const filters: Array<(r: any) => boolean> = [];
    const api: any = {
      select() {
        return api;
      },
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return api;
      },
      in(c: string, vs: unknown[]) {
        filters.push((r) => vs.includes(r[c]));
        return api;
      },
      is(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      async maybeSingle() {
        rows = [...(tables[table] ?? [])];
        const o = rows.filter((r) => filters.every((f) => f(r)));
        return { data: o[0] ?? null, error: null };
      },
      async single() {
        rows = [...(tables[table] ?? [])];
        const o = rows.filter((r) => filters.every((f) => f(r)));
        return { data: o[0] ?? null, error: null };
      },
      async insert(p: any) {
        const list = Array.isArray(p) ? p : [p];
        const ins = list.map((x) => ({ id: nextId(), ...x }));
        tables[table] = [...(tables[table] ?? []), ...ins];
        return { data: ins, error: null } as any;
      },
      async upsert(p: any) {
        const list = Array.isArray(p) ? p : [p];
        const ex = tables[table] ?? [];
        for (const r of list) {
          const idx = ex.findIndex(
            (x) => (r.owner_id && x.owner_id === r.owner_id) || (r.id && x.id === r.id),
          );
          if (idx >= 0) ex[idx] = { ...ex[idx], ...r };
          else ex.push({ id: nextId(), ...r });
        }
        tables[table] = ex;
        return { data: null, error: null };
      },
      update(patch: any) {
        return {
          eq(c: string, v: unknown) {
            tables[table] = (tables[table] ?? []).map((r) => (r[c] === v ? { ...r, ...patch } : r));
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      then(res: any, rej?: any) {
        rows = [...(tables[table] ?? [])];
        const o = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: o, error: null }).then(res, rej);
      },
    };
    const orig = api.insert;
    api.insert = (p: any) => {
      const pr = orig(p);
      return {
        then: (r: any, j: any) => pr.then(r, j),
        select: () => ({
          single: async () => {
            const x = await pr;
            return { data: x.data[0], error: null };
          },
        }),
      };
    };
    return api;
  }
  return {
    __tables: tables,
    auth: { getUser: async () => ({ data: { user: { id: "user-demo" } }, error: null }) },
    from: (t: string) => builder(t),
  } as any;
}

describe("demo metrics — dashboards & reports", () => {
  let client: any;
  beforeEach(async () => {
    client = makeMockClient();
    const r = await seedDemoData({ client });
    expect(r.ok).toBe(true);
  });

  it("dashboard: today and monthly sales are non-zero", () => {
    const today = new Date().toISOString().slice(0, 10);
    const monthKey = today.slice(0, 7);
    const sales = client.__tables.sales.filter((s: any) => s.doc_type === "invoice");
    const todaySales = sales
      .filter((s: any) => s.invoice_date === today)
      .reduce((a: number, s: any) => a + Number(s.total), 0);
    const monthSales = sales
      .filter((s: any) => s.invoice_date.slice(0, 7) === monthKey)
      .reduce((a: number, s: any) => a + Number(s.total), 0);
    expect(todaySales).toBeGreaterThan(0);
    expect(monthSales).toBeGreaterThan(0);
  });

  it("dashboard: receivables and payables are non-zero", () => {
    const receivables = client.__tables.sales
      .filter((s: any) => s.doc_type === "invoice")
      .reduce((a: number, s: any) => a + Number(s.balance), 0);
    const payables = client.__tables.purchases
      .filter((p: any) => p.doc_type === "bill")
      .reduce((a: number, p: any) => a + Number(p.balance), 0);
    expect(receivables).toBeGreaterThan(0);
    expect(payables).toBeGreaterThan(0);
  });

  it("dashboard: monthly expenses non-zero and span cash/bank/mobile", () => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthly = client.__tables.expenses.filter(
      (e: any) => e.expense_date.slice(0, 7) === monthKey,
    );
    const monthlyTotal = monthly.reduce((a: number, e: any) => a + Number(e.amount), 0);
    expect(monthlyTotal).toBeGreaterThan(0);
    const methods = new Set(client.__tables.expenses.map((e: any) => e.payment_method));
    expect(methods.has("cash")).toBe(true);
    expect(methods.has("bank")).toBe(true);
    expect(methods.has("mobile")).toBe(true);
  });

  it("dashboard: cash, bank, mobile balances present", () => {
    const accts = client.__tables.bank_accounts;
    expect(accts.some((a: any) => a.account_type === "cash" && Number(a.current_balance) > 0)).toBe(
      true,
    );
    expect(accts.some((a: any) => a.account_type === "bank" && Number(a.current_balance) > 0)).toBe(
      true,
    );
    expect(
      accts.some((a: any) => a.account_type === "mobile" && Number(a.current_balance) > 0),
    ).toBe(true);
  });

  it("dashboard: stock value > 0, has low-stock and out-of-stock items", () => {
    const items = client.__tables.items;
    const stockValue = items.reduce(
      (a: number, it: any) => a + Number(it.stock) * Number(it.purchase_price),
      0,
    );
    expect(stockValue).toBeGreaterThan(0);
    const lowStock = items.filter(
      (it: any) =>
        it.low_stock_alert != null &&
        Number(it.stock) > 0 &&
        Number(it.stock) <= Number(it.low_stock_alert),
    );
    const outOfStock = items.filter((it: any) => Number(it.stock) === 0);
    expect(lowStock.length).toBeGreaterThanOrEqual(1);
    expect(outOfStock.length).toBeGreaterThanOrEqual(1);
  });

  it("dashboard: item_store_stock mirror produces non-zero per-warehouse stock value", () => {
    const items = client.__tables.items as any[];
    const store = client.__tables.item_store_stock as any[];
    expect(store.length).toBeGreaterThan(0);
    const priceMap = new Map(items.map((i) => [i.id, Number(i.purchase_price || 0)]));
    const value = store.reduce(
      (a, s) => a + Number(s.qty || 0) * Number(priceMap.get(s.item_id) ?? 0),
      0,
    );
    expect(value).toBeGreaterThan(0);
  });

  it("P&L: sales, purchases, expenses and salary all present", () => {
    expect(
      client.__tables.sales.filter((s: any) => s.doc_type === "invoice").length,
    ).toBeGreaterThan(0);
    expect(
      client.__tables.purchases.filter((p: any) => p.doc_type === "bill").length,
    ).toBeGreaterThan(0);
    expect(client.__tables.expenses.length).toBeGreaterThan(0);
    expect(client.__tables.employee_payments.length).toBeGreaterThan(0);
    expect(client.__tables.salary_slips.length).toBeGreaterThan(0);
  });

  it("Balance Sheet: stock/cash/bank/mobile balances populated", () => {
    const itemsValue = client.__tables.items.reduce(
      (a: number, i: any) => a + Number(i.stock) * Number(i.purchase_price),
      0,
    );
    expect(itemsValue).toBeGreaterThan(0);
    const accts = client.__tables.bank_accounts;
    expect(accts.filter((a: any) => a.account_type === "cash").length).toBeGreaterThan(0);
    expect(accts.filter((a: any) => a.account_type === "bank").length).toBeGreaterThan(0);
    expect(accts.filter((a: any) => a.account_type === "mobile").length).toBeGreaterThan(0);
  });

  it("Day Book: includes sale, purchase, payment, expense, salary and transfer", () => {
    expect(client.__tables.sales.length).toBeGreaterThan(0);
    expect(client.__tables.purchases.length).toBeGreaterThan(0);
    expect(client.__tables.payments.length).toBeGreaterThan(0);
    expect(client.__tables.expenses.length).toBeGreaterThan(0);
    expect(client.__tables.employee_payments.length).toBeGreaterThan(0);
    expect(client.__tables.bank_transfers.length).toBeGreaterThan(0);
  });

  it("Stock Movement and warehouse-wise data present", () => {
    expect(client.__tables.stock_movements.length).toBeGreaterThan(0);
    const opening = client.__tables.stock_movements.filter(
      (m: any) => m.reference_type === "opening",
    );
    expect(opening.length).toBeGreaterThan(0);
    const warehouseIds = new Set(client.__tables.stock_movements.map((m: any) => m.warehouse_id));
    expect(warehouseIds.size).toBeGreaterThanOrEqual(2);
  });

  it("Payroll reports: attendance, salary slips, bonus/deduction/advance, salary payments", () => {
    expect(client.__tables.attendance.length).toBeGreaterThan(0);
    expect(client.__tables.salary_slips.length).toBeGreaterThan(0);
    expect(client.__tables.salary_slips.some((s: any) => Number(s.bonus) > 0)).toBe(true);
    expect(client.__tables.salary_slips.some((s: any) => Number(s.deductions) > 0)).toBe(true);
    expect(client.__tables.salary_slips.some((s: any) => Number(s.advance) > 0)).toBe(true);
    expect(client.__tables.employee_payments.length).toBeGreaterThan(0);
  });

  it("Cheques: pending, cleared and bounced all present", () => {
    const statuses = new Set(client.__tables.cheques.map((c: any) => c.status));
    expect(statuses.has("pending")).toBe(true);
    expect(statuses.has("cleared")).toBe(true);
    expect(statuses.has("bounced")).toBe(true);
  });

  it("Loan + payments present with non-zero outstanding", () => {
    expect(client.__tables.loans.length).toBe(1);
    expect(Number(client.__tables.loans[0].outstanding)).toBeGreaterThan(0);
    expect(client.__tables.loan_payments.length).toBeGreaterThanOrEqual(2);
  });

  it("Sales doc types include estimate, sale_order, delivery_challan, credit_note", () => {
    const types = new Set(client.__tables.sales.map((s: any) => s.doc_type));
    for (const t of ["invoice", "estimate", "sale_order", "delivery_challan", "credit_note"]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it("Purchase doc types include bill, purchase_order, debit_note", () => {
    const types = new Set(client.__tables.purchases.map((p: any) => p.doc_type));
    for (const t of ["bill", "purchase_order", "debit_note"]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it("Running seed twice does not duplicate metric inputs", async () => {
    const before = {
      sales: client.__tables.sales.length,
      purchases: client.__tables.purchases.length,
      expenses: client.__tables.expenses.length,
      attendance: client.__tables.attendance.length,
      stock_movements: client.__tables.stock_movements.length,
      cheques: client.__tables.cheques.length,
    };
    const r = await seedDemoData({ client });
    expect(r.alreadySeeded).toBe(true);
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      expect(client.__tables[k].length).toBe(before[k]);
    }
  });
});
