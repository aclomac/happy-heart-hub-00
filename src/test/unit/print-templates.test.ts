import { describe, it, expect } from "vitest";
import {
  REGULAR_TEMPLATES,
  THERMAL_TEMPLATES,
  getRegularTemplate,
  getThermalTemplate,
  renderRegularInvoice,
  renderThermalReceipt,
  SAMPLE_INVOICE,
} from "@/lib/print-templates";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/settings/companySettings";

describe("print-templates", () => {
  it("exposes 6 regular templates", () => {
    expect(Object.keys(REGULAR_TEMPLATES)).toHaveLength(6);
    expect(Object.keys(REGULAR_TEMPLATES).sort()).toEqual(
      ["classic", "compact", "minimal", "modern", "professional", "tax_invoice"].sort(),
    );
  });

  it("exposes 4 thermal templates", () => {
    expect(Object.keys(THERMAL_TEMPLATES)).toHaveLength(4);
    expect(Object.keys(THERMAL_TEMPLATES).sort()).toEqual(
      ["thermal_58", "thermal_80", "thermal_compact", "thermal_detailed"].sort(),
    );
  });

  it("falls back to defaults for unknown ids", () => {
    expect(getRegularTemplate(undefined).id).toBe("classic");
    expect(getRegularTemplate(null).id).toBe("classic");
    expect(getThermalTemplate(undefined).id).toBe("thermal_80");
  });

  it("renders a regular invoice for every template without throwing", async () => {
    for (const t of Object.values(REGULAR_TEMPLATES)) {
      const data = {
        ...SAMPLE_INVOICE,
        printSettings: { ...DEFAULT_PRINT_SETTINGS, regularTemplate: t.id },
      };
      const doc = await renderRegularInvoice(data);
      expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(0);
    }
  });

  it("renders a thermal receipt for every template without throwing", () => {
    for (const t of Object.values(THERMAL_TEMPLATES)) {
      const data = {
        ...SAMPLE_INVOICE,
        printSettings: { ...DEFAULT_PRINT_SETTINGS, thermalTemplate: t.id },
      };
      const doc = renderThermalReceipt(data);
      expect(doc.internal.pageSize.getWidth()).toBe(t.width);
    }
  });

  it("honors paperSize and orientation overrides", async () => {
    const data = {
      ...SAMPLE_INVOICE,
      printSettings: {
        ...DEFAULT_PRINT_SETTINGS,
        paperSize: "letter" as const,
        orientation: "landscape" as const,
      },
    };
    const doc = await renderRegularInvoice(data);
    // Letter landscape: width > height
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
  });
});
