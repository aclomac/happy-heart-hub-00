import { describe, it, expect } from "vitest";
import { evaluateCell, type SyntheticPlanState, type SyntheticRole } from "@/lib/access-matrix";

function cell(
  pathname: string,
  plan: SyntheticPlanState,
  role: SyntheticRole,
  opts: { deviceExceeded?: boolean; companyExceeded?: boolean } = {},
) {
  return evaluateCell({
    pathname,
    plan,
    role,
    deviceExceeded: opts.deviceExceeded ?? false,
    companyExceeded: opts.companyExceeded ?? false,
  });
}

describe("Access matrix — plan gates", () => {
  it("Basic blocks payroll/employees/attendance via direct URL", () => {
    expect(cell("/app/payroll", "basic_trial", "owner")).toBe("plan_lock");
    expect(cell("/app/employees", "basic_trial", "owner")).toBe("plan_lock");
    expect(cell("/app/attendance", "basic_trial", "owner")).toBe("plan_lock");
  });

  it("Basic still allows core modules", () => {
    expect(cell("/app/sales", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/purchases", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/expenses", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/parties", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/items", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/cash", "basic_trial", "owner")).toBe("allowed");
    expect(cell("/app/reports", "basic_trial", "owner")).toBe("allowed");
  });

  it("Gold unlocks payroll/employees/attendance", () => {
    expect(cell("/app/payroll", "gold_active", "owner")).toBe("allowed");
    expect(cell("/app/employees", "gold_active", "owner")).toBe("allowed");
    expect(cell("/app/attendance", "gold_active", "owner")).toBe("allowed");
  });

  it("Pro allows everything", () => {
    expect(cell("/app/payroll", "pro_active", "owner")).toBe("allowed");
    expect(cell("/app/sales", "pro_active", "owner")).toBe("allowed");
  });
});

describe("Access matrix — expiry", () => {
  it("Expired plan blocks protected modules", () => {
    expect(cell("/app/sales", "expired", "owner")).toBe("expired_lock");
    expect(cell("/app/items", "expired", "owner")).toBe("expired_lock");
  });

  it("Expired plan allows subscription/upgrade/settings", () => {
    expect(cell("/app/subscription", "expired", "owner")).toBe("allowed");
    expect(cell("/app/upgrade", "expired", "owner")).toBe("allowed");
    expect(cell("/app/settings", "expired", "owner")).toBe("allowed");
  });

  it("Expired plan allows admin routes only for admins", () => {
    expect(cell("/app/admin/payments", "expired", "owner")).toBe("allowed");
    expect(cell("/app/admin/payments", "expired", "salesman")).toBe("expired_lock");
  });
});

describe("Access matrix — device & company gates", () => {
  it("Device-exceeded blocks every /app route", () => {
    expect(cell("/app/sales", "pro_active", "owner", { deviceExceeded: true })).toBe("device_lock");
    expect(cell("/app/subscription", "pro_active", "owner", { deviceExceeded: true })).toBe(
      "device_lock",
    );
  });

  it("Company-exceeded blocks /companies/new", () => {
    expect(cell("/companies/new", "basic_trial", "owner", { companyExceeded: true })).toBe(
      "company_lock",
    );
  });
});

describe("Access matrix — role permissions", () => {
  it("Salesman can view sales but not reports", () => {
    expect(cell("/app/sales", "pro_active", "salesman")).toBe("allowed");
    expect(cell("/app/reports", "pro_active", "salesman")).toBe("access_denied");
  });

  it("Stock keeper limited to items/parties", () => {
    expect(cell("/app/items", "pro_active", "stock_keeper")).toBe("allowed");
    expect(cell("/app/sales", "pro_active", "stock_keeper")).toBe("access_denied");
    expect(cell("/app/reports", "pro_active", "stock_keeper")).toBe("access_denied");
  });

  it("Accountant gets reports but not POS", () => {
    expect(cell("/app/reports", "pro_active", "accountant")).toBe("allowed");
    expect(cell("/app/pos", "pro_active", "accountant")).toBe("access_denied");
  });

  it("Admin-only routes block non-admins regardless of plan", () => {
    expect(cell("/app/admin", "pro_active", "salesman")).toBe("access_denied");
    expect(cell("/app/admin", "pro_active", "owner")).toBe("allowed");
  });

  it("Owner bypasses role permission gates", () => {
    expect(cell("/app/reports", "pro_active", "owner")).toBe("allowed");
    expect(cell("/app/pos", "pro_active", "owner")).toBe("allowed");
  });
});
