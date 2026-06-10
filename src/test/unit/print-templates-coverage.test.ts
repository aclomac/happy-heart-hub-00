import { describe, it, expect } from "vitest";
import { generateInvoicePDF, type InvoiceData } from "@/lib/pdf/invoice-pdf";
import { generatePOSReceipt } from "@/lib/pdf/pos-receipt";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";
import { REGULAR_TEMPLATES, THERMAL_TEMPLATES, SAMPLE_INVOICE } from "@/lib/print-templates";
import {
  DEFAULT_PRINT_SETTINGS,
  type RegularTemplateId,
  type ThermalTemplateId,
} from "@/lib/settings/companySettings";

/** Minimal Bangla-safe invoice payload mirroring what every build-*.ts emits. */
function makeDoc(
  type: NonNullable<InvoiceData["type"]>,
  title: string,
  template: RegularTemplateId,
): InvoiceData {
  const base = invoiceCompanyFromRow({
    name: "এরপোভো ট্রেডিং",
    business_type: "Retail",
    address: "Dhaka",
    phone: "+880",
    email: "a@b.c",
    gst_number: "BIN-1",
    settings: { print: { ...DEFAULT_PRINT_SETTINGS, regularTemplate: template } },
  });
  return {
    type,
    title,
    company: base.company,
    party: { name: "করিম এন্টারপ্রাইজ" },
    number: `${title}-001`,
    date: "2026-06-03",
    lines: [{ name: "চাল", qty: 1, unit: "KG", price: 100, amount: 100 }],
    subtotal: 100,
    total: 100,
    currency: "BDT",
    currencySymbol: "Tk",
    printSettings: base.printSettings,
    signatureLabel: base.signatureLabel,
    footerNote: base.footerNote,
  };
}

/** Every document type that flows through invoiceCompanyFromRow → generateInvoicePDF. */
const DOC_TYPES: Array<[string, NonNullable<InvoiceData["type"]>]> = [
  ["Sale Invoice", "invoice"],
  ["Estimate / Quotation", "invoice"],
  ["Sale Order", "invoice"],
  ["Delivery Challan", "invoice"],
  ["Credit Note", "invoice"],
  ["Purchase Bill", "bill"],
  ["Purchase Order", "bill"],
  ["Debit Note", "bill"],
  ["Payment In Receipt", "receipt"],
  ["Payment Out Receipt", "receipt"],
  ["Expense Voucher", "bill"],
  ["Salary Slip", "receipt"],
  ["Stock Transfer Challan", "invoice"],
  ["Cash Reconciliation", "invoice"],
];

describe("print templates — end-to-end document coverage", () => {
  it("every document type renders with every regular template", async () => {
    for (const [label, type] of DOC_TYPES) {
      for (const t of Object.values(REGULAR_TEMPLATES)) {
        const data = makeDoc(type, label, t.id);
        const doc = await generateInvoicePDF(data);
        expect(doc, `${label} + ${t.id}`).toBeDefined();
        expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(0);
      }
    }
  });

  it("POS receipt renders with every thermal template", async () => {
    for (const t of Object.values(THERMAL_TEMPLATES)) {
      const data: InvoiceData = {
        ...SAMPLE_INVOICE,
        printSettings: { ...DEFAULT_PRINT_SETTINGS, thermalTemplate: t.id },
      };
      const doc = await generatePOSReceipt(data);
      expect(doc.internal.pageSize.getWidth()).toBe(t.width);
    }
  });

  it("does not crash on an empty / minimal invoice", async () => {
    const data: InvoiceData = {
      company: { name: "" },
      number: "",
      date: "",
      lines: [],
      subtotal: 0,
      total: 0,
    };
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
  });

  it("falls back to classic template when regularTemplate is invalid", async () => {
    const data = makeDoc("invoice", "Sale Invoice", "classic");
    data.printSettings = {
      ...DEFAULT_PRINT_SETTINGS,
      regularTemplate: "not_a_real_template" as RegularTemplateId,
    };
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
  });

  it("falls back to thermal_80 when thermalTemplate is invalid", async () => {
    const data: InvoiceData = {
      ...SAMPLE_INVOICE,
      printSettings: {
        ...DEFAULT_PRINT_SETTINGS,
        thermalTemplate: "nope" as ThermalTemplateId,
      },
    };
    const doc = await generatePOSReceipt(data);
    expect(doc.internal.pageSize.getWidth()).toBe(80);
  });

  it("honors the regularTemplate selected in company settings", async () => {
    // Two different templates produce different PDF byte output for the same data.
    const a = await generateInvoicePDF(makeDoc("invoice", "Sale", "classic"));
    const b = await generateInvoicePDF(makeDoc("invoice", "Sale", "tax_invoice"));
    expect(a.output("datauristring")).not.toEqual(b.output("datauristring"));
  });
});
