import { describe, it, expect } from "vitest";
import {
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_ITEM_SETTINGS,
  DEFAULT_PARTY_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_TEMPLATES,
  mergeSettings,
} from "@/lib/settings/companySettings";

describe("companySettings.mergeSettings", () => {
  it("returns defaults when input is null/undefined", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_COMPANY_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_COMPANY_SETTINGS);
  });

  it("returns defaults when input is empty object", () => {
    expect(mergeSettings({})).toEqual(DEFAULT_COMPANY_SETTINGS);
  });

  it("merges partial print settings preserving defaults for missing keys", () => {
    const merged = mergeSettings({ print: { paperSize: "thermal_80" } });
    expect(merged.print.paperSize).toBe("thermal_80");
    expect(merged.print.fontSize).toBe(DEFAULT_PRINT_SETTINGS.fontSize);
    expect(merged.print.itemColumns.qty).toBe(true);
  });

  it("merges partial itemColumns without losing the rest", () => {
    const merged = mergeSettings({ print: { itemColumns: { hsn: true } } });
    expect(merged.print.itemColumns.hsn).toBe(true);
    expect(merged.print.itemColumns.qty).toBe(DEFAULT_PRINT_SETTINGS.itemColumns.qty);
  });

  it("preserves user template overrides", () => {
    const merged = mergeSettings({ templates: { sales_invoice: "Custom" } });
    expect(merged.templates.sales_invoice).toBe("Custom");
    expect(merged.templates.payment_in).toBe(DEFAULT_TEMPLATES.payment_in);
  });

  it("toggles item flags safely (tax fallback safe)", () => {
    const merged = mergeSettings({ taxEnabled: false, items: { enableStock: false } });
    expect(merged.taxEnabled).toBe(false);
    expect(merged.items.enableStock).toBe(false);
    expect(merged.items.enableMrp).toBe(DEFAULT_ITEM_SETTINGS.enableMrp);
  });

  it("toggles party flags safely", () => {
    const merged = mergeSettings({ parties: { enableLoyaltyPoints: true } });
    expect(merged.parties.enableLoyaltyPoints).toBe(true);
    expect(merged.parties.enableCreditLimit).toBe(DEFAULT_PARTY_SETTINGS.enableCreditLimit);
  });

  it("defaults taxEnabled to true (safe fallback for non-tax businesses overriding to false)", () => {
    expect(mergeSettings({}).taxEnabled).toBe(true);
    expect(mergeSettings({ taxEnabled: false }).taxEnabled).toBe(false);
  });

  it("ignores garbage input gracefully", () => {
    expect(mergeSettings(42)).toEqual(DEFAULT_COMPANY_SETTINGS);
    expect(mergeSettings("nope")).toEqual(DEFAULT_COMPANY_SETTINGS);
  });
});
