import { describe, it, expect } from "vitest";
import {
  DICTIONARY,
  translate,
  translateStatus,
  translatePlan,
  translateAuditAction,
  findMissingBanglaKeys,
} from "@/lib/i18n";

/**
 * Coverage tests for the Bangla i18n pass.
 *
 * If you add a new visible UI string anywhere in the app, add it to
 * src/lib/i18n.tsx DICTIONARY in both `en` and `bn`. These tests guard
 * the common labels listed by the spec.
 */
describe("i18n — Bangla coverage", () => {
  it("every dictionary entry ships a non-empty Bangla string distinct from English", () => {
    const missing = findMissingBanglaKeys();
    expect(missing, `missing/duplicate bn translations: ${missing.join(", ")}`).toEqual([]);
  });

  it("translates the common action keys to Bangla", () => {
    const expected: Record<string, string> = {
      "Add Sale": "বিক্রয় যোগ করুন",
      "Add Purchase": "ক্রয় যোগ করুন",
      "Quick Add": "দ্রুত যোগ করুন",
      "View/Edit": "দেখুন/এডিট",
      "Receive Payment": "পেমেন্ট গ্রহণ",
      "Make Payment": "পেমেন্ট করুন",
      Delete: "ডিলিট",
      Duplicate: "ডুপ্লিকেট",
      Print: "প্রিন্ট",
      Preview: "প্রিভিউ",
      "View History": "হিস্টরি দেখুন",
      "Open PDF": "PDF খুলুন",
      "Cancel Invoice": "ইনভয়েস বাতিল করুন",
      Save: "সেভ করুন",
      Back: "ফিরে যান",
      Search: "সার্চ করুন",
      Filter: "ফিল্টার",
      "Export CSV": "CSV এক্সপোর্ট",
      Download: "ডাউনলোড",
      Settings: "সেটিংস",
      Reports: "রিপোর্ট",
      "Super Admin": "সুপার অ্যাডমিন",
      "Audit Logs": "অডিট লগ",
    };
    for (const [k, v] of Object.entries(expected)) {
      expect(translate(k, "bn"), k).toBe(v);
    }
  });

  it("translates sidebar long labels to Bangla", () => {
    const keys = [
      "Sale Invoices",
      "Purchase Bills",
      "Bank Accounts",
      "Stock Adjustments",
      "Recycle Bin",
      "Salary Payments",
      "Inventory Reports",
    ];
    for (const k of keys) {
      const en = translate(k, "en");
      const bn = translate(k, "bn");
      expect(en, `english present for ${k}`).toBeTruthy();
      expect(bn, `bangla present for ${k}`).toBeTruthy();
      expect(bn).not.toBe(en);
    }
  });

  it("translates payment / invoice / subscription status enums", () => {
    expect(translateStatus("pending", "bn")).toBe("অপেক্ষমান");
    expect(translateStatus("under_review", "bn")).toBe("পর্যালোচনাধীন");
    expect(translateStatus("approved", "bn")).toBe("অনুমোদিত");
    expect(translateStatus("rejected", "bn")).toBe("প্রত্যাখ্যাত");
    expect(translateStatus("cancelled", "bn")).toBe("বাতিল");
    expect(translateStatus("paid", "bn")).toBe("পরিশোধিত");
    expect(translateStatus("partial", "bn")).toBe("আংশিক");
    expect(translateStatus("unpaid", "bn")).toBe("অপরিশোধিত");
    // English mode round-trips cleanly
    expect(translateStatus("pending", "en")).toBe("Pending");
  });

  it("translates plan display labels but preserves unknown plan codes verbatim", () => {
    expect(translatePlan("basic", "bn")).toBe("বেসিক");
    expect(translatePlan("gold", "bn")).toBe("গোল্ড");
    expect(translatePlan("pro", "bn")).toBe("প্রো");
    // unknown plan code stays as-is (technical value)
    expect(translatePlan("custom_plan_xyz", "bn")).toBe("custom_plan_xyz");
  });

  it("translates known audit actions and humanizes unknown ones", () => {
    expect(translateAuditAction("created", "bn")).toBe("তৈরি");
    expect(translateAuditAction("pdf_downloaded", "bn")).toBe("PDF ডাউনলোড");
    expect(translateAuditAction("salary_slip.printed", "bn")).toBe("salary slip printed");
  });

  it("falls back to the key when a translation is missing (no silent break)", () => {
    expect(translate("__never_added_key__", "bn")).toBe("__never_added_key__");
    expect(translate("__never_added_key__", "en")).toBe("__never_added_key__");
  });

  it("guards key spec coverage: a curated set of sidebar/topbar/dialog keys exists", () => {
    const required = [
      // topbar
      "Search Transactions, Parties, Items...",
      "Add Sale",
      "Add Purchase",
      "Quick Add",
      "Sign out",
      // sidebar groups
      "dashboard",
      "sale",
      "purchase",
      "cashbank",
      "payroll",
      "reports",
      "utilities",
      "settings",
      "subscription",
      "support",
      // action menus
      "View/Edit",
      "Delete",
      "Duplicate",
      "Print",
      "Preview",
      "View History",
      "Open Receipt PDF",
      "Open Voucher PDF",
      // dialogs / common
      "Cancel",
      "Save",
      "Confirm",
      "Close",
      "Loading",
      // super admin
      "Super Admin",
      "Audit Logs",
      "Customers",
      "Companies",
      "Plans",
      "Coupons",
      "Devices",
      "Announcements",
      "Platform Admins",
    ];
    const missing = required.filter((k) => !DICTIONARY[k]);
    expect(missing, `missing dictionary keys: ${missing.join(", ")}`).toEqual([]);
  });
});
