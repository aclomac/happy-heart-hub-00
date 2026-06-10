import { describe, it, expect, vi } from "vitest";
import jsPDF from "jspdf";
import { drawReportHeader, drawReportFooter } from "@/lib/export/pdfChrome";
import { escapeCsvField } from "@/lib/export/csv";
import { buildReportPdf } from "@/lib/export/pdfReport";

describe("pdf chrome — Bangla + branding", () => {
  it("renders Bangla company / title / signature without throwing", () => {
    const doc = new jsPDF();
    expect(() =>
      drawReportHeader(doc, {
        companyName: "এরপোভো লিমিটেড",
        companyMeta: "ঢাকা · +৮৮০ ...",
        title: "বিক্রয় রিপোর্ট",
        period: "২০২৬-০১-০১ → ২০২৬-০১-৩১",
        filters: ["গুদাম: প্রধান"],
      }),
    ).not.toThrow();
    expect(() =>
      drawReportFooter(doc, {
        generatedAt: new Date("2026-01-01"),
        signature: "অনুমোদিত স্বাক্ষর",
      }),
    ).not.toThrow();
  });

  it("falls back to ERPOVO when the company name is blank", () => {
    const doc = new jsPDF();
    const textSpy = vi.spyOn(doc, "text");
    drawReportHeader(doc, { companyName: "", title: "Stock Summary" });
    const calls = textSpy.mock.calls.map((c) => String(c[0]));
    expect(calls).toContain("ERPOVO");
  });

  it("survives a forced text() failure via the ASCII fallback", () => {
    const doc = new jsPDF();
    const original = doc.text.bind(doc);
    let fails = 1;
    const spy = vi
      .spyOn(doc, "text")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(function (this: jsPDF, ...args: any[]) {
        if (fails-- > 0) throw new Error("font missing glyph");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any)(...args);
      });
    expect(() => drawReportHeader(doc, { companyName: "এরপোভো", title: "Stock" })).not.toThrow();
    spy.mockRestore();
  });

  it("renders Page N / M correctly across a multi-page report", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.addPage();
    doc.addPage();
    const textCalls: string[] = [];
    vi.spyOn(doc, "text").mockImplementation(function (this: jsPDF, text: unknown) {
      textCalls.push(String(text));
      return this;
    });
    // Draw footer on each page.
    for (let p = 1; p <= 3; p++) {
      doc.setPage(p);
      drawReportFooter(doc, { signature: "Authorised Signatory" });
    }
    expect(textCalls).toEqual(expect.arrayContaining(["Page 1 / 3", "Page 2 / 3", "Page 3 / 3"]));
  });
});

describe("Bangla CSV safety", () => {
  it("round-trips Bangla characters through escapeCsvField", () => {
    expect(escapeCsvField("পণ্য বিক্রেতা")).toBe("পণ্য বিক্রেতা");
    expect(escapeCsvField("কোম্পানি, ঢাকা")).toBe('"কোম্পানি, ঢাকা"');
  });
});

describe("buildReportPdf — Bangla end-to-end", () => {
  it("does not crash building a Bangla report with company fallback", () => {
    expect(() =>
      buildReportPdf({
        company: null,
        title: "বিক্রয় রিপোর্ট",
        period: { from: "2026-06-01", to: "2026-06-30" },
        columns: [
          { header: "তারিখ", accessor: (r: { d: string }) => r.d },
          { header: "পার্টি", accessor: (r: { p: string }) => r.p },
        ],
        rows: [{ d: "2026-06-01", p: "পণ্য বিক্রেতা" }],
        signature: "অনুমোদিত স্বাক্ষর",
      } as Parameters<typeof buildReportPdf>[0]),
    ).not.toThrow();
  });
});
