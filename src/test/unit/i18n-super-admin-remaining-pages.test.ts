import { describe, it, expect } from "vitest";
import { DICTIONARY, translate } from "@/lib/i18n";

describe("i18n — Super Admin remaining pages (plans, gateways, support, announcements, settings, audit-logs, detail pages)", () => {
  const plans = [
    "Plans",
    "Subscription plans and feature toggles.",
    "+ Add plan",
    "Add plan",
    "Feature toggles",
    "Monthly price",
    "Yearly price",
    "Trial days",
    "Company limit",
    "Device limit",
    "User limit",
    "Plan saved",
    "Plan deleted",
  ];
  const gateways = [
    "Payment Gateways",
    "Manage payment methods customers can use to pay for subscriptions",
    "New gateway",
    "Edit gateway",
    "Mode",
    "Sandbox",
    "Live",
    "Enabled",
    "Disabled",
    "No gateways configured yet.",
    "Sandbox mode",
    "Gateway saved",
    "Gateway deleted",
    "Secrets are write-only. Leave blank to keep the existing value.",
  ];
  const support = [
    "Support Tickets",
    "Customer support inbox for platform admins.",
    "All statuses",
    "Inbox",
    "Subject",
    "No tickets.",
    "Select a ticket to view details.",
    "Your reply",
    "Type a reply or internal note…",
    "Internal note (hidden from customer)",
    "Send",
    "Reply sent",
    "Status updated",
    "No messages yet.",
  ];
  const announcements = [
    "Announcements",
    "Platform-wide notices shown in user dashboards.",
    "New announcement",
    "All announcements",
    "Message",
    "Audience",
    "All users",
    "Specific plan",
    "Trial users",
    "Expired users",
    "Target plan key",
    "Starts at",
    "Ends at",
    "Dismissible",
    "No announcements yet.",
    "Announcement created",
    "Delete this announcement?",
  ];
  const settings = [
    "Platform Settings",
    "Branding, support contacts, defaults, and platform-wide toggles.",
    "Branding",
    "Platform name and logo.",
    "Platform name",
    "Support contacts",
    "Support email",
    "Support phone",
    "Support WhatsApp",
    "Terms URL",
    "Privacy URL",
    "Defaults",
    "Currency",
    "Timezone",
    "Invoice prefix",
    "Receipt prefix",
    "System toggles",
    "Maintenance mode",
    "Allow new signups",
    "Enable demo login",
    "Save changes",
    "Settings saved",
  ];
  const audit = [
    "Platform Audit Logs",
    "Platform admin actions and (where allowed) company audit logs.",
    "CSV (page)",
    "CSV (all filtered)",
    "Scope",
    "Platform",
    "Company (app)",
    "All companies",
    "Sort",
    "Newest first",
    "Oldest first",
    "Entity / Target",
    "Page size",
    "Time",
    "Target / Reference",
    "Metadata",
    "No audit entries match the filters.",
    "Previous",
    "Next",
    "Audit entry detail",
    "Metadata (sensitive fields masked)",
    "Access restricted",
    "Only platform admins can view audit logs.",
  ];
  const details = [
    "Back",
    "History",
    "Export CSV",
    "Apply",
    "Extend",
    "Mark trial",
    "Mark active",
    "Mark expired",
    "Company profile",
    "Subscription controls",
    "Change plan",
    "Select plan…",
    "Extend by (days)",
    "Plan changed",
    "Subscription extended",
    "Max companies",
    "No subscription on file.",
    "No audit entries for this company.",
    // coupon
    "Coupon",
    "Active coupon",
    "Disabled — cannot be applied by customers",
    "Coupon not found.",
    "Discount type",
    "Discount value",
    "Valid from",
    "Max uses",
    "Used count",
    "Billing period",
    "Redemption history",
    "No redemptions yet.",
    "Coupon enabled",
    // device
    "Device",
    "Device not found.",
    "Remove device",
    "Reset company devices",
    "Device name",
    "Remove this device?",
    "Remove",
    "Reset",
    // payment
    "Platform Payment",
    "Payment not found.",
    "Mark under review",
    "View receipt",
    "Original amount",
    "Transaction ID",
    "Sender info",
    "Reviewed by",
    "Reviewed at",
    "Submitted at",
    "Admin note",
    "Reject reason",
    "A reason is required.",
    "Proof not available",
  ];

  const all = [
    ...plans,
    ...gateways,
    ...support,
    ...announcements,
    ...settings,
    ...audit,
    ...details,
  ];

  it("all remaining super-admin keys are present in the dictionary", () => {
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
});
