/** @vitest-environment jsdom */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Hoisted shared mock for the supabase client.
const supabaseMock = vi.hoisted(() => {
  const calls: { table: string; op: string; payload?: unknown; filters: Record<string, unknown>; isFilters: Record<string, unknown> }[] = [];
  let nextRows: unknown[] = [];
  let nextSingle: unknown = null;

  function builder(table: string) {
    let lastOp = "select";
    let payload: unknown;
    const filters: Record<string, unknown> = {};
    const isFilters: Record<string, unknown> = {};

    const chain: Record<string, unknown> = {
      select: () => {
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      ilike: (col: string, val: unknown) => {
        filters[`ilike:${col}`] = val;
        return chain;
      },
      neq: (col: string, val: unknown) => {
        filters[`neq:${col}`] = val;
        return chain;
      },
      is: (col: string, val: unknown) => {
        isFilters[col] = val;
        return chain;
      },
      order: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: nextSingle, error: null }).finally(() => {
          calls.push({ table, op: "select.maybeSingle", filters, isFilters });
        }),
      single: () =>
        Promise.resolve({ data: nextSingle, error: null }).finally(() => {
          calls.push({ table, op: `${lastOp}.single`, payload, filters, isFilters });
        }),
      then: (resolve: (v: unknown) => unknown) => {
        calls.push({ table, op: lastOp, payload, filters, isFilters });
        return Promise.resolve({ data: nextRows, error: null }).then(resolve);
      },
      update: (p: unknown) => {
        lastOp = "update";
        payload = p;
        return chain;
      },
      insert: (p: unknown) => {
        lastOp = "insert";
        payload = p;
        return chain;
      },
    };
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => builder(table)),
  };

  return {
    client,
    calls,
    setRows(r: unknown[]) {
      nextRows = r;
    },
    setSingle(r: unknown) {
      nextSingle = r;
    },
    reset() {
      calls.length = 0;
      nextRows = [];
      nextSingle = null;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMock.client,
}));

import {
  listItems,
  upsertItem,
  softDeleteItem,
  listParties,
  upsertParty,
  listWarehouses,
  upsertWarehouse,
  prepareLocalMasterDataForUpload,
  getSyncStatus,
} from "@/lib/master-data";
import {
  DEMO_ITEMS_KEY,
  DEMO_WAREHOUSES_KEY,
  type DemoItem,
  type DemoWarehouse,
} from "@/lib/demo/inventory";
import { DEMO_PARTIES_KEY, type DemoParty } from "@/lib/demo/parties";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const COMPANY_A = "company-aaa";
const COMPANY_B = "company-bbb";

function seedLocalItem(over: Partial<DemoItem> = {}): DemoItem {
  return {
    id: "itm-1",
    company_id: COMPANY_A,
    name: "Chair",
    sku: "CH-001",
    barcode: null,
    category: null,
    category_id: null,
    unit: "pcs",
    sale_price: 100,
    purchase_price: 60,
    wholesale_price: 80,
    mrp: 120,
    stock: 5,
    low_stock_alert: null,
    is_service: false,
    is_active: true,
    image_url: null,
    tax_rate: 0,
    description: null,
    deleted_at: null,
    created_at: new Date().toISOString(),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  supabaseMock.reset();
});
afterEach(() => {
  clearLaunchMode();
  vi.clearAllMocks();
});

describe("master-data adapter — Local mode", () => {
  test("listItems reads from localStorage and ignores other companies", async () => {
    setLaunchMode("local");
    localStorage.setItem(
      DEMO_ITEMS_KEY,
      JSON.stringify([
        seedLocalItem({ id: "a1", company_id: COMPANY_A, name: "A-Item" }),
        seedLocalItem({ id: "b1", company_id: COMPANY_B, name: "B-Item" }),
      ]),
    );
    const rows = await listItems(COMPANY_A);
    expect(rows.map((r) => r.name)).toEqual(["A-Item"]);
    expect(supabaseMock.client.from).not.toHaveBeenCalled();
  });

  test("upsertItem in local mode writes to localStorage and bumps pending counter", async () => {
    setLaunchMode("local");
    const created = await upsertItem({
      company_id: COMPANY_A,
      name: "New Item",
      sku: "NEW-1",
      sale_price: 50,
    });
    expect(created.id).toBeTruthy();
    expect(supabaseMock.client.from).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(DEMO_ITEMS_KEY) ?? "[]");
    expect(stored.length).toBe(1);
    expect(getSyncStatus("items").pendingChanges).toBeGreaterThanOrEqual(1);
  });

  test("duplicate SKU is rejected", async () => {
    setLaunchMode("local");
    localStorage.setItem(
      DEMO_ITEMS_KEY,
      JSON.stringify([seedLocalItem({ sku: "DUP-1" })]),
    );
    await expect(
      upsertItem({
        company_id: COMPANY_A,
        name: "Other",
        sku: "DUP-1",
        sale_price: 1,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  test("softDeleteItem hides item from later list", async () => {
    setLaunchMode("local");
    localStorage.setItem(
      DEMO_ITEMS_KEY,
      JSON.stringify([seedLocalItem({ id: "del-1" })]),
    );
    await softDeleteItem(COMPANY_A, "del-1");
    const rows = await listItems(COMPANY_A);
    expect(rows.find((r) => r.id === "del-1")).toBeUndefined();
  });

  test("parties / warehouses local round-trip", async () => {
    setLaunchMode("local");
    const p = await upsertParty({
      company_id: COMPANY_A,
      name: "Buyer One",
      type: "customer",
      phone: "0123",
    });
    expect((await listParties(COMPANY_A)).map((x) => x.id)).toContain(p.id);

    const w = await upsertWarehouse({
      company_id: COMPANY_A,
      name: "Main Store",
    });
    expect((await listWarehouses(COMPANY_A)).map((x) => x.id)).toContain(w.id);
  });
});

describe("master-data adapter — Cloud mode", () => {
  test("listItems queries supabase scoped by company_id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setRows([{ id: "x", company_id: COMPANY_A, name: "Z" }]);
    await listItems(COMPANY_A);
    const call = supabaseMock.calls.find((c) => c.table === "items");
    expect(call).toBeDefined();
    expect(call!.filters.company_id).toBe(COMPANY_A);
    expect(call!.isFilters.deleted_at).toBeNull();
  });

  test("upsertItem (insert) sends payload with company_id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setSingle({
      id: "new-1",
      company_id: COMPANY_A,
      name: "Cloud Item",
    });
    await upsertItem({
      company_id: COMPANY_A,
      name: "Cloud Item",
      sale_price: 100,
    });
    const insert = supabaseMock.calls.find(
      (c) => c.table === "items" && c.op === "insert.single",
    );
    expect(insert).toBeDefined();
    expect((insert!.payload as { company_id: string }).company_id).toBe(
      COMPANY_A,
    );
  });

  test("listParties scoped by company_id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setRows([]);
    await listParties(COMPANY_B);
    const call = supabaseMock.calls.find((c) => c.table === "parties");
    expect(call!.filters.company_id).toBe(COMPANY_B);
  });

  test("upsertParty insert payload contains company_id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setSingle({
      id: "p1",
      company_id: COMPANY_A,
      name: "X",
      type: "customer",
    });
    await upsertParty({
      company_id: COMPANY_A,
      name: "X",
      type: "customer",
    });
    const insert = supabaseMock.calls.find(
      (c) => c.table === "parties" && c.op === "insert.single",
    );
    expect((insert!.payload as { company_id: string }).company_id).toBe(
      COMPANY_A,
    );
  });

  test("listWarehouses scoped by company_id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setRows([]);
    await listWarehouses(COMPANY_A);
    const call = supabaseMock.calls.find((c) => c.table === "warehouses");
    expect(call!.filters.company_id).toBe(COMPANY_A);
  });

  test("cross-company isolation — cloud list always re-eqs current id", async () => {
    setLaunchMode("cloud");
    supabaseMock.setRows([]);
    await listItems(COMPANY_A);
    await listItems(COMPANY_B);
    const calls = supabaseMock.calls.filter((c) => c.table === "items");
    expect(calls[0].filters.company_id).toBe(COMPANY_A);
    expect(calls[1].filters.company_id).toBe(COMPANY_B);
  });
});

describe("Phase-5 upload prep", () => {
  test("prepareLocalMasterDataForUpload returns only active rows for company", () => {
    const items: DemoItem[] = [
      seedLocalItem({ id: "a", company_id: COMPANY_A }),
      seedLocalItem({
        id: "b",
        company_id: COMPANY_A,
        deleted_at: new Date().toISOString(),
      }),
      seedLocalItem({ id: "c", company_id: COMPANY_B }),
    ];
    localStorage.setItem(DEMO_ITEMS_KEY, JSON.stringify(items));
    const wh: DemoWarehouse[] = [
      {
        id: "w1",
        company_id: COMPANY_A,
        name: "Main",
        type: "main",
        is_default: true,
        is_active: true,
        address: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem(DEMO_WAREHOUSES_KEY, JSON.stringify(wh));
    const parties: DemoParty[] = [
      {
        id: "p1",
        company_id: COMPANY_A,
        name: "P",
        type: "customer",
        phone: null,
        email: null,
        address: null,
        shipping_address: null,
        group_id: null,
        opening_balance: 0,
        balance: 0,
        credit_limit: null,
        loyalty_points: 0,
        gst_number: null,
        is_active: true,
        deleted_at: null,
        created_at: new Date().toISOString(),
      },
    ];
    localStorage.setItem(DEMO_PARTIES_KEY, JSON.stringify(parties));

    const payload = prepareLocalMasterDataForUpload(COMPANY_A);
    expect(payload.items.map((i) => i.id)).toEqual(["a"]);
    expect(payload.warehouses.map((w) => w.id)).toEqual(["w1"]);
    expect(payload.parties.map((p) => p.id)).toEqual(["p1"]);
  });
});
