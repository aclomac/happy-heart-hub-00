import { describe, expect, it } from "vitest";
import { buildDayBook } from "@/lib/reports/calc";
import { resolveReportDrilldown } from "@/lib/reports/drilldown";

describe("Cash & Bank (DayBook) drill-down", () => {
  it("tags payment_in / payment_out rows with their ids", () => {
    const { rows } = buildDayBook({
      payments: [
        { id: "pi-1", payment_date: "2026-06-01", direction: "in", amount: 100 },
        { id: "po-1", payment_date: "2026-06-02", direction: "out", amount: 50 },
      ],
    });
    const pi = rows.find((r) => r.type === "Payment In")!;
    const po = rows.find((r) => r.type === "Payment Out")!;
    expect(pi).toMatchObject({ refKind: "payment_in", refId: "pi-1" });
    expect(po).toMatchObject({ refKind: "payment_out", refId: "po-1" });

    const tIn = resolveReportDrilldown({ kind: pi.refKind!, id: pi.refId });
    const tOut = resolveReportDrilldown({ kind: po.refKind!, id: po.refId });
    expect(tIn).toMatchObject({ disabled: false, to: "/app/payments-in/$id/edit" });
    expect(tOut).toMatchObject({ disabled: false, to: "/app/payment-out/$id/edit" });
  });

  it("tags expense rows and resolves to the expense edit route", () => {
    const { rows } = buildDayBook({
      expenses: [{ id: "e-1", expense_date: "2026-06-01", amount: 200, category: "rent" }],
    });
    const e = rows[0];
    expect(e).toMatchObject({ refKind: "expense", refId: "e-1" });
    const t = resolveReportDrilldown({ kind: e.refKind!, id: e.refId });
    expect(t).toMatchObject({
      disabled: false,
      to: "/app/expenses/$id/edit",
      params: { id: "e-1" },
    });
  });

  it("routes cash/bank transfer rows to the cash transfer detail route", () => {
    const { rows } = buildDayBook({
      cashTxns: [
        {
          id: "ct-1",
          txn_date: "2026-06-01",
          direction: "in",
          amount: 10,
          category: "Owner Deposit",
        },
        {
          id: "bt-1",
          txn_date: "2026-06-02",
          direction: "out",
          amount: 5,
          category: "Owner Withdraw",
          bank_account_id: "ba-1",
        },
      ],
    });
    expect(rows[0].refKind).toBe("cash_transfer");
    expect(rows[1].refKind).toBe("bank_transfer");
    for (const r of rows) {
      const t = resolveReportDrilldown({ kind: r.refKind!, id: r.refId });
      expect(t).toMatchObject({ disabled: false, to: "/app/cash/transfers/$id" });
    }
  });

  it("makes cheque, loan_payment, and salary_payment rows clickable", () => {
    const { rows } = buildDayBook({
      cheques: [
        {
          id: "ch-1",
          cleared_at: "2026-06-01",
          direction: "in",
          amount: 1,
          status: "cleared",
          cheque_number: "1",
        },
      ],
      loanPayments: [{ id: "lp-1", payment_date: "2026-06-01", amount: 1 }],
      salaries: [{ id: "sp-1", payment_date: "2026-06-01", amount: 1 }],
    });
    expect(rows.map((r) => r.refKind).sort()).toEqual(
      ["cheque", "loan_payment", "salary_payment"].sort(),
    );
    for (const r of rows) {
      const t = resolveReportDrilldown({ kind: r.refKind!, id: r.refId });
      expect(t.disabled).toBe(false);
    }
  });

  it("stays safe when source rows have no id", () => {
    const { rows } = buildDayBook({
      payments: [{ payment_date: "2026-06-01", direction: "in", amount: 1 }],
      expenses: [{ expense_date: "2026-06-01", amount: 1 }],
    });
    for (const r of rows) {
      const t = resolveReportDrilldown({ kind: r.refKind!, id: r.refId ?? null });
      expect(t.disabled).toBe(true);
    }
  });
});

describe("Inventory stock-movement drill-down", () => {
  it("resolves sale movements to the sale edit route", () => {
    const t = resolveReportDrilldown({
      kind: "stock_movement",
      referenceType: "sale",
      referenceId: "s-1",
    });
    expect(t).toMatchObject({ disabled: false, to: "/app/sales/$id/edit", params: { id: "s-1" } });
  });

  it("resolves purchase movements to the purchase edit route", () => {
    const t = resolveReportDrilldown({
      kind: "stock_movement",
      referenceType: "purchase",
      referenceId: "p-1",
    });
    expect(t).toMatchObject({
      disabled: false,
      to: "/app/purchases/$id/edit",
      params: { id: "p-1" },
    });
  });

  it("resolves delivery_challan and debit_note movements", () => {
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "delivery_challan",
        referenceId: "dc-1",
      }),
    ).toMatchObject({ disabled: false, to: "/app/delivery-challans/$id/edit" });
    expect(
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "debit_note",
        referenceId: "dn-1",
      }),
    ).toMatchObject({ disabled: false, to: "/app/debit-notes/$id/edit" });
  });

  it("routes stock_adjustment and stock_transfer movements to their detail routes", () => {
    for (const rt of ["adjustment", "stock_adjustment", "adjustment_in"]) {
      const t = resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: rt,
        referenceId: "x-1",
      });
      expect(t, `${rt} should resolve`).toMatchObject({
        disabled: false,
        to: "/app/stock-adjustments/$id/edit",
      });
    }
    for (const rt of ["transfer", "stock_transfer", "transfer_in", "transfer_out"]) {
      const t = resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: rt,
        referenceId: "x-1",
      });
      expect(t, `${rt} should resolve`).toMatchObject({
        disabled: false,
        to: "/app/stock-transfers/$id/edit",
      });
    }
  });

  it("keeps aggregate / id-less movement rows non-clickable", () => {
    expect(
      resolveReportDrilldown({ kind: "stock_movement", referenceType: "sale", referenceId: null })
        .disabled,
    ).toBe(true);
    expect(
      resolveReportDrilldown({ kind: "stock_movement", referenceType: null, referenceId: "x" })
        .disabled,
    ).toBe(true);
  });

  it("never resolves to a non-/app target for cash & inventory drill-down", () => {
    const samples = [
      resolveReportDrilldown({ kind: "payment_in", id: "1" }),
      resolveReportDrilldown({ kind: "payment_out", id: "1" }),
      resolveReportDrilldown({ kind: "expense", id: "1" }),
      resolveReportDrilldown({ kind: "stock_movement", referenceType: "sale", referenceId: "1" }),
      resolveReportDrilldown({
        kind: "stock_movement",
        referenceType: "delivery_challan",
        referenceId: "1",
      }),
    ];
    for (const r of samples) {
      expect(r.disabled).toBe(false);
      if (!r.disabled) expect(r.to.startsWith("/app/")).toBe(true);
    }
  });
});
