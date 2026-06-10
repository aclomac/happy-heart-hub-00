import { test, expect } from "vitest";
import { summarizePnl } from "./calc";

test("summarizePnl segregates sales revenue and other income correctly", () => {
  const input = {
    sales: [
      { total: 1000, doc_type: "invoice", status: "posted" },
      { total: 200, doc_type: "credit_note", status: "posted" }, // 1000 - 200 = 800 net sales
    ],
    purchases: [
      { total: 300, doc_type: "bill", status: "posted" }, // 300 net purchase
    ],
    expenses: [
      { amount: 100, category: "Office", status: "posted" },
    ],
    otherIncome: [
      { amount: 500, status: "posted" },
    ],
  };

  const result = summarizePnl(input as any);

  expect(result.netSales).toBe(800);
  expect(result.otherIncomeTotal).toBe(500);
  expect(result.grossProfit).toBe(500); // 800 - 300
  expect(result.netProfit).toBe(900); // 500 (GP) + 500 (Other) - 100 (Exp)
});

test("summarizePnl excludes deleted other income", () => {
  const input = {
    sales: [],
    purchases: [],
    expenses: [],
    otherIncome: [
      { amount: 500, status: "posted" },
      { amount: 1000, status: "posted", deleted_at: "2026-01-01" },
      { amount: 2000, status: "reversed" },
    ],
  };

  const result = summarizePnl(input as any);
  expect(result.otherIncomeTotal).toBe(500);
});
