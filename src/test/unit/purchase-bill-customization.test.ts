import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const settingsLib = readFileSync(join(process.cwd(), "src/lib/purchase-bill-settings.ts"), "utf8");
const settingsRoute = readFileSync(
  join(process.cwd(), "src/routes/app.purchase-bill-settings.tsx"),
  "utf8",
);
const purchaseForm = readFileSync(
  join(process.cwd(), "src/components/erp/PurchaseDocForm.tsx"),
  "utf8",
);
const buildBill = readFileSync(join(process.cwd(), "src/lib/pdf/build-bill.ts"), "utf8");
const billsLib = readFileSync(join(process.cwd(), "src/lib/purchase-bills.ts"), "utf8");
const i18n = readFileSync(join(process.cwd(), "src/lib/i18n.tsx"), "utf8");
const settingsPage = readFileSync(join(process.cwd(), "src/routes/app.settings.tsx"), "utf8");

describe("Purchase Bill customization — settings module", () => {
  it("defines every required toggle", () => {
    for (const key of [
      "show_billing_name",
      "show_po_no",
      "show_po_date",
      "show_payment_terms",
      "show_due_date",
      "show_description",
      "show_vat",
      "show_discount",
      "show_delivery_charge",
      "show_labor_cost",
      "show_notes",
      "show_terms",
    ]) {
      expect(settingsLib).toContain(key);
    }
  });

  it("defaults customer-facing toggles to true (Tax/VAT included)", () => {
    const block = settingsLib.match(
      /DEFAULT_PURCHASE_BILL_SETTINGS:\s*PurchaseBillSettings\s*=\s*\{([\s\S]*?)\};/,
    );
    expect(block).toBeTruthy();
    expect(block![1]).toContain("show_vat: true");
    // The only "false" allowed is the Phase 2 embed-images-in-PDF toggle.
    const falseLines = block![1].split("\n").filter((l) => /:\s*false/.test(l));
    for (const line of falseLines) {
      expect(line).toContain("embed_attachment_images");
    }
  });

  it("persists under the dedicated settings_kv key", () => {
    expect(settingsLib).toContain('PURCHASE_BILL_SETTINGS_KEY = "purchase_bill.customization"');
  });
});

describe("Purchase Bill customization — settings route", () => {
  it("registers /app/purchase-bill-settings", () => {
    expect(settingsRoute).toContain('createFileRoute("/app/purchase-bill-settings")');
  });

  it("renders a Switch per toggle with testable ids", () => {
    expect(settingsRoute).toContain("data-testid={`pb-toggle-${tg.key}`}");
    expect(settingsRoute).toContain("loadPurchaseBillSettings");
    expect(settingsRoute).toContain("savePurchaseBillSettings");
  });

  it("uses Purchase Bill Customization title (translatable)", () => {
    expect(settingsRoute).toContain('t("Purchase Bill Customization")');
  });
});

describe("Purchase Bill customization — form integration", () => {
  it("loads purchase-bill settings only on the bill kind", () => {
    expect(purchaseForm).toContain('queryKey: ["purchase-bill-settings", companyId]');
    expect(purchaseForm).toMatch(/enabled:\s*!!companyId\s*&&\s*kind\s*===\s*"bill"/);
  });

  it("renders gated Billing Name, PO No, PO Date and Payment Terms fields", () => {
    expect(purchaseForm).toContain('data-testid="pb-field-billing_name"');
    expect(purchaseForm).toContain('data-testid="pb-field-po_no"');
    expect(purchaseForm).toContain('data-testid="pb-field-po_date"');
    expect(purchaseForm).toContain('data-testid="pb-field-payment_terms"');
  });

  it("hydrates meta values on edit", () => {
    expect(purchaseForm).toContain("if (m.billing_name) setBillingName");
    expect(purchaseForm).toContain("if (m.po_no) setPoNo");
    expect(purchaseForm).toContain("if (m.po_date) setPoDate");
    expect(purchaseForm).toContain("if (m.payment_terms) setPaymentTerms");
  });

  it("passes the four new fields into savePurchaseBill", () => {
    expect(purchaseForm).toContain(
      "billing_name: settings.show_billing_name ? billingName || null : null",
    );
    expect(purchaseForm).toContain("po_no: settings.show_po_no ? poNo || null : null");
    expect(purchaseForm).toContain("po_date: settings.show_po_date ? poDate || null : null");
    expect(purchaseForm).toContain(
      "payment_terms: settings.show_payment_terms ? paymentTerms || null : null",
    );
  });
});

describe("Purchase Bill customization — persistence", () => {
  it("extends BillInput and BillMeta with the four optional fields", () => {
    for (const f of ["billing_name", "po_no", "po_date", "payment_terms"]) {
      expect(billsLib).toMatch(new RegExp(`${f}\\?:\\s*string \\| null`));
    }
  });

  it("stringifies the meta fields into notes on save", () => {
    expect(billsLib).toContain("billing_name: input.billing_name ?? null");
    expect(billsLib).toContain("po_no: input.po_no ?? null");
    expect(billsLib).toContain("po_date: input.po_date ?? null");
    expect(billsLib).toContain("payment_terms: input.payment_terms ?? null");
  });
});

describe("Purchase Bill customization — PDF/Print", () => {
  it("loads settings and gates fields in the PDF builder", () => {
    expect(buildBill).toContain("loadPurchaseBillSettings(companyId)");
    expect(buildBill).toContain("settings.show_billing_name && meta.billing_name");
    expect(buildBill).toContain("settings.show_due_date ? bill.due_date : null");
    expect(buildBill).toContain("showVat ? Number(bill.tax) : 0");
    expect(buildBill).toContain("showDiscount ? Number(bill.discount) : 0");
    expect(buildBill).toContain('settings.show_notes ? cleanNotes(bill.notes) : ""');
    expect(buildBill).toContain("settings.show_terms");
  });
});

describe("Purchase Bill customization — Bangla i18n", () => {
  it("includes the new Bangla labels", () => {
    expect(i18n).toContain('"Purchase Bill Customization"');
    expect(i18n).toContain("পারচেজ বিল কাস্টমাইজেশন");
    expect(i18n).toContain('"Purchase Bill Settings"');
    expect(i18n).toContain("পারচেজ বিল সেটিংস");
  });

  it("reuses shared Bangla translations for the gated fields", () => {
    for (const k of ["Billing Name", "PO No.", "PO Date", "Payment Terms", "Tax / VAT column"]) {
      expect(i18n).toContain(`"${k}"`);
    }
  });
});

describe("Purchase Bill customization — Settings page link", () => {
  it("exposes a Settings → Print entry that links to the new route", () => {
    expect(settingsPage).toContain("Purchase Bill Customization");
    expect(settingsPage).toContain('to="/app/purchase-bill-settings"');
  });
});
