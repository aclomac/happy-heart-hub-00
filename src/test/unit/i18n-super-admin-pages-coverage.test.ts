import { describe, it, expect } from "vitest";
import { DICTIONARY, translate, translateStatus } from "@/lib/i18n";

describe("i18n — Super Admin page body labels", () => {
  const payments = [
    "Subscription Payments",
    "Review and approve customer payment requests",
    "Company / User",
    "Txn ID",
    "No payment requests in this tab.",
    "Reject payment",
    "Reason (shown to customer)",
    "Payment proof",
    "Payment approved — subscription activated",
    "Payment rejected",
    "Marked under review",
  ];
  const coupons = [
    "Discount codes for the upgrade form.",
    "New / Update Coupon",
    "Active Coupons",
    "Percentage %",
    "Flat amount",
    "Max uses (blank = unlimited)",
    "Any billing period",
    "Save coupon",
    "No coupons yet.",
    "Coupon saved",
    "Coupon disabled",
  ];
  const devices = [
    "All registered devices across customers.",
    "Prune devices stale > 30 days",
    "Search by customer, company, device name, fingerprint…",
    "Stale only (> 30d)",
    "Company / Plan",
    "Fingerprint",
    "Last seen",
    "Remove this device",
    "Reset all devices for this user",
    "Reset all devices for the first company",
    "No devices match these filters.",
    "Device removed",
  ];
  const reports = [
    "Platform Reports",
    "Revenue, subscriptions, devices and coupon usage.",
    "Plan revenue",
    "Customer growth",
    "Pending payments",
    "Print / PDF",
    "Total devices",
    "Active (7d)",
    "Expiring 7d",
    "Nothing to export",
    "Nothing to print",
    "No data for the selected range.",
  ];

  const all = [...payments, ...coupons, ...devices, ...reports];

  it("all super-admin page keys are present in the dictionary", () => {
    for (const k of all) {
      expect(DICTIONARY[k], `missing key: ${k}`).toBeDefined();
    }
  });

  it("translates each key to a distinct Bangla string", () => {
    for (const k of all) {
      const bn = translate(k, "bn");
      expect(bn, `no bn for ${k}`).toBeTruthy();
      expect(bn, `bn equals en for ${k}`).not.toBe(k);
    }
  });

  it("english mode still returns the original english string", () => {
    for (const k of all) {
      expect(translate(k, "en")).toBe(DICTIONARY[k].en);
    }
  });

  it("payment status badges localize to Bangla", () => {
    expect(translateStatus("pending", "bn")).toBe("অপেক্ষমান");
    expect(translateStatus("under_review", "bn")).toBe("পর্যালোচনাধীন");
    expect(translateStatus("approved", "bn")).toBe("অনুমোদিত");
    expect(translateStatus("rejected", "bn")).toBe("প্রত্যাখ্যাত");
  });
});
