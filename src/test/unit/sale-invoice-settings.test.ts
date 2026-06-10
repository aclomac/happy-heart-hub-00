import { describe, it, expect } from "vitest";
import {
  DEFAULT_SALE_INVOICE_SETTINGS,
  mergeSaleInvoiceSettings,
  paymentTermsToDueDate,
  PAYMENT_TERMS_OPTIONS,
} from "@/lib/sale-invoice-settings";

describe("sale-invoice-settings", () => {
  it("defaults customer-facing field toggles to true", () => {
    // Phase 2 added attachment-PDF toggles; `embed_attachment_images` is
    // intentionally OFF by default to keep PDFs small.
    const OFF_BY_DESIGN = new Set(["embed_attachment_images"]);
    for (const [k, v] of Object.entries(DEFAULT_SALE_INVOICE_SETTINGS)) {
      if (OFF_BY_DESIGN.has(k)) {
        expect(v).toBe(false);
      } else {
        expect(v, k).toBe(true);
      }
    }
  });

  it("merges partial settings on top of defaults", () => {
    const merged = mergeSaleInvoiceSettings({ show_vat: false, show_labor_cost: false });
    expect(merged.show_vat).toBe(false);
    expect(merged.show_labor_cost).toBe(false);
    expect(merged.show_discount).toBe(true);
    expect(merged.show_billing_name).toBe(true);
  });

  it("treats null/undefined as no overrides", () => {
    expect(mergeSaleInvoiceSettings(null)).toEqual(DEFAULT_SALE_INVOICE_SETTINGS);
    expect(mergeSaleInvoiceSettings(undefined)).toEqual(DEFAULT_SALE_INVOICE_SETTINGS);
  });

  it("computes due date from Net N payment terms", () => {
    expect(paymentTermsToDueDate("2026-01-01", "net7")).toBe("2026-01-08");
    expect(paymentTermsToDueDate("2026-01-01", "net30")).toBe("2026-01-31");
    expect(paymentTermsToDueDate("2026-01-01", "net60")).toBe("2026-03-02");
  });

  it("returns empty for non-net presets (caller falls back)", () => {
    expect(paymentTermsToDueDate("2026-01-01", "custom")).toBe("");
    expect(paymentTermsToDueDate("2026-01-01", "due_on_receipt")).toBe("");
    expect(paymentTermsToDueDate("", "net7")).toBe("");
  });

  it("ships the expected dropdown presets", () => {
    const values = PAYMENT_TERMS_OPTIONS.map((o) => o.value);
    expect(values).toEqual([
      "due_on_receipt",
      "net7",
      "net15",
      "net30",
      "net45",
      "net60",
      "custom",
    ]);
  });
});
