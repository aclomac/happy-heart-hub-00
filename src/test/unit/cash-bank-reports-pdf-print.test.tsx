import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { fmtAmount, fmtDate, EmptyExportError, type ReportColumn } from "@/lib/export";

beforeEach(() => {
  buildReportPdf.mockReset();
  printReportHtml.mockReset();
  saveSpy.mockReset();
});

const CASH_SLUGS = [
  "cash-bank-statement",
  "bank-statement",
  "cash-in-hand",
  "cash-reconciliation",
  "cheques",
  "loan-accounts",
  "loan-payments",
  "mobile-banking-statement",
];

type StmtRow = {
  date: string;
  account: string;
  amount: number;
  status?: string;
  balance?: number;
  company_id?: string | null;
  deleted_at?: string | null;
};

const stmtColumns: ReportColumn<StmtRow>[] = [
  { header: "Date", accessor: (r) => fmtDate(r.date) },
  { header: "Account", accessor: (r) => r.account },
  { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
];

function ctx(rows: StmtRow[], slug: string): ReportExportContext<StmtRow> {
  return {
    company: { name: "ERPOVO Demo" },
    companyId: "c1",
    title: slug,
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { from: "2026-06-01", to: "2026-06-30" },
    columns: stmtColumns,
    rows,
    signature: "Authorised Signatory",
  };
}

describe("Cash & Bank reports — useReportExport wiring", () => {
  const rows: StmtRow[] = [
    { date: "2026-06-02", account: "BRAC Bank", amount: 1000, company_id: "c1" },
    {
      date: "2026-06-03",
      account: "Cash",
      amount: 200,
      company_id: "c1",
      deleted_at: "2026-06-04",
    },
    { date: "2026-06-05", account: "Other Co", amount: 50, company_id: "other" },
    { date: "2026-06-06", account: "নগদ", amount: 300, company_id: "c1" },
  ];

  it.each(CASH_SLUGS)("[%s] writes a typed PDF filename and scopes rows", (slug) => {
    runReportPdf(slug, ctx(rows, slug));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as { rows: StmtRow[] };
    expect(args.rows.map((r) => r.account)).toEqual(["BRAC Bank", "নগদ"]);
    expect(saveSpy).toHaveBeenCalledWith(`erpovo-${slug}-2026-06-01_2026-06-30.pdf`);
  });

  it("Print is blocked when no rows pass filters", () => {
    expect(() => runReportPrint(ctx([], "cash-in-hand"))).toThrow(EmptyExportError);
    expect(printReportHtml).not.toHaveBeenCalled();
  });

  it("PDF is blocked when only foreign-company / deleted rows remain", () => {
    expect(() =>
      runReportPdf(
        "cheques",
        ctx(
          [
            { date: "2026-06-09", account: "X", amount: 1, company_id: "other" },
            { date: "2026-06-10", account: "Y", amount: 1, company_id: "c1", deleted_at: "z" },
          ],
          "cheques",
        ),
      ),
    ).toThrow(EmptyExportError);
    expect(buildReportPdf).not.toHaveBeenCalled();
  });

  it("Cheque status filter is respected — only filtered rows reach the PDF", () => {
    type Cheque = StmtRow & { status: string };
    const cheques: Cheque[] = [
      { date: "2026-06-02", account: "BRAC", amount: 500, status: "pending", company_id: "c1" },
      { date: "2026-06-03", account: "EBL", amount: 700, status: "cleared", company_id: "c1" },
    ];
    const cleared = cheques.filter((c) => c.status === "cleared");
    runReportPdf("cheques", ctx(cleared, "cheques"));
    const args = buildReportPdf.mock.calls[0][0] as { rows: Cheque[] };
    expect(args.rows.every((r) => r.status === "cleared")).toBe(true);
  });
});

describe("Cash & Bank statement — running balance preserved", () => {
  type StatementRow = StmtRow & { balance: number };
  const cols: ReportColumn<StatementRow>[] = [
    { header: "Date", accessor: (r) => fmtDate(r.date) },
    { header: "Account", accessor: (r) => r.account },
    { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
    { header: "Balance", align: "right", accessor: (r) => fmtAmount(r.balance) },
  ];

  it("statement PDF includes a running balance column populated from the row", () => {
    const stmt: StatementRow[] = [
      { date: "2026-06-01", account: "BRAC", amount: 1000, balance: 1000, company_id: "c1" },
      { date: "2026-06-02", account: "BRAC", amount: -200, balance: 800, company_id: "c1" },
    ];
    runReportPdf("cash-bank-statement", {
      company: { name: null },
      companyId: "c1",
      title: "Cash & Bank Statement",
      period: { from: "2026-06-01", to: "2026-06-30" },
      filters: { from: "2026-06-01", to: "2026-06-30" },
      columns: cols,
      rows: stmt,
    });
    const args = buildReportPdf.mock.calls[0][0] as {
      columns: ReportColumn<StatementRow>[];
      rows: StatementRow[];
    };
    const balanceCol = args.columns.find((c) => c.header === "Balance")!;
    expect(args.rows.map((r) => balanceCol.accessor(r))).toEqual(["1,000.00", "800.00"]);
  });
});

describe("Loan payments — outstanding balance carried into export", () => {
  type Payment = {
    date: string;
    counterparty: string;
    amount: number;
    outstanding: number;
    company_id?: string | null;
    deleted_at?: string | null;
  };
  const cols: ReportColumn<Payment>[] = [
    { header: "Date", accessor: (r) => fmtDate(r.date) },
    { header: "Counterparty", accessor: (r) => r.counterparty },
    { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
    { header: "Outstanding", align: "right", accessor: (r) => fmtAmount(r.outstanding) },
  ];

  it("loan-payments PDF retains the outstanding column for each payment", () => {
    const pays: Payment[] = [
      {
        date: "2026-06-01",
        counterparty: "BRAC EMI",
        amount: 5000,
        outstanding: 45000,
        company_id: "c1",
      },
      {
        date: "2026-06-15",
        counterparty: "BRAC EMI",
        amount: 5000,
        outstanding: 40000,
        company_id: "c1",
      },
    ];
    runReportPdf("loan-payments", {
      company: { name: null },
      companyId: "c1",
      title: "Loan Payments",
      period: { from: null, to: null },
      filters: {},
      columns: cols,
      rows: pays,
    });
    const args = buildReportPdf.mock.calls[0][0] as {
      columns: ReportColumn<Payment>[];
      rows: Payment[];
    };
    const col = args.columns.find((c) => c.header === "Outstanding")!;
    expect(args.rows.map((r) => col.accessor(r))).toEqual(["45,000.00", "40,000.00"]);
  });
});
