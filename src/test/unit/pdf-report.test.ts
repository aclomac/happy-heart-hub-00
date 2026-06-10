import { describe, it, expect } from "vitest";
import {
  buildReportPdf,
  assertReportNotEmpty,
  pdfFilename,
  EmptyExportError,
  scopeActive,
  scopeCompany,
  buildPrintReportHtml,
} from "@/lib/export";

type Row = {
  date: string;
  party: string;
  amount: number;
  deleted_at?: string | null;
  company_id?: string | null;
};

const sampleRows: Row[] = [
  { date: "2026-06-01", party: "Acme", amount: 1500, company_id: "c1" },
  { date: "2026-06-02", party: "পণ্য বিক্রেতা", amount: 2750.5, company_id: "c1" },
];

const columns = [
  { header: "Date", accessor: (r: Row) => r.date },
  { header: "Party", accessor: (r: Row) => r.party },
  { header: "Amount", align: "right" as const, accessor: (r: Row) => r.amount.toFixed(2) },
];

describe("buildReportPdf", () => {
  it("renders a full PDF without throwing", () => {
    expect(() =>
      buildReportPdf({
        title: "Sales Report",
        company: {
          name: "ERPOVO Ltd",
          address: "Dhaka",
          phone: "+880",
          email: "hi@erpovo.app",
        },
        period: { from: "2026-06-01", to: "2026-06-30" },
        filters: { warehouse: "Main" },
        columns,
        rows: sampleRows,
        totals: ["", "Total", "4250.50"],
        signature: "Authorised Signatory",
      }),
    ).not.toThrow();
  });

  it("works with missing company info (fallback path)", () => {
    expect(() =>
      buildReportPdf({
        title: "Audit History",
        columns,
        rows: sampleRows,
      }),
    ).not.toThrow();
  });

  it("survives Bangla text in cells and filters", () => {
    expect(() =>
      buildReportPdf({
        title: "স্টক রিপোর্ট",
        filters: { search: "পণ্য" },
        columns,
        rows: sampleRows,
      }),
    ).not.toThrow();
  });
});

describe("assertReportNotEmpty", () => {
  it("throws EmptyExportError for empty input", () => {
    expect(() => assertReportNotEmpty([])).toThrow(EmptyExportError);
  });
  it("passes non-empty input through", () => {
    expect(assertReportNotEmpty([1, 2])).toEqual([1, 2]);
  });
});

describe("pdfFilename", () => {
  it("produces a PDF filename with date range", () => {
    expect(pdfFilename("Sales Report", { from: "2026-06-01", to: "2026-06-30" })).toBe(
      "erpovo-sales-report-2026-06-01_2026-06-30.pdf",
    );
  });
});

describe("scope helpers (PDF safety)", () => {
  it("strips soft-deleted rows", () => {
    const rows: Row[] = [
      { date: "1", party: "A", amount: 1, company_id: "c1" },
      { date: "2", party: "B", amount: 2, company_id: "c1", deleted_at: "2026-06-01" },
    ];
    expect(scopeActive(rows)).toHaveLength(1);
  });
  it("strips other-company rows", () => {
    const rows: Row[] = [
      { date: "1", party: "A", amount: 1, company_id: "c1" },
      { date: "2", party: "B", amount: 2, company_id: "c2" },
    ];
    expect(scopeCompany(rows, "c1")).toHaveLength(1);
  });
});

describe("buildPrintReportHtml", () => {
  const html = buildPrintReportHtml({
    title: "Sales Report",
    company: { name: "ERPOVO Ltd", address: "Dhaka", phone: "+880", email: "x@y.z" },
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { warehouse: "Main", search: "পণ্য" },
    columns,
    rows: sampleRows,
    totals: ["", "Total", "4250.50"],
    signature: "Authorised Signatory",
  });

  it("includes title, company and period", () => {
    expect(html).toContain("Sales Report");
    expect(html).toContain("ERPOVO Ltd");
    expect(html).toContain("2026-06-01 → 2026-06-30");
  });

  it("includes every row's data", () => {
    expect(html).toContain("Acme");
    expect(html).toContain("পণ্য বিক্রেতা");
    expect(html).toContain("পণ্য"); // filter value
  });

  it("escapes HTML-unsafe characters", () => {
    const evil = buildPrintReportHtml({
      title: "X",
      columns: [{ header: "C", accessor: (r: { v: string }) => r.v }],
      rows: [{ v: "<script>alert(1)</script>" }],
    });
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).toContain("&lt;script&gt;");
  });

  it("renders totals row when provided", () => {
    expect(html).toContain("4250.50");
    expect(html).toContain("<tfoot>");
  });

  it("contains A4 print CSS", () => {
    expect(html).toContain("@page");
    expect(html).toContain("A4");
  });
});
