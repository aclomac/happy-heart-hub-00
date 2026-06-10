import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  stock: number;
  low_stock_alert: number | null;
  purchase_price: number;
  sale_price: number;
  category_id: string | null;
  is_service: boolean;
  is_active: boolean;
  deleted_at: string | null;
};

export type WarehouseRow = {
  id: string;
  name: string;
  is_default: boolean;
  deleted_at: string | null;
};

export type AdjustmentRow = {
  id: string;
  adjustment_date: string;
  adjustment_type: string;
  qty_delta: number;
  reason: string | null;
  reference_no: string | null;
  item_id: string;
  warehouse_id: string;
  deleted_at: string | null;
  created_at: string;
};

export type TransferRow = {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type TransferItemRow = {
  id: string;
  transfer_id: string;
  item_id: string;
  qty: number;
  unit: string;
};

export type StoreStockRow = {
  item_id: string;
  warehouse_id: string;
  qty: number;
};

// ---------- Pure helpers (test-friendly) ----------

/** Σ stock × purchase_price across all items; safe fallback to 0. */
export function calcTotalStockValue(
  items: Pick<ItemRow, "stock" | "purchase_price" | "deleted_at" | "is_service">[],
  storeStock?: Pick<StoreStockRow, "item_id" | "qty">[],
  itemPriceMap?: Map<string, number>,
): number {
  try {
    if (storeStock && itemPriceMap) {
      let sum = 0;
      for (const s of storeStock) {
        const p = Number(itemPriceMap.get(s.item_id) ?? 0);
        sum += Number(s.qty || 0) * p;
      }
      if (Number.isFinite(sum)) return sum;
    }
    let sum = 0;
    for (const i of items) {
      if (i.deleted_at) continue;
      if (i.is_service) continue;
      sum += Number(i.stock || 0) * Number(i.purchase_price || 0);
    }
    return Number.isFinite(sum) ? sum : 0;
  } catch {
    return 0;
  }
}

export function countLowStock(
  items: Pick<ItemRow, "stock" | "low_stock_alert" | "is_service" | "deleted_at">[],
): number {
  return items.filter(
    (i) =>
      !i.deleted_at &&
      !i.is_service &&
      i.low_stock_alert != null &&
      Number(i.stock) < Number(i.low_stock_alert),
  ).length;
}

export function countOutOfStock(
  items: Pick<ItemRow, "stock" | "is_service" | "deleted_at" | "is_active">[],
): number {
  return items.filter(
    (i) => !i.deleted_at && i.is_active !== false && !i.is_service && Number(i.stock) <= 0,
  ).length;
}

export type LowStockItem = {
  id: string;
  name: string;
  stock: number;
  low_stock_alert: number;
  deficit: number;
};

export function buildLowStockList(items: ItemRow[]): LowStockItem[] {
  return items
    .filter(
      (i) =>
        !i.deleted_at &&
        !i.is_service &&
        i.low_stock_alert != null &&
        Number(i.stock) < Number(i.low_stock_alert),
    )
    .map((i) => ({
      id: i.id,
      name: i.name,
      stock: Number(i.stock || 0),
      low_stock_alert: Number(i.low_stock_alert || 0),
      deficit: Number(i.low_stock_alert || 0) - Number(i.stock || 0),
    }))
    .sort((a, b) => b.deficit - a.deficit);
}

/** Running balance: for an ordered list of movements (oldest -> newest)
 * for a single (item, warehouse), produce per-row balance. */
export function computeRunningBalance<T extends { direction: "in" | "out"; qty: number }>(
  movementsAsc: T[],
): (T & { balance: number })[] {
  let bal = 0;
  return movementsAsc.map((m) => {
    bal += m.direction === "in" ? Number(m.qty) : -Number(m.qty);
    return { ...m, balance: bal };
  });
}

export type TransferSummary = {
  id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  items_count: number;
  total_qty: number;
  status: "active" | "deleted";
};

export function summarizeTransfers(
  transfers: TransferRow[],
  items: TransferItemRow[],
): TransferSummary[] {
  const byId = new Map<string, TransferItemRow[]>();
  for (const it of items) {
    const arr = byId.get(it.transfer_id) ?? [];
    arr.push(it);
    byId.set(it.transfer_id, arr);
  }
  return transfers.map((t) => {
    const list = byId.get(t.id) ?? [];
    return {
      id: t.id,
      transfer_no: t.transfer_no,
      transfer_date: t.transfer_date,
      from_warehouse_id: t.from_warehouse_id,
      to_warehouse_id: t.to_warehouse_id,
      items_count: list.length,
      total_qty: list.reduce((a, l) => a + Number(l.qty || 0), 0),
      status: t.deleted_at ? "deleted" : "active",
    };
  });
}

// ---------- Async loaders (Supabase) ----------

export async function loadInventoryDashboard(companyId: string) {
  const [itemsRes, whRes, storeRes, adjRes, trRes] = await Promise.all([
    sb
      .from("items")
      .select(
        "id,name,sku,unit,stock,low_stock_alert,purchase_price,sale_price,category_id,is_service,is_active,deleted_at",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null),
    sb
      .from("warehouses")
      .select("id,name,is_default,deleted_at,is_active")
      .eq("company_id", companyId)
      .is("deleted_at", null),
    sb.from("item_store_stock").select("item_id,warehouse_id,qty").eq("company_id", companyId),
    sb
      .from("stock_adjustments")
      .select(
        "id,adjustment_date,adjustment_type,qty_delta,reason,reference_no,item_id,warehouse_id,deleted_at,created_at",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    sb
      .from("stock_transfers")
      .select(
        "id,transfer_no,transfer_date,from_warehouse_id,to_warehouse_id,note,deleted_at,created_at",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items = (itemsRes.data ?? []) as ItemRow[];
  const warehouses = (whRes.data ?? []) as (WarehouseRow & { is_active: boolean })[];
  const storeStock = (storeRes.data ?? []) as StoreStockRow[];
  const adjustments = (adjRes.data ?? []) as AdjustmentRow[];
  const transfers = (trRes.data ?? []) as TransferRow[];

  const priceMap = new Map(items.map((i) => [i.id, Number(i.purchase_price || 0)]));

  return {
    items,
    warehouses,
    storeStock,
    adjustments,
    transfers,
    totals: {
      stockValue: calcTotalStockValue(items, storeStock, priceMap),
      totalItems: items.filter((i) => i.is_active !== false).length,
      lowStock: countLowStock(items),
      outOfStock: countOutOfStock(items),
      warehouses: warehouses.length,
    },
  };
}
