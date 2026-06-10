import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { drawReportHeader, drawReportFooter } from "@/lib/export/pdfChrome";

describe("pdf chrome", () => {
  it("draws a header and returns a content start Y position", () => {
    const doc = new jsPDF();
    const y = drawReportHeader(doc, {
      companyName: "ERPOVO Ltd",
      companyMeta: "Dhaka · +880 ...",
      title: "Stock Summary",
      period: "2026-01-01 → 2026-01-31",
      filters: ["Warehouse: Main"],
    });
    expect(typeof y).toBe("number");
    expect(y).toBeGreaterThan(20);
  });

  it("does not crash on a minimal header", () => {
    const doc = new jsPDF();
    expect(() => drawReportHeader(doc, { companyName: "X", title: "Y" })).not.toThrow();
  });

  it("draws a footer with generated timestamp and page info", () => {
    const doc = new jsPDF();
    expect(() => drawReportFooter(doc, { generatedAt: new Date("2026-01-01") })).not.toThrow();
    expect(() => drawReportFooter(doc, {})).not.toThrow();
    expect(() => drawReportFooter(doc, { signature: "Prepared by: Admin" })).not.toThrow();
  });
});
