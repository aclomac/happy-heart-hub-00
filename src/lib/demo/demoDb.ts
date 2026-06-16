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
  adjustStoreStock,
} from "./inventory";
import {
  ensurePartiesSeed,
  getParties,
  setParties,
  getPartyGroups,
  setPartyGroups,
  getPartyLedger,
  setPartyLedger,
} from "./parties";
import {
  ensureSalesSeed,
  getSales,
  setSales,
  getSaleItems,
  setSaleItems,
  getPayments,
  setPayments,
  getCashTxns,
  setCashTxns,
  getOtherIncome,
  setOtherIncome,
} from "./sales";
import {
  ensurePurchasesSeed,
  getPurchases,
  setPurchases,
  getPurchaseItems,
  setPurchaseItems,
  getBankAccounts,
  setBankAccounts,
} from "./purchases";
import {
  ensureExpensesSeed,
  getExpenses,
  setExpenses,
  getExpenseCategories,
  setExpenseCategories,
} from "./expenses";
import {
  ensureCashSeed,
  getCheques,
  setCheques,
  getBankTransfers,
  setBankTransfers,
  getLoans,
  setLoans,
  getLoanPayments,
  setLoanPayments,
  getReconciliations,
  setReconciliations,
} from "./cash";
import {
  ensurePayrollSeed,
  getEmployees,
  setEmployees,
  getAttendance,
  setAttendance,
  getSalarySlips,
  setSalarySlips,
  getEmployeePayments,
  setEmployeePayments,
} from "./payroll";
import {
  ensureSystemSeed,
  getSettingsKv, setSettingsKv,
  getSupportTickets, setSupportTickets,
  getSupportMessages, setSupportMessages,
  getDevices, setDevices,
  getMessageTemplates, setMessageTemplates,
  getPaymentMethods, setPaymentMethods,
  getRoles, setRoles,
  getImportHistory, setImportHistory,
  getPrintSettings, setPrintSettings,
} from "./system";
import {
  ensureFactoryPayrollSeed,
  getLabourRates, setLabourRates,
  getContractWorkEntries, setContractWorkEntries,
  getContractPayments, setContractPayments,
  getContractAllocations, setContractAllocations,
} from "./factory-payroll";

import { DEMO_COMPANY_ID } from "./constants";
import { getDemoCompanies, isExplicitDemoMode, setDemoCompanies } from "./localStore";

/**
 * Mirror DB triggers: when a stock_movements row is inserted, update the
 * matching item_store_stock row and the item's total stock so the rest of
 * the app sees consistent numbers without a real backend.
 */
function applyInsertSideEffects(name: string, rows: Row[]) {
  if (name === "stock_movements") {
    for (const r of rows) {
      const qty = Number(r.qty || 0);
      if (!qty) continue;
      const delta = r.direction === "out" ? -qty : qty;
      if (!r.item_id || !r.warehouse_id) continue;
      adjustStoreStock(r.company_id ?? DEMO_COMPANY_ID, r.item_id, r.warehouse_id, delta);
    }
    return;
  }
  if (name === "parties") {
    const ledger = getPartyLedger();
    for (const r of rows) {
      const ob = Number(r.opening_balance || 0);
      if (!ob) continue;
      ledger.push({
        id: `ob-${r.id}`,
        company_id: r.company_id ?? DEMO_COMPANY_ID,
        party_id: r.id,
        entry_date: new Date().toISOString().slice(0, 10),
        entry_type: "opening_balance",
        reference_no: "OPENING",
        debit: ob > 0 ? ob : 0,
        credit: ob < 0 ? -ob : 0,
        balance: ob,
        note: "Opening balance",
        created_at: new Date().toISOString(),
      });
    }
    setPartyLedger(ledger);
  }
}

type Row = Record<string, any>;
type Reader = () => Row[];
type Writer = (rows: Row[]) => void;

function table(name: string): { read: Reader; write: Writer } {
  if (isExplicitDemoMode()) {
    ensureInventorySeed();
    ensurePartiesSeed();
    ensureSalesSeed();
    ensurePurchasesSeed();
    ensureExpensesSeed();
    ensureCashSeed();
    ensurePayrollSeed();
    ensureSystemSeed();
    ensureFactoryPayrollSeed();
  }

  const empty = { read: () => [], write: () => {} };
  switch (name) {
    case "items": return { read: getItems as Reader, write: setItems as unknown as Writer };
    case "item_categories": return { read: getCategories as Reader, write: setCategories as unknown as Writer };
    case "warehouses": return { read: getWarehouses as Reader, write: setWarehouses as unknown as Writer };
    case "item_store_stock": return { read: getStoreStock as Reader, write: setStoreStock as unknown as Writer };
    case "stock_movements": return { read: getMovements as Reader, write: setMovements as unknown as Writer };
    case "stock_adjustments": return { read: getAdjustments as Reader, write: setAdjustments as unknown as Writer };
    case "stock_transfers": return { read: getTransfers as Reader, write: setTransfers as unknown as Writer };
    case "stock_transfer_items": return { read: getTransferItems as Reader, write: setTransferItems as unknown as Writer };
    case "item_variants": return empty;
    case "parties": return { read: getParties as Reader, write: setParties as unknown as Writer };
    case "party_groups": return { read: getPartyGroups as Reader, write: setPartyGroups as unknown as Writer };
    case "party_ledger": return { read: getPartyLedger as Reader, write: setPartyLedger as unknown as Writer };
    case "sales": return { read: getSales as Reader, write: setSales as unknown as Writer };
    case "sale_items": return { read: getSaleItems as Reader, write: setSaleItems as unknown as Writer };
    case "payments": return { read: getPayments as Reader, write: setPayments as unknown as Writer };
    case "payments_out": return { read: getPayments as Reader, write: setPayments as unknown as Writer };
    case "cash_transactions": return { read: getCashTxns as Reader, write: setCashTxns as unknown as Writer };
    case "other_income": return { read: getOtherIncome as Reader, write: setOtherIncome as unknown as Writer };
    case "other_incomes": return { read: getOtherIncome as Reader, write: setOtherIncome as unknown as Writer };
    case "purchases": return { read: getPurchases as Reader, write: setPurchases as unknown as Writer };
    case "purchase_orders": return { read: getPurchases as Reader, write: setPurchases as unknown as Writer };
    case "debit_notes": return { read: getPurchases as Reader, write: setPurchases as unknown as Writer };
    case "purchase_items": return { read: getPurchaseItems as Reader, write: setPurchaseItems as unknown as Writer };
    case "bank_accounts": return { read: getBankAccounts as Reader, write: setBankAccounts as unknown as Writer };
    case "expenses": return { read: getExpenses as Reader, write: setExpenses as unknown as Writer };
    case "expense_categories": return { read: getExpenseCategories as Reader, write: setExpenseCategories as unknown as Writer };
    case "settings_kv": return { read: getSettingsKv as Reader, write: setSettingsKv as unknown as Writer };
    case "support_tickets": return { read: getSupportTickets as Reader, write: setSupportTickets as unknown as Writer };
    case "support_ticket_messages": return { read: getSupportMessages as Reader, write: setSupportMessages as unknown as Writer };
    case "devices": return { read: getDevices as Reader, write: setDevices as unknown as Writer };
    case "message_templates": return { read: getMessageTemplates as Reader, write: setMessageTemplates as unknown as Writer };
    case "payment_methods": return { read: getPaymentMethods as Reader, write: setPaymentMethods as unknown as Writer };
    case "user_roles": return { read: getRoles as Reader, write: setRoles as unknown as Writer };
    case "import_history": return { read: getImportHistory as Reader, write: setImportHistory as unknown as Writer };
    case "print_settings": return { read: getPrintSettings as Reader, write: setPrintSettings as unknown as Writer };
    case "audit_logs": return empty;
    case "company_members": return empty;
    case "cheques": return { read: getCheques as Reader, write: setCheques as unknown as Writer };
    case "bank_transfers": return { read: getBankTransfers as Reader, write: setBankTransfers as unknown as Writer };
    case "loans": return { read: getLoans as Reader, write: setLoans as unknown as Writer };
    case "loan_payments": return { read: getLoanPayments as Reader, write: setLoanPayments as unknown as Writer };
    case "cash_reconciliations": return { read: getReconciliations as Reader, write: setReconciliations as unknown as Writer };
    case "employees": return { read: getEmployees as Reader, write: setEmployees as unknown as Writer };
    case "attendance": return { read: getAttendance as Reader, write: setAttendance as unknown as Writer };
    case "salary_slips": return { read: getSalarySlips as Reader, write: setSalarySlips as unknown as Writer };
    case "employee_payments": return { read: getEmployeePayments as Reader, write: setEmployeePayments as unknown as Writer };
    case "labour_rates": return { read: getLabourRates as Reader, write: setLabourRates as unknown as Writer };
    case "contract_work_entries": return { read: getContractWorkEntries as Reader, write: setContractWorkEntries as unknown as Writer };
    case "contract_payments": return { read: getContractPayments as Reader, write: setContractPayments as unknown as Writer };
    case "contract_payment_allocations": return { read: getContractAllocations as Reader, write: setContractAllocations as unknown as Writer };




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

/**
 * Hydrate Postgres-style embedded selects. We only support the trivial
 * `parties(name)` shape used by Sales / Payments lists so the rendered list
 * gets `row.parties = { name }`.
 */
function attachJoins(cols: string, rows: Row[]): Row[] {
  if (!cols || !/parties\s*\(/i.test(cols)) return rows;
  const parties = getParties();
  const map = new Map(parties.map((p) => [p.id, { name: p.name }]));
  return rows.map((r) => ({ ...r, parties: r.party_id ? (map.get(r.party_id) ?? null) : null }));
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
  private cols = "";

  constructor(private name: string) {}

  // ----- query verbs -----
  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "insert" && this.mode !== "update" && this.mode !== "upsert") {
      this.mode = "select";
    }
    if (cols) this.cols = cols;
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
        const joined = attachJoins(this.cols, limited);
        const count = this.wantCount ? filtered.length : undefined;
        if (this.singleMode === "maybe") return { data: joined[0] ?? null, error: null, count };
        if (this.singleMode === "single") {
          if (!joined[0]) return { data: null, error: { message: "No rows found" }, count };
          return { data: joined[0], error: null, count };
        }
        return { data: this.headOnly ? null : joined, error: null, count };
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
    case "parties": return {
      type: "customer", phone: null, email: null, address: null, shipping_address: null,
      group_id: null, opening_balance: 0, balance: 0, credit_limit: null,
      loyalty_points: 0, gst_number: null, is_active: true,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "party_groups": return {
      description: null, deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "party_ledger": return {
      entry_date: nowIso.slice(0, 10), entry_type: "manual",
      reference_no: null, debit: 0, credit: 0, balance: 0, note: null,
      created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "sales": return {
      doc_type: "invoice", invoice_no: "", invoice_date: nowIso.slice(0, 10), due_date: null,
      party_id: null, subtotal: 0, discount: 0, tax: 0, delivery_charge: 0, labor_charge: 0,
      total: 0, paid: 0, balance: 0, status: "unpaid", payment_method: null, notes: null,
      reference_sale_id: null, po_no: null, po_date: null, billing_name: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "sale_items": return {
      variant_id: null, description: null, qty: 0, unit: "PCS",
      price: 0, discount_pct: 0, tax_pct: 0, amount: 0,
    };
    case "payments": return {
      direction: "in", amount: 0, method: "cash", reference_no: null,
      payment_date: nowIso.slice(0, 10), notes: null, status: "posted",
      posted_txn_id: null, deleted_at: null, created_at: nowIso,
      company_id: DEMO_COMPANY_ID,
    };
    case "purchases":
    case "purchase_orders":
    case "debit_notes": return {
      doc_type: "bill", bill_no: "", bill_date: nowIso.slice(0, 10), due_date: null,
      party_id: null, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0,
      balance: 0, status: "unpaid", payment_method: null, notes: null,
      reference_purchase_id: null, deleted_at: null, created_at: nowIso,
      company_id: DEMO_COMPANY_ID,
    };
    case "purchase_items": return {
      variant_id: null, description: null, qty: 0, unit: "PCS",
      price: 0, discount_pct: 0, tax_pct: 0, amount: 0,
    };
    case "bank_accounts": return {
      account_type: "bank", current_balance: 0, is_active: true,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "payments_out": return {
      direction: "out", amount: 0, method: "cash", reference_no: null,
      payment_date: nowIso.slice(0, 10), notes: null, status: "posted",
      posted_txn_id: null, reversed_at: null, reversed_by: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "expenses": return {
      expense_no: "", expense_date: nowIso.slice(0, 10), category: null,
      category_id: null, vendor: null, store: null, amount: 0, tax: 0,
      payment_method: "cash", bank_account_id: null, notes: null,
      attachment_url: null, is_recurring: false, recurrence: null,
      status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null,
      created_by: null, deleted_at: null, created_at: nowIso,
      company_id: DEMO_COMPANY_ID,
    };
    case "expense_categories": return {
      is_active: true, deleted_at: null, created_at: nowIso,
      company_id: DEMO_COMPANY_ID,
    };
    case "cheques": return {
      cheque_no: "", cheque_date: nowIso.slice(0, 10), amount: 0,
      direction: "received", party_id: null, bank_account_id: null,
      status: "pending", notes: null, deleted_at: null,
      created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "bank_transfers": return {
      from_bank_id: null, to_bank_id: null, amount: 0,
      transfer_date: nowIso.slice(0, 10), notes: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "loans": return {
      loan_name: "", lender: null, loan_type: "term_loan",
      principal: 0, interest_rate: 0, outstanding: 0,
      start_date: nowIso.slice(0, 10), end_date: null,
      bank_account_id: null, notes: null, is_active: true,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "loan_payments": return {
      loan_id: null, payment_date: nowIso.slice(0, 10),
      principal_amount: 0, interest_amount: 0, total_amount: 0,
      bank_account_id: null, notes: null, status: "posted",
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "cash_reconciliations": return {
      recon_date: nowIso.slice(0, 10), store: null,
      opening_balance: 0, system_balance: 0, physical_balance: 0,
      difference: 0, status: "draft", note: null, attachment_url: null,
      responsible_user_id: null, created_by: null, posted_by: null,
      adjustment_txn_id: null, is_cancelled: false,
      cancelled_at: null, cancelled_by: null,
      reversed_at: null, reversed_by: null,
      created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "cash_transactions": return {
      bank_account_id: null, direction: "in", amount: 0,
      txn_date: nowIso.slice(0, 10), category: null, notes: null,
      reference_type: "manual", reference_id: null, status: "posted",
      reversed_at: null, reversed_by: null,
      created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "employees": return {
      code: null, name: "", designation: null, department: null,
      pay_type: "fixed", base_salary: 0, daily_wage: 0,
      phone: null, email: null, address: null, joining_date: null,
      notes: null, is_active: true,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "attendance": return {
      employee_id: null, date: nowIso.slice(0, 10), status: "present",
      note: null, deleted_at: null, created_at: nowIso,
      company_id: DEMO_COMPANY_ID,
    };
    case "salary_slips": return {
      employee_id: null, period_month: nowIso.slice(0, 7),
      days_present: 0, days_total: 0,
      gross: 0, bonus: 0, deductions: 0, advance: 0, net: 0, due: 0,
      status: "pending", paid_on: null, posted_txn_id: null,
      posted_at: null, notes: null,
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "employee_payments": return {
      employee_id: null, slip_id: null, amount: 0, method: "cash",
      bank_account_id: null, payment_date: nowIso.slice(0, 10),
      notes: null, posted_txn_id: null, status: "posted",
      deleted_at: null, created_at: nowIso, company_id: DEMO_COMPANY_ID,
    };
    case "settings_kv": return {
      company_id: DEMO_COMPANY_ID, key: "", value: {}, updated_at: nowIso,
    };
    case "support_tickets": return {
      user_id: null, subject: "", module: null, priority: "normal",
      status: "open", proof_url: null,
      deleted_at: null, created_at: nowIso,
    };
    case "support_ticket_messages": return {
      ticket_id: null, author_id: null, body: "", is_internal: false,
      created_at: nowIso,
    };
    case "devices": return {
      user_id: null, device_fingerprint: "", device_name: "Demo Device",
      last_seen_at: nowIso, created_at: nowIso,
    };
    case "message_templates": return {
      company_id: DEMO_COMPANY_ID, name: "", channel: "sms", body: "",
      created_at: nowIso,
    };
    case "payment_methods": return {
      company_id: DEMO_COMPANY_ID, name: "", type: "cash", is_active: true,
    };
    case "user_roles": return { user_id: null, role: "user" };
    case "import_history": return {
      company_id: DEMO_COMPANY_ID, file_name: "", status: "imported",
      created_at: nowIso,
    };
    case "labour_rates": return {
      company_id: DEMO_COMPANY_ID, item_id: null, work_type: "",
      rate: 0, unit: "pcs", effective_date: nowIso.slice(0, 10),
      employee_id: null, is_active: true, notes: null,
      created_at: nowIso, updated_at: nowIso,
    };
    case "contract_work_entries": return {
      company_id: DEMO_COMPANY_ID, work_date: nowIso.slice(0, 10),
      employee_id: null, item_id: null, work_type: "",
      qty: 0, rate: 0, total: 0, paid_amount: 0,
      status: "unpaid", production_ref: null, notes: null,
      deleted_at: null, created_at: nowIso, updated_at: nowIso,
    };
    case "contract_payments": return {
      company_id: DEMO_COMPANY_ID, employee_id: null,
      payment_date: nowIso.slice(0, 10), amount: 0,
      method: "cash", bank_account_id: null, posted_txn_id: null,
      notes: null, status: "posted",
      deleted_at: null, created_at: nowIso, updated_at: nowIso,
    };
    case "contract_payment_allocations": return {
      payment_id: null, work_entry_id: null, amount: 0,
      created_at: nowIso,
    };

    default: return {};
  }
}

export function demoFrom(name: string) {
  return new Builder(name);
}
