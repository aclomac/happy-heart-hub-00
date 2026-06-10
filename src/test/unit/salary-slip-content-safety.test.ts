import { describe, it, expect } from "vitest";
import { buildSalarySlipInvoiceData } from "@/lib/pdf/build-salary-slip";

const DASH = "—";
const baseCompany = { name: "Acme", currency: "BDT" };

describe("salary slip PDF content & safety", () => {
  it("preview/PDF data exposes employee, month, gross, net, paid, pending, status", () => {
    const d = buildSalarySlipInvoiceData({
      slip: {
        id: "s1",
        period_month: "2026-06",
        gross: 30000,
        bonus: 0,
        deductions: 0,
        advance: 0,
        net: 30000,
        due: 10000,
        status: "partial",
      },
      employee: { name: "Karim", code: "E2", base_salary: 30000 },
      company: baseCompany,
    });
    expect(d.party?.name).toBe("Karim");
    expect(d.date.startsWith("2026-06") || d.terms?.includes("2026-06")).toBe(true);
    expect(d.subtotal).toBe(30000); // gross
    expect(d.total).toBe(30000); // net
    expect(d.paid).toBe(20000);
    expect(d.balance).toBe(10000);
    expect(d.notes).toMatch(/PARTIAL/);
  });

  it("renders DASH and no NaN/undefined for missing phone/designation/notes/logo/bonus/deduction/advance", () => {
    const d = buildSalarySlipInvoiceData({
      slip: {
        id: "s1",
        period_month: "2026-06",
        gross: 10000,
        // bonus/deductions/advance/notes/payment_method all missing
      },
      employee: { name: "Anon" }, // no phone, no designation, no code, no base_salary
      company: { name: "X" }, // no logo, no address, no phone
    });
    const json = JSON.stringify(d);
    expect(json).not.toContain("NaN");
    expect(json).not.toContain("undefined");
    expect(json).not.toContain("null,null");
    // Lines exist even when fields are missing
    const basic = d.lines.find((l) => l.name === "Basic salary");
    expect(basic?.unit).toBe(DASH);
    expect(basic?.amount).toBe(0);
    expect(d.lines.find((l) => l.name === "Bonus")?.amount).toBe(0);
    expect(d.lines.find((l) => l.name === "Deductions")?.amount).toBe(-0);
    expect(d.lines.find((l) => l.name === "Advance adj.")?.amount).toBe(-0);
    // No logo on company => company.logo_url is undefined/null, never the string "undefined"
    expect(d.company.logo_url ?? null).toBeNull();
  });

  it("Bangla employee + company + notes render without corruption or NaN", () => {
    const d = buildSalarySlipInvoiceData({
      slip: {
        id: "s2",
        period_month: "2026-০৬", // bangla digits
        gross: 25000,
        net: 25000,
        due: 0,
        status: "paid",
        notes: "মে মাসের বেতন",
        paid_on: "2026-06-05",
      },
      employee: { name: "রহিম উদ্দিন", designation: "ক্যাশিয়ার", phone: "০১৭০০" },
      company: { name: "অ্যাকমে কোং", currency: "BDT" },
    });
    expect(d.company.name).toBe("অ্যাকমে কোং");
    expect(d.party?.name).toBe("রহিম উদ্দিন");
    expect(d.notes).toContain("মে মাসের বেতন");
    expect(d.notes).toContain("PAID");
    expect(JSON.stringify(d)).not.toContain("NaN");
    expect(JSON.stringify(d)).not.toContain("undefined");
  });
});
