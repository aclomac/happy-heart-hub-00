import { describe, it, expect } from "vitest";
import {
  calcTotalStockValue,
  countLowStock,
  countOutOfStock,
  buildLowStockList,
  computeRunningBalance,
  summarizeTransfers,
  type ItemRow,
  type StoreStockRow,
} from "@/lib/inventory-stats";

const baseItem: Omit<ItemRow, "id" | "name"> = {
  sku: null,
  unit: "PCS",
  stock: 0,
  low_stock_alert: null,
  purchase_price: 0,
  sale_price: 0,
  category_id: null,
  is_service: false,
  is_active: true,
  deleted_at: null,
};

describe("inventory dashboard helpers", () => {
  it("excludes soft-deleted items from stock value", () => {
    const items: ItemRow[] = [
      { ...baseItem, id: "1", name: "A", stock: 10, purchase_price: 100 },
      { ...baseItem, id: "2", name: "B", stock: 5, purchase_price: 50, deleted_at: "2024-01-01" },
    ];
    expect(calcTotalStockValue(items)).toBe(1000);
  });

  it("excludes services from stock value", () => {
    const items: ItemRow[] = [
      { ...baseItem, id: "1", name: "A", stock: 10, purchase_price: 100 },
      { ...baseItem, id: "2", name: "Svc", stock: 5, purchase_price: 50, is_service: true },
    ];
    expect(calcTotalStockValue(items)).toBe(1000);
  });

  it("prefers store-level stock × price map when given", () => {
    const items: ItemRow[] = [{ ...baseItem, id: "1", name: "A", stock: 10, purchase_price: 100 }];
    const store: StoreStockRow[] = [
      { item_id: "1", warehouse_id: "w1", qty: 3 },
      { item_id: "1", warehouse_id: "w2", qty: 4 },
    ];
    const map = new Map([["1", 100]]);
    expect(calcTotalStockValue(items, store, map)).toBe(700);
  });

  it("returns 0 if everything is missing (safe fallback)", () => {
    expect(calcTotalStockValue([])).toBe(0);
  });

  it("countLowStock only counts items below threshold and not deleted/service", () => {
    const items: ItemRow[] = [
      { ...baseItem, id: "1", name: "A", stock: 1, low_stock_alert: 5 },
      { ...baseItem, id: "2", name: "B", stock: 10, low_stock_alert: 5 },
      { ...baseItem, id: "3", name: "C", stock: 1, low_stock_alert: 5, deleted_at: "x" },
      { ...baseItem, id: "4", name: "D", stock: 1, low_stock_alert: 5, is_service: true },
      { ...baseItem, id: "5", name: "E", stock: 0, low_stock_alert: null },
    ];
    expect(countLowStock(items)).toBe(1);
  });

  it("countOutOfStock excludes deleted and inactive and service", () => {
    const items: ItemRow[] = [
      { ...baseItem, id: "1", name: "A", stock: 0 },
      { ...baseItem, id: "2", name: "B", stock: 0, deleted_at: "x" },
      { ...baseItem, id: "3", name: "C", stock: 0, is_service: true },
      { ...baseItem, id: "4", name: "D", stock: 0, is_active: false },
      { ...baseItem, id: "5", name: "E", stock: 5 },
    ];
    expect(countOutOfStock(items)).toBe(1);
  });

  it("buildLowStockList sorts by deficit DESC", () => {
    const items: ItemRow[] = [
      { ...baseItem, id: "1", name: "A", stock: 2, low_stock_alert: 5 },
      { ...baseItem, id: "2", name: "B", stock: 1, low_stock_alert: 10 },
      { ...baseItem, id: "3", name: "C", stock: 10, low_stock_alert: 5 },
    ];
    const list = buildLowStockList(items);
    expect(list.map((l) => l.id)).toEqual(["2", "1"]);
    expect(list[0].deficit).toBe(9);
  });
});

describe("computeRunningBalance", () => {
  it("computes correct running balance from oldest to newest", () => {
    const movements = [
      { direction: "in" as const, qty: 10 },
      { direction: "out" as const, qty: 3 },
      { direction: "in" as const, qty: 5 },
      { direction: "out" as const, qty: 2 },
    ];
    const tagged = computeRunningBalance(movements);
    expect(tagged.map((m) => m.balance)).toEqual([10, 7, 12, 10]);
  });

  it("handles empty input", () => {
    expect(computeRunningBalance([])).toEqual([]);
  });

  it("restoring (repost) recovers original balance — once-only via DB idempotency surface", () => {
    // Simulates: initial +10, soft-delete (-10 reversal), restore (+10 repost)
    const movements = [
      { direction: "in" as const, qty: 10 }, // adjustment
      { direction: "out" as const, qty: 10 }, // adjustment_reversal
      { direction: "in" as const, qty: 10 }, // adjustment_repost
    ];
    const tagged = computeRunningBalance(movements);
    expect(tagged.at(-1)?.balance).toBe(10);
  });
});

describe("summarizeTransfers", () => {
  it("aggregates qty + items per transfer and respects deleted_at", () => {
    const transfers = [
      {
        id: "t1",
        transfer_no: "TR-1",
        transfer_date: "2025-01-01",
        from_warehouse_id: "w1",
        to_warehouse_id: "w2",
        note: null,
        deleted_at: null,
        created_at: "2025-01-01",
      },
      {
        id: "t2",
        transfer_no: "TR-2",
        transfer_date: "2025-01-02",
        from_warehouse_id: "w1",
        to_warehouse_id: "w3",
        note: null,
        deleted_at: "2025-01-03",
        created_at: "2025-01-02",
      },
    ];
    const items = [
      { id: "i1", transfer_id: "t1", item_id: "x", qty: 3, unit: "PCS" },
      { id: "i2", transfer_id: "t1", item_id: "y", qty: 2, unit: "PCS" },
      { id: "i3", transfer_id: "t2", item_id: "z", qty: 5, unit: "PCS" },
    ];
    const out = summarizeTransfers(transfers, items);
    expect(out[0]).toMatchObject({ items_count: 2, total_qty: 5, status: "active" });
    expect(out[1]).toMatchObject({ items_count: 1, total_qty: 5, status: "deleted" });
  });
});
