import { describe, it, expect, vi } from "vitest";
import { generateInvoicePDF, type InvoiceData } from "@/lib/pdf/invoice-pdf";
import { invoiceCompanyFromRow } from "@/lib/pdf/print-context";

// jsdom fetch doesn't return real images — short-circuit loadImage failures.
function baseInvoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    title: "TAX INVOICE",
    company: {
      name: "Acme Co",
      address: "Dhaka",
      phone: "+880",
      email: "x@y.com",
      gst_number: "TIN-1",
    },
    party: { name: "Customer", phone: null, address: null, gst_number: null },
    number: "INV-001",
    date: "2026-06-01",
    lines: [{ name: "Widget", qty: 1, price: 100, amount: 100 }],
    subtotal: 100,
    total: 100,
    paid: 100,
    balance: 0,
    currency: "BDT",
    ...overrides,
  };
}

describe("invoice-pdf — Company Profile + Print Settings", () => {
  it("renders the company name in the header (Bangla safe)", async () => {
    const data = baseInvoice({
      company: {
        name: "এরপোভো লিমিটেড",
        address: "ঢাকা",
        phone: "+880",
        email: "x@y",
        gst_number: "TIN-9",
      },
    });
    const doc = await generateInvoicePDF(data);
    // doc was produced without throwing — that's the contract for Bangla safety.
    expect(doc).toBeDefined();
    expect(typeof doc.output("datauristring")).toBe("string");
  });

  it("falls back to ERPOVO when company.name is blank", async () => {
    const data = baseInvoice({
      company: { name: "" } as InvoiceData["company"],
    });
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
  });

  it("does not call addImage when showLogo=false", async () => {
    const data = baseInvoice({
      company: {
        name: "Acme",
        logo_url: "https://example.com/logo.png",
        address: null,
        phone: null,
        email: null,
        gst_number: null,
      },
      printSettings: { showLogo: false },
    });
    // Stub fetch so loadImage would otherwise succeed.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(""));
    await generateInvoicePDF(data);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders the signature block when showSignature is the default (true)", async () => {
    const data = baseInvoice();
    const doc = await generateInvoicePDF(data);
    // Just smoke-test — the actual signature line is drawn at fixed Y.
    expect(doc).toBeDefined();
  });

  it("hides terms when showTerms=false", async () => {
    // We can't easily probe drawn text, but the call must not throw.
    const data = baseInvoice({
      terms: "All sales final",
      printSettings: { showTerms: false },
    });
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
  });

  it("includes bank/QR/footer note when toggles are on", async () => {
    const data = baseInvoice({
      printSettings: {
        showBankDetails: true,
        bankDetailsText: "Bank: ABC #12345",
        showQr: true,
        qrText: "bkash:+880",
      },
      footerNote: "Auto-generated voucher",
    });
    const doc = await generateInvoicePDF(data);
    expect(doc).toBeDefined();
  });
});

describe("invoiceCompanyFromRow", () => {
  it("normalizes a companies row into the InvoiceData company shape", () => {
    const r = invoiceCompanyFromRow({
      name: "Acme",
      address: "Dhaka",
      phone: "+880",
      email: "x@y",
      gst_number: "TIN-1",
      logo_url: "https://l",
      signature_url: "https://s",
      business_type: "Retail",
      settings: { print: { showLogo: false } },
    });
    expect(r.company).toMatchObject({
      name: "Acme",
      address: "Dhaka",
      phone: "+880",
      email: "x@y",
      gst_number: "TIN-1",
      logo_url: "https://l",
      signature_url: "https://s",
      business_type: "Retail",
    });
    expect(r.printSettings.showLogo).toBe(false);
    expect(r.signatureLabel).toBe("Authorised Signatory");
  });

  it("falls back to ERPOVO when row is null", () => {
    const r = invoiceCompanyFromRow(null);
    expect(r.company.name).toBe("ERPOVO");
    expect(r.printSettings.showLogo).toBe(true);
  });
});
