import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/components/erp/PaymentActions.tsx"), "utf8");
const labelsSrc = readFileSync(
  join(process.cwd(), "src/components/erp/payment-actions-labels.ts"),
  "utf8",
);
const haystack = `${src}\n${labelsSrc}`;

const IN_LABELS = [
  "View/Edit",
  "Open Receipt PDF",
  "Preview Receipt",
  "Print Receipt",
  "Delete",
  "Duplicate",
  "View History",
];

const OUT_LABELS = [
  "View/Edit",
  "Open Voucher PDF",
  "Preview Voucher",
  "Print Voucher",
  "Delete",
  "Duplicate",
  "View History",
];

describe("PaymentActions shared menu", () => {
  it("declares both direction configs with the spec label sets", () => {
    for (const l of IN_LABELS) {
      // labels live either as JSX text in PaymentActions or in the locale-aware
      // payment-actions-labels module — both forms are searched as plain text.
      expect(haystack.includes(l), `payment-in missing label: ${l}`).toBe(true);
    }
    for (const l of OUT_LABELS) {
      expect(haystack.includes(l), `payment-out missing label: ${l}`).toBe(true);
    }
  });

  it("wires routes for view/edit and duplicate for both directions", () => {
    expect(src).toContain("`/app/payments-in/${id}/edit`");
    expect(src).toContain("`/app/payments-in/new?duplicate=${id}`");
    expect(src).toContain("`/app/payment-out/${id}/edit`");
    expect(src).toContain("`/app/payment-out/new?duplicate=${id}`");
  });

  it("declares correct soft-delete modules per direction", () => {
    expect(src).toContain('softDeleteModule: "payment_in"');
    expect(src).toContain('softDeleteModule: "payment_out"');
  });

  it("uses softDeleteWithUndo for delete (reverses cash/party/allocation idempotently)", () => {
    expect(src).toContain("softDeleteWithUndo");
    expect(src).toMatch(/module:\s*cfg\.softDeleteModule/);
  });

  it("writes audit logs for edit/pdf/preview/print/duplicate", () => {
    expect(src).toContain('"edit_opened"');
    expect(src).toContain('"pdf_downloaded"');
    expect(src).toContain('"previewed"');
    expect(src).toContain('"printed"');
    expect(src).toContain('"duplicated"');
  });

  it("audit metadata uses entity_type per direction and references payment_id + reference_no", () => {
    expect(src).toContain('entityType: "payment_in"');
    expect(src).toContain('entityType: "payment_out"');
    expect(src).toContain("entityId: payment.id");
    expect(src).toContain("referenceNo: payment.reference_no");
  });

  it("PDF helpers route through buildCashEntryData + downloadInvoicePDF/printInvoicePDF", () => {
    expect(src).toContain("buildCashEntryData(payment.posted_txn_id, companyId)");
    expect(src).toContain("downloadInvoicePDF");
    expect(src).toContain("printInvoicePDF");
  });

  it("scopes history modal query to this payment id and reference_no", () => {
    expect(src).toContain('queryKey: ["payment-history", paymentId]');
    expect(src).toMatch(/entity_id\.eq\.\$\{paymentId\}/);
    expect(src).toMatch(/reference_no\.eq\.\$\{refLabel\}/);
  });

  it("guards PDF flow when payment has no posted transaction", () => {
    expect(src).toContain("Receipt not available");
  });
});

describe("Payments new routes — duplicate hydration", () => {
  const inNew = readFileSync(join(process.cwd(), "src/routes/app.payments-in.new.tsx"), "utf8");
  const outNew = readFileSync(join(process.cwd(), "src/routes/app.payment-out.new.tsx"), "utf8");
  const outShell = readFileSync(join(process.cwd(), "src/routes/app.payment-out.tsx"), "utf8");

  it("payments-in/new accepts ?duplicate=<uuid>", () => {
    expect(inNew).toMatch(/duplicate:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
  });

  it("payment-out/new accepts ?duplicate=<uuid> and forwards to PaymentOut", () => {
    expect(outNew).toMatch(/duplicate:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    expect(outNew).toContain("duplicatePaymentId={duplicate}");
  });

  it("PaymentOut hydrates from existing payment without copying reference_no or status", () => {
    expect(outShell).toContain("duplicatePaymentId");
    expect(outShell).toMatch(/select\(\s*"party_id,amount,method,notes"\s*\)/);
    expect(outShell).toContain("Duplicated from payment");
    // Must NOT pull reference_no/status from the source row
    expect(outShell).not.toMatch(
      /select\(\s*"[^"]*reference_no[^"]*"\s*\)[\s\S]{0,200}duplicatePaymentId/,
    );
  });

  it("payments-in new hydrates duplicate without copying reference_no", () => {
    expect(inNew).toContain("Duplicated from payment");
    expect(inNew).toMatch(/select\(\s*"party_id,amount,method,notes"\s*\)/);
  });
});

describe("Payment edit routes — disabled with reason", () => {
  const inEdit = readFileSync(
    join(process.cwd(), "src/routes/app.payments-in.$id.edit.tsx"),
    "utf8",
  );
  const outEdit = readFileSync(
    join(process.cwd(), "src/routes/app.payment-out.$id.edit.tsx"),
    "utf8",
  );

  it("payment-in edit explains why editing is disabled and offers duplicate-as-new", () => {
    expect(inEdit).toContain("Editing is disabled");
    expect(inEdit).toContain("Duplicate as New");
  });
  it("payment-out edit explains why editing is disabled and offers duplicate-as-new", () => {
    expect(outEdit).toContain("Editing is disabled");
    expect(outEdit).toContain("Duplicate as New");
  });
});
