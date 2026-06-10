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

const PAYROLL_SLUGS = [
  "monthly-salary-report",
  "employee-wise-salary-report",
  "attendance-report",
  "advance-salary-report",
  "bonus-deduction-report",
  "salary-payments-report",
  "employees-report",
  "payroll-reports",
];

type Slip = {
  employee: string;
  amount: number;
  status?: string;
  company_id?: string | null;
  deleted_at?: string | null;
};

const cols: ReportColumn<Slip>[] = [
  { header: "Employee", accessor: (r) => r.employee },
  { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.amount) },
];

function ctx(rows: Slip[], slug: string): ReportExportContext<Slip> {
  return {
    company: { name: "ERPOVO Demo" },
    companyId: "c1",
    title: slug,
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { from: "2026-06-01", to: "2026-06-30" },
    columns: cols,
    rows,
    signature: "Authorised Signatory",
  };
}

describe("Payroll reports — useReportExport wiring", () => {
  const rows: Slip[] = [
    { employee: "Rahim", amount: 12000, company_id: "c1" },
    { employee: "Ghost", amount: 9000, company_id: "c1", deleted_at: "2026-06-04" },
    { employee: "Other", amount: 500, company_id: "other" },
    { employee: "কর্মচারী ১", amount: 7000, company_id: "c1" },
    { employee: "রহিম", amount: 8000, company_id: "c1" },
  ];

  it.each(PAYROLL_SLUGS)("[%s] writes a typed PDF filename and scopes rows", (slug) => {
    runReportPdf(slug, ctx(rows, slug));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as { rows: Slip[] };
    expect(args.rows.map((r) => r.employee)).toEqual(["Rahim", "কর্মচারী ১", "রহিম"]);
    expect(saveSpy).toHaveBeenCalledWith(`erpovo-${slug}-2026-06-01_2026-06-30.pdf`);
  });

  it("Print is blocked when no rows pass filters", () => {
    expect(() => runReportPrint(ctx([], "monthly-salary-report"))).toThrow(EmptyExportError);
    expect(printReportHtml).not.toHaveBeenCalled();
  });

  it("PDF is blocked when only foreign-company / deleted rows remain", () => {
    expect(() =>
      runReportPdf(
        "salary-payments-report",
        ctx(
          [
            { employee: "X", amount: 1, company_id: "other" },
            { employee: "Y", amount: 1, company_id: "c1", deleted_at: "z" },
          ],
          "salary-payments-report",
        ),
      ),
    ).toThrow(EmptyExportError);
    expect(buildReportPdf).not.toHaveBeenCalled();
  });

  it("Salary payment status filter is respected — only filtered rows reach the PDF", () => {
    const payments: Slip[] = [
      { employee: "A", amount: 1000, status: "paid", company_id: "c1" },
      { employee: "B", amount: 2000, status: "pending", company_id: "c1" },
    ];
    const paid = payments.filter((p) => p.status === "paid");
    runReportPdf("salary-payments-report", ctx(paid, "salary-payments-report"));
    const args = buildReportPdf.mock.calls[0][0] as { rows: Slip[] };
    expect(args.rows.every((r) => r.status === "paid")).toBe(true);
  });

  it("Attendance month filter is respected — caller passes already-filtered rows", () => {
    type Att = Slip & { month: string };
    const all: Att[] = [
      { employee: "A", amount: 0, month: "2026-05", company_id: "c1" },
      { employee: "B", amount: 0, month: "2026-06", company_id: "c1" },
      { employee: "C", amount: 0, month: "2026-06", company_id: "c1" },
    ];
    const june = all.filter((a) => a.month === "2026-06");
    runReportPdf("attendance-report", {
      ...ctx(june, "attendance-report"),
      rows: june,
    });
    const args = buildReportPdf.mock.calls[0][0] as { rows: Att[] };
    expect(args.rows.map((r) => r.employee)).toEqual(["B", "C"]);
  });

  it("Employees report uses already-filtered active list", () => {
    type Emp = Slip & { is_active: boolean };
    const all: Emp[] = [
      { employee: "Active1", amount: 0, is_active: true, company_id: "c1" },
      { employee: "Inactive1", amount: 0, is_active: false, company_id: "c1" },
      { employee: "Active2", amount: 0, is_active: true, company_id: "c1" },
    ];
    const active = all.filter((e) => e.is_active);
    runReportPdf("employees-report", { ...ctx(active, "employees-report"), rows: active });
    const args = buildReportPdf.mock.calls[0][0] as { rows: Emp[] };
    expect(args.rows.every((r) => r.is_active)).toBe(true);
    expect(args.rows.length).toBe(2);
  });
});

describe("Monthly salary totals — exported totals row populated", () => {
  type SalaryRow = {
    employee: string;
    gross: number;
    net: number;
    company_id?: string | null;
    deleted_at?: string | null;
  };
  const colsTot: ReportColumn<SalaryRow>[] = [
    { header: "Employee", accessor: (r) => r.employee },
    { header: "Gross", align: "right", accessor: (r) => fmtAmount(r.gross) },
    { header: "Net", align: "right", accessor: (r) => fmtAmount(r.net) },
  ];

  it("monthly-salary-report PDF carries a Totals row with summed amounts", () => {
    const slips: SalaryRow[] = [
      { employee: "A", gross: 10000, net: 9000, company_id: "c1" },
      { employee: "B", gross: 20000, net: 18000, company_id: "c1" },
    ];
    const totalGross = slips.reduce((s, r) => s + r.gross, 0);
    const totalNet = slips.reduce((s, r) => s + r.net, 0);
    runReportPdf("monthly-salary-report", {
      company: { name: null },
      companyId: "c1",
      title: "Monthly Salary",
      period: { from: "2026-06-01", to: "2026-06-30" },
      filters: { from: "2026-06-01", to: "2026-06-30" },
      columns: colsTot,
      rows: slips,
      totals: ["Totals", fmtAmount(totalGross), fmtAmount(totalNet)],
      signature: "Authorised Signatory",
    });
    const args = buildReportPdf.mock.calls[0][0] as { totals: (string | number)[] };
    expect(args.totals).toEqual(["Totals", "30,000.00", "27,000.00"]);
  });
});

describe("Bangla employee names survive the export pipeline", () => {
  it("PDF rows keep Bangla characters intact through scoping", () => {
    const rows: Slip[] = [
      { employee: "কর্মচারী রহিম", amount: 5000, company_id: "c1" },
      { employee: "মোঃ করিম", amount: 6000, company_id: "c1" },
    ];
    runReportPdf("employees-report", ctx(rows, "employees-report"));
    const args = buildReportPdf.mock.calls[0][0] as { rows: Slip[] };
    expect(args.rows.map((r) => r.employee)).toEqual(["কর্মচারী রহিম", "মোঃ করিম"]);
  });

  it("fmtDate handles ISO date strings used by salary slips", () => {
    expect(fmtDate("2026-06-15")).toBeTruthy();
  });
});
