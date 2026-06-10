import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the two builders so tests are fast and assert call args.
const buildReportPdf = vi.fn();
const printReportHtml = vi.fn();
const saveSpy = vi.fn();

vi.mock("@/lib/export/pdfReport", async (orig) => {
  const actual = (await orig()) as typeof import("@/lib/export/pdfReport");
  return {
    ...actual,
    buildReportPdf: (args: unknown) => {
      buildReportPdf(args);
      return { save: saveSpy } as unknown as ReturnType<typeof actual.buildReportPdf>;
    },
  };
});
vi.mock("@/lib/export/printReport", async (orig) => {
  const actual = (await orig()) as typeof import("@/lib/export/printReport");
  return {
    ...actual,
    printReportHtml: (args: unknown) => {
      printReportHtml(args);
    },
  };
});

import {
  runReportPdf,
  runReportPrint,
  type ReportExportContext,
} from "@/lib/export/useReportExport";
import { EmptyExportError } from "@/lib/export";

type Row = {
  date: string;
  party: string;
  amount: number;
  deleted_at?: string | null;
  company_id?: string | null;
};

const columns = [
  { header: "Date", accessor: (r: Row) => r.date },
  { header: "Party", accessor: (r: Row) => r.party },
  { header: "Amount", align: "right" as const, accessor: (r: Row) => r.amount.toFixed(2) },
];

function ctx(
  rows: Row[],
  overrides: Partial<ReportExportContext<Row>> = {},
): ReportExportContext<Row> {
  return {
    company: { name: "ERPOVO Ltd", address: "Dhaka" },
    companyId: "c1",
    title: "Sales Report",
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { warehouse: "Main", search: "পণ্য" },
    columns,
    rows,
    totals: ["", "Total", "0.00"],
    signature: "Authorised Signatory",
    ...overrides,
  };
}

beforeEach(() => {
  buildReportPdf.mockReset();
  printReportHtml.mockReset();
  saveSpy.mockReset();
});

describe("runReportPdf", () => {
  it("scopes rows (deleted + foreign company stripped) and saves with typed filename", () => {
    const rows: Row[] = [
      { date: "2026-06-01", party: "Acme", amount: 1, company_id: "c1" },
      { date: "2026-06-02", party: "Foo", amount: 2, company_id: "c1", deleted_at: "2026-06-03" },
      { date: "2026-06-03", party: "Bar", amount: 3, company_id: "c2" },
    ];
    runReportPdf("sales-report", ctx(rows));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as {
      rows: Row[];
      title: string;
      filters: unknown;
    };
    expect(args.title).toBe("Sales Report");
    expect(args.rows.map((r) => r.party)).toEqual(["Acme"]);
    expect(saveSpy).toHaveBeenCalledWith("erpovo-sales-report-2026-06-01_2026-06-30.pdf");
  });

  it("throws EmptyExportError on empty scope (no PDF generated)", () => {
    expect(() => runReportPdf("sales-report", ctx([]))).toThrow(EmptyExportError);
    expect(buildReportPdf).not.toHaveBeenCalled();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("respects filenameSlug override", () => {
    const rows: Row[] = [{ date: "2026-06-01", party: "A", amount: 1, company_id: "c1" }];
    runReportPdf("sales-report", ctx(rows, { filenameSlug: "monthly-recap" }));
    expect(saveSpy).toHaveBeenCalledWith("erpovo-monthly-recap-2026-06-01_2026-06-30.pdf");
  });

  it("works with null company (fallback path)", () => {
    const rows: Row[] = [{ date: "2026-06-01", party: "A", amount: 1, company_id: "c1" }];
    runReportPdf("audit-history", ctx(rows, { company: null }));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as { company: unknown };
    expect(args.company).toBeNull();
  });

  it("survives Bangla text in title, filters and rows", () => {
    const rows: Row[] = [
      { date: "2026-06-01", party: "পণ্য বিক্রেতা", amount: 1, company_id: "c1" },
    ];
    runReportPdf("stock", ctx(rows, { title: "স্টক রিপোর্ট" }));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
  });
});

describe("runReportPrint", () => {
  it("scopes rows and calls printReportHtml", () => {
    const rows: Row[] = [
      { date: "2026-06-01", party: "Acme", amount: 1, company_id: "c1" },
      { date: "2026-06-02", party: "Bar", amount: 2, company_id: "c2" },
    ];
    runReportPrint(ctx(rows));
    expect(printReportHtml).toHaveBeenCalledTimes(1);
    const args = printReportHtml.mock.calls[0][0] as { rows: Row[] };
    expect(args.rows.map((r) => r.party)).toEqual(["Acme"]);
  });

  it("throws EmptyExportError on empty scope (no print window)", () => {
    expect(() => runReportPrint(ctx([]))).toThrow(EmptyExportError);
    expect(printReportHtml).not.toHaveBeenCalled();
  });
});
