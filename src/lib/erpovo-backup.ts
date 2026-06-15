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

const SENSITIVE_KEY = /secret|token|password|api_key|access_key|private_key/i;
const PERF_KEY = /^perf[_-]?(stress|test|bench)/i;

function scrub(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_KEY.test(k) || PERF_KEY.test(k)) continue;
    out[k] = v;
  }
  return out;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = (supabase.from(t) as any).select("*").eq("company_id", companyId);
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
  let zip: import("jszip");
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
    checks.push({ label: ".erpovo file opens", ok: true });
  } catch (e) {
    checks.push({ label: ".erpovo file opens", ok: false, detail: (e as Error).message });
    return { ok: false, checks };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const z = zip as any;
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
