import { describe, it, expect } from "vitest";
import { DICTIONARY, translate, findMissingBanglaKeys } from "@/lib/i18n";

/**
 * Coverage for the per-module ERP body i18n pass (POS, Purchase, Expense,
 * Cash & Bank, Inventory, Payroll, Reports, Utilities, Settings,
 * Subscription/Upgrade). Page bodies are translated by auto-translating
 * `PageHeader` + `EmptyState` against this dictionary, so the only thing
 * we need to guard is that the dictionary covers the literal strings the
 * pages render.
 */

const MODULE_KEYS: Record<string, string[]> = {
  POS: ["POS · Point of Sale", "Fast retail checkout"],
  Purchase: [
    "Purchase Bills",
    "Purchase Orders",
    "Debit Notes / Return",
    "Payment Out",
    "Purchase Reports",
  ],
  Expense: ["Expenses", "Expense Categories", "Edit Expense", "No expenses"],
  "Cash & Bank": ["Cash & Bank", "Bank Accounts", "Cash In Hand", "Cheques", "Loan Accounts"],
  Inventory: [
    "Items",
    "Products, Services & Inventory",
    "Stock Adjustments",
    "Stock Transfers",
    "Stock Movement Ledger",
    "Inventory Reports",
  ],
  Payroll: [
    "Payroll & Employees",
    "Employees, attendance, salary setup & payments",
    "Employees",
    "Attendance",
    "Salary Setup",
    "Salary Payments",
    "Payroll Reports",
  ],
  Reports: [
    "Reports",
    "Business insights and financial reports",
    "Sales Reports",
    "Purchase Reports",
    "Comprehensive sales analytics",
  ],
  Utilities: [
    "Utilities",
    "Import, export, barcode, financial year tools",
    "Import Items",
    "Export Items",
    "Bulk Update Items",
    "Barcode Generator",
    "Import Parties",
    "Close Financial Year",
  ],
  Settings: ["Settings", "Company profile, taxes, users & preferences"],
  Subscription: [
    "Subscription & Billing",
    "Choose the plan that fits your business",
    "Upgrade Required",
    "Upgrade Plan",
  ],
};

describe("i18n — module body coverage", () => {
  it.each(Object.entries(MODULE_KEYS))(
    "module %s: every required label has a distinct Bangla translation",
    (_module, keys) => {
      const missing: string[] = [];
      for (const k of keys) {
        const entry = DICTIONARY[k];
        if (!entry || !entry.bn || entry.bn === entry.en) missing.push(k);
      }
      expect(missing, `missing/duplicate bn for: ${missing.join(", ")}`).toEqual([]);
    },
  );

  it("common table headers + filter labels translate to Bangla", () => {
    const required: Record<string, string> = {
      Date: "তারিখ",
      Description: "বিবরণ",
      Amount: "পরিমাণ",
      Status: "স্ট্যাটাস",
      Category: "ক্যাটাগরি",
      Type: "টাইপ",
      Name: "নাম",
      Total: "মোট",
      Customer: "গ্রাহক",
      Supplier: "সরবরাহকারী",
      "Show deleted": "ডিলিট দেখান",
      All: "সব",
    };
    for (const [k, v] of Object.entries(required)) {
      expect(translate(k, "bn"), k).toBe(v);
    }
  });

  it("English mode round-trips module keys verbatim", () => {
    for (const keys of Object.values(MODULE_KEYS)) {
      for (const k of keys) {
        expect(translate(k, "en")).toBe(DICTIONARY[k].en);
      }
    }
  });

  it("missing-key guard still passes after the module expansion", () => {
    expect(findMissingBanglaKeys()).toEqual([]);
  });
});
