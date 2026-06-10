import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the audit writer + builders BEFORE importing the export hook so its
// internal imports see the mocked exports.
const auditSpy = vi.fn<(input: unknown) => Promise<void>>().mockResolvedValue();
vi.mock("@/lib/export/exportAudit", async (orig) => {
  const actual = (await orig()) as typeof import("@/lib/export/exportAudit");
  return {
    ...actual,
    logExportAudit: (i: unknown) => auditSpy(i),
  };
});

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
import { moduleFromSlug } from "@/lib/export/exportAudit";
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
  auditSpy.mockClear();
  buildReportPdf.mockReset();
  printReportHtml.mockReset();
  saveSpy.mockReset();
});

describe("export audit — runReportPdf", () => {
  it("writes a success audit row with rowCount, fileName, filters, slug", () => {
    const rows: Row[] = [
      { date: "2026-06-01", party: "Acme", amount: 1, company_id: "c1" },
      { date: "2026-06-02", party: "Beta", amount: 2, company_id: "c1" },
    ];
    runReportPdf("sales-report", ctx(rows));
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const arg = auditSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      companyId: "c1",
      reportSlug: "sales-report",
      action: "export_pdf",
      status: "success",
      rowCount: 2,
      fileName: "erpovo-sales-report-2026-06-01_2026-06-30.pdf",
    });
    expect(arg.filters).toMatchObject({ warehouse: "Main" });
  });

  it("writes a blocked_empty audit row and still throws", () => {
    expect(() => runReportPdf("sales-report", ctx([]))).toThrow(EmptyExportError);
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const arg = auditSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      action: "export_pdf",
      status: "blocked_empty",
      rowCount: 0,
      reportSlug: "sales-report",
    });
  });

  it("writes a failed audit row with the error message when the builder throws", () => {
    buildReportPdf.mockImplementationOnce(() => {
      throw new Error("font load failed");
    });
    const rows: Row[] = [{ date: "2026-06-01", party: "A", amount: 1, company_id: "c1" }];
    expect(() => runReportPdf("sales-report", ctx(rows))).toThrow("font load failed");
    expect(auditSpy).toHaveBeenCalledTimes(1);
    const arg = auditSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      action: "export_pdf",
      status: "failed",
      error: "font load failed",
      rowCount: 1,
    });
  });
});

describe("export audit — runReportPrint", () => {
  it("writes a success print audit row", () => {
    const rows: Row[] = [{ date: "2026-06-01", party: "Acme", amount: 1, company_id: "c1" }];
    runReportPrint(ctx(rows), "sales-report");
    expect(auditSpy).toHaveBeenCalledTimes(1);
    expect(auditSpy.mock.calls[0][0]).toMatchObject({
      action: "print",
      status: "success",
      rowCount: 1,
      reportSlug: "sales-report",
    });
  });

  it("writes blocked_empty when nothing to print", () => {
    expect(() => runReportPrint(ctx([]), "sales-report")).toThrow(EmptyExportError);
    expect(auditSpy.mock.calls[0][0]).toMatchObject({
      action: "print",
      status: "blocked_empty",
    });
  });
});

describe("moduleFromSlug", () => {
  it("maps known slugs to their modules", () => {
    expect(moduleFromSlug("salary-payments-report")).toBe("Salary");
    expect(moduleFromSlug("day-book")).toBe("Accounting");
    expect(moduleFromSlug("stock-summary")).toBe("Inventory");
    expect(moduleFromSlug("cheques")).toBe("Cash");
    expect(moduleFromSlug("sales-report")).toBe("Sales");
    expect(moduleFromSlug("audit-history")).toBe("Audit");
    expect(moduleFromSlug("recycle-bin")).toBe("RecycleBin");
  });
  it("falls back to Other for unknown slugs", () => {
    expect(moduleFromSlug("totally-unknown")).toBe("Other");
    expect(moduleFromSlug(null)).toBe("Other");
    expect(moduleFromSlug(undefined)).toBe("Other");
  });
});
