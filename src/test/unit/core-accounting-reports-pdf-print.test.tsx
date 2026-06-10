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

const ACCT_SLUGS = [
  "day-book",
  "profit-loss",
  "balance-sheet",
  "trial-balance",
  "party-statement",
  "tax-report",
  "receivables-report",
  "payables-report",
];

type Row = Record<string, unknown> & {
  company_id?: string | null;
  deleted_at?: string | null;
};

const CO = "company-a";
const FOREIGN = "company-b";

function ctx<R extends Row>(
  rows: R[],
  columns: ReportColumn<R>[],
  totals?: (string | number | null | undefined)[],
): ReportExportContext<R> {
  return {
    company: { name: "ERPOVO" },
    companyId: CO,
    title: "Test Report",
    period: { from: "2026-01-01", to: "2026-01-31" },
    filters: { from: "2026-01-01", to: "2026-01-31" },
    columns,
    rows,
    totals,
    signature: "Authorised Signatory",
  };
}

describe("Core Accounting export migration", () => {
  it.each(ACCT_SLUGS)("uses shared pipeline for slug %s", (slug) => {
    const rows = [{ a: 1, company_id: CO }];
    runReportPdf(slug, ctx(rows, [{ header: "A", accessor: (r) => String(r.a) }]));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("strips deleted and foreign-company rows", () => {
    const rows: Row[] = [
      { id: 1, company_id: CO },
      { id: 2, company_id: CO, deleted_at: "2026-01-15" },
      { id: 3, company_id: FOREIGN },
    ];
    runReportPdf("day-book", ctx(rows, [{ header: "ID", accessor: (r) => String(r.id) }]));
    const call = buildReportPdf.mock.calls[0][0] as { rows: Row[] };
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0].id).toBe(1);
  });

  it("blocks empty exports with EmptyExportError", () => {
    expect(() =>
      runReportPdf("profit-loss", ctx([], [{ header: "X", accessor: () => "" }])),
    ).toThrow(EmptyExportError);
    expect(() => runReportPrint(ctx([], [{ header: "X", accessor: () => "" }]))).toThrow(
      EmptyExportError,
    );
    expect(buildReportPdf).not.toHaveBeenCalled();
    expect(printReportHtml).not.toHaveBeenCalled();
  });

  it("Profit & Loss totals carry through", () => {
    const rows = [
      { section: "Revenue", line: "Sales", amount: 1000, company_id: CO },
      { section: "Net Profit", line: "Net Profit", amount: 250, company_id: CO },
    ];
    runReportPdf(
      "profit-loss",
      ctx(
        rows,
        [
          { header: "Section", accessor: (r) => String(r.section) },
          { header: "Line", accessor: (r) => String(r.line) },
          { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount as number) },
        ],
        ["", "Net Profit", fmtAmount(250)],
      ),
    );
    const call = buildReportPdf.mock.calls[0][0] as { totals: string[] };
    expect(call.totals).toContain("Net Profit");
    expect(call.totals[2]).toBe(fmtAmount(250));
  });

  it("Balance Sheet totals carry through", () => {
    const rows = [
      { section: "Assets", line: "Cash", amount: 500, company_id: CO },
      { section: "Equity", line: "Net Worth", amount: 500, company_id: CO },
    ];
    runReportPdf(
      "balance-sheet",
      ctx(
        rows,
        [
          { header: "Section", accessor: (r) => String(r.section) },
          { header: "Line", accessor: (r) => String(r.line) },
          { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount as number) },
        ],
        ["", "Net Worth", fmtAmount(500)],
      ),
    );
    const call = buildReportPdf.mock.calls[0][0] as { totals: string[] };
    expect(call.totals[1]).toBe("Net Worth");
    expect(call.totals[2]).toBe(fmtAmount(500));
  });

  it("Trial Balance debit equals credit", () => {
    const rows = [
      { account: "Cash", debit: 1000, credit: 0, company_id: CO },
      { account: "Equity", debit: 0, credit: 1000, company_id: CO },
    ];
    const debit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
    const credit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
    expect(debit).toBe(credit);
    runReportPdf(
      "trial-balance",
      ctx(
        rows,
        [
          { header: "Account", accessor: (r) => String(r.account) },
          {
            header: "Debit",
            align: "right",
            accessor: (r) => (r.debit ? fmtAmount(r.debit as number) : ""),
          },
          {
            header: "Credit",
            align: "right",
            accessor: (r) => (r.credit ? fmtAmount(r.credit as number) : ""),
          },
        ],
        ["Totals:", fmtAmount(debit), fmtAmount(credit)],
      ),
    );
    const call = buildReportPdf.mock.calls[0][0] as { totals: string[] };
    expect(call.totals[1]).toBe(call.totals[2]);
  });

  it("Day Book filtered rows only (caller-side filter is honored)", () => {
    const all = [
      { date: "2026-01-15", type: "Sale", in: 100, out: 0, company_id: CO },
      { date: "2026-02-20", type: "Sale", in: 200, out: 0, company_id: CO },
    ];
    const filtered = all.filter((r) => r.date >= "2026-01-01" && r.date <= "2026-01-31");
    runReportPdf(
      "day-book",
      ctx(filtered, [
        { header: "Date", accessor: (r) => fmtDate(r.date) },
        { header: "Type", accessor: (r) => String(r.type) },
      ]),
    );
    const call = buildReportPdf.mock.calls[0][0] as { rows: Row[] };
    expect(call.rows).toHaveLength(1);
  });

  it("Bangla party/account names survive the pipeline", () => {
    const rows = [{ party: "গ্রাহক ১", account: "নগদ", amount: 1234, company_id: CO }];
    runReportPdf(
      "party-statement",
      ctx(rows, [
        { header: "Party", accessor: (r) => String(r.party) },
        { header: "Account", accessor: (r) => String(r.account) },
        { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount as number) },
      ]),
    );
    const call = buildReportPdf.mock.calls[0][0] as {
      columns: ReportColumn<Row>[];
      rows: Row[];
    };
    expect(call.columns[0].accessor(call.rows[0])).toBe("গ্রাহক ১");
    expect(call.columns[1].accessor(call.rows[0])).toBe("নগদ");
  });

  it("Tax Report respects period filter context", () => {
    const rows = [{ label: "Net Tax Payable", amount: 500, company_id: CO }];
    runReportPdf(
      "tax-report",
      ctx(rows, [
        { header: "Line", accessor: (r) => String(r.label) },
        { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount as number) },
      ]),
    );
    const call = buildReportPdf.mock.calls[0][0] as {
      period: { from: string; to: string };
      filters: { from: string; to: string };
    };
    expect(call.period.from).toBe("2026-01-01");
    expect(call.period.to).toBe("2026-01-31");
    expect(call.filters.from).toBe("2026-01-01");
  });

  it("Receivables/Payables include party name and total", () => {
    const rows = [
      { name: "Acme", phone: "555", balance: 1000, company_id: CO },
      { name: "Beta", phone: "777", balance: 500, company_id: CO },
    ];
    runReportPdf(
      "receivables-report",
      ctx(
        rows,
        [
          { header: "Party", accessor: (r) => String(r.name) },
          { header: "Phone", accessor: (r) => String(r.phone) },
          { header: "Amount Due", align: "right", accessor: (r) => fmtAmount(r.balance as number) },
        ],
        ["Total Receivables", "", fmtAmount(1500)],
      ),
    );
    const call = buildReportPdf.mock.calls[0][0] as { rows: Row[]; totals: string[] };
    expect(call.rows).toHaveLength(2);
    expect(call.totals[0]).toBe("Total Receivables");
    expect(call.totals[2]).toBe(fmtAmount(1500));
  });

  it("Print pipeline also strips foreign rows and asserts non-empty", () => {
    runReportPrint(
      ctx<Row>(
        [
          { id: 1, company_id: CO },
          { id: 2, company_id: FOREIGN },
        ],
        [{ header: "ID", accessor: (r) => String(r.id) }],
      ),
    );
    expect(printReportHtml).toHaveBeenCalledTimes(1);
    const call = printReportHtml.mock.calls[0][0] as { rows: Row[] };
    expect(call.rows).toHaveLength(1);
    expect(call.rows[0].id).toBe(1);
  });
});
