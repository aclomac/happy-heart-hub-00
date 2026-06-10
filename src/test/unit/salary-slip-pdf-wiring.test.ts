import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(p), "utf8");

describe("salary slip PDF wiring across payroll surfaces", () => {
  const helper = read("src/lib/pdf/salary-slip-actions.ts");

  it("shared helper builds via real builder + invoice pdf + audit", () => {
    expect(helper).toContain('from "@/lib/pdf/build-salary-slip"');
    expect(helper).toContain("buildSalarySlipData");
    expect(helper).toContain("downloadInvoicePDF");
    expect(helper).toContain("printInvoicePDF");
    expect(helper).toContain("generateInvoicePDF");
    expect(helper).toContain("salary_slip.pdf_opened");
    expect(helper).toContain("salary_slip.previewed");
    expect(helper).toContain("salary_slip.printed");
    expect(helper).toContain("source");
    expect(helper).toContain("salary_slip_id");
    expect(helper).toContain("employee_id");
    expect(helper).toContain("company_id");
  });

  it("salary slip detail route uses shared helper", () => {
    const src = read("src/routes/app.payroll.salary-slips.$id.tsx");
    expect(src).toContain("runSalarySlipPdfAction");
    expect(src).toMatch(/source:\s*"drilldown"/);
    expect(src).not.toMatch(/window\.print\(\)/);
  });

  it("payroll reports table rows use real builder via SlipRowActions", () => {
    const src = read("src/components/erp/payroll/PayrollReportsSection.tsx");
    expect(src).toContain('from "@/lib/pdf/salary-slip-actions"');
    expect(src).toContain("SlipRowActions");
    expect(src).toMatch(/source:\s*"payroll_report"/);
    // Both monthly + employee tables wired
    const occurrences = src.match(/<SlipRowActions/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("SalarySlipDialog Print/PDF use real builder, not HTML window.open", () => {
    const src = read("src/components/erp/payroll/SalaryPaymentsSection.tsx");
    expect(src).toContain("runSalarySlipPdfAction");
    expect(src).toMatch(/source:\s*"payroll_report"/);
    // The HTML-print fallback path should be gone for printSlip/downloadPdf
    expect(src).not.toMatch(/setTimeout\(\(\)\s*=>\s*w\.print\(\)/);
  });

  it("salary payment detail wires Linked slip PDF + Print via builder", () => {
    const src = read("src/routes/app.payroll.salary-payments.$id.tsx");
    expect(src).toContain("runSalarySlipPdfAction");
    expect(src).toMatch(/source:\s*"salary_payment"/);
    expect(src).toContain("Slip PDF");
    expect(src).toContain("Slip Print");
    // Plain navigation still preserved
    expect(src).toContain("Linked slip");
  });

  it("employee detail still links to filtered slips/payments lists", () => {
    const src = read("src/routes/app.payroll.employees.$id.tsx");
    expect(src).toContain("Salary slips");
    expect(src).toContain("Payments");
    expect(src).toContain("Attendance");
  });
});
