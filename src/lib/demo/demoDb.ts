/**
 * Demo Supabase shim.
 *
 * Provides a thin chainable builder that mimics
 * `supabase.from(<table>).select()/insert()/update()/delete()/upsert()`
 * for the small set of tables used by Items and Inventory in demo mode.
 *
 * Unknown tables receive a "soft" builder that returns empty results and
 * silently accepts writes, so any other module that still calls Supabase
 * (Sales, Purchases, etc.) does not crash the UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ensureInventorySeed,
  getItems,
  setItems,
  getCategories,
  setCategories,
  getWarehouses,
  setWarehouses,
  getStoreStock,
  setStoreStock,
  getMovements,
  setMovements,
  getAdjustments,
  setAdjustments,
  getTransfers,
  setTransfers,
  getTransferItems,
  setTransferItems,
  genId,
} from "./inventory";
import { getDemoCompanies, setDemoCompanies, DEMO_COMPANY_ID } from "./localStore";

type Row = Record<string, any>;
type Reader = () => Row[];
type Writer = (rows: Row[]) => void;

function table(name: string): { read: Reader; write: Writer } {
  ensureInventorySeed();
  switch (name) {
    case "items": return { read: getItems as Reader, write: setItems as unknown as Writer };
    case "item_categories": return { read: getCategories as Reader, write: setCategories as unknown as Writer };
    case "warehouses": return { read: getWarehouses as Reader, write: setWarehouses as unknown as Writer };
    case "item_store_stock": return { read: getStoreStock as Reader, write: setStoreStock as unknown as Writer };
    case "stock_movements": return { read: getMovements as Reader, write: setMovements as unknown as Writer };
    case "stock_adjustments": return { read: getAdjustments as Reader, write: setAdjustments as unknown as Writer };
    case "stock_transfers": return { read: getTransfers as Reader, write: setTransfers as unknown as Writer };
    case "stock_transfer_items": return { read: getTransferItems as Reader, write: setTransferItems as unknown as Writer };
    case "companies": return {
      read: () => getDemoCompanies() as unknown as Row[],
      write: (rows) => setDemoCompanies(rows as any),
    };
    default:
      // Soft fallback for any other table — keeps Sales/Purchases queries
      // from throwing while the rest of the app is being migrated.
      return { read: () => [], write: () => {} };
  }
}

type Filter = { op: string; col: string; val: any };
type Order = { col: string; asc: boolean };

function passesFilter(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case "eq": return v === f.val || String(v) === String(f.val);
    case "neq": return v !== f.val && String(v) !== String(f.val);
    case "is":
      if (f.val === null) return v === null || v === undefined;
      return v === f.val;
    case "in": return Array.isArray(f.val) && f.val.some((x) => String(x) === String(v));
    case "gte": return v != null && v >= f.val;
    case "lte": return v != null && v <= f.val;
    case "gt": return v != null && v > f.val;
    case "lt": return v != null && v < f.val;
    case "ilike": {
      const pat = String(f.val).toLowerCase().replace(/%/g, "");
      return String(v ?? "").toLowerCase().includes(pat);
    }
    default: return true;
  }
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) => filters.every((f) => passesFilter(r, f)));
}

function applyOrders(rows: Row[], orders: Order[]): Row[] {
  if (!orders.length) return rows;
  const out = [...rows];
  out.sort((a, b) => {
    for (const o of orders) {
      const av = a[o.col]; const bv = b[o.col];
      if (av === bv) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return o.asc ? -1 : 1;
      if (av > bv) return o.asc ? 1 : -1;
    }
    return 0;
  });
  return out;
}

class Builder<T extends Row = Row> implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private wantCount = false;
  private headOnly = false;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private upsertConflict: string[] | null = null;
  private singleMode: "none" | "maybe" | "single" = "none";

  constructor(private name: string) {}

  // ----- query verbs -----
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "insert" && this.mode !== "update" && this.mode !== "upsert") {
      this.mode = "select";
    }
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.mode = "insert"; this.payload = rows; return this; }
  update(patch: Row) { this.mode = "update"; this.payload = patch; return this; }
  delete() { this.mode = "delete"; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = rows;
    this.upsertConflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : ["id"];
    return this;
  }

  // ----- filters -----
  eq(col: string, val: any) { this.filters.push({ op: "eq", col, val }); return this; }
  neq(col: string, val: any) { this.filters.push({ op: "neq", col, val }); return this; }
  is(col: string, val: any) { this.filters.push({ op: "is", col, val }); return this; }
  in(col: string, vals: any[]) { this.filters.push({ op: "in", col, val: vals }); return this; }
  gte(col: string, val: any) { this.filters.push({ op: "gte", col, val }); return this; }
  lte(col: string, val: any) { this.filters.push({ op: "lte", col, val }); return this; }
  gt(col: string, val: any) { this.filters.push({ op: "gt", col, val }); return this; }
  lt(col: string, val: any) { this.filters.push({ op: "lt", col, val }); return this; }
  ilike(col: string, val: string) { this.filters.push({ op: "ilike", col, val }); return this; }
  // best-effort no-op for `or` — used by some advanced filters; returns all
  or(_expr: string) { return this; }
  not(_col: string, _op: string, _val: any) { return this; }
  contains(_col: string, _val: any) { return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(_a: number, _b: number) { return this; }
  maybeSingle() { this.singleMode = "maybe"; return this.run(); }
  single() { this.singleMode = "single"; return this.run(); }

  // Awaiting the builder runs it as-is.
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled as any, onrejected as any);
  }

  private async run(): Promise<{ data: any; error: any; count?: number }> {
    try {
      const t = table(this.name);
      const all = t.read();

      if (this.mode === "select") {
        const filtered = applyFilters(all, this.filters);
        const ordered = applyOrders(filtered, this.orders);
        const limited = this.limitN != null ? ordered.slice(0, this.limitN) : ordered;
        const count = this.wantCount ? filtered.length : undefined;
        if (this.singleMode === "maybe") return { data: limited[0] ?? null, error: null, count };
        if (this.singleMode === "single") {
          if (!limited[0]) return { data: null, error: { message: "No rows found" }, count };
          return { data: limited[0], error: null, count };
        }
        return { data: this.headOnly ? null : limited, error: null, count };
      }

      if (this.mode === "insert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const inserted = rows.map((r) => ({ ...defaults(this.name), ...r, id: r.id ?? genId() }));
        const next = [...all, ...inserted];
        t.write(next);
        applyInsertSideEffects(this.name, inserted);
        if (this.singleMode === "maybe") return { data: inserted[0] ?? null, error: null };
        if (this.singleMode === "single") return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }

      if (this.mode === "update") {
        const patch = this.payload as Row;
        let updated: Row[] = [];
        const next = all.map((r) => {
          if (this.filters.every((f) => passesFilter(r, f))) {
            const nr = { ...r, ...patch };
            updated.push(nr);
            return nr;
          }
          return r;
        });
        t.write(next);
        if (this.singleMode === "maybe") return { data: updated[0] ?? null, error: null };
        if (this.singleMode === "single") return { data: updated[0] ?? null, error: null };
        return { data: updated, error: null };
      }

      if (this.mode === "delete") {
        const next: Row[] = [];
        const removed: Row[] = [];
        for (const r of all) {
          if (this.filters.length && this.filters.every((f) => passesFilter(r, f))) {
            removed.push(r);
          } else next.push(r);
        }
        t.write(next);
        return { data: removed, error: null };
      }

      if (this.mode === "upsert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const conflict = this.upsertConflict ?? ["id"];
        const next = [...all];
        const out: Row[] = [];
        for (const r of rows) {
          const idx = next.findIndex((x) => conflict.every((c) => String(x[c]) === String(r[c])));
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...r };
            out.push(next[idx]);
          } else {
            const ins = { ...defaults(this.name), ...r, id: r.id ?? genId() };
            next.push(ins);
            out.push(ins);
          }
        }
        t.write(next);
        return { data: out, error: null };
      }

      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: String(err?.message ?? err) } };
    }
  }
}

function defaults(name: string): Row {
  const nowIso = new Date().toISOString();
  switch (name) {
    case "items": return {
      sku: null, barcode: null, category: null, category_id: null, unit: "PCS",
      sale_price: 0, purchase_price: 0, wholesale_price: 0, mrp: 0,
      stock: 0, low_stock_alert: null, is_service: false, is_active: true,
      image_url: null, tax_rate: 0, description: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "item_categories": return {
      color: "#6366f1", deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "warehouses": return {
      type: "branch", is_default: false, is_active: true, address: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "item_store_stock": return { qty: 0, company_id: DEMO_COMPANY_ID };
    case "stock_movements": return {
      direction: "in", qty: 0, movement_date: nowIso.slice(0, 10),
      reference_type: "manual", reference_id: null, reference_no: null,
      note: null, created_by: null, created_at: nowIso, deleted_at: null,
      variant_id: null, company_id: DEMO_COMPANY_ID,
    };
    case "stock_adjustments": return {
      adjustment_type: "increase", qty_delta: 0, qty_target: null,
      reason: null, reference_no: null, attachment_url: null,
      adjustment_date: nowIso.slice(0, 10), created_by: null, posted_by: null,
      created_at: nowIso, deleted_at: null, variant_id: null,
      company_id: DEMO_COMPANY_ID,
    };
    case "stock_transfers": return {
      transfer_no: "", transfer_date: nowIso.slice(0, 10),
      note: null, created_by: null, posted_by: null,
      created_at: nowIso, deleted_at: null, company_id: DEMO_COMPANY_ID,
    };
    case "stock_transfer_items": return { variant_id: null, qty: 0, unit: "PCS" };
    default: return {};
  }
}

export function demoFrom(name: string) {
  return new Builder(name);
}
