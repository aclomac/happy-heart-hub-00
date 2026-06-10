import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractImageSource, importItemImages, type ParsedDb } from "@/lib/vyapar-import";
import {
  appendHistory,
  loadHistory,
  newBatchId,
  summarize,
  toReportFile,
} from "@/lib/import-history";

// In-memory items table that simulates a single existing item by name.
const itemsState: { id: string; name: string; image_url: string | null }[] = [
  { id: "it-1", name: "Widget", image_url: null },
];
const updates: { id: string; image_url: string }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const itemsApi = () => {
    let updateValue: { image_url?: string } | null = null;
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.eq = (col: string, val: string) => {
      if (updateValue && col === "id") {
        updates.push({ id: val, image_url: updateValue.image_url ?? "" });
        const row = itemsState.find((r) => r.id === val);
        if (row) row.image_url = updateValue.image_url ?? null;
        updateValue = null;
        return Promise.resolve({ data: null, error: null });
      }
      return api;
    };
    api.is = () => Promise.resolve({ data: itemsState, error: null });
    api.update = (v: { image_url?: string }) => {
      updateValue = v;
      return api;
    };
    api.insert = () => Promise.resolve({ data: null, error: null });
    return api;
  };
  const storage = {
    from: () => ({
      upload: vi.fn(async () => ({ data: { path: "x" }, error: null })),
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
    }),
  };
  return {
    supabase: {
      from: () => itemsApi(),
      storage,
      auth: { getUser: vi.fn() },
    },
  };
});

beforeEach(() => {
  itemsState[0].image_url = null;
  updates.length = 0;
});

describe("vyapar-import: image source extraction", () => {
  it("detects http url", () => {
    const src = extractImageSource({ image_url: "https://x/y.jpg" });
    expect(src?.kind).toBe("url");
  });
  it("detects base64 → data url", () => {
    const src = extractImageSource({ image_base64: "AAA", mime: "image/png" });
    expect(src?.kind).toBe("dataurl");
    expect(String(src?.value)).toMatch(/^data:image\/png;base64,AAA/);
  });
  it("detects raw bytes", () => {
    const src = extractImageSource({ image_blob: new Uint8Array([1, 2, 3]) });
    expect(src?.kind).toBe("bytes");
  });
  it("returns null when nothing usable", () => {
    expect(extractImageSource({})).toBeNull();
  });
});

describe("vyapar-import: importItemImages", () => {
  it("imports from kb_item_images by mapping vyapar item_id → name → existing item", async () => {
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_id: "v1", item_name: "Widget" }]],
        ["kb_item_images", [{ item_id: "v1", image_url: "https://cdn/foo.jpg" }]],
      ]),
    };
    const r = await importItemImages(db, "co-1");
    expect(r.module).toBe("images");
    expect(r.inserted).toBe(1);
    expect(updates[0]?.image_url).toBe("https://cdn/foo.jpg");
  });

  it("falls back to kb_images table when kb_item_images is missing", async () => {
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_id: "v1", item_name: "Widget" }]],
        ["kb_images", [{ item_id: "v1", image_url: "https://cdn/bar.jpg" }]],
      ]),
    };
    const r = await importItemImages(db, "co-1");
    expect(r.inserted).toBe(1);
  });

  it("is idempotent: skips items that already have an image", async () => {
    itemsState[0].image_url = "https://existing";
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_id: "v1", item_name: "Widget" }]],
        ["kb_item_images", [{ item_id: "v1", image_url: "https://cdn/new" }]],
      ]),
    };
    const r = await importItemImages(db, "co-1");
    expect(r.inserted).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it("does not fail when images table is missing", async () => {
    const db: ParsedDb = { tables: new Map() };
    const r = await importItemImages(db, "co-1");
    expect(r.inserted).toBe(0);
    expect(r.errors.length).toBe(0);
  });

  it("uses ItemImageThumb fallback path: unusable row is skipped, not thrown", async () => {
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_id: "v1", item_name: "Widget" }]],
        ["kb_item_images", [{ item_id: "v1" /* no image fields */ }]],
      ]),
    };
    const r = await importItemImages(db, "co-1");
    expect(r.inserted).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it("emits progress events", async () => {
    const events: string[] = [];
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_id: "v1", item_name: "Widget" }]],
        ["kb_item_images", [{ item_id: "v1", image_url: "https://cdn/a" }]],
      ]),
    };
    await importItemImages(db, "co-1", (e) => events.push(e.phase));
    expect(events).toContain("start");
    expect(events).toContain("done");
  });
});

describe("import-history", () => {
  it("appends and reads back entries with safe metadata only", () => {
    const entry = {
      batchId: newBatchId(),
      fileName: "backup.vyb",
      fileSize: 1234,
      fileType: "vyb",
      at: new Date().toISOString(),
      status: "imported" as const,
      source: "vyapar" as const,
      reports: [{ module: "items", inserted: 2, skipped: 1, errorCount: 0 }],
      totals: { inserted: 2, skipped: 1, errors: 0 },
    };
    appendHistory("co-x", entry);
    const hist = loadHistory("co-x");
    expect(hist[0].batchId).toBe(entry.batchId);
    // metadata is sanitized — no PII fields
    const raw = JSON.stringify(hist[0]);
    expect(raw).not.toMatch(/phone|email|address/i);
  });

  it("summarize totals correctly", () => {
    const totals = summarize([
      { module: "items", inserted: 3, skipped: 1, errors: ["e"] },
      { module: "parties", inserted: 2, skipped: 0, errors: [] },
    ]);
    expect(totals).toEqual({ inserted: 5, skipped: 1, errors: 1 });
  });

  it("toReportFile produces a JSON blob", async () => {
    const entry = {
      batchId: "b1",
      fileName: "a.vyb",
      fileSize: 1,
      fileType: "vyb",
      at: "now",
      status: "imported" as const,
      source: "vyapar" as const,
      reports: [],
      totals: { inserted: 0, skipped: 0, errors: 0 },
    };
    const blob = toReportFile(entry, []);
    expect(blob.type).toBe("application/json");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("i18n: bangla labels for import flow", async () => {
  it("translates the new import keys", async () => {
    const mod = await import("@/lib/i18n");
    expect(mod.translate("Import Progress", "bn")).toBe("ইমপোর্ট প্রগ্রেস");
    expect(mod.translate("Import History", "bn")).toBe("ইমপোর্ট হিস্টোরি");
    expect(mod.translate("Parsing File", "bn")).toBe("ফাইল পড়া হচ্ছে");
    expect(mod.translate("Images Imported", "bn")).toBe("ছবি ইমপোর্ট হয়েছে");
    expect(mod.translate("Skipped Rows", "bn")).toBe("বাদ দেওয়া সারি");
    expect(mod.translate("Download Report", "bn")).toBe("রিপোর্ট ডাউনলোড");
    expect(mod.translate("Import Batch", "bn")).toBe("ইমপোর্ট ব্যাচ");
    expect(mod.translate("Import Completed", "bn")).toBe("ইমপোর্ট সম্পন্ন হয়েছে");
    expect(mod.translate("Import Failed", "bn")).toBe("ইমপোর্ট ব্যর্থ হয়েছে");
  });
});
