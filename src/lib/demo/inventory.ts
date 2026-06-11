/**
 * Local-only inventory repository for ERPOVO demo mode.
 *
 * Stores items / categories / warehouses / stock_movements /
 * stock_adjustments / stock_transfers (+ transfer items) inside
 * localStorage so Items and Inventory modules work without Supabase.
 *
 * Tables are seeded once for the Chair King demo company, then mutated by
 * the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./constants";

export const DEMO_ITEMS_KEY = "erpovo_demo_items";
export const DEMO_ITEM_CATEGORIES_KEY = "erpovo_demo_item_categories";
export const DEMO_UNITS_KEY = "erpovo_demo_units";
export const DEMO_WAREHOUSES_KEY = "erpovo_demo_warehouses";
export const DEMO_ITEM_STORE_STOCK_KEY = "erpovo_demo_item_store_stock";
export const DEMO_STOCK_MOVEMENTS_KEY = "erpovo_demo_stock_movements";
export const DEMO_STOCK_ADJUSTMENTS_KEY = "erpovo_demo_stock_adjustments";
export const DEMO_STOCK_TRANSFERS_KEY = "erpovo_demo_stock_transfers";
export const DEMO_STOCK_TRANSFER_ITEMS_KEY = "erpovo_demo_stock_transfer_items";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled */
  }
}

export function genId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Row shapes ----------
export type DemoItem = {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  category_id: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  wholesale_price: number;
  mrp: number;
  stock: number;
  low_stock_alert: number | null;
  is_service: boolean;
  is_active: boolean;
  image_url: string | null;
  tax_rate: number;
  description: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoCategory = {
  id: string;
  company_id: string;
  name: string;
  color: string;
  deleted_at: string | null;
  created_at: string;
};

export type DemoWarehouse = {
  id: string;
  company_id: string;
  name: string;
  type: string;
  is_default: boolean;
  is_active: boolean;
  address: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoItemStoreStock = {
  id: string;
  company_id: string;
  item_id: string;
  warehouse_id: string;
  qty: number;
};

export type DemoStockMovement = {
  id: string;
  company_id: string;
  item_id: string;
  variant_id: string | null;
  warehouse_id: string;
  direction: "in" | "out";
  qty: number;
  movement_date: string;
  reference_type: string;
  reference_id: string | null;
  reference_no: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type DemoStockAdjustment = {
  id: string;
  company_id: string;
  item_id: string;
  variant_id: string | null;
  warehouse_id: string;
  adjustment_type: string;
  qty_delta: number;
  qty_target: number | null;
  reason: string | null;
  reference_no: string | null;
  attachment_url: string | null;
  adjustment_date: string;
  created_by: string | null;
  posted_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type DemoStockTransfer = {
  id: string;
  company_id: string;
  transfer_no: string;
  transfer_date: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  note: string | null;
  created_by: string | null;
  posted_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type DemoStockTransferItem = {
  id: string;
  transfer_id: string;
  item_id: string;
  variant_id: string | null;
  qty: number;
  unit: string;
};

// ---------- Seeded IDs ----------
const C = DEMO_COMPANY_ID;
const WH_MAIN = "00000000-0000-0000-0000-00000000wh01";
const WH_SHOW = "00000000-0000-0000-0000-00000000wh02";

const CAT_CHAIRS = "00000000-0000-0000-0000-000000ca0001";
const CAT_TABLES = "00000000-0000-0000-0000-000000ca0002";
const CAT_PARTS = "00000000-0000-0000-0000-000000ca0003";

type ItemSeed = {
  id: string;
  name: string;
  sku: string;
  category_id: string;
  category: string;
  unit: string;
  purchase_price: number;
  sale_price: number;
  wholesale_price: number;
  mrp: number;
  stock: number;
  low_stock_alert: number;
};

const ITEM_SEED: ItemSeed[] = [
  { id: "demo-itm-01", name: "Visitor Chair", sku: "CKC-S201F", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 2200, sale_price: 3200, wholesale_price: 2900, mrp: 3500, stock: 45, low_stock_alert: 10 },
  { id: "demo-itm-02", name: "Office Chair Fixed Handle", sku: "CKC-405-F", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 4500, sale_price: 6500, wholesale_price: 6000, mrp: 7000, stock: 30, low_stock_alert: 8 },
  { id: "demo-itm-03", name: "Office Chair 3D Handle", sku: "CKC-405-3D", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 5200, sale_price: 7400, wholesale_price: 6800, mrp: 7900, stock: 22, low_stock_alert: 6 },
  { id: "demo-itm-04", name: "Executive Mesh Chair", sku: "CKC-EXM-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 7200, sale_price: 10500, wholesale_price: 9600, mrp: 11200, stock: 12, low_stock_alert: 4 },
  { id: "demo-itm-05", name: "Ergonomic High Back Chair", sku: "CKC-EHB-02", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 8500, sale_price: 12500, wholesale_price: 11500, mrp: 14000, stock: 8, low_stock_alert: 3 },
  { id: "demo-itm-06", name: "Conference Chair", sku: "CKC-CNF-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 3200, sale_price: 4800, wholesale_price: 4400, mrp: 5200, stock: 26, low_stock_alert: 6 },
  { id: "demo-itm-07", name: "Waiting Chair (3-seater)", sku: "CKC-WAIT-3S", category_id: CAT_CHAIRS, category: "Chairs", unit: "SET", purchase_price: 6800, sale_price: 9500, wholesale_price: 8700, mrp: 10200, stock: 4, low_stock_alert: 5 },
  { id: "demo-itm-08", name: "Back Support Cushion", sku: "CKP-BS-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 450, sale_price: 850, wholesale_price: 700, mrp: 950, stock: 60, low_stock_alert: 15 },
  { id: "demo-itm-09", name: "Chair Wheel Set", sku: "CKP-WHL-05", category_id: CAT_PARTS, category: "Parts", unit: "SET", purchase_price: 280, sale_price: 520, wholesale_price: 450, mrp: 600, stock: 0, low_stock_alert: 10 },
  { id: "demo-itm-10", name: "Chair Gas Lift Cylinder", sku: "CKP-GAS-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 620, sale_price: 1100, wholesale_price: 950, mrp: 1250, stock: 18, low_stock_alert: 5 },
  { id: "demo-itm-11", name: "Chair Arm Rest (Pair)", sku: "CKP-ARM-02", category_id: CAT_PARTS, category: "Parts", unit: "PAIR", purchase_price: 380, sale_price: 720, wholesale_price: 620, mrp: 800, stock: 35, low_stock_alert: 10 },
  { id: "demo-itm-12", name: "Chair Mechanism Base", sku: "CKP-MEC-04", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 1200, sale_price: 1950, wholesale_price: 1750, mrp: 2200, stock: 0, low_stock_alert: 4 },
  { id: "demo-itm-13", name: "Gaming Style Office Chair", sku: "CKC-GAM-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 9800, sale_price: 14500, wholesale_price: 13200, mrp: 15800, stock: 10, low_stock_alert: 3 },
  { id: "demo-itm-14", name: "Director Chair", sku: "CKC-DIR-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 11500, sale_price: 16500, wholesale_price: 15000, mrp: 17800, stock: 6, low_stock_alert: 2 },
  { id: "demo-itm-15", name: "Staff Chair", sku: "CKC-STF-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 2800, sale_price: 4200, wholesale_price: 3800, mrp: 4500, stock: 36, low_stock_alert: 10 },
  { id: "demo-itm-16", name: "Training Chair", sku: "CKC-TRN-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 3900, sale_price: 5800, wholesale_price: 5300, mrp: 6200, stock: 14, low_stock_alert: 4 },
  { id: "demo-itm-17", name: "Meeting Room Chair", sku: "CKC-MTG-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 4800, sale_price: 7200, wholesale_price: 6500, mrp: 7800, stock: 18, low_stock_alert: 5 },
  { id: "demo-itm-18", name: "Mesh Fabric (per meter)", sku: "CKA-MSH-01", category_id: CAT_PARTS, category: "Parts", unit: "MTR", purchase_price: 220, sale_price: 380, wholesale_price: 330, mrp: 420, stock: 120, low_stock_alert: 25 },
  { id: "demo-itm-19", name: "Chair Base (5-Star)", sku: "CKP-BAS-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 850, sale_price: 1400, wholesale_price: 1200, mrp: 1550, stock: 22, low_stock_alert: 6 },
  { id: "demo-itm-20", name: "Chair Cushion", sku: "CKA-CSH-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 380, sale_price: 650, wholesale_price: 560, mrp: 720, stock: 40, low_stock_alert: 10 },
  { id: "demo-itm-21", name: "Workstation Table", sku: "CKT-WRK-01", category_id: CAT_TABLES, category: "Tables", unit: "PCS", purchase_price: 6000, sale_price: 9000, wholesale_price: 8200, mrp: 9800, stock: 18, low_stock_alert: 4 },
  { id: "demo-itm-22", name: "Meeting Table (8 person)", sku: "CKT-MTG-08", category_id: CAT_TABLES, category: "Tables", unit: "PCS", purchase_price: 18000, sale_price: 26500, wholesale_price: 24000, mrp: 29000, stock: 5, low_stock_alert: 2 },
  { id: "demo-itm-23", name: "Reception Desk", sku: "CKT-RCP-01", category_id: CAT_TABLES, category: "Tables", unit: "PCS", purchase_price: 14000, sale_price: 21000, wholesale_price: 19500, mrp: 23000, stock: 4, low_stock_alert: 2 },
  { id: "demo-itm-24", name: "Computer Desk", sku: "CKT-COM-01", category_id: CAT_TABLES, category: "Tables", unit: "PCS", purchase_price: 4500, sale_price: 6800, wholesale_price: 6200, mrp: 7400, stock: 16, low_stock_alert: 5 },
  { id: "demo-itm-25", name: "Filing Cabinet 4-Drawer", sku: "CKS-FIL-04", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 5200, sale_price: 7800, wholesale_price: 7200, mrp: 8500, stock: 12, low_stock_alert: 3 },
  { id: "demo-itm-26", name: "Bar Stool", sku: "CKC-BAR-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 1800, sale_price: 2900, wholesale_price: 2600, mrp: 3200, stock: 24, low_stock_alert: 6 },
  { id: "demo-itm-27", name: "Folding Chair", sku: "CKC-FLD-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 950, sale_price: 1500, wholesale_price: 1300, mrp: 1750, stock: 50, low_stock_alert: 15 },
  { id: "demo-itm-28", name: "Cafeteria Chair", sku: "CKC-CAF-01", category_id: CAT_CHAIRS, category: "Chairs", unit: "PCS", purchase_price: 1600, sale_price: 2500, wholesale_price: 2250, mrp: 2800, stock: 28, low_stock_alert: 8 },
  { id: "demo-itm-29", name: "Heavy Duty Chair Caster (Pro)", sku: "CKP-WHL-PRO", category_id: CAT_PARTS, category: "Parts", unit: "SET", purchase_price: 520, sale_price: 880, wholesale_price: 780, mrp: 950, stock: 32, low_stock_alert: 10 },
  { id: "demo-itm-30", name: "Lumbar Support Belt", sku: "CKP-LBR-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 380, sale_price: 720, wholesale_price: 620, mrp: 800, stock: 26, low_stock_alert: 8 },
  { id: "demo-itm-31", name: "Headrest Attachment", sku: "CKP-HDR-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 680, sale_price: 1200, wholesale_price: 1050, mrp: 1350, stock: 14, low_stock_alert: 4 },
  { id: "demo-itm-32", name: "Footrest", sku: "CKA-FTR-01", category_id: CAT_PARTS, category: "Parts", unit: "PCS", purchase_price: 1100, sale_price: 1850, wholesale_price: 1650, mrp: 2000, stock: 10, low_stock_alert: 3 },
];

// ---------- Public accessors ----------
export function getItems(): DemoItem[] { return read<DemoItem>(DEMO_ITEMS_KEY); }
export function setItems(v: DemoItem[]) { write(DEMO_ITEMS_KEY, v); }
export function getCategories(): DemoCategory[] { return read<DemoCategory>(DEMO_ITEM_CATEGORIES_KEY); }
export function setCategories(v: DemoCategory[]) { write(DEMO_ITEM_CATEGORIES_KEY, v); }
export function getWarehouses(): DemoWarehouse[] { return read<DemoWarehouse>(DEMO_WAREHOUSES_KEY); }
export function setWarehouses(v: DemoWarehouse[]) { write(DEMO_WAREHOUSES_KEY, v); }
export function getStoreStock(): DemoItemStoreStock[] { return read<DemoItemStoreStock>(DEMO_ITEM_STORE_STOCK_KEY); }
export function setStoreStock(v: DemoItemStoreStock[]) { write(DEMO_ITEM_STORE_STOCK_KEY, v); }
export function getMovements(): DemoStockMovement[] { return read<DemoStockMovement>(DEMO_STOCK_MOVEMENTS_KEY); }
export function setMovements(v: DemoStockMovement[]) { write(DEMO_STOCK_MOVEMENTS_KEY, v); }
export function getAdjustments(): DemoStockAdjustment[] { return read<DemoStockAdjustment>(DEMO_STOCK_ADJUSTMENTS_KEY); }
export function setAdjustments(v: DemoStockAdjustment[]) { write(DEMO_STOCK_ADJUSTMENTS_KEY, v); }
export function getTransfers(): DemoStockTransfer[] { return read<DemoStockTransfer>(DEMO_STOCK_TRANSFERS_KEY); }
export function setTransfers(v: DemoStockTransfer[]) { write(DEMO_STOCK_TRANSFERS_KEY, v); }
export function getTransferItems(): DemoStockTransferItem[] { return read<DemoStockTransferItem>(DEMO_STOCK_TRANSFER_ITEMS_KEY); }
export function setTransferItems(v: DemoStockTransferItem[]) { write(DEMO_STOCK_TRANSFER_ITEMS_KEY, v); }

// ---------- Seeding ----------
export function ensureInventorySeed() {
  if (!isBrowser()) return;
  // Warehouses
  if (getWarehouses().length === 0) {
    setWarehouses([
      { id: WH_MAIN, company_id: C, name: "Main Warehouse", type: "main", is_default: true, is_active: true, address: "Dhaka, Bangladesh", deleted_at: null, created_at: now() },
      { id: WH_SHOW, company_id: C, name: "Showroom", type: "branch", is_default: false, is_active: true, address: "Dhanmondi, Dhaka", deleted_at: null, created_at: now() },
    ]);
  }
  // Categories
  if (getCategories().length === 0) {
    setCategories([
      { id: CAT_CHAIRS, company_id: C, name: "Chairs", color: "#3b82f6", deleted_at: null, created_at: now() },
      { id: CAT_TABLES, company_id: C, name: "Tables", color: "#f59e0b", deleted_at: null, created_at: now() },
      { id: CAT_PARTS, company_id: C, name: "Parts", color: "#10b981", deleted_at: null, created_at: now() },
    ]);
  }
  // Items
  if (getItems().length === 0) {
    const items: DemoItem[] = ITEM_SEED.map((s) => ({
      id: s.id,
      company_id: C,
      name: s.name,
      sku: s.sku,
      barcode: null,
      category: s.category,
      category_id: s.category_id,
      unit: s.unit,
      sale_price: s.sale_price,
      purchase_price: s.purchase_price,
      wholesale_price: s.wholesale_price,
      mrp: s.mrp,
      stock: s.stock,
      low_stock_alert: s.low_stock_alert,
      is_service: false,
      is_active: true,
      image_url: null,
      tax_rate: 0,
      description: null,
      deleted_at: null,
      created_at: now(),
    }));
    setItems(items);
    // Store stock — put 70% in main warehouse, 30% in showroom.
    const stock: DemoItemStoreStock[] = [];
    const moves: DemoStockMovement[] = [];
    for (const it of items) {
      const main = Math.round(it.stock * 0.7);
      const show = it.stock - main;
      stock.push({ id: genId("ss"), company_id: C, item_id: it.id, warehouse_id: WH_MAIN, qty: main });
      stock.push({ id: genId("ss"), company_id: C, item_id: it.id, warehouse_id: WH_SHOW, qty: show });
      if (main > 0) {
        moves.push({
          id: genId("mv"), company_id: C, item_id: it.id, variant_id: null,
          warehouse_id: WH_MAIN, direction: "in", qty: main, movement_date: today(),
          reference_type: "opening", reference_id: null, reference_no: "OPEN",
          note: "Opening stock", created_by: null, created_at: now(), deleted_at: null,
        });
      }
      if (show > 0) {
        moves.push({
          id: genId("mv"), company_id: C, item_id: it.id, variant_id: null,
          warehouse_id: WH_SHOW, direction: "in", qty: show, movement_date: today(),
          reference_type: "opening", reference_id: null, reference_no: "OPEN",
          note: "Opening stock", created_by: null, created_at: now(), deleted_at: null,
        });
      }
    }
    setStoreStock(stock);
    setMovements(moves);
  }
}

// ---------- Stock helpers used by the demo postStockAdjustment / Transfer ----------
export function adjustStoreStock(
  companyId: string,
  itemId: string,
  warehouseId: string,
  delta: number,
) {
  const stock = getStoreStock();
  const idx = stock.findIndex(
    (s) => s.company_id === companyId && s.item_id === itemId && s.warehouse_id === warehouseId,
  );
  if (idx >= 0) {
    stock[idx] = { ...stock[idx], qty: Number(stock[idx].qty || 0) + delta };
  } else {
    stock.push({ id: genId("ss"), company_id: companyId, item_id: itemId, warehouse_id: warehouseId, qty: delta });
  }
  setStoreStock(stock);

  // Mirror total on the item.
  const items = getItems();
  const ii = items.findIndex((it) => it.id === itemId);
  if (ii >= 0) {
    items[ii] = { ...items[ii], stock: Number(items[ii].stock || 0) + delta };
    setItems(items);
  }
}

export function getStoreQty(
  companyId: string,
  itemId: string,
  warehouseId: string,
): number {
  const row = getStoreStock().find(
    (s) => s.company_id === companyId && s.item_id === itemId && s.warehouse_id === warehouseId,
  );
  return Number(row?.qty ?? 0);
}
