import { describe, it, expect } from "vitest";
import { DICTIONARY, translate, translateStatus } from "@/lib/i18n";

const SUPER_ADMIN_KEYS = [
  // Sidebar / navigation
  "Super Admin",
  "Customers",
  "Companies",
  "Plans",
  "Subscriptions",
  "Payments",
  "Payment Gateways",
  "Devices",
  "Feature Control",
  "Reports",
  "Coupons",
  "Support",
  "Announcements",
  "Audit Logs",
  "Platform Admins",
  "Settings",
  "Back to ERP",
  // Dashboard
  "Platform Dashboard",
  "ERPOVO SaaS operations overview.",
  "Total Customers",
  "Total Companies",
  "Active Subscriptions",
  "Trial Companies",
  "Pending Payments",
  "Under Review",
  "Monthly Revenue",
  "Yearly Revenue",
  "Plan-wise subscriptions",
  "Recent companies",
  "Recent audit events",
  // Customer list
  "Registered users on the ERPOVO platform.",
  "Search by name or phone…",
  "No customers found.",
  // Actions
  "Approve",
  "Reject",
  "Mark Under Review",
  "Enable",
  "Disable",
  "Remove Device",
  "Reset Devices",
  "Export CSV",
  "View Details",
  "Save Changes",
  // Security
  "API Key",
  "Webhook Secret",
  "Masked",
  "Hidden for security",
  // Dialogs
  "Are you sure?",
  "This action cannot be undone.",
  "Reason (optional)",
];

describe("Super Admin Bangla coverage", () => {
  it("every key exists in the dictionary with a Bangla translation", () => {
    for (const key of SUPER_ADMIN_KEYS) {
      const entry = DICTIONARY[key];
      expect(entry, `missing dictionary entry: ${key}`).toBeDefined();
      expect(entry.bn, `missing bn translation: ${key}`).toBeTruthy();
      expect(entry.bn).not.toBe(entry.en);
    }
  });

  it("translate() returns Bangla in bn mode and English in en mode", () => {
    expect(translate("Approve", "bn")).toBe("অনুমোদন করুন");
    expect(translate("Approve", "en")).toBe("Approve");
    expect(translate("Platform Dashboard", "bn")).toBe("প্ল্যাটফর্ম ড্যাশবোর্ড");
  });

  it("status labels are Bangla for super-admin workflow states", () => {
    expect(translateStatus("pending", "bn")).toBeTruthy();
    expect(translateStatus("under_review", "bn")).toBeTruthy();
    expect(translateStatus("approved", "bn")).toBeTruthy();
    expect(translateStatus("rejected", "bn")).toBeTruthy();
    expect(translateStatus("cancelled", "bn")).toBeTruthy();
    expect(translateStatus("active", "bn")).toBe("সক্রিয়");
    expect(translateStatus("expired", "bn")).toBe("মেয়াদোত্তীর্ণ");
    expect(translateStatus("trial", "bn")).toBe("ট্রায়াল");
  });

  it("English mode is unchanged (round-trip)", () => {
    for (const key of SUPER_ADMIN_KEYS) {
      expect(translate(key, "en")).toBe(DICTIONARY[key].en);
    }
  });
});
