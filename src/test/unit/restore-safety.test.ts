import { describe, it, expect, vi } from "vitest";
import {
  DISABLED_TABLES,
  DISABLED_MESSAGE,
  filterDisabled,
  isDisabledTable,
  isForbiddenPayloadKey,
  stripForbiddenKeys,
  sanitizeBackupData,
  buildRestoreChecklist,
  canRestore,
  type ChecklistInput,
} from "@/lib/restore-safety";

const REQUIRED_DISABLED = [
  "sales",
  "sale_invoices",
  "sale_orders",
  "purchases",
  "purchase_invoices",
  "purchase_orders",
  "stock_movements",
  "payments",
  "payments_in",
  "payments_out",
];

describe("restore-safety: disabled table enforcement", () => {
  it("blocks every money-impacting table", () => {
    for (const t of REQUIRED_DISABLED) {
      expect(isDisabledTable(t)).toBe(true);
      expect(DISABLED_TABLES.has(t)).toBe(true);
    }
  });

  it("filterDisabled strips disabled tables and keeps safe ones", () => {
    const mixed = ["items", "sales", "parties", "payments_in", "warehouses", "stock_movements"];
    const { allowed, blocked } = filterDisabled(mixed);
    expect(allowed).toEqual(["items", "parties", "warehouses"]);
    expect(blocked.sort()).toEqual(["payments_in", "sales", "stock_movements"].sort());
  });

  it("exposes the user-facing disabled message", () => {
    expect(DISABLED_MESSAGE).toMatch(/disabled for safety/i);
    expect(DISABLED_MESSAGE).toMatch(/Sales\/Purchases/);
  });

  it("sanitizeBackupData drops disabled tables even if present in backup", () => {
    const data = {
      items: [{ name: "x" }],
      parties: [{ name: "y" }],
      sales: [{ id: 1 }],
      sale_invoices: [{ id: 2 }],
      payments_in: [{ id: 3 }],
      stock_movements: [{ id: 4 }],
    };
    const safe = sanitizeBackupData(data);
    expect(Object.keys(safe).sort()).toEqual(["items", "parties"]);
  });
});

describe("restore-safety: forbidden keys / PERF / secrets exclusion", () => {
  it("flags PERF stress test pseudo-tables", () => {
    expect(isForbiddenPayloadKey("perf_stress")).toBe(true);
    expect(isForbiddenPayloadKey("PERF-test")).toBe(true);
    expect(isForbiddenPayloadKey("perf_bench")).toBe(true);
  });

  it("flags .env / secrets / auth-token-like keys", () => {
    for (const k of [".env", "env", "client_secret", "auth_token", "api_key", "tokens"]) {
      expect(isForbiddenPayloadKey(k)).toBe(true);
    }
  });

  it("strips forbidden keys from a payload object", () => {
    const cleaned = stripForbiddenKeys({
      name: "ok",
      api_key: "x",
      auth_token: "y",
      stripe_secret: "z",
    });
    expect(cleaned).toEqual({ name: "ok" });
  });

  it("sanitizeBackupData rejects PERF/secret pseudo-tables", () => {
    const data = {
      items: [{}],
      perf_stress: [{}],
      ".env": [{}],
      api_keys: [{}],
    };
    const safe = sanitizeBackupData(data);
    expect(Object.keys(safe)).toEqual(["items"]);
  });
});

describe("restore-safety: checklist gating", () => {
  function baseInput(): ChecklistInput {
    return {
      hasPreview: true,
      hasManifest: true,
      hasParseError: false,
      companyId: "co-1",
      dryRunCompleted: true,
      conflictsReviewed: true,
      mode: "merge",
      confirm: true,
      typedRestore: "RESTORE",
      selectedTablesCount: 2,
      busy: false,
    };
  }

  it("all checks pass → restore allowed", () => {
    const checks = buildRestoreChecklist(baseInput());
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(canRestore(baseInput())).toBe(true);
  });

  it("blocks until a valid backup is uploaded", () => {
    expect(canRestore({ ...baseInput(), hasPreview: false })).toBe(false);
  });

  it("blocks until dry run completed", () => {
    expect(canRestore({ ...baseInput(), dryRunCompleted: false })).toBe(false);
  });

  it("blocks until conflicts reviewed", () => {
    expect(canRestore({ ...baseInput(), conflictsReviewed: false })).toBe(false);
  });

  it("blocks until a safe table is selected", () => {
    expect(canRestore({ ...baseInput(), selectedTablesCount: 0 })).toBe(false);
  });

  it("blocks until checkbox is checked", () => {
    expect(canRestore({ ...baseInput(), confirm: false })).toBe(false);
  });

  it("blocks until user typed RESTORE", () => {
    expect(canRestore({ ...baseInput(), typedRestore: "restor" })).toBe(false);
    expect(canRestore({ ...baseInput(), typedRestore: "" })).toBe(false);
  });

  it("blocks when restore mode not selected", () => {
    expect(canRestore({ ...baseInput(), mode: null })).toBe(false);
  });

  it("blocks while busy", () => {
    expect(canRestore({ ...baseInput(), busy: true })).toBe(false);
  });

  it("checklist labels match the required safety items (order-sensitive)", () => {
    const labels = buildRestoreChecklist(baseInput()).map((c) => c.label);
    expect(labels).toEqual([
      "Backup file validated",
      "Snapshot manifest found",
      "Company scoped",
      "Secrets excluded",
      "PERF data excluded",
      "Dry run completed",
      "Conflicts reviewed",
      "Restore mode selected",
      "Safety confirmation completed",
    ]);
  });
});

describe("restore-safety: importErpovoBackup pipeline respects disabled tables", () => {
  it("safe-flow restore (sanitizeBackupData → importErpovoBackup) never targets disabled tables", async () => {
    // Mock supabase BEFORE importing the module under test.
    const fromSpy = vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }));
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { from: fromSpy },
    }));

    const { importErpovoBackup } = await import("@/lib/erpovo-backup");

    // Backup contains both safe and money-impacting tables.
    const preview = {
      manifest: {
        app: "erpovo" as const,
        version: 1 as const,
        exported_at: new Date().toISOString(),
        company_id: "src-co",
        tables: [],
      },
      data: {
        items: [{ id: 1, name: "Tea" }],
        sales: [{ id: 9, amount: 1000 }],
        payments_in: [{ id: 10, amount: 200 }],
        stock_movements: [{ id: 11, qty: 5 }],
      } as Record<string, Record<string, unknown>[]>,
    };

    const safeData = sanitizeBackupData(preview.data);
    const safeTables = Object.keys(safeData) as ("items" | "parties")[];
    expect(safeTables).toEqual(["items"]);

    await importErpovoBackup(
      { ...preview, data: safeData },
      "dst-co",
      safeTables,
    );

    // supabase.from must never have been called with a disabled table.
    const calledTables = fromSpy.mock.calls.map((c) => (c as unknown as string[])[0]);
    for (const t of REQUIRED_DISABLED) {
      expect(calledTables).not.toContain(t);
    }
    expect(calledTables).toContain("items");

    vi.doUnmock("@/integrations/supabase/client");
  });
});

describe("restore-safety: history entry shape", () => {
  it("a successful restore history entry carries the required fields", () => {
    const entry = {
      ts: new Date().toISOString(),
      file: "backup.zip",
      mode: "merge" as const,
      filter: "all" as const,
      tables: ["items", "parties"],
      dryRun: false,
      inserted: 12,
      skipped: 1,
      errors: 0,
      status: "done" as const,
    };
    for (const k of [
      "ts",
      "file",
      "mode",
      "tables",
      "inserted",
      "skipped",
      "errors",
      "status",
    ]) {
      expect(entry).toHaveProperty(k);
    }
    expect(entry.tables).not.toContain("sales");
    expect(entry.tables).not.toContain("payments_in");
  });
});

describe("restore-safety: invalid backup messaging", () => {
  it("readErpovoBackup throws a clear error on a non-ERPOVO ZIP", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("random.txt", "hello");
    const blob = await zip.generateAsync({ type: "uint8array" });
    const file = new File([blob], "bad.zip", { type: "application/zip" });

    const { readErpovoBackup } = await import("@/lib/erpovo-backup");
    await expect(readErpovoBackup(file)).rejects.toThrow(/Invalid ERPOVO backup/i);
  });
});
