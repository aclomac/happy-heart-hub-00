import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calcSalary, DEFAULT_SETUP, isContractPayType } from "@/lib/payroll-setup";
import { isDailyWageEmployee } from "@/lib/daily-wage";

const root = join(__dirname, "..", "..", "..");

describe("Contract / Piece Rate pay type", () => {
  it("is exposed in Employee form select", () => {
    const src = readFileSync(
      join(root, "src/components/erp/payroll/EmployeesSection.tsx"),
      "utf8",
    );
    expect(src).toMatch(/value="contract"/);
    expect(src).toMatch(/Contract \/ Piece Rate/);
    expect(src).toMatch(
      /Contract worker payment is calculated from Contract Work entries and Labour Rates\./,
    );
  });

  it("is exposed in Salary Setup select", () => {
    const src = readFileSync(
      join(root, "src/components/erp/payroll/SalarySetupSection.tsx"),
      "utf8",
    );
    expect(src).toMatch(/value="contract"/);
    expect(src).toMatch(/Contract \/ Piece Rate/);
    expect(src).toMatch(/Contract Worker Setup/);
  });

  it("excludes contract workers from monthly salary generation targets", () => {
    const src = readFileSync(
      join(root, "src/components/erp/payroll/SalaryPaymentsSection.tsx"),
      "utf8",
    );
    expect(src).toMatch(/pay_type !== "contract"/);
  });

  it("calcSalary returns zero for contract pay type", () => {
    const out = calcSalary({
      pay_type: "contract",
      base_salary: 30000,
      daily_wage: 500,
      days_present: 20,
      days_total: 26,
      overtime_hours: 5,
      setup: { ...DEFAULT_SETUP },
    });
    expect(out.gross).toBe(0);
    expect(out.net).toBe(0);
  });

  it("isContractPayType helper", () => {
    expect(isContractPayType("contract")).toBe(true);
    expect(isContractPayType("fixed")).toBe(false);
    expect(isContractPayType(null)).toBe(false);
  });

  it("isDailyWageEmployee excludes contract workers even when daily_wage > 0", () => {
    expect(
      isDailyWageEmployee({
        id: "e1",
        name: "x",
        code: null,
        daily_wage: 500,
        pay_type: "contract",
      }),
    ).toBe(false);
    expect(
      isDailyWageEmployee({
        id: "e2",
        name: "x",
        code: null,
        daily_wage: 500,
        pay_type: "daily",
      }),
    ).toBe(true);
  });

  it("Contract Work and Contract Payments dropdowns include all active employees (so contract workers appear)", () => {
    const cw = readFileSync(
      join(root, "src/components/erp/payroll/ContractWorkSection.tsx"),
      "utf8",
    );
    const cp = readFileSync(
      join(root, "src/components/erp/payroll/ContractPaymentsSection.tsx"),
      "utf8",
    );
    // both query active employees without restricting pay_type, so contract workers appear
    expect(cw).toMatch(/from\("employees"\)[\s\S]*is_active/);
    expect(cp).toMatch(/from\("employees"\)[\s\S]*is_active/);
    expect(cw).not.toMatch(/pay_type[^=]*!=\s*"contract"/);
    expect(cp).not.toMatch(/pay_type[^=]*!=\s*"contract"/);
  });
});
