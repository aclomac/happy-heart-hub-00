import { describe, it, expect } from "vitest";
import { buildSalarySlipInvoiceData } from "@/lib/pdf/build-salary-slip";

const company = {
  name: "Acme Co",
  currency: "BDT",
  address: "Dhaka",
  phone: "+880",
  email: "a@b.c",
};

const baseSlip = {
  id: "11111111-aaaa-bbbb-cccc-222222222222",
  company_id: "co-1",
  employee_id: "emp-1",
  period_month: "2026-05",
  days_total: 30,
  days_present: 28,
  gross: 30000,
  bonus: 2000,
  deductions: 1000,
  advance: 500,
  net: 30500,
  due: 30500,
  status: "unpaid",
  notes: "Bonus for May",
};

const emp = {
  id: "emp-1",
  name: "রহিম উদ্দিন",
  code: "E-001",
  designation: "Cashier",
  phone: "01700",
  pay_type: "fixed",
  base_salary: 30000,
};

describe("buildSalarySlipInvoiceData", () => {
  it("renders required fields with safe defaults", () => {
    const d = buildSalarySlipInvoiceData({ slip: baseSlip, employee: emp, company });
    expect(d.title).toBe("SALARY SLIP");
    expect(d.company.name).toBe("Acme Co");
    expect(d.party?.name).toContain("রহিম");
    expect(d.party?.address).toContain("E-001");
    expect(d.number).toMatch(/^SLIP-/);
    expect(d.total).toBe(30500);
    expect(d.currencySymbol).toBe("Tk");
    expect(d.lines.find((l) => l.name === "Basic salary")?.amount).toBe(30000);
    expect(d.lines.find((l) => l.name === "Bonus")?.amount).toBe(2000);
    expect(d.lines.find((l) => l.name === "Deductions")?.amount).toBe(-1000);
  });

  it("handles missing optional fields without NaN/undefined", () => {
    const d = buildSalarySlipInvoiceData({
      slip: { id: "x", company_id: "c", period_month: "2026-06" },
      employee: null,
      company: { name: "X" },
    });
    expect(d.party?.name).toBe("Employee");
    expect(Number.isFinite(d.total)).toBe(true);
    expect(Number.isFinite(d.paid ?? 0)).toBe(true);
    for (const l of d.lines) {
      expect(Number.isFinite(l.amount)).toBe(true);
    }
    expect(JSON.stringify(d)).not.toContain("NaN");
    expect(JSON.stringify(d)).not.toContain("undefined");
  });

  it("unpaid slip shows full balance pending", () => {
    const d = buildSalarySlipInvoiceData({ slip: baseSlip, employee: emp, company });
    expect(d.paid).toBe(0);
    expect(d.balance).toBe(30500);
    expect(d.notes).toContain("UNPAID");
  });

  it("partially paid slip shows paid + pending", () => {
    const d = buildSalarySlipInvoiceData({
      slip: { ...baseSlip, due: 10000, status: "partial" },
      employee: emp,
      company,
    });
    expect(d.paid).toBe(20500);
    expect(d.balance).toBe(10000);
    expect(d.notes).toContain("PARTIAL");
  });

  it("fully paid slip shows paid status and paid date", () => {
    const d = buildSalarySlipInvoiceData({
      slip: { ...baseSlip, due: 0, status: "paid", paid_on: "2026-06-05", payment_method: "BANK" },
      employee: emp,
      company,
    });
    expect(d.paid).toBe(30500);
    expect(d.balance).toBe(0);
    expect(d.notes).toContain("PAID");
    expect(d.notes).toContain("2026-06-05");
    expect(d.paymentMethod).toBe("BANK");
  });

  it("safely handles bangla company name", () => {
    const d = buildSalarySlipInvoiceData({
      slip: baseSlip,
      employee: emp,
      company: { ...company, name: "অ্যাকমে কোং" },
    });
    expect(d.company.name).toBe("অ্যাকমে কোং");
  });
});
