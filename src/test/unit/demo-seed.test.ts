import { describe, it, expect, beforeEach } from "vitest";
import { seedDemoData } from "@/lib/demo/seedDemo";
import { SEED_VERSION, DEMO_COMPANY_NAME } from "@/lib/demo/constants";

/**
 * In-memory mock of the supabase client surface used by the seeder.
 * Tables are stored as arrays; selects with chained .eq().maybeSingle()
 * apply an AND filter. Inserts append rows with generated ids.
 */
function makeMockClient(initial?: Record<string, any[]>) {
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
    online_store_items: [],
    ...initial,
  };
  let idCounter = 1;
  const nextId = () => `id-${idCounter++}`;

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const filters: Array<(r: any) => boolean> = [];
    const api: any = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      is(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
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
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return { data: out[0] ?? null, error: null };
      },
      async single() {
        rows = [...(tables[table] ?? [])];
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return { data: out[0] ?? null, error: null };
      },
      async insert(payload: any) {
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted = list.map((p) => ({ id: nextId(), ...p }));
        tables[table] = [...(tables[table] ?? []), ...inserted];
        rows = tables[table];
        return {
          data: inserted,
          error: null,
          select: () => ({
            single: async () => ({ data: inserted[0], error: null }),
          }),
        } as any;
      },
      async upsert(payload: any) {
        const list = Array.isArray(payload) ? payload : [payload];
        const existing = tables[table] ?? [];
        for (const p of list) {
          const idx = existing.findIndex(
            (r) => (p.owner_id && r.owner_id === p.owner_id) || (p.id && r.id === p.id),
          );
          if (idx >= 0) existing[idx] = { ...existing[idx], ...p };
          else existing.push({ id: nextId(), ...p });
        }
        tables[table] = existing;
        return { data: null, error: null };
      },
      update(patch: any) {
        const next: any = {
          eq(col: string, val: unknown) {
            tables[table] = (tables[table] ?? []).map((r) =>
              r[col] === val ? { ...r, ...patch } : r,
            );
            return Promise.resolve({ data: null, error: null });
          },
        };
        return next;
      },
      then(resolve: any, reject?: any) {
        rows = [...(tables[table] ?? [])];
        const out = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: out, error: null }).then(resolve, reject);
      },
    };
    const origInsert = api.insert;
    api.insert = (payload: any) => {
      const p = origInsert(payload);
      return {
        then: (res: any, rej: any) => p.then(res, rej),
        select: () => ({
          single: async () => {
            const r = await p;
            return { data: r.data[0], error: null };
          },
        }),
      };
    };
    return api;
  }

  return {
    __tables: tables,
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-demo", email: "admin@erpovo.com" } },
        error: null,
      }),
    },
    from: (t: string) => builder(t),
  } as any;
}

describe("demo seed", () => {
  let client: any;
  beforeEach(() => {
    client = makeMockClient();
  });

  it("creates company, parties, items, warehouses, transactions, payroll", async () => {
    const report = await seedDemoData({ client });
    expect(report.ok).toBe(true);
    expect(report.alreadySeeded).toBe(false);
    expect(client.__tables.companies).toHaveLength(1);
    expect(client.__tables.companies[0].name).toBe(DEMO_COMPANY_NAME);
    expect(client.__tables.subscriptions[0].plan).toBe("pro");
    expect(client.__tables.parties.length).toBe(10);
    expect(client.__tables.items.length).toBe(10);
    expect(client.__tables.warehouses.length).toBe(3);
    // 14 invoices + 4 estimate + 3 SO + 3 DC + 2 CN
    expect(client.__tables.sales.length).toBe(26);
    // 8 bills + 3 PO + 2 DN
    expect(client.__tables.purchases.length).toBe(13);
    expect(client.__tables.expenses.length).toBe(10);
    expect(client.__tables.payments.length).toBe(14);
    expect(client.__tables.employees.length).toBe(5);
    expect(client.__tables.employee_payments.length).toBe(5);
    expect(client.__tables.expense_categories.length).toBeGreaterThanOrEqual(5);
    expect(client.__tables.bank_accounts.length).toBeGreaterThanOrEqual(5);
    expect(client.__tables.cheques.length).toBe(3);
    expect(client.__tables.loans.length).toBe(1);
    expect(client.__tables.loan_payments.length).toBe(2);
    expect(client.__tables.cash_reconciliations.length).toBe(1);
    expect(client.__tables.bank_transfers.length).toBe(1);
    expect(client.__tables.salary_slips.length).toBe(5);
    expect(client.__tables.attendance.length).toBe(5 * 30);
    expect(client.__tables.stock_movements.length).toBeGreaterThan(0);
    // Every demo item has an image_url so the catalogue + storefront look complete.
    expect(client.__tables.items.every((it: any) => !!it.image_url)).toBe(true);
    // Online catalogue is populated, visible, and image-rich.
    expect(client.__tables.online_store_items.length).toBe(client.__tables.items.length);
    expect(client.__tables.online_store_items.every((r: any) => r.visible === true)).toBe(true);
    expect(client.__tables.online_store_items.every((r: any) => !!r.online_image_url)).toBe(true);
    expect(
      client.__tables.online_store_items.filter((r: any) => r.featured === true).length,
    ).toBeGreaterThanOrEqual(4);
    expect(client.__tables.companies[0].settings.demo_seed.version).toBe(SEED_VERSION);
  });

  it("is idempotent on re-run (no duplicates)", async () => {
    await seedDemoData({ client });
    const before = {
      parties: client.__tables.parties.length,
      items: client.__tables.items.length,
      sales: client.__tables.sales.length,
      purchases: client.__tables.purchases.length,
      expenses: client.__tables.expenses.length,
      payments: client.__tables.payments.length,
      cheques: client.__tables.cheques.length,
      attendance: client.__tables.attendance.length,
      stock_movements: client.__tables.stock_movements.length,
      bank_accounts: client.__tables.bank_accounts.length,
      online_store_items: client.__tables.online_store_items.length,
    };
    const report2 = await seedDemoData({ client });
    expect(report2.ok).toBe(true);
    expect(report2.alreadySeeded).toBe(true);
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      expect(client.__tables[k].length).toBe(before[k]);
    }
  });

  it("force re-run still does not duplicate keyed rows", async () => {
    await seedDemoData({ client });
    const before = {
      parties: client.__tables.parties.length,
      items: client.__tables.items.length,
      sales: client.__tables.sales.length,
      purchases: client.__tables.purchases.length,
      cheques: client.__tables.cheques.length,
      bank_accounts: client.__tables.bank_accounts.length,
      attendance: client.__tables.attendance.length,
    };
    const report2 = await seedDemoData({ client, force: true });
    expect(report2.ok).toBe(true);
    for (const k of Object.keys(before) as (keyof typeof before)[]) {
      expect(client.__tables[k].length).toBe(before[k]);
    }
  });

  it("produces non-zero financial figures for dashboards", async () => {
    await seedDemoData({ client });
    const salesTotal = client.__tables.sales.reduce((a: number, r: any) => a + (r.total || 0), 0);
    const purchaseTotal = client.__tables.purchases.reduce(
      (a: number, r: any) => a + (r.total || 0),
      0,
    );
    const receivables = client.__tables.sales.reduce(
      (a: number, r: any) => a + (r.balance || 0),
      0,
    );
    expect(salesTotal).toBeGreaterThan(0);
    expect(purchaseTotal).toBeGreaterThan(0);
    expect(receivables).toBeGreaterThanOrEqual(0);
  });

  it("reports errors safely when auth has no user", async () => {
    const broken: any = {
      ...client,
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    };
    const report = await seedDemoData({ client: broken });
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
