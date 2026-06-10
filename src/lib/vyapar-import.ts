// Vyapar backup importer.
//
// Supports .vyb / .zip (containing .vyp) / .vyp (raw SQLite).
// Uses JSZip to extract archives and sql.js (wasm) to read the SQLite DB.
// All work happens client-side. Safe to run multiple times — importers
// dedupe by SKU / name / phone / original Vyapar id.

import { supabase } from "@/integrations/supabase/client";

export type VyaparPreview = {
  tables: { name: string; rows: number }[];
  counts: {
    items: number;
    parties: number;
    stores: number;
    categories: number;
    units: number;
    transactions: number;
  };
};

export type VyaparModule =
  | "items"
  | "categories"
  | "units"
  | "parties"
  | "stores"
  | "stock"
  | "images";

export type ProgressEvent = {
  module: VyaparModule | "parse";
  phase: "start" | "progress" | "done" | "error";
  current?: number;
  total?: number;
  message?: string;
};
export type ProgressFn = (e: ProgressEvent) => void;

const VYAPAR_TABLES = [
  "kb_items",
  "kb_item_categories",
  "kb_item_units",
  "kb_item_stock_tracking",
  "kb_item_images",
  "kb_images",
  "kb_names",
  "kb_party_groups",
  "kb_address",
  "kb_transactions",
  "kb_lineitems",
  "txn_payment_mapping",
  "kb_paymentTypes",
  "stores",
  "store_transactions",
  "store_line_items",
];

export type ParsedDb = {
  tables: Map<string, Record<string, unknown>[]>;
};

// ---------- file detection ----------

export function detectFileKind(name: string): "vyb" | "zip" | "vyp" | "unknown" {
  const n = name.toLowerCase();
  if (n.endsWith(".vyb")) return "vyb";
  if (n.endsWith(".zip")) return "zip";
  if (n.endsWith(".vyp") || n.endsWith(".db") || n.endsWith(".sqlite")) return "vyp";
  return "unknown";
}

// Zip-slip protection: reject path traversal.
export function isSafeEntryPath(p: string): boolean {
  if (!p) return false;
  if (p.includes("..")) return false;
  if (p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)) return false;
  if (p.includes("\\..\\") || p.includes("/../")) return false;
  return true;
}

// SQLite file signature: "SQLite format 3\0"
export function isSqliteBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const sig = "SQLite format 3\0";
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig.charCodeAt(i)) return false;
  }
  return true;
}

// ---------- archive extraction ----------

export async function extractVypFromArchive(file: File): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const buf = new Uint8Array(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  let chosen: { name: string; bytes: Uint8Array } | null = null;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (!isSafeEntryPath(entry.name)) {
      throw new Error(`Unsafe path in archive: ${entry.name}`);
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".vyp") || lower.endsWith(".db") || lower.endsWith(".sqlite")) {
      const bytes = await entry.async("uint8array");
      if (isSqliteBytes(bytes)) {
        chosen = { name: entry.name, bytes };
        break;
      }
    }
  }
  if (!chosen) {
    // Fallback: scan every file for SQLite signature.
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      if (!isSafeEntryPath(entry.name)) continue;
      const bytes = await entry.async("uint8array");
      if (isSqliteBytes(bytes)) {
        chosen = { name: entry.name, bytes };
        break;
      }
    }
  }
  if (!chosen) throw new Error("No SQLite (.vyp) database found in archive");
  return chosen.bytes;
}

// ---------- sql.js parsing ----------

let _sqlPromise: Promise<unknown> | null = null;
async function loadSqlJs() {
  if (!_sqlPromise) {
    _sqlPromise = import("sql.js").then((mod) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mod as any).default({
        locateFile: (f: string) => `https://sql.js.org/dist/${f}`,
      }),
    );
  }
  return _sqlPromise;
}

export async function parseSqlite(bytes: Uint8Array): Promise<ParsedDb> {
  if (!isSqliteBytes(bytes)) throw new Error("Not a valid SQLite database");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SQL = (await loadSqlJs()) as any;
  const db = new SQL.Database(bytes);
  try {
    const tables = new Map<string, Record<string, unknown>[]>();
    const tableNames = db
      .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
      ?.values.map((r: unknown[]) => String(r[0])) as string[] | undefined;
    if (!tableNames) return { tables };
    for (const t of tableNames) {
      if (!VYAPAR_TABLES.includes(t)) continue;
      try {
        const res = db.exec(`SELECT * FROM "${t}"`);
        if (!res[0]) {
          tables.set(t, []);
          continue;
        }
        const cols = res[0].columns as string[];
        const rows = (res[0].values as unknown[][]).map((row) => {
          const obj: Record<string, unknown> = {};
          cols.forEach((c, i) => {
            obj[c] = row[i];
          });
          return obj;
        });
        tables.set(t, rows);
      } catch {
        // skip broken table safely
      }
    }
    return { tables };
  } finally {
    db.close();
  }
}

// ---------- preview ----------

export async function parseVyaparFile(file: File): Promise<ParsedDb> {
  const kind = detectFileKind(file.name);
  if (kind === "unknown") throw new Error("Unsupported file. Use .vyb, .zip, or .vyp");
  const bytes =
    kind === "vyp" ? new Uint8Array(await file.arrayBuffer()) : await extractVypFromArchive(file);
  return parseSqlite(bytes);
}

export function buildPreview(db: ParsedDb): VyaparPreview {
  const tables = Array.from(db.tables.entries()).map(([name, rows]) => ({
    name,
    rows: rows.length,
  }));
  return {
    tables,
    counts: {
      items: db.tables.get("kb_items")?.length ?? 0,
      parties: db.tables.get("kb_names")?.length ?? 0,
      stores: db.tables.get("stores")?.length ?? 0,
      categories: db.tables.get("kb_item_categories")?.length ?? 0,
      units: db.tables.get("kb_item_units")?.length ?? 0,
      transactions: db.tables.get("kb_transactions")?.length ?? 0,
    },
  };
}

// ---------- mappers ----------

function s(v: unknown): string | null {
  if (v == null) return null;
  const str = String(v).trim();
  return str === "" ? null : str;
}
function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type ImportReport = {
  module: VyaparModule;
  inserted: number;
  skipped: number;
  errors: string[];
  cancelled?: boolean;
  rows?: ImportReportRow[];
};

export type ImportReportRow = {
  module: VyaparModule;
  ref: string | null; // safe reference (name / id), no PII
  action: "inserted" | "updated" | "skipped" | "error";
  reason?: string;
};

export class ImportCancelledError extends Error {
  constructor() {
    super("Import cancelled");
    this.name = "ImportCancelledError";
  }
}

function checkCancel(signal?: AbortSignal) {
  if (signal?.aborted) throw new ImportCancelledError();
}

// ---------- item importer ----------

export async function importItems(
  db: ParsedDb,
  companyId: string,
  signal?: AbortSignal,
): Promise<ImportReport> {
  const report: ImportReport = { module: "items", inserted: 0, skipped: 0, errors: [], rows: [] };
  const rows = db.tables.get("kb_items");
  if (!rows || rows.length === 0) {
    report.errors.push("kb_items table missing or empty — skipped");
    return report;
  }
  const cats = db.tables.get("kb_item_categories") ?? [];
  const units = db.tables.get("kb_item_units") ?? [];
  const catMap = new Map<string, string>();
  for (const c of cats)
    catMap.set(
      String(c.item_categoryId ?? c.id ?? ""),
      String(c.item_categoryName ?? c.name ?? ""),
    );
  const unitMap = new Map<string, string>();
  for (const u of units)
    unitMap.set(
      String(u.unitId ?? u.id ?? ""),
      String(u.unitShortName ?? u.shortName ?? u.unitName ?? "PCS"),
    );

  // Pre-load existing items by name+sku to dedupe
  const { data: existing } = await supabase
    .from("items")
    .select("id,name,sku")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const existingKey = new Set<string>();
  (existing ?? []).forEach((it) => {
    existingKey.add(`${(it.sku ?? "").toLowerCase()}|${(it.name ?? "").toLowerCase()}`);
  });

  for (const r of rows) {
    if (signal?.aborted) {
      report.cancelled = true;
      return report;
    }
    const name = s(r.item_name ?? r.name);
    if (!name) {
      report.skipped++;
      report.rows!.push({ module: "items", ref: null, action: "skipped", reason: "missing name" });
      continue;
    }
    const sku = s(r.item_code ?? r.sku ?? r.item_hsn_sac_code) ?? "";
    const key = `${sku.toLowerCase()}|${name.toLowerCase()}`;
    if (existingKey.has(key)) {
      report.skipped++;
      report.rows!.push({ module: "items", ref: name, action: "skipped", reason: "duplicate" });
      continue;
    }
    const catId = s(r.item_categoryId ?? r.category_id);
    const unitId = s(r.item_baseUnitId ?? r.unit_id);
    const payload = {
      company_id: companyId,
      name,
      sku: sku || null,
      category: catId ? (catMap.get(catId) ?? null) : null,
      unit: unitId ? (unitMap.get(unitId) ?? "PCS") : "PCS",
      sale_price: num(r.item_sale_unit_price ?? r.sale_price),
      purchase_price: num(r.item_purchase_unit_price ?? r.purchase_price),
      stock: num(r.item_stock_quantity ?? r.opening_stock ?? r.stock),
      mrp: num(r.item_mrp ?? r.mrp),
      tax_rate: num(r.item_tax_rate ?? r.tax_rate),
      is_service: Boolean(r.item_type === 2 || r.is_service),
    };
    const { error } = await supabase.from("items").insert(payload);
    if (error) {
      report.errors.push(`${name}: ${error.message}`);
      report.skipped++;
      report.rows!.push({ module: "items", ref: name, action: "error", reason: error.message });
    } else {
      report.inserted++;
      existingKey.add(key);
      report.rows!.push({ module: "items", ref: name, action: "inserted" });
    }
  }
  return report;
}

// ---------- party importer ----------

export async function importParties(
  db: ParsedDb,
  companyId: string,
  signal?: AbortSignal,
): Promise<ImportReport> {
  const report: ImportReport = { module: "parties", inserted: 0, skipped: 0, errors: [], rows: [] };
  const rows = db.tables.get("kb_names");
  if (!rows || rows.length === 0) {
    report.errors.push("kb_names table missing or empty — skipped");
    return report;
  }
  const groups = db.tables.get("kb_party_groups") ?? [];
  const groupMap = new Map<string, string>();
  for (const g of groups)
    groupMap.set(String(g.groupId ?? g.id ?? ""), String(g.groupName ?? g.name ?? ""));

  const { data: existing } = await supabase
    .from("parties")
    .select("id,name,phone")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const seen = new Set<string>();
  (existing ?? []).forEach((p) => {
    seen.add(`${(p.phone ?? "").toLowerCase()}|${(p.name ?? "").toLowerCase()}`);
  });

  for (const r of rows) {
    if (signal?.aborted) {
      report.cancelled = true;
      return report;
    }
    const name = s(r.full_name ?? r.name);
    if (!name) {
      report.skipped++;
      report.rows!.push({
        module: "parties",
        ref: null,
        action: "skipped",
        reason: "missing name",
      });
      continue;
    }
    const phone = s(r.phone_number ?? r.phone) ?? "";
    const key = `${phone.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      report.skipped++;
      report.rows!.push({ module: "parties", ref: name, action: "skipped", reason: "duplicate" });
      continue;
    }
    const groupId = s(r.party_groupId ?? r.group_id);
    const groupName = groupId ? (groupMap.get(groupId) ?? null) : null;
    const typeRaw = Number(r.party_type ?? 1);
    const payload = {
      company_id: companyId,
      name,
      phone: phone || null,
      email: s(r.email),
      address: s(r.address ?? r.billing_address),
      type: typeRaw === 2 ? "supplier" : "customer",
      notes: groupName ? `Vyapar group: ${groupName}` : null,
      balance: num(r.amount ?? r.opening_balance ?? r.balance),
    };
    const { error } = await supabase.from("parties").insert(payload);
    if (error) {
      report.errors.push(`${name}: ${error.message}`);
      report.skipped++;
      report.rows!.push({ module: "parties", ref: name, action: "error", reason: error.message });
    } else {
      report.inserted++;
      seen.add(key);
      report.rows!.push({ module: "parties", ref: name, action: "inserted" });
    }
  }
  return report;
}

// ---------- store importer ----------

export async function importStores(
  db: ParsedDb,
  companyId: string,
  signal?: AbortSignal,
): Promise<ImportReport> {
  const report: ImportReport = { module: "stores", inserted: 0, skipped: 0, errors: [], rows: [] };
  const rows = db.tables.get("stores");
  if (!rows || rows.length === 0) {
    report.errors.push("stores table missing or empty — skipped");
    return report;
  }
  const { data: existing } = await supabase
    .from("warehouses")
    .select("id,name")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const seen = new Set<string>((existing ?? []).map((w) => (w.name ?? "").toLowerCase()));

  for (const r of rows) {
    if (signal?.aborted) {
      report.cancelled = true;
      return report;
    }
    const name = s(r.store_name ?? r.name);
    if (!name) {
      report.skipped++;
      report.rows!.push({ module: "stores", ref: null, action: "skipped", reason: "missing name" });
      continue;
    }
    if (seen.has(name.toLowerCase())) {
      report.skipped++;
      report.rows!.push({ module: "stores", ref: name, action: "skipped", reason: "duplicate" });
      continue;
    }
    const payload = {
      company_id: companyId,
      name,
      address: s(r.store_address ?? r.address),
      type: "branch",
      is_default: false,
    };
    const { error } = await supabase.from("warehouses").insert(payload);
    if (error) {
      report.errors.push(`${name}: ${error.message}`);
      report.skipped++;
      report.rows!.push({ module: "stores", ref: name, action: "error", reason: error.message });
    } else {
      report.inserted++;
      seen.add(name.toLowerCase());
      report.rows!.push({ module: "stores", ref: name, action: "inserted" });
    }
  }
  return report;
}

// ---------- image importer ----------

// Safely extract an image source from a Vyapar image row.
// Supports: base64 string, data URL, raw byte arrays/buffers, http(s) url.
export function extractImageSource(
  row: Record<string, unknown>,
): { kind: "dataurl" | "url" | "bytes"; value: string | Uint8Array; mime: string } | null {
  const mime = (typeof row.mime === "string" && row.mime) || "image/jpeg";
  for (const k of ["image_url", "url", "path", "image_path"]) {
    const v = row[k];
    if (typeof v === "string" && /^https?:\/\//i.test(v)) {
      return { kind: "url", value: v, mime };
    }
  }
  for (const k of ["image_base64", "base64", "data"]) {
    const v = row[k];
    if (typeof v === "string" && v.length > 0) {
      if (v.startsWith("data:")) return { kind: "dataurl", value: v, mime };
      // bare base64
      return { kind: "dataurl", value: `data:${mime};base64,${v}`, mime };
    }
  }
  for (const k of ["image_blob", "image", "blob", "bytes"]) {
    const v = row[k];
    if (v instanceof Uint8Array && v.length > 0) {
      return { kind: "bytes", value: v, mime };
    }
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
      return { kind: "bytes", value: new Uint8Array(v as number[]), mime };
    }
  }
  return null;
}

const MAX_DATA_URL_BYTES = 512 * 1024; // 512 KB cap for data-url fallback

export async function importItemImages(
  db: ParsedDb,
  companyId: string,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<ImportReport> {
  const report: ImportReport = { module: "images", inserted: 0, skipped: 0, errors: [], rows: [] };
  const imgRows = db.tables.get("kb_item_images") ?? db.tables.get("kb_images") ?? [];
  onProgress?.({ module: "images", phase: "start", total: imgRows.length });
  if (imgRows.length === 0) {
    onProgress?.({ module: "images", phase: "done", current: 0, total: 0 });
    return report;
  }
  const items = db.tables.get("kb_items") ?? [];
  // Map Vyapar item id → item name (used to find ERPOVO item row).
  const vyId2Name = new Map<string, string>();
  for (const it of items) {
    const id = s(it.item_id ?? it.id);
    const nm = s(it.item_name ?? it.name);
    if (id && nm) vyId2Name.set(id, nm);
  }
  const { data: existing } = await supabase
    .from("items")
    .select("id,name,image_url")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const byName = new Map<string, { id: string; image_url: string | null }>();
  (existing ?? []).forEach((it) =>
    byName.set((it.name ?? "").toLowerCase(), {
      id: it.id,
      image_url: it.image_url ?? null,
    }),
  );

  let i = 0;
  for (const r of imgRows) {
    if (signal?.aborted) {
      report.cancelled = true;
      onProgress?.({ module: "images", phase: "done", current: i, total: imgRows.length });
      return report;
    }
    i++;
    onProgress?.({ module: "images", phase: "progress", current: i, total: imgRows.length });
    try {
      const vyId = s(r.item_id ?? r.itemId);
      const name = vyId ? vyId2Name.get(vyId) : s(r.item_name);
      if (!name) {
        report.skipped++;
        continue;
      }
      const target = byName.get(name.toLowerCase());
      if (!target) {
        report.skipped++;
        continue;
      }
      if (target.image_url) {
        // idempotency: don't overwrite existing image
        report.skipped++;
        continue;
      }
      const src = extractImageSource(r);
      if (!src) {
        report.skipped++;
        continue;
      }
      let url: string | null = null;
      if (src.kind === "url") {
        url = src.value as string;
      } else {
        const bytes = src.kind === "bytes" ? (src.value as Uint8Array) : null;
        const path = `${companyId}/import-${Date.now()}-${i}.jpg`;
        if (bytes) {
          const up = await supabase.storage
            .from("item-images")
            .upload(path, bytes, { upsert: true, contentType: src.mime });
          if (!up.error) {
            url = supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
          }
        }
        if (!url && src.kind === "dataurl") {
          const value = src.value as string;
          if (value.length <= MAX_DATA_URL_BYTES) url = value;
        }
      }
      if (!url) {
        report.skipped++;
        continue;
      }
      const { error } = await supabase.from("items").update({ image_url: url }).eq("id", target.id);
      if (error) {
        report.errors.push(`${name}: ${error.message}`);
        report.skipped++;
      } else {
        report.inserted++;
        target.image_url = url;
      }
    } catch (e) {
      report.errors.push(e instanceof Error ? e.message : "image error");
      report.skipped++;
    }
  }
  onProgress?.({ module: "images", phase: "done", current: i, total: imgRows.length });
  return report;
}

export type ModuleHooks = {
  onModuleStart?: (m: VyaparModule) => void | Promise<void>;
  onModuleEnd?: (m: VyaparModule, r: ImportReport) => void | Promise<void>;
};

export async function runImport(
  db: ParsedDb,
  companyId: string,
  modules: VyaparModule[],
  onProgress?: ProgressFn,
  signal?: AbortSignal,
  hooks?: ModuleHooks,
): Promise<ImportReport[]> {
  const out: ImportReport[] = [];
  const runOne = async (mod: VyaparModule, fn: () => Promise<ImportReport>) => {
    if (signal?.aborted) return false;
    onProgress?.({ module: mod, phase: "start" });
    await hooks?.onModuleStart?.(mod);
    const r = await fn();
    out.push(r);
    onProgress?.({ module: mod, phase: "done" });
    await hooks?.onModuleEnd?.(mod, r);
    return !r.cancelled;
  };
  if (modules.includes("items")) {
    if (!(await runOne("items", () => importItems(db, companyId, signal)))) return out;
  }
  if (modules.includes("parties")) {
    if (!(await runOne("parties", () => importParties(db, companyId, signal)))) return out;
  }
  if (modules.includes("stores")) {
    if (!(await runOne("stores", () => importStores(db, companyId, signal)))) return out;
  }
  if (modules.includes("images")) {
    if (signal?.aborted) return out;
    await hooks?.onModuleStart?.("images");
    const r = await importItemImages(db, companyId, onProgress, signal);
    out.push(r);
    await hooks?.onModuleEnd?.("images", r);
  }
  return out;
}
