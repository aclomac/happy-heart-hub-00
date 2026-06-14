#!/usr/bin/env bun
/**
 * ERPOVO one-click restore.
 *
 * Reads a backup ZIP produced by scripts/backup-export.ts (--snapshot) or by
 * the in-app Utilities → Backup export, and rebuilds company-scoped state
 * into the target company using the same SAFE_TABLES contract as
 * src/lib/erpovo-backup.ts.
 *
 * Safe-by-design:
 *  - Only SAFE_TABLES are touched (no auth, no payments, no secrets).
 *  - `id` and source `company_id` are stripped per row; target company_id
 *    is re-stamped on insert (matches importErpovoBackup behavior).
 *  - Service role is required and is server-only.
 *  - --dry-run prints the plan without writing.
 *
 * Usage:
 *   bun run scripts/backup-restore.ts \
 *     --file=/mnt/documents/erpovo-stable-backup-<stamp>.zip \
 *     --company-id=<uuid> \
 *     [--tables=items,parties,...] \
 *     [--dry-run]
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import JSZip from "jszip";

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

const ARGS = process.argv.slice(2);
function flag(name: string): string | boolean | undefined {
  const hit = ARGS.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
}

const FILE = flag("file") as string | undefined;
const COMPANY_ID =
  (flag("company-id") as string | undefined) ?? process.env.ERPOVO_RESTORE_COMPANY_ID;
const TABLES_FLAG = flag("tables") as string | undefined;
const DRY_RUN = !!flag("dry-run");

function die(msg: string): never {
  console.error(`[restore] ERROR: ${msg}`);
  process.exit(1);
}

if (!FILE) die("--file=<path-to-backup.zip> is required");
if (!existsSync(FILE!)) die(`file not found: ${FILE}`);
if (!COMPANY_ID) die("--company-id=<uuid> is required (or ERPOVO_RESTORE_COMPANY_ID)");

const selected: SafeTable[] = TABLES_FLAG
  ? (TABLES_FLAG.split(",")
      .map((s) => s.trim())
      .filter((t): t is SafeTable => (SAFE_TABLES as readonly string[]).includes(t)) as SafeTable[])
  : [...SAFE_TABLES];

if (!selected.length) die("no valid tables selected");

async function loadSnapshot(zipPath: string): Promise<{
  manifest: { app: string; company_id?: string; exported_at?: string };
  data: Record<string, Record<string, unknown>[]>;
}> {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  // Try in-app layout first (manifest.json + data.json at root), then
  // backup-export layout (snapshot/manifest.json + snapshot/data.json).
  const m =
    zip.file("snapshot/manifest.json") ?? zip.file("manifest.json");
  const d = zip.file("snapshot/data.json") ?? zip.file("data.json");
  if (!m || !d) die("backup is missing snapshot data (manifest.json / data.json)");
  const manifest = JSON.parse(await m!.async("string"));
  const data = JSON.parse(await d!.async("string"));
  if (manifest.app !== "erpovo") die("not an ERPOVO backup");
  return { manifest, data };
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!url || !key)) {
    die("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or use --dry-run)");
  }

  const { manifest, data } = await loadSnapshot(FILE!);
  console.log(`[restore] backup exported_at=${manifest.exported_at ?? "?"} source_company=${manifest.company_id ?? "?"}`);
  console.log(`[restore] target company=${COMPANY_ID}`);
  console.log(`[restore] tables=${selected.join(",")}${DRY_RUN ? " (dry-run)" : ""}`);

  if (DRY_RUN) {
    for (const t of selected) {
      console.log(`  - ${t}: ${data[t]?.length ?? 0} rows`);
    }
    console.log("[restore] dry-run complete — no writes performed.");
    return;
  }

  const sb = createClient(url!, key!, { auth: { persistSession: false } });
  const results: { table: string; inserted: number; skipped: number; errors: string[] }[] = [];

  for (const t of selected) {
    const rows = data[t] ?? [];
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];
    if (!rows.length) {
      results.push({ table: t, inserted, skipped, errors });
      console.log(`  - ${t}: 0 rows (nothing to do)`);
      continue;
    }

    // Re-stamp company_id, drop source id so DB generates a fresh one.
    // Mirrors importErpovoBackup in src/lib/erpovo-backup.ts.
    const payload = rows.map((r) => {
      const { id: _id, company_id: _cid, ...rest } = r as Record<string, unknown>;
      void _id;
      void _cid;
      return { ...rest, company_id: COMPANY_ID };
    });

    // Bulk insert in chunks for speed; on chunk failure fall back to row-by-row
    // so a single bad row doesn't lose the whole table.
    const CHUNK = 200;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const slice = payload.slice(i, i + CHUNK);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from(t) as any).insert(slice);
      if (!error) {
        inserted += slice.length;
        continue;
      }
      // fallback: per-row insert so partial success is preserved
      for (const row of slice) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: rowErr } = await (sb.from(t) as any).insert(row);
        if (rowErr) {
          skipped++;
          if (errors.length < 3) errors.push(rowErr.message);
        } else {
          inserted++;
        }
      }
    }

    results.push({ table: t, inserted, skipped, errors });
    console.log(
      `  - ${t}: inserted=${inserted} skipped=${skipped}${errors.length ? ` first_error="${errors[0]}"` : ""}`,
    );
  }

  const totalIn = results.reduce((n, r) => n + r.inserted, 0);
  const totalSkip = results.reduce((n, r) => n + r.skipped, 0);
  console.log(`[restore] ✅ done — inserted=${totalIn} skipped=${totalSkip} across ${results.length} tables`);
}

main().catch((err) => {
  console.error("[restore] FAILED:", err);
  process.exit(1);
});
