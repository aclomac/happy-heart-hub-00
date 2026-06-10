import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import {
  detectFileKind,
  isSafeEntryPath,
  isSqliteBytes,
  extractVypFromArchive,
  buildPreview,
  type ParsedDb,
} from "@/lib/vyapar-import";
import { exportErpovoBackup, readErpovoBackup } from "@/lib/erpovo-backup";

// Stub supabase: erpovo backup export queries tables.
vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const api: {
      select: () => typeof api;
      eq: () => typeof api;
      is: () => Promise<{ data: never[]; error: null }>;
    } = {
      select: () => api,
      eq: () => api,
      is: () => Promise.resolve({ data: [], error: null }),
    };
    return api;
  };
  return { supabase: { from: builder, auth: { getUser: vi.fn() } } };
});

function makeFile(name: string, bytes: Uint8Array): File {
  // Cast: File ctor in node test runtime is provided by happy-dom/jsdom.
  return new File([bytes as BlobPart], name);
}

describe("vyapar-import: file kind detection", () => {
  it("detects .vyb / .zip / .vyp / unknown", () => {
    expect(detectFileKind("backup.VYB")).toBe("vyb");
    expect(detectFileKind("foo.zip")).toBe("zip");
    expect(detectFileKind("bar.vyp")).toBe("vyp");
    expect(detectFileKind("bar.sqlite")).toBe("vyp");
    expect(detectFileKind("bar.txt")).toBe("unknown");
  });
});

describe("vyapar-import: zip-slip protection", () => {
  it("rejects path traversal", () => {
    expect(isSafeEntryPath("../etc/passwd")).toBe(false);
    expect(isSafeEntryPath("/abs/path")).toBe(false);
    expect(isSafeEntryPath("C:\\Windows\\foo")).toBe(false);
    expect(isSafeEntryPath("safe/dir/file.vyp")).toBe(true);
  });
});

describe("vyapar-import: SQLite signature", () => {
  it("detects valid SQLite magic header", () => {
    const sig = new TextEncoder().encode("SQLite format 3\0");
    expect(isSqliteBytes(sig)).toBe(true);
    expect(isSqliteBytes(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("vyapar-import: archive extraction", () => {
  it("finds the SQLite .vyp inside a zip", async () => {
    const sqliteBytes = new Uint8Array(100);
    new TextEncoder().encodeInto("SQLite format 3\0", sqliteBytes);
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    zip.file("data.vyp", sqliteBytes);
    const blob = await zip.generateAsync({ type: "uint8array" });
    const file = makeFile("backup.vyb", blob);
    const extracted = await extractVypFromArchive(file);
    expect(isSqliteBytes(extracted)).toBe(true);
  });

  it("throws when no SQLite file present", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    const blob = await zip.generateAsync({ type: "uint8array" });
    const file = makeFile("backup.zip", blob);
    await expect(extractVypFromArchive(file)).rejects.toThrow(/No SQLite/);
  });
});

describe("vyapar-import: preview", () => {
  it("summarises counts and tolerates missing tables", () => {
    const db: ParsedDb = {
      tables: new Map([
        ["kb_items", [{ item_name: "A" }, { item_name: "B" }]],
        ["kb_names", [{ full_name: "Acme" }]],
      ]),
    };
    const pv = buildPreview(db);
    expect(pv.counts.items).toBe(2);
    expect(pv.counts.parties).toBe(1);
    expect(pv.counts.stores).toBe(0);
    expect(pv.tables.find((t) => t.name === "kb_items")?.rows).toBe(2);
  });
});

describe("erpovo-backup: round-trip", () => {
  it("exports a zip with manifest + data and reads it back", async () => {
    const blob = await exportErpovoBackup("co-1");
    expect(blob.size).toBeGreaterThan(0);
    const file = new File([blob], "test.erpovo");
    const pv = await readErpovoBackup(file);
    expect(pv.manifest.app).toBe("erpovo");
    expect(pv.manifest.company_id).toBe("co-1");
    expect(Array.isArray(pv.manifest.tables)).toBe(true);
  });

  it("rejects archives missing the manifest", async () => {
    const zip = new JSZip();
    zip.file("random.txt", "x");
    const buf = await zip.generateAsync({ type: "uint8array" });
    const file = new File([buf as BlobPart], "bad.erpovo");
    await expect(readErpovoBackup(file)).rejects.toThrow(/Invalid/);
  });
});
