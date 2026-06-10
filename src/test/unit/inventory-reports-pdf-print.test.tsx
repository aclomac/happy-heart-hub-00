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
import { fmtAmount, fmtQty, EmptyExportError, type ReportColumn } from "@/lib/export";

type StockRow = {
  item: string;
  warehouse_id: string;
  qty: number;
  value: number;
  company_id?: string | null;
  deleted_at?: string | null;
};

const stockColumns: ReportColumn<StockRow>[] = [
  { header: "Item", accessor: (r) => r.item },
  { header: "Qty", align: "right", accessor: (r) => fmtQty(r.qty) },
  { header: "Value", align: "right", accessor: (r) => fmtAmount(r.value) },
];

function stockCtx(rows: StockRow[], slug: string): ReportExportContext<StockRow> {
  return {
    company: { name: "ERPOVO Demo" },
    companyId: "c1",
    title: slug,
    period: { from: "2026-06-01", to: "2026-06-30" },
    filters: { from: "2026-06-01", to: "2026-06-30" },
    columns: stockColumns,
    rows,
    signature: "Authorised Signatory",
  };
}

beforeEach(() => {
  buildReportPdf.mockReset();
  printReportHtml.mockReset();
  saveSpy.mockReset();
});

const INV_SLUGS = [
  "stock-summary",
  "stock-detail",
  "low-stock-summary",
  "stock-movement-report",
  "stock-transfer-report",
  "warehouse-wise-stock",
  "stock-summary-by-category",
  "item-wise-profit-loss",
  "item-report-by-party",
  "item-wise-discount",
  "stock-movement-ledger",
  "stock-transfer-list",
];

describe("Inventory reports — useReportExport wiring", () => {
  const rows: StockRow[] = [
    { item: "Rice", warehouse_id: "w1", qty: 10, value: 1000, company_id: "c1" },
    {
      item: "Sugar",
      warehouse_id: "w1",
      qty: 5,
      value: 500,
      company_id: "c1",
      deleted_at: "2026-06-05",
    },
    { item: "Foreign", warehouse_id: "w2", qty: 3, value: 30, company_id: "other" },
    { item: "ডাল", warehouse_id: "w1", qty: 2, value: 200, company_id: "c1" },
  ];

  it.each(INV_SLUGS)("[%s] writes a typed PDF filename and scopes rows", (slug) => {
    runReportPdf(slug, stockCtx(rows, slug));
    expect(buildReportPdf).toHaveBeenCalledTimes(1);
    const args = buildReportPdf.mock.calls[0][0] as { rows: StockRow[] };
    expect(args.rows.map((r) => r.item)).toEqual(["Rice", "ডাল"]);
    expect(saveSpy).toHaveBeenCalledWith(`erpovo-${slug}-2026-06-01_2026-06-30.pdf`);
  });

  it("Print is blocked when no rows pass filters", () => {
    expect(() => runReportPrint(stockCtx([], "stock-summary"))).toThrow(EmptyExportError);
    expect(printReportHtml).not.toHaveBeenCalled();
  });

  it("PDF is blocked when only foreign-company / deleted rows remain", () => {
    expect(() =>
      runReportPdf(
        "stock-summary",
        stockCtx(
          [
            { item: "X", warehouse_id: "w1", qty: 1, value: 1, company_id: "other" },
            {
              item: "Y",
              warehouse_id: "w1",
              qty: 1,
              value: 1,
              company_id: "c1",
              deleted_at: "2026-06-09",
            },
          ],
          "stock-summary",
        ),
      ),
    ).toThrow(EmptyExportError);
    expect(buildReportPdf).not.toHaveBeenCalled();
  });

  it("respects warehouse filter — only matching warehouse rows reach the PDF", () => {
    const filtered = rows.filter((r) => r.warehouse_id === "w1");
    runReportPdf("warehouse-wise-stock", stockCtx(filtered, "warehouse-wise-stock"));
    const args = buildReportPdf.mock.calls[0][0] as { rows: StockRow[] };
    expect(args.rows.every((r) => r.warehouse_id === "w1")).toBe(true);
    expect(args.rows.map((r) => r.item)).toEqual(["Rice", "ডাল"]);
  });
});

describe("Stock Movement Ledger — running balance preserved", () => {
  type MoveRow = {
    movement_date: string;
    item: string;
    direction: "in" | "out";
    qty: number;
    balance: number;
    company_id?: string | null;
    deleted_at?: string | null;
  };
  const moveColumns: ReportColumn<MoveRow>[] = [
    { header: "Date", accessor: (r) => r.movement_date },
    { header: "Item", accessor: (r) => r.item },
    {
      header: "Qty In",
      align: "right",
      accessor: (r) => (r.direction === "in" ? fmtQty(r.qty) : ""),
    },
    {
      header: "Qty Out",
      align: "right",
      accessor: (r) => (r.direction === "out" ? fmtQty(r.qty) : ""),
    },
    { header: "Balance", align: "right", accessor: (r) => fmtQty(r.balance) },
  ];

  it("ledger PDF includes a running balance column populated from the row", () => {
    const ledger: MoveRow[] = [
      {
        movement_date: "2026-06-01",
        item: "Rice",
        direction: "in",
        qty: 10,
        balance: 10,
        company_id: "c1",
      },
      {
        movement_date: "2026-06-02",
        item: "Rice",
        direction: "out",
        qty: 4,
        balance: 6,
        company_id: "c1",
      },
    ];
    runReportPdf("stock-movement-ledger", {
      company: { name: null },
      companyId: "c1",
      title: "Stock Movement Ledger",
      period: { from: "2026-06-01", to: "2026-06-30" },
      filters: { from: "2026-06-01", to: "2026-06-30" },
      columns: moveColumns,
      rows: ledger,
    });
    const args = buildReportPdf.mock.calls[0][0] as {
      columns: ReportColumn<MoveRow>[];
      rows: MoveRow[];
    };
    expect(args.columns.map((c) => c.header)).toContain("Balance");
    const balanceCol = args.columns.find((c) => c.header === "Balance")!;
    expect(args.rows.map((r) => balanceCol.accessor(r))).toEqual(["10", "6"]);
  });
});
