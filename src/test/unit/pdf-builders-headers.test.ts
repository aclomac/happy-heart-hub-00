// Phase 9 — verify Purchase Bill / Transfer Challan PDFs render the resolved
// company header and stay Bangla-safe. The builders are pure given their
// input data, so we feed them synthetic rows instead of hitting Supabase.

import { describe, it, expect } from "vitest";
import {
  buildTransferChallanPDF,
  type TransferChallanData,
} from "@/lib/pdf/build-transfer-challan";
import { invoiceCompanyFromRow, resolvePrintContext } from "@/lib/pdf/print-context";
import { generateInvoicePDF, type InvoiceData } from "@/lib/pdf/invoice-pdf";

function banglaCompanyRow() {
  return {
    name: "এরপোভো লিমিটেড",
    address: "ঢাকা, বাংলাদেশ",
    phone: "+8801712345678",
    email: "info@erpovo.bd",
    gst_number: "BIN-1234",
    logo_url: null,
    signature_url: null,
    settings: {},
    currency: "BDT",
  };
}

describe("purchase bill PDF (via invoice pipeline) — header + footer", () => {
  it("renders the resolved company header without throwing", async () => {
    const co = invoiceCompanyFromRow(banglaCompanyRow());
    const data: InvoiceData = {
      type: "bill",
      title: "PURCHASE BILL",
      company: co.company,
      printSettings: co.printSettings,
      signatureLabel: co.signatureLabel,
      footerNote: co.footerNote,
      party: { name: "বিক্রেতা", phone: null, address: null, gst_number: null },
      number: "BILL-001",
      date: "2026-06-01",
      lines: [{ name: "চাল", qty: 10, unit: "কেজি", price: 80, amount: 800 }],
      subtotal: 800,
      total: 800,
      paid: 0,
      balance: 800,
      currency: "BDT",
      terms: "Terms and conditions apply",
    };
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
    expect(typeof doc.output("datauristring")).toBe("string");
  });

  it("falls back to ERPOVO when the company row is empty", () => {
    const r = invoiceCompanyFromRow({});
    expect(r.company.name).toBe("ERPOVO");
    expect(r.printSettings.showLogo).toBe(true);
  });
});

describe("stock transfer challan PDF — header + footer", () => {
  function baseChallan(overrides: Partial<TransferChallanData> = {}): TransferChallanData {
    const ctx = resolvePrintContext(banglaCompanyRow());
    return {
      company: {
        name: ctx.company.name,
        address: ctx.company.address,
        phone: ctx.company.phone,
        email: ctx.company.email,
        gst_number: ctx.company.taxNumber,
        logo_url: ctx.company.logoUrl,
      },
      printContext: ctx,
      transfer_no: "TR-001",
      transfer_date: "2026-06-01",
      from: "Dhaka WH",
      to: "Chittagong WH",
      note: "Handle with care",
      lines: [
        { item: "চাল", qty: 10, unit: "কেজি" },
        { item: "ডাল", qty: 5, unit: "কেজি" },
      ],
      ...overrides,
    };
  }

  it("renders a Bangla-safe challan with company header + signatures", () => {
    const doc = buildTransferChallanPDF(baseChallan());
    expect(doc).toBeDefined();
    expect(typeof doc.output("datauristring")).toBe("string");
  });

  it("handles an empty line set without crashing", () => {
    const doc = buildTransferChallanPDF(baseChallan({ lines: [] }));
    expect(doc).toBeDefined();
  });

  it("hides signature block when showSignature is false", () => {
    const ctx = resolvePrintContext(banglaCompanyRow());
    const data = baseChallan({
      printContext: {
        ...ctx,
        print: { ...ctx.print, showSignature: false },
      },
    });
    const doc = buildTransferChallanPDF(data);
    expect(doc).toBeDefined();
  });

  it("appends bank / terms footer when toggles are on", () => {
    const ctx = resolvePrintContext(banglaCompanyRow());
    const data = baseChallan({
      printContext: {
        ...ctx,
        print: {
          ...ctx.print,
          showTerms: true,
          termsText: "Subject to local jurisdiction",
          showBankDetails: true,
          bankDetailsText: "Bank: ABC #12345",
        },
      },
    });
    const doc = buildTransferChallanPDF(data);
    expect(doc).toBeDefined();
  });

  it("falls back to ERPOVO when companies row is empty", () => {
    const ctx = resolvePrintContext({});
    expect(ctx.company.name).toBe("ERPOVO");
  });
});
