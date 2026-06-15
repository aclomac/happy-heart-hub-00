// ERPOVO native backup: ZIP with manifest.json + data.json.
// No API keys, payment secrets, or auth data exported.

import { supabase } from "@/integrations/supabase/client";

const SAFE_TABLES = [
  "items",
  "item_categories",
  "units",
  "parties",
  "party_groups",
  "warehouses",
  "item_store_stock",
  "other_income_categories",
  "other_incomes",
] as const;

type SafeTable = (typeof SAFE_TABLES)[number];

export type ErpovoManifest = {
  app: "erpovo";
  version: 1;
  exported_at: string;
  company_id: string;
  tables: { name: SafeTable; rows: number }[];
};

export type ErpovoBackupPreview = {
  manifest: ErpovoManifest;
  data: Record<string, Record<string, unknown>[]>;
};

export async function exportErpovoBackup(companyId: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const data: Record<string, Record<string, unknown>[]> = {};
  const tableMeta: { name: SafeTable; rows: number }[] = [];

  for (const t of SAFE_TABLES) {
    const { data: rows, error } = await supabase
      .from(t)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) {
      // skip missing optional tables safely
      continue;
    }
    const clean = (rows ?? []).map((r) => {
      const o = { ...r } as Record<string, unknown>;
      // strip any potentially sensitive keys defensively
      for (const k of Object.keys(o)) {
        if (/secret|token|password|api_key/i.test(k)) delete o[k];
      }
      return o;
    });
    data[t] = clean;
    tableMeta.push({ name: t, rows: clean.length });
  }

  const manifest: ErpovoManifest = {
    app: "erpovo",
    version: 1,
    exported_at: new Date().toISOString(),
    company_id: companyId,
    tables: tableMeta,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("data.json", JSON.stringify(data, null, 2));
  return zip.generateAsync({ type: "blob" });
}

export async function readErpovoBackup(file: File): Promise<ErpovoBackupPreview> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestEntry = zip.file("manifest.json");
  const dataEntry = zip.file("data.json");
  if (!manifestEntry || !dataEntry)
    throw new Error("Invalid ERPOVO backup: missing manifest or data");
  const manifest = JSON.parse(await manifestEntry.async("string")) as ErpovoManifest;
  if (manifest.app !== "erpovo") throw new Error("Not an ERPOVO backup");
  const data = JSON.parse(await dataEntry.async("string")) as Record<
    string,
    Record<string, unknown>[]
  >;
  return { manifest, data };
}

export async function importErpovoBackup(
  preview: ErpovoBackupPreview,
  companyId: string,
  selected: SafeTable[],
): Promise<{ table: string; inserted: number; skipped: number }[]> {
  const results: { table: string; inserted: number; skipped: number }[] = [];
  for (const t of selected) {
    const rows = preview.data[t] ?? [];
    let inserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const { id: _id, company_id: _cid, ...rest } = r as Record<string, unknown>;
      void _id;
      void _cid;
      const payload = { ...rest, company_id: companyId } as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from(t) as any).insert(payload);
      if (error) skipped++;
      else inserted++;
    }
    results.push({ table: t, inserted, skipped });
  }
  return results;
}

export { SAFE_TABLES };
export type { SafeTable };

// ───────────────────────────────────────────────────────────────────────────
// FULL company snapshot — used by Sync → "Backup to PC".
// Includes business transactions (sales, purchases, payments, stock movements,
// ecommerce, etc.) in addition to SAFE_TABLES masters. Sensitive keys are
// stripped per-row. Restore safety still blocks money-impacting tables via
// src/lib/restore-safety.ts.

export const FULL_EXPORT_TABLES = [
  // masters
  "items", "item_categories", "item_variants", "units",
  "parties", "party_groups", "warehouses", "item_store_stock",
  "tax_rates", "expense_categories", "other_income_categories",
  // transactions
  "sales", "sale_items",
  "purchases", "purchase_items",
  "expenses", "other_incomes",
  "payments", "payment_requests",
  // stock
  "stock_movements", "stock_adjustments",
  "stock_transfers", "stock_transfer_items",
  // cash / bank
  "bank_accounts", "bank_transfers",
  "cash_transactions", "cash_reconciliations", "cheques",
  "loans", "loan_payments",
  // payroll
  "employees", "attendance", "employee_payments", "salary_slips",
  // ecommerce
  "online_orders", "online_order_status_logs",
  "online_store_items", "online_store_settings",
  "couriers", "cod_receipts", "cod_settlements",
  "return_exchange", "replacement_items",
  // manufacturing
  "item_manufacturing_recipes", "item_manufacturing_recipe_lines",
  // marketing
  "marketing_campaigns", "marketing_costs",
  // settings + misc
  "settings_kv", "payment_settings", "document_attachments",
  "saved_audit_views",
] as const;

export const EXCLUDED_FROM_BACKUP = [
  "profiles", "user_roles", "devices",
  "subscriptions", "company_subscriptions",
  "support_tickets", "support_ticket_messages",
  "audit_logs", "platform_*", "recycle_bin",
  ".env / secrets / api_keys / auth_tokens",
  "PERF stress / benchmark data",
] as const;

// Child tables that do NOT have a `company_id` column — fetched by parent IDs.
const CHILD_TABLE_PARENT_FK: Record<string, { parent: string; fk: string } | undefined> = {
  sale_items: { parent: "sales", fk: "sale_id" },
  purchase_items: { parent: "purchases", fk: "purchase_id" },
};


const SENSITIVE_KEY = /secret|token|password|api_key|access_key|private_key/i;
const PERF_KEY = /^perf[_-]?(stress|test|bench)/i;
type BackupRow = Record<string, unknown>;

function scrub(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_KEY.test(k) || PERF_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
}

function tableRows(data: Record<string, BackupRow[]>, name: string): BackupRow[] {
  const rows = data[name];
  return Array.isArray(rows) ? rows : [];
}

function upsertMeta(meta: FullTableMeta[], name: string, rows: number, reason?: string) {
  const existing = meta.find((m) => m.name === name);
  if (existing) {
    existing.rows = rows;
    if (rows > 0) {
      delete existing.skipped;
      delete existing.reason;
    } else if (reason) {
      existing.skipped = true;
      existing.reason = reason;
    }
  } else {
    meta.push(reason ? { name, rows, skipped: true, reason } : { name, rows });
  }
}

function firstValue(row: BackupRow, keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return undefined;
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asArray(v: unknown): BackupRow[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as BackupRow[]) : [];
}

function normalizeLine(
  kind: "sale" | "purchase",
  line: BackupRow,
  parent: BackupRow | undefined,
  companyId: string,
  index: number,
): BackupRow {
  const parentFk = kind === "sale" ? "sale_id" : "purchase_id";
  const parentId = String(firstValue(line, [parentFk]) ?? parent?.id ?? "");
  const item = (line.item && typeof line.item === "object" ? line.item : undefined) as BackupRow | undefined;
  const itemName = String(
    firstValue(line, ["item_name", "product_name", "name", "description"]) ??
      firstValue(item ?? {}, ["name", "item_name", "product_name"]) ??
      (kind === "sale" ? "Recovered sale line" : "Recovered purchase line"),
  );
  const sku = firstValue(line, ["sku", "code", "item_code", "barcode"]) ?? firstValue(item ?? {}, ["sku", "code", "barcode"]);
  const qty = toNumber(firstValue(line, ["qty", "quantity", "quantity_sold", "quantity_purchased"]), 1);
  const rate = toNumber(firstValue(line, ["rate", "price", "unit_price", "sale_price", "purchase_price"]), 0);
  const discount = toNumber(firstValue(line, ["discount", "discount_pct", "discount_percent"]), 0);
  const tax = toNumber(firstValue(line, ["tax", "tax_pct", "tax_percent", "tax_rate"]), 0);
  const amount = toNumber(firstValue(line, ["amount", "line_total", "total"]), qty * rate);
  const clean = scrub(line);
  return {
    ...clean,
    id: String(firstValue(line, ["id"]) ?? `${parentId || kind}-backup-line-${index + 1}`),
    company_id: String(firstValue(line, ["company_id"]) ?? parent?.company_id ?? companyId),
    [parentFk]: parentId,
    item_id: firstValue(line, ["item_id", "product_id"]) ?? firstValue(item ?? {}, ["id"]) ?? null,
    item_name: itemName,
    sku: sku ?? null,
    code: sku ?? null,
    item_code: sku ?? null,
    qty,
    quantity: qty,
    unit: String(firstValue(line, ["unit", "uom"]) ?? "PCS"),
    price: rate,
    rate,
    discount_pct: discount,
    discount,
    tax_pct: tax,
    tax,
    amount,
    warehouse_id: firstValue(line, ["warehouse_id", "store_id"]) ?? null,
    store: firstValue(line, ["store", "store_name", "warehouse_name"]) ?? firstValue(line, ["warehouse_id", "store_id"]) ?? null,
  };
}

function collectEmbeddedLines(
  data: Record<string, BackupRow[]>,
  parentTable: "sales" | "purchases",
  outTable: "sale_items" | "purchase_items",
  companyId: string,
): BackupRow[] {
  const parentFk = outTable === "sale_items" ? "sale_id" : "purchase_id";
  const keys = outTable === "sale_items"
    ? ["sale_items", "sales_items", "invoice_items", "sale_invoice_items", "sales_doc_items", "document_items", "line_items", "items"]
    : ["purchase_items", "purchase_invoice_items", "bill_items", "purchase_bill_items", "document_items", "line_items", "items"];
  const byId = new Map(tableRows(data, parentTable).map((p) => [String(p.id), p]));
  const recovered: BackupRow[] = [];
  for (const parent of byId.values()) {
    for (const key of keys) {
      const lines = asArray(parent[key]);
      if (!lines.length) continue;
      recovered.push(...lines.map((line, i) => normalizeLine(outTable === "sale_items" ? "sale" : "purchase", { ...line, [parentFk]: parent.id }, parent, companyId, recovered.length + i)));
      break;
    }
  }
  return recovered;
}

function collectLocalStorageLines(
  data: Record<string, BackupRow[]>,
  outTable: "sale_items" | "purchase_items",
  companyId: string,
): BackupRow[] {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
  const parentTable = outTable === "sale_items" ? "sales" : "purchases";
  const parentFk = outTable === "sale_items" ? "sale_id" : "purchase_id";
  const keys = outTable === "sale_items"
    ? ["erpovo_demo_sale_items", "erpovo_demo_pos_sale_items"]
    : ["erpovo_demo_purchase_items"];
  const parents = new Map(tableRows(data, parentTable).map((p) => [String(p.id), p]));
  const seen = new Set<string>();
  const recovered: BackupRow[] = [];
  for (const key of keys) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      for (const line of asArray(parsed)) {
        const parentId = String(line[parentFk] ?? "");
        const parent = parents.get(parentId);
        if (!parent) continue;
        const id = String(line.id ?? `${key}-${parentId}-${recovered.length}`);
        if (seen.has(id)) continue;
        seen.add(id);
        recovered.push(normalizeLine(outTable === "sale_items" ? "sale" : "purchase", line, parent, companyId, recovered.length));
      }
    } catch {
      // Ignore malformed legacy/demo storage; ZIP verification will catch missing lines.
    }
  }
  return recovered;
}

function collectStockMovementLines(
  data: Record<string, BackupRow[]>,
  outTable: "sale_items" | "purchase_items",
  companyId: string,
): BackupRow[] {
  const parentTable = outTable === "sale_items" ? "sales" : "purchases";
  const parentFk = outTable === "sale_items" ? "sale_id" : "purchase_id";
  const refs = outTable === "sale_items"
    ? new Set(["sale", "sale_invoice", "invoice", "pos", "delivery", "credit_note"])
    : new Set(["purchase", "purchase_bill", "bill", "debit_note"]);
  const parents = new Map(tableRows(data, parentTable).map((p) => [String(p.id), p]));
  const itemMap = new Map(tableRows(data, "items").map((i) => [String(i.id), i]));
  const grouped = new Map<string, BackupRow[]>();
  for (const mv of tableRows(data, "stock_movements")) {
    const parentId = String(firstValue(mv, ["reference_id", parentFk]) ?? "");
    if (!parents.has(parentId)) continue;
    const refType = String(firstValue(mv, ["reference_type", "type", "movement_type"]) ?? "").toLowerCase();
    if (refType && !refs.has(refType)) continue;
    const item = itemMap.get(String(mv.item_id ?? ""));
    const line = normalizeLine(
      outTable === "sale_items" ? "sale" : "purchase",
      {
        id: `${outTable}-from-stock-${mv.id ?? grouped.size}`,
        [parentFk]: parentId,
        item_id: mv.item_id ?? null,
        item_name: firstValue(mv, ["item_name", "product_name"]) ?? item?.name,
        sku: item?.sku ?? item?.barcode ?? null,
        qty: mv.qty,
        unit: item?.unit ?? "PCS",
        warehouse_id: mv.warehouse_id ?? null,
        store: mv.warehouse_id ?? null,
      },
      parents.get(parentId),
      companyId,
      grouped.size,
    );
    const key = `${parentId}:${String(line.item_id ?? line.item_name)}:${String(line.warehouse_id ?? "")}`;
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  }
  return Array.from(grouped.values()).map((lines, i) => {
    const first = lines[0];
    const qty = lines.reduce((n, r) => n + Math.abs(toNumber(r.qty ?? r.quantity)), 0);
    return { ...first, id: first.id ?? `${outTable}-stock-${i + 1}`, qty, quantity: qty, amount: toNumber(first.rate) * qty };
  });
}

function recoverMissingLineTables(data: Record<string, BackupRow[]>, meta: FullTableMeta[], companyId: string) {
  for (const outTable of ["sale_items", "purchase_items"] as const) {
    if (tableRows(data, outTable).length > 0) continue;
    const parentTable = outTable === "sale_items" ? "sales" : "purchases";
    if (tableRows(data, parentTable).length === 0) continue;
    const recovered = [
      ...collectEmbeddedLines(data, parentTable, outTable, companyId),
      ...collectLocalStorageLines(data, outTable, companyId),
      ...collectStockMovementLines(data, outTable, companyId),
    ];
    const seen = new Set<string>();
    data[outTable] = recovered.filter((row) => {
      const parentFk = outTable === "sale_items" ? "sale_id" : "purchase_id";
      const key = `${String(row[parentFk])}:${String(row.id)}:${String(row.item_id ?? row.item_name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return !!row[parentFk];
    });
    upsertMeta(meta, outTable, data[outTable].length, data[outTable].length ? undefined : `${parentTable} exist but line rows were not found in sale_items/purchase_items, embedded payloads, local backup keys, or stock movements`);
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type FullTableMeta = {
  name: string;
  rows: number;
  skipped?: boolean;
  reason?: string;
};

export type FullErpovoManifest = {
  app: "erpovo";
  kind: "full-snapshot";
  version: 2;
  exported_at: string;
  company_id: string;
  company_name?: string;
  total_records: number;
  tables: FullTableMeta[];
  included_tables: string[];
  excluded_tables: readonly string[];
  data_sha256: string;
};

export type FullBackupResult = {
  blob: Blob;
  fileName: string;
  manifest: FullErpovoManifest;
};

export async function exportErpovoBackupFull(companyId: string): Promise<FullBackupResult> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const data: Record<string, Record<string, unknown>[]> = {};
  const tableMeta: FullTableMeta[] = [];

  // company profile (single row, by id — not company_id)
  let companyName: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cRow, error } = await (supabase.from("companies") as any)
      .select("*").eq("id", companyId).maybeSingle();
    if (!error && cRow) {
      const clean = scrub(cRow as Record<string, unknown>);
      data["companies"] = [clean];
      tableMeta.push({ name: "companies", rows: 1 });
      const nm = (cRow as { name?: string }).name;
      if (typeof nm === "string") companyName = nm;
    } else {
      tableMeta.push({ name: "companies", rows: 0, skipped: true, reason: error?.message });
    }
  } catch (e) {
    tableMeta.push({ name: "companies", rows: 0, skipped: true, reason: (e as Error).message });
  }

  for (const t of FULL_EXPORT_TABLES) {
    try {
      const childMap = CHILD_TABLE_PARENT_FK[t];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any;
      if (childMap) {
        // Child table without company_id — fetch by parent IDs already loaded
        const parentRows = (data[childMap.parent] ?? []) as Record<string, unknown>[];
        const parentIds = parentRows
          .map((r) => r.id)
          .filter((v): v is string => typeof v === "string" || typeof v === "number")
          .map(String);
        if (parentIds.length === 0) {
          data[t] = [];
          tableMeta.push({ name: t, rows: 0 });
          continue;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (supabase.from(t) as any).select("*").in(childMap.fk, parentIds);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        q = (supabase.from(t) as any).select("*").eq("company_id", companyId);
      }
      const { data: rows, error } = await q;
      if (error) {
        tableMeta.push({ name: t, rows: 0, skipped: true, reason: error.message });
        continue;
      }
      const clean = ((rows ?? []) as Record<string, unknown>[]).map(scrub);
      data[t] = clean;
      tableMeta.push({ name: t, rows: clean.length });
    } catch (e) {
      tableMeta.push({ name: t, rows: 0, skipped: true, reason: (e as Error).message });
    }
  }

  recoverMissingLineTables(data, tableMeta, companyId);

  const total_records = tableMeta.reduce((n, m) => n + m.rows, 0);
  const dataJson = JSON.stringify(data, null, 2);
  const data_sha256 = await sha256Hex(dataJson);

  const manifest: FullErpovoManifest = {
    app: "erpovo",
    kind: "full-snapshot",
    version: 2,
    exported_at: new Date().toISOString(),
    company_id: companyId,
    company_name: companyName,
    total_records,
    tables: tableMeta,
    included_tables: tableMeta.filter((m) => !m.skipped).map((m) => m.name),
    excluded_tables: EXCLUDED_FROM_BACKUP,
    data_sha256,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("data.json", dataJson);

  const blob = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return {
    blob,
    fileName: `erpovo-backup-${stamp}.erpovo`,
    manifest,
  };
}

// Verify a downloaded .erpovo backup file.
export type VerifyCheck = { label: string; ok: boolean; detail?: string };
export type VerifyResult = {
  ok: boolean;
  checks: VerifyCheck[];
  manifest?: FullErpovoManifest | ErpovoManifest;
  totalRecords?: number;
  computedHash?: string;
};

export async function verifyErpovoBackup(file: File): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];
  const JSZip = (await import("jszip")).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let z: any;
  try {
    z = await JSZip.loadAsync(await file.arrayBuffer());
    checks.push({ label: ".erpovo file opens", ok: true });
  } catch (e) {
    checks.push({ label: ".erpovo file opens", ok: false, detail: (e as Error).message });
    return { ok: false, checks };
  }
  const mEntry = z.file("manifest.json");
  const dEntry = z.file("data.json");
  checks.push({ label: "manifest.json present", ok: !!mEntry });
  checks.push({ label: "data.json present", ok: !!dEntry });
  if (!mEntry || !dEntry) return { ok: false, checks };

  const manifestRaw = await mEntry.async("string");
  const dataRaw = await dEntry.async("string");
  let manifest: FullErpovoManifest | ErpovoManifest;
  try {
    manifest = JSON.parse(manifestRaw);
    checks.push({ label: "manifest parses", ok: true });
  } catch (e) {
    checks.push({ label: "manifest parses", ok: false, detail: (e as Error).message });
    return { ok: false, checks };
  }

  checks.push({
    label: "manifest app = erpovo",
    ok: (manifest as { app?: string }).app === "erpovo",
  });

  const computed = await sha256Hex(dataRaw);
  const claimed = (manifest as FullErpovoManifest).data_sha256;
  if (claimed) {
    checks.push({
      label: "data hash matches manifest",
      ok: claimed === computed,
      detail: claimed === computed ? undefined : `expected ${claimed.slice(0, 12)}… got ${computed.slice(0, 12)}…`,
    });
  } else {
    checks.push({ label: "data hash matches manifest", ok: true, detail: "legacy backup (no hash) — skipped" });
  }

  // Required modules
  let data: Record<string, unknown[]> = {};
  try {
    data = JSON.parse(dataRaw);
  } catch {
    /* handled below */
  }
  const requiredModules = ["items", "parties", "warehouses"];
  const missing = requiredModules.filter((t) => !(t in data));
  checks.push({
    label: "required modules present",
    ok: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(", ")}` : undefined,
  });

  const countRows = (name: string) => (Array.isArray(data[name]) ? data[name].length : 0);
  const salesCount = countRows("sales");
  const saleItemsCount = countRows("sale_items");
  const purchasesCount = countRows("purchases");
  const purchaseItemsCount = countRows("purchase_items");
  checks.push({
    label: "sale item lines included",
    ok: salesCount === 0 || saleItemsCount > 0,
    detail: salesCount > 0 && saleItemsCount === 0 ? "Sales exist but sale item lines are missing from backup" : `${salesCount} sales / ${saleItemsCount} sale item lines`,
  });
  checks.push({
    label: "purchase item lines included",
    ok: purchasesCount === 0 || purchaseItemsCount > 0,
    detail: purchasesCount > 0 && purchaseItemsCount === 0 ? "Purchases exist but purchase item lines are missing from backup" : `${purchasesCount} purchases / ${purchaseItemsCount} purchase item lines`,
  });

  // Secrets / PERF exclusion scan
  const flat = dataRaw;
  const secretHit = /"(?:[a-z_]*?(?:secret|api_key|auth_token|password|private_key))"\s*:/i.test(flat);
  const perfHit = /"perf[_-]?(?:stress|test|bench)[a-z_]*"\s*:/i.test(flat);
  checks.push({ label: "secrets excluded", ok: !secretHit });
  checks.push({ label: "PERF data excluded", ok: !perfHit });

  const totalRecords = Object.values(data).reduce(
    (n, rows) => n + (Array.isArray(rows) ? rows.length : 0),
    0,
  );

  return {
    ok: checks.every((c) => c.ok),
    checks,
    manifest,
    totalRecords,
    computedHash: computed,
  };
}
