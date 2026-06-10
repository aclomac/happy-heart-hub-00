import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src", "routes");
const appAudit = readFileSync(join(root, "app.audit.tsx"), "utf8");
const superAudit = readFileSync(join(root, "super-admin.audit-logs.tsx"), "utf8");

describe("audit viewer wiring", () => {
  it("/app/audit has page size selector + sort + presets + saved views", () => {
    expect(appAudit).toContain("audit-page-size");
    expect(appAudit).toContain("audit-sort");
    expect(appAudit).toContain("DatePresetSelect");
    expect(appAudit).toContain("SavedViewsMenu");
  });

  it("/app/audit exposes CSV-page and CSV-all-filtered buttons", () => {
    expect(appAudit).toContain("audit-export-page");
    expect(appAudit).toContain("audit-export-all");
    expect(appAudit).toContain("downloadAllFilteredCsv");
  });

  it("/app/audit resets page to 0 when filters change", () => {
    expect(appAudit).toContain("const applyFilters = (next: AuditFilterValues) => {");
    expect(appAudit).toMatch(/setPage\(0\)/);
  });

  it("/app/audit query key includes pageSize and sortBy", () => {
    expect(appAudit).toContain('["audit:logs", companyId, filters, page, pageSize, sortBy]');
  });

  it("/app/audit scopes RLS by current company_id", () => {
    expect(appAudit).toMatch(/\.eq\("company_id", companyId!\)/);
  });

  it("/super-admin/audit-logs has page size, sort, presets, saved views", () => {
    expect(superAudit).toContain("super-audit-page-size");
    expect(superAudit).toContain("super-audit-sort");
    expect(superAudit).toContain("DatePresetSelect");
    expect(superAudit).toContain('scope="platform"');
  });

  it("/super-admin/audit-logs has page + all-filtered CSV export", () => {
    expect(superAudit).toContain("super-audit-export-page");
    expect(superAudit).toContain("super-audit-export-all");
  });

  it("/super-admin/audit-logs gates on isPlatformAdmin", () => {
    expect(superAudit).toContain("useIsPlatformAdmin");
    expect(superAudit).toContain("Only platform admins can view audit logs.");
  });

  it("/super-admin/audit-logs caps fetch at 2000", () => {
    expect(superAudit).toContain("FETCH_HARD_CAP = 2000");
  });
});
