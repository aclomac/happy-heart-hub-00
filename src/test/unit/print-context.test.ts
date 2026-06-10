import { describe, it, expect, vi } from "vitest";
import jsPDF from "jspdf";
import {
  resolveCompany,
  resolvePrintContext,
  buildHeaderMeta,
  buildTaxLine,
  fetchPrintContext,
  FALLBACK_COMPANY_NAME,
} from "@/lib/pdf/print-context";
import { drawReportHeader, drawReportFooter } from "@/lib/export/pdfChrome";
import { buildReportPdf } from "@/lib/export/pdfReport";
import { buildPrintReportHtml } from "@/lib/export/printReport";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/settings/companySettings";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

describe("print-context resolver", () => {
  it("falls back to ERPOVO when name is missing", () => {
    const c = resolveCompany({});
    expect(c.name).toBe(FALLBACK_COMPANY_NAME);
  });

  it("trims and prefers the row name", () => {
    expect(resolveCompany({ name: "  Acme Co  " }).name).toBe("Acme Co");
  });

  it("normalizes all known company columns", () => {
    const c = resolveCompany({
      name: "X",
      business_type: "Retail",
      address: "Dhaka",
      phone: "+880",
      email: "x@y",
      logo_url: "https://l",
      signature_url: "https://s",
      gst_number: "TIN-1",
      currency: "BDT",
    });
    expect(c).toMatchObject({
      name: "X",
      businessType: "Retail",
      address: "Dhaka",
      phone: "+880",
      email: "x@y",
      logoUrl: "https://l",
      signatureUrl: "https://s",
      taxNumber: "TIN-1",
      currency: "BDT",
    });
  });

  it("returns DEFAULT_PRINT_SETTINGS when settings JSONB is empty", () => {
    const ctx = resolvePrintContext({ name: "Y", settings: {} });
    expect(ctx.print).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it("merges partial print settings on top of defaults", () => {
    const ctx = resolvePrintContext({
      name: "Y",
      settings: { print: { showLogo: false, termsText: "Custom" } },
    });
    expect(ctx.print.showLogo).toBe(false);
    expect(ctx.print.showSignature).toBe(true); // default preserved
    expect(ctx.print.termsText).toBe("Custom");
  });

  it("buildHeaderMeta joins address/phone/email and skips blanks", () => {
    expect(
      buildHeaderMeta({
        name: "X",
        address: "Dhaka",
        phone: "+1",
        email: "",
      }),
    ).toBe("Dhaka · +1");
  });

  it("buildTaxLine includes TIN and business type", () => {
    expect(buildTaxLine({ name: "X", taxNumber: "TIN-9", businessType: "Manufacturing" })).toBe(
      "TIN/GST: TIN-9 · Manufacturing",
    );
    expect(buildTaxLine({ name: "X" })).toBe("");
  });

  it("fetchPrintContext returns safe fallback when companyId is null", async () => {
    const ctx = await fetchPrintContext(null);
    expect(ctx.company.name).toBe(FALLBACK_COMPANY_NAME);
    expect(ctx.print).toEqual(DEFAULT_PRINT_SETTINGS);
  });
});

describe("pdfChrome — company header + footer toggles", () => {
  it("renders company name + meta + tax line", () => {
    const doc = new jsPDF();
    const spy = vi.spyOn(doc, "text");
    drawReportHeader(doc, {
      companyName: "Acme Co",
      companyMeta: "Dhaka · +1",
      taxLine: "TIN/GST: 999",
      title: "Sales",
    });
    const calls = spy.mock.calls.map((c) => String(c[0]));
    expect(calls).toContain("Acme Co");
    expect(calls).toContain("Dhaka · +1");
    expect(calls).toContain("TIN/GST: 999");
  });

  it("falls back to ERPOVO when name is empty", () => {
    const doc = new jsPDF();
    const spy = vi.spyOn(doc, "text");
    drawReportHeader(doc, { companyName: "", title: "X" });
    expect(spy.mock.calls.map((c) => String(c[0]))).toContain("ERPOVO");
  });

  it("omits logo image when showLogo is false even if dataUrl present", () => {
    const doc = new jsPDF();
    const addSpy = vi.spyOn(doc, "addImage");
    drawReportHeader(doc, {
      companyName: "X",
      title: "Y",
      logoDataUrl: "data:image/png;base64,AAA",
      showLogo: false,
    });
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("omits page number when showPageNumber=false", () => {
    const doc = new jsPDF();
    const spy = vi.spyOn(doc, "text");
    drawReportFooter(doc, { showPageNumber: false });
    const calls = spy.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.startsWith("Page "))).toBe(false);
  });

  it("renders terms / bank / qr / footer note when toggles are on", () => {
    const doc = new jsPDF();
    const spy = vi.spyOn(doc, "text");
    drawReportFooter(doc, {
      print: {
        showTerms: true,
        termsText: "No returns",
        showBankDetails: true,
        bankDetailsText: "ABC 12345",
        showQr: true,
        qrText: "bkash:+880",
      },
      footerNote: "Computer-generated",
    });
    const calls = spy.mock.calls.map((c) => String(c[0]));
    expect(calls).toContain("Terms: No returns");
    expect(calls).toContain("Bank: ABC 12345");
    expect(calls).toContain("Pay: bkash:+880");
    expect(calls).toContain("Computer-generated");
  });

  it("hides terms / bank / qr when their toggles are off", () => {
    const doc = new jsPDF();
    const spy = vi.spyOn(doc, "text");
    drawReportFooter(doc, {
      print: {
        showTerms: false,
        termsText: "No returns",
        showBankDetails: false,
        bankDetailsText: "ABC",
        showQr: false,
        qrText: "x",
      },
    });
    const calls = spy.mock.calls.map((c) => String(c[0]));
    expect(calls).not.toContain("Terms: No returns");
    expect(calls).not.toContain("Bank: ABC");
    expect(calls).not.toContain("Pay: x");
  });
});

describe("buildReportPdf — printContext wiring", () => {
  it("uses company name from printContext when no `company` is passed", () => {
    const ctx = resolvePrintContext({ name: "Acme Co", settings: {} });
    expect(() =>
      buildReportPdf({
        printContext: ctx,
        title: "Sales",
        columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
        rows: [{ x: "1" }],
      } as Parameters<typeof buildReportPdf>[0]),
    ).not.toThrow();
  });

  it("survives Bangla company + signature without throwing", () => {
    const ctx = resolvePrintContext({
      name: "এরপোভো লিমিটেড",
      address: "ঢাকা",
      settings: {},
    });
    expect(() =>
      buildReportPdf({
        printContext: ctx,
        title: "বিক্রয় রিপোর্ট",
        columns: [{ header: "পার্টি", accessor: (r: { p: string }) => r.p }],
        rows: [{ p: "পণ্য বিক্রেতা" }],
        signature: "অনুমোদিত স্বাক্ষর",
      } as Parameters<typeof buildReportPdf>[0]),
    ).not.toThrow();
  });
});

describe("buildPrintReportHtml — print settings wiring", () => {
  it("emits the company name and tax line in HTML", () => {
    const ctx = resolvePrintContext({
      name: "Acme",
      gst_number: "TIN-42",
      settings: {},
    });
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "Sales",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(html).toContain("Acme");
    expect(html).toContain("TIN/GST: TIN-42");
  });

  it("includes a logo <img> when showLogo + logoDataUrl are set", () => {
    const ctx = resolvePrintContext({
      name: "Acme",
      settings: { print: { showLogo: true } },
    });
    ctx.logoDataUrl = "data:image/png;base64,AAA";
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "Sales",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(html).toContain("<img");
    expect(html).toContain("data:image/png;base64,AAA");
  });

  it("omits the logo when showLogo=false even if dataUrl is set", () => {
    const ctx = resolvePrintContext({
      name: "Acme",
      settings: { print: { showLogo: false } },
    });
    ctx.logoDataUrl = "data:image/png;base64,AAA";
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "Sales",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(html).not.toContain("<img");
  });

  it("omits signature when showSignature=false", () => {
    const ctx = resolvePrintContext({
      name: "Acme",
      settings: { print: { showSignature: false } },
    });
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "Sales",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
      signature: "Auth Sig",
    });
    // The footer cell should be empty (no "Auth Sig" text).
    expect(html).not.toContain("Auth Sig");
  });

  it("renders extra terms/bank/qr blocks when enabled", () => {
    const ctx = resolvePrintContext({
      name: "Acme",
      settings: {
        print: {
          showTerms: true,
          termsText: "No returns",
          showBankDetails: true,
          bankDetailsText: "ABC 12345",
          showQr: true,
          qrText: "bkash:+880",
        },
      },
    });
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "Sales",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(html).toContain("No returns");
    expect(html).toContain("ABC 12345");
    expect(html).toContain("bkash:+880");
  });

  it("renders Bangla company name without crashing", () => {
    const ctx = resolvePrintContext({
      name: "এরপোভো",
      address: "ঢাকা",
      settings: {},
    });
    const html = buildPrintReportHtml({
      printContext: ctx,
      title: "বিক্রয়",
      columns: [{ header: "পার্টি", accessor: (r: { p: string }) => r.p }],
      rows: [{ p: "পণ্য বিক্রেতা" }],
    });
    expect(html).toContain("এরপোভো");
    expect(html).toContain("ঢাকা");
  });

  it("respects A4 paper size by default and thermal_80 when set", () => {
    const a4 = buildPrintReportHtml({
      printContext: resolvePrintContext({ name: "X", settings: {} }),
      title: "T",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(a4).toContain("size: A4");
    const thermal = buildPrintReportHtml({
      printContext: resolvePrintContext({
        name: "X",
        settings: { print: { paperSize: "thermal_80" } },
      }),
      title: "T",
      columns: [{ header: "X", accessor: (r: { x: string }) => r.x }],
      rows: [{ x: "1" }],
    });
    expect(thermal).toContain("80mm");
  });
});
