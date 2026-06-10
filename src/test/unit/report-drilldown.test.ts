import { describe, expect, it } from "vitest";
import { resolveReportDrilldown } from "@/lib/reports/drilldown";

describe("resolveReportDrilldown", () => {
  it("routes sale invoice rows to the sale edit route", () => {
    const r = resolveReportDrilldown({ kind: "sale_invoice", id: "sale-1" });
    expect(r).toMatchObject({
      disabled: false,
      to: "/app/sales/$id/edit",
      params: { id: "sale-1" },
    });
  });

  it("routes purchase bill rows to the purchase edit route", () => {
    const r = resolveReportDrilldown({ kind: "purchase_bill", id: "po-1" });
    expect(r).toMatchObject({
      disabled: false,
      to: "/app/purchases/$id/edit",
      params: { id: "po-1" },
    });
  });

  it("routes payment_in/payment_out/expense rows", () => {
    expect(resolveReportDrilldown({ kind: "payment_in", id: "p1" })).toMatchObject({
      disabled: false,
      to: "/app/payments-in/$id/edit",
    });
    expect(resolveReportDrilldown({ kind: "payment_out", id: "p2" })).toMatchObject({
      disabled: false,
      to: "/app/payment-out/$id/edit",
    });
    expect(resolveReportDrilldown({ kind: "expense", id: "e1" })).toMatchObject({
      disabled: false,
      to: "/app/expenses/$id/edit",
    });
  });

  it("routes debit_note and delivery_challan rows", () => {
    expect(resolveReportDrilldown({ kind: "debit_note", id: "d1" })).toMatchObject({
      disabled: false,
      to: "/app/debit-notes/$id/edit",
      params: { id: "d1" },
    });
    expect(resolveReportDrilldown({ kind: "delivery_challan", id: "dc1" })).toMatchObject({
      disabled: false,
      to: "/app/delivery-challans/$id/edit",
      params: { id: "dc1" },
    });
  });

  it("routes super-admin company and customer rows", () => {
    expect(resolveReportDrilldown({ kind: "super_admin_company", id: "c1" })).toMatchObject({
      disabled: false,
      to: "/super-admin/companies/$companyId",
      params: { companyId: "c1" },
    });
    expect(resolveReportDrilldown({ kind: "super_admin_subscription", id: "c2" })).toMatchObject({
      disabled: false,
      to: "/super-admin/companies/$companyId",
      params: { companyId: "c2" },
    });
    expect(resolveReportDrilldown({ kind: "super_admin_customer", id: "u1" })).toMatchObject({
      disabled: false,
      to: "/super-admin/customers/$userId",
      params: { userId: "u1" },
    });
  });

  it("routes stock_movement rows by reference_type/reference_id", () => {
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "sale",
        referenceId: "sale-9",
      }),
    ).toMatchObject({ disabled: false, to: "/app/sales/$id/edit", params: { id: "sale-9" } });

    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "purchase",
        referenceId: "po-9",
      }),
    ).toMatchObject({ disabled: false, to: "/app/purchases/$id/edit", params: { id: "po-9" } });

    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "delivery_challan",
        referenceId: "dc-9",
      }),
    ).toMatchObject({ disabled: false, to: "/app/delivery-challans/$id/edit" });

    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "debit_note",
        referenceId: "dn-9",
      }),
    ).toMatchObject({ disabled: false, to: "/app/debit-notes/$id/edit" });

    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "payment_in",
        referenceId: "p9",
      }),
    ).toMatchObject({ disabled: false, to: "/app/payments-in/$id/edit" });
  });

  it("routes adjustment and transfer stock_movement rows to their detail pages", () => {
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "adjustment_reversal",
        referenceId: "adj-1",
      }),
    ).toMatchObject({ disabled: false, to: "/app/stock-adjustments/$id/edit" });
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "stock_transfer",
        referenceId: "t-1",
      }),
    ).toMatchObject({ disabled: false, to: "/app/stock-transfers/$id/edit" });
  });

  it("routes credit_note stock_movement source to credit note detail", () => {
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "credit_note",
        referenceId: "cn-1",
      }),
    ).toMatchObject({ disabled: false, to: "/app/credit-notes/$id/edit", params: { id: "cn-1" } });
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "totally_unknown",
        referenceId: "x",
      }).disabled,
    ).toBe(true);
  });

  it("disables rows whose id is missing or blank", () => {
    expect(resolveReportDrilldown({ kind: "sale_invoice", id: null }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "purchase_bill", id: "  " }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "credit_note", id: null }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "item", id: "" }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "party", id: "  " }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "cheque", id: null }).disabled).toBe(true);
    expect(resolveReportDrilldown({ kind: "loan_payment", id: undefined }).disabled).toBe(true);
    expect(
      resolveReportDrilldown({ kind: "stock_movement", referenceType: "sale", referenceId: null })
        .disabled,
    ).toBe(true);
  });

  it("routes credit_note, item, party, cheque, loan_payment to detail routes when id exists", () => {
    expect(resolveReportDrilldown({ kind: "credit_note", id: "cn-1" })).toMatchObject({
      disabled: false,
      to: "/app/credit-notes/$id/edit",
      params: { id: "cn-1" },
    });
    expect(resolveReportDrilldown({ kind: "item", id: "i-1" })).toMatchObject({
      disabled: false,
      to: "/app/items/$id/edit",
      params: { id: "i-1" },
    });
    expect(resolveReportDrilldown({ kind: "party", id: "p-1" })).toMatchObject({
      disabled: false,
      to: "/app/parties/$id",
      params: { id: "p-1" },
    });
    expect(resolveReportDrilldown({ kind: "cheque", id: "ch-1" })).toMatchObject({
      disabled: false,
      to: "/app/cash/cheques/$id",
      params: { id: "ch-1" },
    });
    expect(resolveReportDrilldown({ kind: "loan_payment", id: "lp-1" })).toMatchObject({
      disabled: false,
      to: "/app/cash/loan-payments/$id",
      params: { id: "lp-1" },
    });
  });

  it("routes payroll and super-admin kinds to detail routes when id exists", () => {
    expect(resolveReportDrilldown({ kind: "employee", id: "e-1" })).toMatchObject({
      disabled: false,
      to: "/app/payroll/employees/$id",
      params: { id: "e-1" },
    });
    expect(resolveReportDrilldown({ kind: "salary_slip", id: "s-1" })).toMatchObject({
      disabled: false,
      to: "/app/payroll/salary-slips/$id",
      params: { id: "s-1" },
    });
    expect(resolveReportDrilldown({ kind: "salary_payment", id: "sp-1" })).toMatchObject({
      disabled: false,
      to: "/app/payroll/salary-payments/$id",
      params: { id: "sp-1" },
    });
    expect(resolveReportDrilldown({ kind: "attendance", id: "a-1" })).toMatchObject({
      disabled: false,
      to: "/app/payroll/attendance/$id",
      params: { id: "a-1" },
    });
    expect(resolveReportDrilldown({ kind: "super_admin_payment", id: "p-1" })).toMatchObject({
      disabled: false,
      to: "/super-admin/payments/$id",
      params: { id: "p-1" },
    });
    expect(resolveReportDrilldown({ kind: "super_admin_coupon", id: "co-1" })).toMatchObject({
      disabled: false,
      to: "/super-admin/coupons/$id",
      params: { id: "co-1" },
    });
    expect(resolveReportDrilldown({ kind: "super_admin_device", id: "d-1" })).toMatchObject({
      disabled: false,
      to: "/super-admin/devices/$id",
      params: { id: "d-1" },
    });
  });

  it("disables payroll and super-admin kinds when id is missing", () => {
    for (const kind of [
      "employee",
      "salary_slip",
      "salary_payment",
      "attendance",
      "super_admin_payment",
      "super_admin_coupon",
      "super_admin_device",
    ] as const) {
      expect(resolveReportDrilldown({ kind, id: null }).disabled).toBe(true);
      expect(resolveReportDrilldown({ kind, id: "  " }).disabled).toBe(true);
    }
  });

  it("returns a non-empty disabled reason for every disabled case", () => {
    const cases = [
      resolveReportDrilldown({ kind: "sale_invoice", id: null }),
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "unknown_thing",
        referenceId: "x",
      }),
      resolveReportDrilldown({ kind: "employee", id: null }),
    ];
    for (const c of cases) {
      expect(c.disabled).toBe(true);
      if (c.disabled) expect(c.reason.length).toBeGreaterThan(0);
    }
  });

  it("routes stock_adjustment, stock_transfer, and cash/bank/mobile transfers to their detail routes", () => {
    expect(resolveReportDrilldown({ kind: "stock_adjustment", id: "a-1" })).toMatchObject({
      disabled: false,
      to: "/app/stock-adjustments/$id/edit",
      params: { id: "a-1" },
    });
    expect(resolveReportDrilldown({ kind: "stock_transfer", id: "t-1" })).toMatchObject({
      disabled: false,
      to: "/app/stock-transfers/$id/edit",
      params: { id: "t-1" },
    });
    for (const kind of ["cash_transfer", "bank_transfer", "mobile_transfer"] as const) {
      expect(resolveReportDrilldown({ kind, id: "c-1" })).toMatchObject({
        disabled: false,
        to: "/app/cash/transfers/$id",
        params: { id: "c-1" },
      });
      expect(resolveReportDrilldown({ kind, id: null }).disabled).toBe(true);
    }
  });

  it("never resolves a target outside /app or /super-admin", () => {
    const samples = [
      resolveReportDrilldown({ kind: "sale_invoice", id: "1" }),
      resolveReportDrilldown({ kind: "purchase_bill", id: "1" }),
      resolveReportDrilldown({ kind: "payment_in", id: "1" }),
      resolveReportDrilldown({ kind: "payment_out", id: "1" }),
      resolveReportDrilldown({ kind: "expense", id: "1" }),
      resolveReportDrilldown({ kind: "debit_note", id: "1" }),
      resolveReportDrilldown({ kind: "delivery_challan", id: "1" }),
      resolveReportDrilldown({ kind: "super_admin_company", id: "1" }),
      resolveReportDrilldown({ kind: "super_admin_customer", id: "1" }),
      resolveReportDrilldown({ kind: "stock_movement", referenceType: "sale", referenceId: "1" }),
    ];
    for (const r of samples) {
      expect(r.disabled).toBe(false);
      if (!r.disabled) {
        expect(r.to.startsWith("/app/") || r.to.startsWith("/super-admin/")).toBe(true);
      }
    }
  });
});
