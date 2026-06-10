import { describe, it, expect } from "vitest";
import {
  calcSalary,
  parseSetup,
  serializeSetup,
  DEFAULT_SETUP,
  type EmployeeSetup,
} from "@/lib/payroll-setup";

function setup(overrides: Partial<EmployeeSetup> = {}): EmployeeSetup {
  return {
    ...DEFAULT_SETUP,
    ...overrides,
    fixed: { ...DEFAULT_SETUP.fixed, ...(overrides.fixed ?? {}) },
    daily: { ...DEFAULT_SETUP.daily, ...(overrides.daily ?? {}) },
    overtime: { ...DEFAULT_SETUP.overtime, ...(overrides.overtime ?? {}) },
    bonuses: overrides.bonuses ?? [],
    deductions: overrides.deductions ?? [],
    advances: overrides.advances ?? [],
  };
}

describe("calcSalary - fixed monthly", () => {
  it("pays full salary for full attendance", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 26000,
      days_present: 26,
      days_total: 26,
      setup: setup({ fixed: { monthly: 26000, working_days: 26 } }),
    });
    expect(r.base).toBe(26000);
    expect(r.net).toBe(26000);
  });

  it("prorates fixed salary by days present", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 26000,
      days_present: 13,
      days_total: 26,
      setup: setup({ fixed: { monthly: 26000, working_days: 26 } }),
    });
    expect(r.base).toBe(13000);
    expect(r.net).toBe(13000);
  });
});

describe("calcSalary - daily wage / Hajira", () => {
  it("multiplies daily rate by days present", () => {
    const r = calcSalary({
      pay_type: "daily",
      base_salary: 0,
      daily_wage: 500,
      days_present: 20,
      days_total: 26,
      setup: setup({ daily: { rate: 500, default_days: 26 } }),
    });
    expect(r.base).toBe(10000);
    expect(r.net).toBe(10000);
  });
});

describe("calcSalary - overtime / bonus / deduction / advance", () => {
  it("adds overtime hours * rate * multiplier", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 26000,
      days_present: 26,
      days_total: 26,
      overtime_hours: 5,
      setup: setup({
        fixed: { monthly: 26000, working_days: 26 },
        overtime: { rate_per_hour: 100, multiplier: 1.5 },
      }),
    });
    expect(r.overtime).toBe(750);
    expect(r.gross).toBe(26750);
    expect(r.net).toBe(26750);
  });

  it("applies fixed and percent bonuses & deductions in correct order", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 20000,
      days_present: 26,
      days_total: 26,
      setup: setup({
        fixed: { monthly: 20000, working_days: 26 },
        bonuses: [{ name: "Festival", amount: 2000, type: "fixed" }],
        deductions: [{ name: "PF", amount: 5, type: "percent" }], // 5% of gross 20000 = 1000
      }),
    });
    expect(r.gross).toBe(20000);
    expect(r.bonus_total).toBe(2000);
    expect(r.deduction_total).toBe(1000);
    expect(r.net).toBe(21000);
  });

  it("recovers outstanding advance, capped at net-positive amount", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 10000,
      days_present: 26,
      days_total: 26,
      setup: setup({
        fixed: { monthly: 10000, working_days: 26 },
        advances: [{ date: "2025-01-01", amount: 3000, recovered: 1000 }],
      }),
    });
    // Outstanding advance = 2000, recovered from gross
    expect(r.advance_recovery).toBe(2000);
    expect(r.net).toBe(8000);
  });

  it("advance recovery never makes net go below zero", () => {
    const r = calcSalary({
      pay_type: "fixed",
      base_salary: 1000,
      days_present: 26,
      days_total: 26,
      setup: setup({
        fixed: { monthly: 1000, working_days: 26 },
        advances: [{ date: "2025-01-01", amount: 99999, recovered: 0 }],
      }),
    });
    expect(r.net).toBe(0);
  });
});

describe("payroll-setup round-trip", () => {
  it("serialize → parse preserves setup", () => {
    const original = setup({
      fixed: { monthly: 30000, working_days: 30 },
      daily: { rate: 800, default_days: 26 },
      bonuses: [{ name: "Eid", amount: 5000, type: "fixed" }],
      deductions: [{ name: "Tax", amount: 10, type: "percent" }],
      overtime: { rate_per_hour: 120, multiplier: 2 },
      advances: [{ date: "2025-02-01", amount: 1000, recovered: 0 }],
    });
    const round = parseSetup(serializeSetup(original));
    expect(round.fixed).toEqual(original.fixed);
    expect(round.daily).toEqual(original.daily);
    expect(round.bonuses).toEqual(original.bonuses);
    expect(round.deductions).toEqual(original.deductions);
    expect(round.overtime).toEqual(original.overtime);
    expect(round.advances).toEqual(original.advances);
  });

  it("treats unparseable notes as free text and returns defaults", () => {
    const r = parseSetup("just a note");
    expect(r.fixed.working_days).toBe(26);
    expect(r.free_notes).toBe("just a note");
  });

  it("returns defaults for empty notes", () => {
    expect(parseSetup(null).fixed.monthly).toBe(0);
    expect(parseSetup("").bonuses).toEqual([]);
  });
});
