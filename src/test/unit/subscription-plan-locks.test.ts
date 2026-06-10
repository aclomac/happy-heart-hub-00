import { describe, it, expect } from "vitest";
import { PLAN_FEATURES, PLAN_LIMITS, planAllowsModule, nextPlan } from "@/lib/use-subscription";

describe("Subscription plan locks", () => {
  describe("PLAN_LIMITS", () => {
    it("Basic = 1 company / 1 device / free", () => {
      expect(PLAN_LIMITS.basic.max_companies).toBe(1);
      expect(PLAN_LIMITS.basic.max_devices).toBe(1);
      expect(PLAN_LIMITS.basic.price).toBe(0);
    });
    it("Gold = 2 companies / 2 devices / $60", () => {
      expect(PLAN_LIMITS.gold.max_companies).toBe(2);
      expect(PLAN_LIMITS.gold.max_devices).toBe(2);
      expect(PLAN_LIMITS.gold.price).toBe(60);
    });
    it("Pro = unlimited companies / 10 devices / $100", () => {
      expect(PLAN_LIMITS.pro.max_companies).toBeGreaterThanOrEqual(999999);
      expect(PLAN_LIMITS.pro.max_devices).toBe(10);
      expect(PLAN_LIMITS.pro.price).toBe(100);
    });
  });

  describe("PLAN_FEATURES payroll/employee/attendance gates", () => {
    it("Basic locks payroll, employee, attendance", () => {
      expect(PLAN_FEATURES.basic.payrollEnabled).toBe(false);
      expect(PLAN_FEATURES.basic.employeeEnabled).toBe(false);
      expect(PLAN_FEATURES.basic.attendanceEnabled).toBe(false);
    });
    it("Gold unlocks payroll, employee, attendance", () => {
      expect(PLAN_FEATURES.gold.payrollEnabled).toBe(true);
      expect(PLAN_FEATURES.gold.employeeEnabled).toBe(true);
      expect(PLAN_FEATURES.gold.attendanceEnabled).toBe(true);
    });
    it("Pro has Infinity companies and all features", () => {
      expect(PLAN_FEATURES.pro.maxCompanies).toBe(Infinity);
      expect(PLAN_FEATURES.pro.maxDevices).toBe(10);
      expect(PLAN_FEATURES.pro.payrollEnabled).toBe(true);
    });
  });

  describe("planAllowsModule", () => {
    it("Basic cannot use payroll/employees/attendance/salary", () => {
      expect(planAllowsModule("basic", "payroll")).toBe(false);
      expect(planAllowsModule("basic", "employees")).toBe(false);
      expect(planAllowsModule("basic", "attendance")).toBe(false);
      expect(planAllowsModule("basic", "salary")).toBe(false);
    });
    it("Gold can use payroll/employees/attendance", () => {
      expect(planAllowsModule("gold", "payroll")).toBe(true);
      expect(planAllowsModule("gold", "employees")).toBe(true);
      expect(planAllowsModule("gold", "attendance")).toBe(true);
    });
    it("Pro can use everything", () => {
      expect(planAllowsModule("pro", "payroll")).toBe(true);
      expect(planAllowsModule("pro", "employees")).toBe(true);
    });
    it("Unknown modules are allowed on all plans (core feature)", () => {
      expect(planAllowsModule("basic", "sales")).toBe(true);
      expect(planAllowsModule("basic", "reports")).toBe(true);
    });
  });

  describe("nextPlan upgrade path", () => {
    it("basic → gold", () => {
      expect(nextPlan("basic")).toBe("gold");
    });
    it("gold → pro", () => {
      expect(nextPlan("gold")).toBe("pro");
    });
    it("pro → pro (already top)", () => {
      expect(nextPlan("pro")).toBe("pro");
    });
  });
});
