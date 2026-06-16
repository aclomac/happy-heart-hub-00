import { describe, it, expect } from "vitest";
import { pickLabourRate, workTypesForItem, pickLabourUnit } from "@/lib/labour-rates";

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

describe("workTypesForItem + auto-fill", () => {
  const rates = [
    { is_active: true, item_id: "barstool", work_type: "full setup", effective_date: "2026-01-01", rate: 120, unit: "pcs", employee_id: null },
  ];

  it("returns one work type when product has a single default rate", () => {
    const wts = workTypesForItem(rates, { itemId: "barstool", workDate: "2026-06-16" });
    expect(wts).toHaveLength(1);
    expect(wts[0].work_type).toBe("full setup");
    expect(wts[0].unit).toBe("pcs");
  });

  it("auto-resolves rate 120 for that single rate", () => {
    const r = pickLabourRate(rates as any, {
      itemId: "barstool", workType: "full setup", employeeId: "ridoy", workDate: "2026-06-16",
    });
    expect(r).toBe(120);
  });

  it("is case-insensitive and trims work type", () => {
    const r = pickLabourRate(rates as any, {
      itemId: "barstool", workType: "  FULL Setup  ", employeeId: "ridoy", workDate: "2026-06-16",
    });
    expect(r).toBe(120);
  });

  it("pickLabourUnit returns matching unit", () => {
    const u = pickLabourUnit(rates as any, {
      itemId: "barstool", workType: "full setup", employeeId: "ridoy", workDate: "2026-06-16",
    });
    expect(u).toBe("pcs");
  });

  it("worker-specific rate overrides default", () => {
    const mixed = [
      ...rates,
      { is_active: true, item_id: "barstool", work_type: "full setup", effective_date: "2026-01-01", rate: 150, unit: "pcs", employee_id: "ridoy" },
    ];
    const r = pickLabourRate(mixed as any, {
      itemId: "barstool", workType: "full setup", employeeId: "ridoy", workDate: "2026-06-16",
    });
    expect(r).toBe(150);
  });
});
