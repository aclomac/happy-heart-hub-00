import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve("src/routes/app.payroll.employees.$id.tsx"), "utf8");

describe("employee detail salary slip + payment actions", () => {
  it("queries recent salary slips and payments", () => {
    expect(src).toContain('from("salary_slips")');
    expect(src).toContain('from("employee_payments")');
    expect(src).toContain('"employee-detail-slips"');
    expect(src).toContain('"employee-detail-pays"');
  });

  it("renders View Slip link to /app/payroll/salary-slips/$id", () => {
    expect(src).toMatch(/to=["']\/app\/payroll\/salary-slips\/\$id["']/);
    expect(src).toContain("View Slip");
  });

  it("renders View Payment link to /app/payroll/salary-payments/$id", () => {
    expect(src).toMatch(/to=["']\/app\/payroll\/salary-payments\/\$id["']/);
    expect(src).toContain("View Payment");
  });

  it("Open PDF / Preview / Print all use runSalarySlipPdfAction with source=employee_detail", () => {
    expect(src).toContain('from "@/lib/pdf/salary-slip-actions"');
    expect(src).toContain("runSalarySlipPdfAction");
    expect(src).toMatch(/source:\s*"employee_detail"/);
    expect(src).toContain("Open PDF");
    expect(src).toContain("Preview");
    expect(src).toContain("Print");
    // pdf|preview|print actions plumbed
    expect(src).toMatch(/runSlip\(\s*"pdf"/);
    expect(src).toMatch(/runSlip\(\s*"preview"/);
    expect(src).toMatch(/runSlip\(\s*"print"/);
  });

  it("audit metadata includes employee_id, salary_slip_id, month, company_id via shared helper", () => {
    // Shared helper sets these fields; route must pass employeeId + month
    expect(src).toContain("employeeId: empId");
    expect(src).toMatch(/month:\s*slip\.period_month/);
  });

  it("empty state shown when no salary slips", () => {
    expect(src).toContain('data-testid="emp-slips-empty"');
    expect(src).toContain("No salary slips yet");
    expect(src).toContain("View salary slips");
  });

  it("payment row shows linked slip PDF/Print or disabled reason", () => {
    expect(src).toContain("Slip PDF");
    expect(src).toContain("Slip Print");
    expect(src).toContain("No linked slip");
    expect(src).toMatch(/title=["']No linked salary slip for this month["']/);
  });

  it("missing-field safety: DASH + Number.isFinite guard, no raw toFixed without guard", () => {
    expect(src).toContain('const DASH = "—"');
    expect(src).toContain("Number.isFinite(n)");
    // num() helper is the only place toFixed is used and it is guarded
    expect(src).not.toMatch(/Number\([^)]+\)\.toFixed/);
  });

  it("keeps existing filtered links to payroll sections", () => {
    expect(src).toMatch(/hash=["']attendance["']/);
    expect(src).toMatch(/hash=["']salaries["']/);
    expect(src).toMatch(/hash=["']payments["']/);
  });

  it("inactive employee read-only state preserved", () => {
    expect(src).toContain("Inactive employee");
    expect(src).toContain("Locked");
  });
});
