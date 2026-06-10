import { describe, it, expect } from "vitest";
import { DEFAULT_PERMISSIONS, ALL_MODULES, ALL_ACTIONS, ROLES } from "@/lib/permissions";

describe("Role permission matrix", () => {
  it("owner has every action on every module", () => {
    for (const m of ALL_MODULES) {
      for (const a of ALL_ACTIONS) {
        expect(DEFAULT_PERMISSIONS.owner[m]?.[a]).toBe(true);
      }
    }
  });

  it("admin has every action on every module", () => {
    for (const m of ALL_MODULES) {
      for (const a of ALL_ACTIONS) {
        expect(DEFAULT_PERMISSIONS.admin[m]?.[a]).toBe(true);
      }
    }
  });

  it("manager has full access except settings", () => {
    expect(DEFAULT_PERMISSIONS.manager.sales?.edit).toBe(true);
    expect(DEFAULT_PERMISSIONS.manager.settings).toBeUndefined();
  });

  it("accountant can access sales, purchases, cash and reports", () => {
    expect(DEFAULT_PERMISSIONS.accountant.sales?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.accountant.purchases?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.accountant.cash?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.accountant.reports?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.accountant.payroll).toBeUndefined();
  });

  it("stock_keeper limited to items and purchases", () => {
    expect(DEFAULT_PERMISSIONS.stock_keeper.items?.edit).toBe(true);
    expect(DEFAULT_PERMISSIONS.stock_keeper.purchases?.edit).toBe(true);
    expect(DEFAULT_PERMISSIONS.stock_keeper.cash).toBeUndefined();
  });

  it("salesman has sales/pos plus read-only parties & items", () => {
    expect(DEFAULT_PERMISSIONS.salesman.sales?.add).toBe(true);
    expect(DEFAULT_PERMISSIONS.salesman.pos?.add).toBe(true);
    expect(DEFAULT_PERMISSIONS.salesman.parties?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.salesman.parties?.edit).toBeFalsy();
    expect(DEFAULT_PERMISSIONS.salesman.items?.view).toBe(true);
    expect(DEFAULT_PERMISSIONS.salesman.items?.edit).toBeFalsy();
  });

  it("biller cannot delete", () => {
    expect(DEFAULT_PERMISSIONS.biller.sales?.add).toBe(true);
    expect(DEFAULT_PERMISSIONS.biller.sales?.delete).toBeFalsy();
  });

  it("hr_manager only has payroll", () => {
    expect(DEFAULT_PERMISSIONS.hr_manager.payroll?.edit).toBe(true);
    expect(DEFAULT_PERMISSIONS.hr_manager.sales).toBeUndefined();
  });

  it("viewer is read-only across every module", () => {
    for (const m of ALL_MODULES) {
      expect(DEFAULT_PERMISSIONS.viewer[m]?.view).toBe(true);
      expect(DEFAULT_PERMISSIONS.viewer[m]?.edit).toBeFalsy();
      expect(DEFAULT_PERMISSIONS.viewer[m]?.delete).toBeFalsy();
    }
  });

  it("exposes the canonical role list", () => {
    const values = ROLES.map((r) => r.value).sort();
    expect(values).toContain("owner");
    expect(values).toContain("admin");
    expect(values).toContain("manager");
    expect(values).toContain("accountant");
    expect(values).toContain("stock_keeper");
    expect(values).toContain("salesman");
    expect(values).toContain("viewer");
  });

  it("includes export action in the matrix", () => {
    expect(ALL_ACTIONS).toContain("export");
    expect(DEFAULT_PERMISSIONS.admin.reports?.export).toBe(true);
  });
});
