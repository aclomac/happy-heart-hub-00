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
