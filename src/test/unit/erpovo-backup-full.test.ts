import { describe, it, expect, vi } from "vitest";

// Mock supabase: every supabase.from(table).select("*").eq("...") returns a
// deterministic row set so we can assert which modules show up in the backup.
const { fromSpy } = vi.hoisted(() => {
  const data: Record<string, Record<string, unknown>[]> = {
    companies: [{ id: "co-1", name: "Acme Corp", api_key: "leak", secret_token: "leak" }],
    items: [{ id: 1, name: "Tea", company_id: "co-1" }],
    parties: [{ id: 1, name: "Acme", company_id: "co-1" }],
    warehouses: [{ id: 1, name: "Main", company_id: "co-1" }],
    sales: [{ id: 1, total: 1000, company_id: "co-1" }],
    sale_items: [{ id: 1, qty: 2, company_id: "co-1" }],
    purchases: [{ id: 1, total: 500, company_id: "co-1" }],
    purchase_items: [{ id: 1, qty: 1, company_id: "co-1" }],
    payments: [{ id: 1, amount: 200, company_id: "co-1" }],
    stock_movements: [{ id: 1, qty: 5, company_id: "co-1" }],
    expenses: [{ id: 1, amount: 50, company_id: "co-1" }],
    settings_kv: [{ key: "x", value: "y", company_id: "co-1" }],
    payment_settings: [
      { id: 1, gateway: "stripe", api_key: "sk_live_XXX", company_id: "co-1" },
    ],
    online_orders: [{ id: 1, total: 100, company_id: "co-1" }],
  };
  const fromSpy = vi.fn((table: string) => {
    const rows = data[table];
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () =>
        Promise.resolve(rows ? { data: rows[0], error: null } : { data: null, error: null }),
      then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
        resolve({ data: rows ?? [], error: null }),
    };
    return builder;
  });
  return { fromSpy };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromSpy },
}));

import {
  exportErpovoBackupFull,
  verifyErpovoBackup,
  FULL_EXPORT_TABLES,
} from "@/lib/erpovo-backup";

describe("erpovo backup: full snapshot includes business data", () => {
  it("includes sales / purchases / payments / stock_movements in the backup", async () => {
    const { blob, manifest, fileName } = await exportErpovoBackupFull("co-1");
    expect(fileName).toMatch(/^erpovo-backup-.*\.erpovo$/);
    expect(blob.size).toBeGreaterThan(0);

    const present = manifest.tables.filter((t) => t.rows > 0).map((t) => t.name);
    for (const required of ["sales", "purchases", "payments", "stock_movements", "items", "parties"]) {
      expect(present).toContain(required);
    }
    expect(manifest.total_records).toBeGreaterThan(0);
    expect(manifest.data_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("scrubs sensitive keys (api_key / secret_token) from rows", async () => {
    const { blob } = await exportErpovoBackupFull("co-1");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const dataRaw = await zip.file("data.json")!.async("string");
    expect(dataRaw).not.toMatch(/sk_live_XXX/);
    expect(dataRaw).not.toMatch(/secret_token/i);
    expect(dataRaw).not.toMatch(/api_key/i);
  });

  it("declares an FULL_EXPORT_TABLES list covering core modules", () => {
    for (const t of [
      "sales", "sale_items", "purchases", "purchase_items",
      "payments", "expenses", "stock_movements", "stock_adjustments",
      "stock_transfers", "online_orders", "settings_kv",
    ]) {
      expect(FULL_EXPORT_TABLES).toContain(t);
    }
  });
});

describe("erpovo backup: verifyErpovoBackup", () => {
  it("passes on a freshly exported file", async () => {
    const { blob, fileName } = await exportErpovoBackupFull("co-1");
    const file = new File([blob], fileName, { type: "application/zip" });
    const result = await verifyErpovoBackup(file);
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.label === "data hash matches manifest")?.ok).toBe(true);
    expect(result.checks.find((c) => c.label === "secrets excluded")?.ok).toBe(true);
    expect(result.checks.find((c) => c.label === "PERF data excluded")?.ok).toBe(true);
    expect(result.checks.find((c) => c.label === "required modules present")?.ok).toBe(true);
  });

  it("fails when the file is not a valid zip", async () => {
    const file = new File(["not a zip"], "junk.erpovo", { type: "application/zip" });
    const result = await verifyErpovoBackup(file);
    expect(result.ok).toBe(false);
  });
});
