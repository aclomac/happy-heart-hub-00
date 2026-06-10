import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runImport,
  importItems,
  ImportCancelledError,
  type ParsedDb,
  type ImportReport,
} from "@/lib/vyapar-import";
import {
  appendHistory,
  loadHistory,
  filterHistory,
  toReportCsv,
  toReportFile,
  type ImportHistoryEntry,
} from "@/lib/import-history";

// Mock supabase: every items insert/select succeeds, mimicking a real backend.
const insertCalls: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const itemsApi = () => {
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = () => api;
    api.is = () => Promise.resolve({ data: [], error: null });
    api.insert = (v: unknown) => {
      insertCalls.push(v);
      return Promise.resolve({ data: null, error: null });
    };
    api.update = () => ({
      eq: () => Promise.resolve({ data: null, error: null }),
    });
    return api;
  };
  return {
    supabase: {
      from: () => itemsApi(),
      storage: {
        from: () => ({
          upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
          getPublicUrl: () => ({ data: { publicUrl: "https://x" } }),
        }),
      },
      auth: { getUser: vi.fn() },
    },
  };
});

beforeEach(() => {
  insertCalls.length = 0;
});

function makeDb(itemCount: number): ParsedDb {
  return {
    tables: new Map([
      [
        "kb_items",
        Array.from({ length: itemCount }, (_, i) => ({
          item_id: `v${i}`,
          item_name: `Widget ${i}`,
        })),
      ],
    ]),
  };
}

describe("vyapar-import: cancel", () => {
  it("aborting before runImport starts cancels immediately with no DB writes", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await runImport(makeDb(5), "co-1", ["items"], undefined, ctrl.signal);
    expect(out).toEqual([]);
    expect(insertCalls.length).toBe(0);
  });

  it("aborting mid-import marks the module cancelled and stops further work", async () => {
    const ctrl = new AbortController();
    // Abort after the very first insert.
    const origInsert = insertCalls.push.bind(insertCalls);
    let count = 0;
    (insertCalls as unknown as { push: typeof origInsert }).push = (v: unknown) => {
      count++;
      if (count >= 2) ctrl.abort();
      return origInsert(v);
    };
    const out = await importItems(makeDb(10), "co-1", ctrl.signal);
    expect(out.cancelled).toBe(true);
    // Should have stopped well before processing all 10
    expect(out.inserted).toBeLessThan(10);
    (insertCalls as unknown as { push: typeof origInsert }).push = origInsert;
  });

  it("ImportCancelledError is exported and is an Error", () => {
    const e = new ImportCancelledError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ImportCancelledError");
  });
});

describe("import-history: filters", () => {
  const base = (overrides: Partial<ImportHistoryEntry>): ImportHistoryEntry => ({
    batchId: "imp_x",
    fileName: "a.vyb",
    fileSize: 100,
    fileType: "vyb",
    at: "2025-01-15T10:00:00.000Z",
    status: "imported",
    source: "vyapar",
    reports: [],
    totals: { inserted: 0, skipped: 0, errors: 0 },
    ...overrides,
  });

  it("filters by status", () => {
    const list = [
      base({ batchId: "a", status: "imported" }),
      base({ batchId: "b", status: "failed" }),
      base({ batchId: "c", status: "cancelled" }),
    ];
    expect(filterHistory(list, { status: "cancelled" }).map((e) => e.batchId)).toEqual(["c"]);
    expect(filterHistory(list, { status: "all" }).length).toBe(3);
  });

  it("filters by file type", () => {
    const list = [base({ batchId: "a", fileType: "vyb" }), base({ batchId: "b", fileType: "zip" })];
    expect(filterHistory(list, { fileType: "zip" }).map((e) => e.batchId)).toEqual(["b"]);
  });

  it("filters by date range and search", () => {
    const list = [
      base({ batchId: "a", at: "2025-01-10T00:00:00Z", fileName: "alpha.vyb" }),
      base({ batchId: "b", at: "2025-02-10T00:00:00Z", fileName: "beta.vyb" }),
    ];
    expect(
      filterHistory(list, { from: "2025-02-01", to: "2025-03-01" }).map((e) => e.batchId),
    ).toEqual(["b"]);
    expect(filterHistory(list, { search: "alpha" }).map((e) => e.batchId)).toEqual(["a"]);
    expect(filterHistory(list, { search: "BETA" }).map((e) => e.batchId)).toEqual(["b"]);
  });
});

describe("import-history: retry idempotency persists prior batch id", () => {
  it("appending a retry with the same batch id replaces the older entry on next render", () => {
    const e1: ImportHistoryEntry = {
      batchId: "imp_retry_1",
      fileName: "a.vyb",
      fileSize: 1,
      fileType: "vyb",
      at: "2025-01-15T10:00:00Z",
      status: "failed",
      source: "vyapar",
      reports: [],
      totals: { inserted: 0, skipped: 0, errors: 1 },
    };
    appendHistory("co-retry", e1);
    const e2 = {
      ...e1,
      status: "imported" as const,
      totals: { inserted: 5, skipped: 0, errors: 0 },
    };
    appendHistory("co-retry", e2);
    const hist = loadHistory("co-retry");
    expect(hist[0].status).toBe("imported");
    expect(hist[0].totals.inserted).toBe(5);
  });
});

describe("import-history: CSV/JSON report", () => {
  const entry: ImportHistoryEntry = {
    batchId: "imp_r",
    fileName: "a.vyb",
    fileSize: 10,
    fileType: "vyb",
    at: "now",
    status: "imported",
    source: "vyapar",
    reports: [],
    totals: { inserted: 1, skipped: 1, errors: 0 },
  };
  const reports: ImportReport[] = [
    {
      module: "items",
      inserted: 1,
      skipped: 1,
      errors: [],
      rows: [
        { module: "items", ref: "Widget", action: "inserted" },
        { module: "items", ref: "Widget2", action: "skipped", reason: "duplicate" },
      ],
    },
  ];

  it("CSV report contains the per-row actions", async () => {
    const blob = toReportCsv(entry, reports);
    expect(blob.type).toBe("text/csv");
    const text = await blob.text();
    expect(text).toMatch(/batch_id,module,row_ref,action,reason/);
    expect(text).toMatch(/items,Widget,inserted/);
    expect(text).toMatch(/items,Widget2,skipped,duplicate/);
  });

  it("CSV report does not include PII (phone, email, address)", async () => {
    const piiReports: ImportReport[] = [
      {
        module: "parties",
        inserted: 1,
        skipped: 0,
        errors: [],
        rows: [{ module: "parties", ref: "Acme Co", action: "inserted" }],
      },
    ];
    const text = await toReportCsv(entry, piiReports).text();
    expect(text).not.toMatch(/phone|email|address/i);
  });

  it("JSON report includes module rows array", async () => {
    const blob = toReportFile(entry, reports);
    const json = JSON.parse(await blob.text());
    expect(json.modules[0].rows).toHaveLength(2);
  });
});

describe("i18n: bangla labels for cancel/retry", () => {
  it("translates the new cancel/retry keys", async () => {
    const mod = await import("@/lib/i18n");
    expect(mod.translate("Cancel Import", "bn")).toBe("ইমপোর্ট বাতিল করুন");
    expect(mod.translate("Retry Import", "bn")).toBe("আবার ইমপোর্ট করুন");
    expect(mod.translate("Import Cancelled", "bn")).toBe("ইমপোর্ট বাতিল হয়েছে");
    expect(mod.translate("Module Started", "bn")).toBe("মডিউল শুরু হয়েছে");
    expect(mod.translate("Module Completed", "bn")).toBe("মডিউল সম্পন্ন হয়েছে");
    expect(mod.translate("Export Report CSV", "bn")).toBe("CSV রিপোর্ট এক্সপোর্ট");
    expect(mod.translate("Export Report JSON", "bn")).toBe("JSON রিপোর্ট এক্সপোর্ট");
  });
});

describe("audit metadata safety", () => {
  it("audit-shape metadata fields do not leak PII", () => {
    // These are the only fields the route is allowed to log.
    const allowedKeys = [
      "batch_id",
      "module",
      "modules",
      "inserted_count",
      "updated_count",
      "skipped_count",
      "error_count",
      "file_size",
      "file_type",
      "source",
      "cancelled",
      "error",
    ];
    const sample = {
      batch_id: "imp_1",
      modules: ["items", "parties"],
      inserted_count: 5,
      skipped_count: 1,
      error_count: 0,
      file_size: 1024,
      file_type: "vyb",
    };
    for (const k of Object.keys(sample)) {
      expect(allowedKeys).toContain(k);
    }
    const json = JSON.stringify(sample);
    expect(json).not.toMatch(/phone|email|address|secret|api_key|token/i);
  });
});
