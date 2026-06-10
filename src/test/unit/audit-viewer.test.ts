import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const modal = readFileSync(
  resolve(__dirname, "../../components/erp/audit/AuditHistoryModal.tsx"),
  "utf8",
);
const route = readFileSync(resolve(__dirname, "../../routes/super-admin.audit-logs.tsx"), "utf8");
const appAudit = readFileSync(resolve(__dirname, "../../routes/app.audit.tsx"), "utf8");

describe("audit history modal & viewers wiring", () => {
  it("modal scopes by entity_id when present, else falls back to reference_no", () => {
    expect(modal).toMatch(/args\.entityId/);
    expect(modal).toMatch(/q\.eq\("entity_id", args\.entityId\)/);
    expect(modal).toMatch(/q\.eq\("reference_no", args\.referenceNo\)/);
  });

  it("modal uses safeMetadata helpers (no raw secret leakage)", () => {
    expect(modal).toMatch(/safeMetadataEntries/);
    expect(modal).toMatch(/safeMetadata\(/);
    expect(modal).not.toMatch(/JSON\.stringify\(row\.metadata/);
  });

  it("modal queries the audit_logs table", () => {
    expect(modal).toMatch(/from\("audit_logs"\)/);
  });

  it("super-admin route is guarded by useIsPlatformAdmin and shows access restricted", () => {
    expect(route).toMatch(/useIsPlatformAdmin/);
    expect(route).toMatch(/Access restricted/);
  });

  it("super-admin route shows both platform and app scopes with filters", () => {
    expect(route).toMatch(/platform_audit_logs/);
    expect(route).toMatch(/from\("audit_logs"\)/);
    expect(route).toMatch(/Scope/);
    expect(route).toMatch(/exportCSV/);
  });

  it("super-admin route uses safeMetadataEntries (masking applied)", () => {
    expect(route).toMatch(/safeMetadataEntries/);
    expect(route).toMatch(/actionDisplayLabel/);
  });

  it("app audit page scopes by current company_id (no cross-company leakage)", () => {
    expect(appAudit).toMatch(/\.eq\("company_id", companyId!\)/);
  });

  it("app audit page restricts viewing to owner/admin", () => {
    expect(appAudit).toMatch(/isOwner|isAdmin/);
    expect(appAudit).toMatch(/Access restricted/);
  });

  it("app audit page supports CSV export", () => {
    expect(appAudit).toMatch(/exportCSV\(/);
  });
});
