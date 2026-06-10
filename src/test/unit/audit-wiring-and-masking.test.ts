import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeMetadata, safeMetadataEntries } from "@/lib/audit-metadata-safety";

/**
 * Wiring + safety checks for the existing per-entity history dialogs and
 * the shared AuditHistoryModal primitive.
 *
 * The existing inline dialogs intentionally do NOT dump raw metadata, so
 * the masking risk is limited to the shared modal and the audit viewers.
 */

function read(p: string) {
  return readFileSync(resolve(__dirname, "../../", p), "utf8");
}

const FILES = {
  modal: "components/erp/audit/AuditHistoryModal.tsx",
  appAudit: "routes/app.audit.tsx",
  superAudit: "routes/super-admin.audit-logs.tsx",
  sales: "components/erp/SaleInvoiceActions.tsx",
  purchases: "components/erp/PurchaseBillActions.tsx",
  payments: "components/erp/PaymentActions.tsx",
  expense: "components/erp/ExpenseRowActions.tsx",
  stockAdj: "components/erp/StockAdjustmentRowActions.tsx",
  stockXfer: "components/erp/StockTransferRowActions.tsx",
};

describe("audit history dialogs — RLS safety and entity scoping", () => {
  it("every per-entity history dialog scopes by company_id (no cross-company leak)", () => {
    for (const key of [
      "sales",
      "purchases",
      "payments",
      "expense",
      "stockAdj",
      "stockXfer",
    ] as const) {
      const src = read(FILES[key]);
      expect(src, `${key} must scope by company_id`).toMatch(/\.eq\("company_id",\s*companyId\)/);
    }
  });

  it("every per-entity history dialog filters by entity_id with reference_no fallback", () => {
    for (const key of [
      "sales",
      "purchases",
      "payments",
      "expense",
      "stockAdj",
      "stockXfer",
    ] as const) {
      const src = read(FILES[key]);
      expect(src, `${key} should query entity_id or reference_no`).toMatch(
        /entity_id\.eq\.|reference_no\.eq\./,
      );
    }
  });

  it("per-entity dialogs never render raw metadata JSON in the dialog", () => {
    for (const key of [
      "sales",
      "purchases",
      "payments",
      "expense",
      "stockAdj",
      "stockXfer",
    ] as const) {
      const src = read(FILES[key]);
      // No raw JSON.stringify of the metadata field inside the dialog
      expect(src, `${key} must not stringify raw metadata`).not.toMatch(
        /JSON\.stringify\(\s*l\.metadata/,
      );
    }
  });

  it("shared AuditHistoryModal exists and uses masked metadata helpers", () => {
    const src = read(FILES.modal);
    expect(src).toMatch(/safeMetadataEntries/);
    expect(src).toMatch(/safeMetadata\(/);
    expect(src).not.toMatch(/JSON\.stringify\(row\.metadata/);
  });
});

describe("audit metadata masking — required fields", () => {
  it.each([
    ["api_key", "abc"],
    ["webhook_secret", "x"],
    ["password", "x"],
    ["token", "x"],
    ["authorization", "Bearer xyz"],
    ["stripe_secret", "x"],
    ["client_secret", "x"],
  ])("masks %s", (key, value) => {
    const out = safeMetadata({ [key]: value }) as Record<string, unknown>;
    expect(out[key]).toBe("••••••••");
  });

  it("partially masks device_fingerprint values", () => {
    const out = safeMetadata({ device_fingerprint: "abcd1234efgh5678" }) as Record<string, unknown>;
    expect(String(out.device_fingerprint)).toMatch(/^abcd…5678$/);
  });

  it("safeMetadataEntries renders null/undefined as the em-dash", () => {
    const entries = safeMetadataEntries({ note: null, empty: undefined, val: "ok" });
    expect(entries.find((e) => e.key === "note")?.value).toBe("—");
    expect(entries.find((e) => e.key === "empty")?.value).toBe("—");
    expect(entries.find((e) => e.key === "val")?.value).toBe("ok");
  });
});

describe("audit viewers — export buttons present", () => {
  it("/app/audit exposes CSV, Print, and PDF buttons", () => {
    const src = read(FILES.appAudit);
    expect(src).toMatch(/onClick=\{downloadCsv\}/);
    expect(src).toMatch(/onClick=\{onPrint\}/);
    expect(src).toMatch(/onClick=\{onPdf\}/);
  });

  it("/super-admin/audit-logs exposes CSV export", () => {
    const src = read(FILES.superAudit);
    expect(src).toMatch(/onClick=\{downloadPageCsv\}/);
    expect(src).toMatch(/onClick=\{downloadAllCsv\}/);
    expect(src).toMatch(/exportCSV\(/);
  });
});
