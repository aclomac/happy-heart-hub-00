import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/erp/PurchaseBillActions.tsx"), "utf8");

const EXPECTED_LABELS = [
  "View/Edit",
  "Make Payment",
  "Convert To Debit Note",
  "Cancel Bill",
  "Delete",
  "Duplicate",
  "Open PDF",
  "Preview",
  "Print",
  "View History",
];

describe("Purchase Bill row action menu", () => {
  it("renders all expected labels in the spec order", () => {
    const positions = EXPECTED_LABELS.map((label) => ({
      label,
      index: src.indexOf(`> ${label}\n`),
    }));
    for (const p of positions) {
      expect(p.index, `missing label: ${p.label}`).toBeGreaterThan(-1);
    }
    const sorted = [...positions].sort((a, b) => a.index - b.index);
    expect(sorted.map((p) => p.label)).toEqual(EXPECTED_LABELS);
  });

  it("wires actions to the correct routes", () => {
    expect(src).toContain("`/app/purchases/${bill.id}/edit`");
    expect(src).toContain("`/app/payment-out/new?source=${bill.id}`");
    expect(src).toContain("`/app/debit-notes/new?source=${bill.id}`");
    expect(src).toContain("`/app/purchases/new?duplicate=${bill.id}`");
  });

  it("disables Edit and Cancel when the bill is cancelled", () => {
    const matches = src.match(/disabled=\{isCancelled\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("disables Make Payment when fully paid or cancelled", () => {
    expect(src).toMatch(/disabled=\{isCancelled \|\| fullyPaid\}/);
  });

  it("uses softDeleteWithUndo for Delete and writes a cancel audit event", () => {
    expect(src).toContain("softDeleteWithUndo");
    expect(src).toContain('audit("cancelled")');
    expect(src).toContain('module: "Purchases"');
  });

  it("writes audit events for delete, duplicate, payment, debit note, pdf, preview, print", () => {
    expect(src).toContain('audit("deleted")');
    expect(src).toContain('"duplicated"');
    expect(src).toContain('"payment_started"');
    expect(src).toContain('"debit_note_started"');
    expect(src).toContain('"pdf_downloaded"');
    expect(src).toContain('"previewed"');
    expect(src).toContain('"printed"');
  });

  it("audit metadata uses purchase_bill entity_type and bill_no reference", () => {
    expect(src).toContain('entityType: "purchase_bill"');
    expect(src).toContain("referenceNo: bill.bill_no");
  });

  it("scopes history modal query to this bill", () => {
    expect(src).toContain('queryKey: ["bill-history", billId]');
    expect(src).toMatch(/entity_id\.eq\.\$\{billId\}/);
  });
});
