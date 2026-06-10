import { describe, it, expect } from "vitest";
import { parseOT, summarizeAttendance } from "@/lib/attendance-calc";
import { calcSalary, DEFAULT_SETUP, type EmployeeSetup } from "@/lib/payroll-setup";

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

describe("parseOT", () => {
  it("returns 0 for null/empty/non-matching notes", () => {
    expect(parseOT(null)).toBe(0);
    expect(parseOT("")).toBe(0);
    expect(parseOT("some note")).toBe(0);
  });
  it("parses integer and decimal overtime hours", () => {
    expect(parseOT("OT:2")).toBe(2);
    expect(parseOT("OT:2.5")).toBe(2.5);
    expect(parseOT("note OT:3 trailing")).toBe(3);
  });
});

describe("summarizeAttendance", () => {
  it("counts each status type", () => {
    const s = summarizeAttendance([
      { status: "present", note: null },
      { status: "present", note: null },
      { status: "absent", note: null },
      { status: "half", note: null },
      { status: "leave", note: null },
      { status: "overtime", note: "OT:2" },
    ]);
    expect(s.present).toBe(2);
    expect(s.absent).toBe(1);
    expect(s.half).toBe(1);
    expect(s.leave).toBe(1);
    expect(s.overtime_hours).toBe(2);
  });

  it("treats half day as 0.5 effective day", () => {
    const s = summarizeAttendance([
      { status: "present", note: null },
      { status: "present", note: null },
      { status: "half", note: null },
      { status: "half", note: null },
    ]);
    expect(s.days_present).toBe(3);
  });

  it("sums overtime hours across multiple overtime entries", () => {
    const s = summarizeAttendance([
      { status: "overtime", note: "OT:1.5" },
      { status: "overtime", note: "OT:2" },
      { status: "overtime", note: null }, // missing OT tag => 0
    ]);
    expect(s.overtime_hours).toBe(3.5);
  });

  it("ignores deleted marks (caller filters; empty list yields zeros)", () => {
    const s = summarizeAttendance([]);
    expect(s).toEqual({
      present: 0,
      absent: 0,
      half: 0,
      leave: 0,
      overtime_hours: 0,
      days_present: 0,
    });
  });
});

describe("attendance -> salary integration", () => {
  it("editing attendance recalculates salary base proportionally", () => {
    const setupRule = setup({ fixed: { monthly: 26000, working_days: 26 } });
    const first = summarizeAttendance(
      Array.from({ length: 20 }, () => ({ status: "present", note: null })),
    );
    const r1 = calcSalary({
      pay_type: "fixed",
      base_salary: 26000,
      days_present: first.days_present,
      days_total: 26,
      setup: setupRule,
    });
    expect(r1.base).toBe(20000);

    // Edit: one of those days flips to half-day.
    const second = summarizeAttendance([
      ...Array.from({ length: 19 }, () => ({ status: "present", note: null })),
      { status: "half", note: null },
    ]);
    const r2 = calcSalary({
      pay_type: "fixed",
      base_salary: 26000,
      days_present: second.days_present,
      days_total: 26,
      setup: setupRule,
    });
    expect(r2.base).toBe(19500);
  });

  it("overtime mark feeds overtime hours into salary", () => {
    const s = summarizeAttendance([
      { status: "present", note: null },
      { status: "overtime", note: "OT:4" },
    ]);
    const r = calcSalary({
      pay_type: "daily",
      base_salary: 0,
      days_present: s.days_present,
      days_total: 26,
      overtime_hours: s.overtime_hours,
      setup: setup({
        daily: { rate: 500, default_days: 26 },
        overtime: { rate_per_hour: 100, multiplier: 1.5 },
      }),
    });
    expect(r.base).toBe(500); // 1 day x 500
    expect(r.overtime).toBe(600); // 4h x 100 x 1.5
    expect(r.gross).toBe(1100);
  });
});

describe("attendance delete/restore idempotency", () => {
  // The DB-level soft-delete sets deleted_at; the section queries only
  // active rows (deleted_at IS NULL). The salary recompute therefore depends
  // purely on which marks are visible. We simulate that here.
  const allMarks = [
    { id: "a", status: "present", note: null },
    { id: "b", status: "present", note: null },
    { id: "c", status: "present", note: null },
  ];

  it("deleting one mark removes its contribution once", () => {
    const visible = allMarks.filter((m) => m.id !== "b");
    expect(summarizeAttendance(visible).days_present).toBe(2);
  });

  it("deleting the same mark twice does not double-decrement", () => {
    // simulate two delete passes that both filter out 'b'
    const pass1 = allMarks.filter((m) => m.id !== "b");
    const pass2 = pass1.filter((m) => m.id !== "b");
    expect(summarizeAttendance(pass2).days_present).toBe(2);
  });

  it("restoring a previously deleted mark re-adds its contribution exactly once", () => {
    const deleted = allMarks.filter((m) => m.id !== "b");
    const restored = [...deleted, allMarks.find((m) => m.id === "b")!];
    expect(summarizeAttendance(restored).days_present).toBe(3);
    // restoring twice (defensive) still yields 3 unique marks if dedup by id
    const dedup = Array.from(new Map(restored.map((m) => [m.id, m])).values());
    expect(summarizeAttendance(dedup).days_present).toBe(3);
  });
});
