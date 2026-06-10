import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(p), "utf8");

describe("salary slip E2E fixture wiring", () => {
  const seeders = read("e2e/fixtures/seeders.ts");

  it("exports an idempotent ensureSalarySlipFixture helper", () => {
    expect(seeders).toContain("export async function ensureSalarySlipFixture");
    // Idempotency = stable lookup keys
    expect(seeders).toContain("E2E-SLIP-EMP");
    expect(seeders).toContain("E2E-SLIP-PAY");
    // Looks up before insert for each entity
    const lookupHits = seeders.match(/\.maybeSingle\(\)/g) ?? [];
    expect(lookupHits.length).toBeGreaterThanOrEqual(3);
    // Attendance is upserted, never duplicated
    expect(seeders).toMatch(/from\("attendance"\)\s*\.upsert/);
    expect(seeders).toContain("ignoreDuplicates: true");
  });

  it("creates employee + slip + payment relation", () => {
    expect(seeders).toContain('from("employees")');
    expect(seeders).toContain('from("salary_slips")');
    expect(seeders).toContain('from("employee_payments")');
    expect(seeders).toMatch(/period_month/);
    expect(seeders).toMatch(/return\s*\{\s*employeeId,\s*slipId,\s*paymentId,\s*periodMonth\s*\}/);
  });

  it("salary slip smoke spec uses the fixture and skips safely", () => {
    const spec = read("e2e/smoke/salary-slip-actions.spec.ts");
    expect(spec).toContain("ensureSalarySlipFixture");
    expect(spec).toContain("E2E_BASE_URL");
    expect(spec).toContain("E2E_COMPANY_ID");
    expect(spec).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(spec).toMatch(/test\.skip\(!fixture/);
    // Covers all four surfaces
    expect(spec).toContain("/app/payroll/salary-slips/");
    expect(spec).toContain("/app/payroll/employees/");
    expect(spec).toContain("/app/payroll/salary-payments/");
    expect(spec).toContain("#reports");
    // PDF actions wired
    expect(spec).toMatch(/Open PDF/);
    expect(spec).toMatch(/Preview/);
    expect(spec).toMatch(/Print/);
  });
});
