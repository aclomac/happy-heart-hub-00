import { describe, expect, it } from "vitest";
import {
  ALLOWED_DOCUMENT_EXT,
  ALLOWED_IMAGE_EXT,
  BLOCKED_EXT,
  MAX_FILES_PER_DOCUMENT,
  MAX_FILE_BYTES,
  classifyKind,
  filenameFromPath,
  getExt,
  validateAttachmentFile,
} from "@/lib/document-attachments";
import { DICTIONARY } from "@/lib/i18n";

function makeFile(name: string, type: string, size: number): File {
  // jsdom File constructor accepts content + name + opts
  const blob = new Blob([new Uint8Array(Math.min(size, 4))], { type });
  const f = new File([blob], name, { type });
  // Override size for validation tests without allocating huge buffers.
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("document-attachments validation", () => {
  it("accepts allowed image types", () => {
    for (const ext of ALLOWED_IMAGE_EXT) {
      const f = makeFile(`pic.${ext}`, `image/${ext === "jpg" ? "jpeg" : ext}`, 1024);
      const v = validateAttachmentFile(f);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.kind).toBe("image");
    }
  });

  it("accepts allowed document types", () => {
    for (const ext of ALLOWED_DOCUMENT_EXT) {
      const f = makeFile(`doc.${ext}`, "application/octet-stream", 2048);
      const v = validateAttachmentFile(f);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.kind).toBe("document");
    }
  });

  it("blocks dangerous file types", () => {
    for (const ext of BLOCKED_EXT) {
      const f = makeFile(`bad.${ext}`, "application/octet-stream", 100);
      const v = validateAttachmentFile(f);
      expect(v.ok).toBe(false);
    }
  });

  it("rejects unsupported types", () => {
    const f = makeFile("song.mp3", "audio/mpeg", 100);
    const v = validateAttachmentFile(f);
    expect(v.ok).toBe(false);
  });

  it("rejects files over the size limit", () => {
    const f = makeFile("big.pdf", "application/pdf", MAX_FILE_BYTES + 1);
    const v = validateAttachmentFile(f);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.toLowerCase()).toContain("too large");
  });

  it("rejects empty files", () => {
    const f = makeFile("empty.pdf", "application/pdf", 0);
    const v = validateAttachmentFile(f);
    expect(v.ok).toBe(false);
  });

  it("classifyKind returns null for unknown types", () => {
    expect(classifyKind(makeFile("x.zip", "application/zip", 100))).toBeNull();
  });

  it("getExt + filenameFromPath helpers", () => {
    expect(getExt("foo/bar.PDF")).toBe("pdf");
    expect(filenameFromPath("a/b/c/d.png")).toBe("d.png");
  });

  it("has a sensible per-document attachment cap", () => {
    expect(MAX_FILES_PER_DOCUMENT).toBeGreaterThanOrEqual(20);
  });
});

describe("document-attachments i18n", () => {
  it("Bangla translations exist for required attachment labels", () => {
    const keys = [
      "Attachments",
      "Attach Images",
      "Attach Documents",
      "Upload Image",
      "Upload Document",
      "Download Attachment",
      "Remove Attachment",
      "File too large",
      "Unsupported file type",
      "Attachment uploaded",
      "Attachment removed",
    ];
    for (const k of keys) {
      const entry = DICTIONARY[k];
      expect(entry, `missing key: ${k}`).toBeDefined();
      expect(entry.bn.length).toBeGreaterThan(0);
      expect(entry.bn).not.toBe(entry.en);
    }
  });
});
