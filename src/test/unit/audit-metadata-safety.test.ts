import { describe, it, expect } from "vitest";
import {
  safeMetadata,
  safeMetadataEntries,
  safeDisplay,
  maskFingerprint,
  isSensitiveKey,
  actionDisplayLabel,
  DASH,
} from "@/lib/audit-metadata-safety";

describe("audit metadata safety", () => {
  it("masks sensitive top-level keys", () => {
    const out = safeMetadata({
      api_key: "abc123",
      webhook_secret: "shh",
      password: "p",
      token: "t",
      name: "Acme",
    }) as Record<string, unknown>;
    expect(out.api_key).toBe("••••••••");
    expect(out.webhook_secret).toBe("••••••••");
    expect(out.password).toBe("••••••••");
    expect(out.token).toBe("••••••••");
    expect(out.name).toBe("Acme");
  });

  it("masks nested sensitive keys", () => {
    const out = safeMetadata({
      payload: { access_token: "x", user: { client_secret: "y", id: "u1" } },
    }) as Record<string, Record<string, unknown>>;
    expect((out.payload as Record<string, unknown>).access_token).toBe("••••••••");
    const user = (out.payload as Record<string, Record<string, unknown>>).user;
    expect(user.client_secret).toBe("••••••••");
    expect(user.id).toBe("u1");
  });

  it("partially masks fingerprint values", () => {
    expect(maskFingerprint("abcd1234efghxyz")).toBe("abcd…hxyz");
    expect(maskFingerprint("short")).toMatch(/rt$/);
    expect(maskFingerprint("")).toBe(DASH);
    const out = safeMetadata({ device_fingerprint: "abcd1234efgh5678" }) as Record<string, unknown>;
    expect(String(out.device_fingerprint)).toMatch(/^abcd…5678$/);
  });

  it("isSensitiveKey is case insensitive", () => {
    expect(isSensitiveKey("API_KEY")).toBe(true);
    expect(isSensitiveKey("Authorization")).toBe(true);
    expect(isSensitiveKey("normal_field")).toBe(false);
  });

  it("safeDisplay returns DASH for null/undefined/empty", () => {
    expect(safeDisplay(null)).toBe(DASH);
    expect(safeDisplay(undefined)).toBe(DASH);
    expect(safeDisplay("")).toBe(DASH);
    expect(safeDisplay(0)).toBe("0");
    expect(safeDisplay(false)).toBe("false");
    expect(safeDisplay({ a: 1 })).toBe('{"a":1}');
  });

  it("safeMetadataEntries returns key/value rows with masking applied", () => {
    const entries = safeMetadataEntries({ api_key: "secret", name: "Acme" });
    const apiKey = entries.find((e) => e.key === "api_key");
    const name = entries.find((e) => e.key === "name");
    expect(apiKey?.value).toBe("••••••••");
    expect(name?.value).toBe("Acme");
  });

  it("actionDisplayLabel normalizes known and unknown actions", () => {
    expect(actionDisplayLabel("salary_slip.pdf_opened")).toBe("PDF opened");
    expect(actionDisplayLabel("approved")).toBe("Approved");
    expect(actionDisplayLabel("under_review")).toBe("Under review");
    expect(actionDisplayLabel("devices_reset_company")).toBe("Devices reset (company)");
    expect(actionDisplayLabel("custom_thing_happened")).toBe("Custom Thing Happened");
    expect(actionDisplayLabel("")).toBe(DASH);
  });

  it("preserves arrays while masking sensitive children", () => {
    const out = safeMetadata([{ token: "x" }, { name: "ok" }]) as Array<Record<string, unknown>>;
    expect(out[0].token).toBe("••••••••");
    expect(out[1].name).toBe("ok");
  });
});
