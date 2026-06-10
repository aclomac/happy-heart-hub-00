import { describe, expect, it } from "vitest";
import { DICTIONARY } from "@/lib/i18n";

describe("AttachmentsSection status/retry i18n", () => {
  it("has all required status/retry labels translated to Bangla", () => {
    const keys = [
      "Pending",
      "Uploading",
      "Uploaded",
      "Failed",
      "Retry",
      "Remove from queue",
      "Upload failed",
    ];
    for (const k of keys) {
      const e = DICTIONARY[k];
      expect(e, `missing key: ${k}`).toBeDefined();
      expect(e.bn.length).toBeGreaterThan(0);
      expect(e.bn).not.toBe(e.en);
    }
  });

  it("status labels are distinct from each other", () => {
    const labels = ["Pending", "Uploading", "Uploaded", "Failed"].map((k) => DICTIONARY[k].bn);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
