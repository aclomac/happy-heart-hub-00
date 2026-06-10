import { describe, it, expect } from "vitest";
import { DICTIONARY, translate, findMissingBanglaKeys } from "@/lib/i18n";

/**
 * Final i18n polish pass: Online Store / Grow page, Access Denied screen,
 * Maintenance Gate, ComingSoon, and common plan/device system labels.
 */
describe("i18n — final polish coverage", () => {
  const grow = [
    "Grow Your Business",
    "Online store, catalogue & marketing",
    "Preview Store",
    "Share Link",
    "Force Sync",
    "Get Your Own Website",
    "Online Orders",
    "Manage Orders",
    "Store Views",
    "Total Orders",
    "Open Orders",
    "Delivered",
    "Order Value",
    "Catalogue",
    "Sell online with a free storefront. Catalogue your items, share the link with customers, accept orders and sync them back to ERPOVO automatically.",
    "Manage and convert orders from your storefront into sale invoices.",
  ];
  const system = [
    "Access Denied",
    "You don't have permission to view this page. Contact your administrator to request access.",
    "Admins only",
    "Insufficient role",
    "Missing permission",
    "Back to Dashboard",
    "Switch Company",
    "is under maintenance",
    "We're performing scheduled maintenance. Please check back shortly.",
    "Coming Soon",
    "This section is part of a future Super Admin phase. Stay tuned.",
    "Upgrade required",
    "Plan locked",
    "Device limit exceeded",
    "Reset demo devices",
  ];
  const all = [...grow, ...system];

  it("every key is present in the dictionary", () => {
    for (const k of all) {
      expect(DICTIONARY[k], `missing key: ${k}`).toBeDefined();
    }
  });

  it("each key has a distinct Bangla translation", () => {
    for (const k of all) {
      const bn = translate(k, "bn");
      expect(bn, `no bn for ${k}`).toBeTruthy();
      expect(bn, `bn equals en for ${k}`).not.toBe(k);
    }
  });

  it("english mode round-trips verbatim", () => {
    for (const k of all) {
      expect(translate(k, "en")).toBe(DICTIONARY[k].en);
    }
  });

  it("missing-translation guard still passes", () => {
    expect(findMissingBanglaKeys()).toEqual([]);
  });
});
