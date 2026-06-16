import { describe, it, expect } from "vitest";
import { pickLabourRate } from "@/lib/labour-rates";

const base = {
  is_active: true,
  item_id: "p1",
  work_type: "fitting",
};

describe("pickLabourRate", () => {
  it("returns null when no rate matches", () => {
    expect(
      pickLabourRate([], {
        itemId: "p1",
        workType: "fitting",
        employeeId: "e1",
        workDate: "2026-01-10",
      }),
    ).toBeNull();
  });

  it("prefers worker-specific rate over default", () => {
    const rate = pickLabourRate(
      [
        { ...base, employee_id: null, effective_date: "2026-01-01", rate: 50 },
        { ...base, employee_id: "e1", effective_date: "2026-01-01", rate: 60 },
      ],
      { itemId: "p1", workType: "fitting", employeeId: "e1", workDate: "2026-01-10" },
    );
    expect(rate).toBe(60);
  });

  it("picks latest effective_date <= work date", () => {
    const rate = pickLabourRate(
      [
        { ...base, employee_id: null, effective_date: "2026-01-01", rate: 50 },
        { ...base, employee_id: null, effective_date: "2026-01-05", rate: 55 },
        { ...base, employee_id: null, effective_date: "2026-01-20", rate: 70 },
      ],
      { itemId: "p1", workType: "fitting", employeeId: "e1", workDate: "2026-01-10" },
    );
    expect(rate).toBe(55);
  });

  it("ignores inactive and non-matching rows", () => {
    const rate = pickLabourRate(
      [
        { ...base, is_active: false, employee_id: null, effective_date: "2026-01-01", rate: 999 },
        { ...base, work_type: "packing", employee_id: null, effective_date: "2026-01-01", rate: 30 },
        { ...base, employee_id: null, effective_date: "2026-01-01", rate: 50 },
      ],
      { itemId: "p1", workType: "fitting", employeeId: "e1", workDate: "2026-01-10" },
    );
    expect(rate).toBe(50);
  });

  it("falls back to default when no worker-specific rate exists yet", () => {
    const rate = pickLabourRate(
      [
        { ...base, employee_id: null, effective_date: "2026-01-01", rate: 50 },
        { ...base, employee_id: "e2", effective_date: "2026-01-01", rate: 80 },
      ],
      { itemId: "p1", workType: "fitting", employeeId: "e1", workDate: "2026-01-10" },
    );
    expect(rate).toBe(50);
  });
});
