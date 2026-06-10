import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/erp/SaleInvoiceActions.tsx"), "utf8");

const EXPECTED_LABELS = [
  "View/Edit",
  "Receive Payment",
  "Convert To Return",
  "Preview Delivery Challan",
  "Cancel Invoice",
  "Delete",
  "Duplicate",
  "Open PDF",
  "Preview",
  "Print",
  "View History",
];

describe("Sale Invoice row action menu", () => {
  it("renders all expected labels in the spec order", () => {
    const positions = EXPECTED_LABELS.map((label) => ({
      label,
      // Match label followed by newline so "Preview" doesn't hit "Preview Delivery Challan"
      index: src.indexOf(`> ${label}\n`),
    }));
    for (const p of positions) {
      expect(p.index, `missing label: ${p.label}`).toBeGreaterThan(-1);
    }
    const sorted = [...positions].sort((a, b) => a.index - b.index);
    expect(sorted.map((p) => p.label)).toEqual(EXPECTED_LABELS);
  });

  it("wires actions to the correct routes", () => {
    expect(src).toContain("`/app/sales/${sale.id}/edit`");
    expect(src).toContain("`/app/payments-in/new?source=${sale.id}`");
    expect(src).toContain("`/app/credit-notes/new?source=${sale.id}`");
    expect(src).toContain("`/app/delivery-challans/new?source=${sale.id}`");
    expect(src).toContain("`/app/sales/new?duplicate=${sale.id}`");
  });

  it("disables Edit and Cancel when the invoice is cancelled", () => {
    const matches = src.match(/disabled=\{isCancelled\}/g) ?? [];
    // one on View/Edit, one on Cancel Invoice
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("disables Receive Payment when fully paid or cancelled", () => {
    expect(src).toMatch(/disabled=\{isCancelled \|\| fullyPaid\}/);
  });

  it("uses softDeleteWithUndo for Delete and writes a cancel audit event", () => {
    expect(src).toContain("softDeleteWithUndo");
    expect(src).toContain('action: "cancelled"');
    expect(src).toContain('module: "Sales"');
  });

  it("scopes history modal query to this invoice", () => {
    expect(src).toContain('queryKey: ["invoice-history", saleId]');
    expect(src).toMatch(/entity_id\.eq\.\$\{saleId\}/);
  });
});
