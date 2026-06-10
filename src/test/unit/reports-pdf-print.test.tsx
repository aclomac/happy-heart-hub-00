import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the two builders so we can assert call args without touching jsPDF / window.
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
    printReportHtml: (args: unknown) => printReportHtml(args),
  };
});

import {
  runReportPdf,
  runReportPrint,
  type ReportExportContext,
} from "@/lib/export/useReportExport";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";
import { EmptyExportError } from "@/lib/export";

type SaleRow = {
  invoice_no: string;
  invoice_date: string;
  customer: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
  company_id?: string | null;
  deleted_at?: string | null;
};

const saleColumns: ReportColumn<SaleRow>[] = [
  { header: "Invoice", accessor: (r) => r.invoice_no },
  { header: "Date", accessor: (r) => fmtDate(r.invoice_date) },
  { header: "Customer", accessor: (r) => r.customer },
  { header: "Total", align: "right", accessor: (r) => fmtAmount(r.total) },
];

function salesCtx(rows: SaleRow[]): ReportExportContext<SaleRow> {
  return {
    company: { name: "ERPOVO Demo" },
    companyId: "c1",
    title: "Sales Report",
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { from: "2026-06-01", to: "2026-06-30" },
    columns: saleColumns,
    rows,
    signature: "Authorised Signatory",
  };
}

beforeEach(() => {
  buildReportPdf.mockReset();
  printReportHtml.mockReset();
  saveSpy.mockReset();
});

describe("Sales Report — useReportExport wiring", () => {
  const rows: SaleRow[] = [
    {
      invoice_no: "INV-1",
      invoice_date: "2026-06-05",
      customer: "Acme",
      total: 100,
      paid: 100,
      balance: 0,
      status: "paid",
      company_id: "c1",
    },
    {
      invoice_no: "INV-2",
      invoice_date: "2026-06-06",
      customer: "Beta",
      total: 50,
      paid: 0,
      balance: 50,
      status: "unpaid",
      company_id: "c1",
      deleted_at: "2026-06-07",
    },
    {
      invoice_no: "INV-3",
      invoice_date: "2026-06-07",
      customer: "Gamma",
      total: 25,
      paid: 25,
      balance: 0,
      status: "paid",
      company_id: "c2",
    },
  ];

  it("PDF uses filtered rows only and writes the sales-report filename", () => {
    runReportPdf("sales-report", salesCtx(rows));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as { rows: SaleRow[]; title: string };
    expect(args.title).toBe("Sales Report");
    expect(args.rows.map((r) => r.invoice_no)).toEqual(["INV-1"]);
    expect(saveSpy).toHaveBeenCalledWith("erpovo-sales-report-2026-06-01_2026-06-30.pdf");
  });

  it("Print uses filtered rows only", () => {
    runReportPrint(salesCtx(rows));
    expect(printReportHtml).toHaveBeenCalledTimes(1);
    const args = printReportHtml.mock.calls[0][0] as { rows: SaleRow[] };
    expect(args.rows.map((r) => r.invoice_no)).toEqual(["INV-1"]);
  });

  it("empty rows block PDF & Print with EmptyExportError", () => {
    expect(() => runReportPdf("sales-report", salesCtx([]))).toThrow(EmptyExportError);
    expect(() => runReportPrint(salesCtx([]))).toThrow(EmptyExportError);
    expect(buildReportPdf).not.toHaveBeenCalled();
    expect(printReportHtml).not.toHaveBeenCalled();
  });
});

describe("Purchase Report — useReportExport wiring", () => {
  type PurchRow = {
    bill_no: string;
    bill_date: string;
    supplier: string;
    total: number;
    company_id?: string | null;
    deleted_at?: string | null;
  };
  const rows: PurchRow[] = [
    { bill_no: "B1", bill_date: "2026-06-01", supplier: "Vendor A", total: 200, company_id: "c1" },
    {
      bill_no: "B2",
      bill_date: "2026-06-02",
      supplier: "Vendor B",
      total: 75,
      company_id: "c1",
      deleted_at: "2026-06-03",
    },
    { bill_no: "B3", bill_date: "2026-06-03", supplier: "Foreign", total: 5, company_id: "other" },
  ];

  it("strips deleted and foreign-company rows for PDF", () => {
    runReportPdf("purchase-report", {
      company: { name: null },
      companyId: "c1",
      title: "Purchase Report",
      period: { from: "2026-06-01", to: "2026-06-30" },
      filters: { from: "2026-06-01", to: "2026-06-30" },
      columns: [
        { header: "Bill", accessor: (r) => r.bill_no },
        { header: "Supplier", accessor: (r) => r.supplier },
        { header: "Total", align: "right", accessor: (r) => fmtAmount(r.total) },
      ],
      rows,
    });
    const args = buildReportPdf.mock.calls[0][0] as { rows: PurchRow[] };
    expect(args.rows.map((r) => r.bill_no)).toEqual(["B1"]);
    expect(saveSpy).toHaveBeenCalledWith("erpovo-purchase-report-2026-06-01_2026-06-30.pdf");
  });

  it("strips deleted and foreign-company rows for Print", () => {
    runReportPrint({
      company: { name: null },
      companyId: "c1",
      title: "Purchase Report",
      period: { from: "2026-06-01", to: "2026-06-30" },
      columns: [{ header: "Bill", accessor: (r) => r.bill_no }],
      rows,
    });
    const args = printReportHtml.mock.calls[0][0] as { rows: PurchRow[] };
    expect(args.rows.map((r) => r.bill_no)).toEqual(["B1"]);
  });
});

describe("Expense Report — useReportExport wiring", () => {
  type ExpRow = {
    expense_date: string;
    category: string;
    vendor: string;
    amount: number;
    company_id?: string | null;
    deleted_at?: string | null;
  };
  const rows: ExpRow[] = [
    {
      expense_date: "2026-06-01",
      category: "rent",
      vendor: "Landlord",
      amount: 1000,
      company_id: "c1",
    },
    {
      expense_date: "2026-06-02",
      category: "fuel",
      vendor: "পেট্রোল পাম্প",
      amount: 50,
      company_id: "c1",
    },
    {
      expense_date: "2026-06-03",
      category: "rent",
      vendor: "Other Co",
      amount: 999,
      company_id: "other",
    },
  ];

  it("scopes by company and supports Bangla", () => {
    runReportPdf("expense-report", {
      company: { name: null },
      companyId: "c1",
      title: "Expense Report",
      period: { from: "2026-06-01", to: "2026-06-30" },
      filters: { from: "2026-06-01", to: "2026-06-30" },
      columns: [
        { header: "Date", accessor: (r) => fmtDate(r.expense_date) },
        { header: "Vendor", accessor: (r) => r.vendor },
        { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
      ],
      rows,
    });
    const args = buildReportPdf.mock.calls[0][0] as { rows: ExpRow[] };
    expect(args.rows.map((r) => r.vendor)).toEqual(["Landlord", "পেট্রোল পাম্প"]);
    expect(saveSpy).toHaveBeenCalledWith("erpovo-expense-report-2026-06-01_2026-06-30.pdf");
  });
});
