import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { resolveReportDrilldown, type DrilldownKind } from "@/lib/reports/drilldown";
import { OtherIncomeReport } from "@/components/erp/reports/OtherIncomeReport";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportCSV } from "@/lib/export-csv";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";
import { Download, FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { summarizePnl, stockValueOf, buildDayBook } from "@/lib/reports/calc";

export const Route = createFileRoute("/app/reports")({ component: ReportsShell });

function ReportsShell() {
  const { pathname } = useLocation();
  return pathname === "/app/reports" ? <Reports /> : <Outlet />;
}

type Period = "today" | "7d" | "30d" | "month" | "year" | "custom";

function periodRange(p: Period, fromStr: string, toStr: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(today);
  if (p === "today") return { from: iso(today), to: iso(today) };
  if (p === "7d") {
    start.setDate(today.getDate() - 6);
    return { from: iso(start), to: iso(today) };
  }
  if (p === "30d") {
    start.setDate(today.getDate() - 29);
    return { from: iso(start), to: iso(today) };
  }
  if (p === "month") {
    start.setDate(1);
    return { from: iso(start), to: iso(today) };
  }
  if (p === "year") {
    return { from: `${today.getFullYear()}-01-01`, to: iso(today) };
  }
  return { from: fromStr || iso(today), to: toStr || iso(today) };
}

function PeriodPicker({
  period,
  setPeriod,
  from,
  setFrom,
  to,
  setTo,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
}) {
  return (
    <div className="bg-card border rounded-md p-3 mb-3 flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs">Period</Label>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {period === "custom" && (
        <>
          <div>
            <Label className="text-xs">From</Label>
            <Input
              className="h-9"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input className="h-9" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}

function fmt(n: number) {
  return `৳ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SaleReport({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-sales", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,invoice_date,total,paid,balance,status,parties(name)")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const total = data.reduce((s, r) => s + Number(r.total || 0), 0);
  const paid = data.reduce((s, r) => s + Number(r.paid || 0), 0);
  const bal = data.reduce((s, r) => s + Number(r.balance || 0), 0);
  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">Sale Report · {data.length} invoices</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCSV(
              "sale-report",
              data.map((r) => ({
                Invoice: r.invoice_no,
                Date: r.invoice_date,
                Customer: r.parties?.name,
                Total: r.total,
                Paid: r.paid,
                Balance: r.balance,
                Status: r.status,
              })),
              { title: "Sale Report", slug: "sale-report", from, to, filters: { from, to } },
            )
          }
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.invoice_no}</td>
                <td>{r.invoice_date}</td>
                <td className="font-medium">{r.parties?.name || "—"}</td>
                <td className="text-right">{fmt(r.total)}</td>
                <td className="text-right num-pos">{fmt(r.paid)}</td>
                <td className="text-right num-neg">{fmt(r.balance)}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-6">
                  No sales in this period
                </td>
              </tr>
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={3} className="text-right">
                  Totals:
                </td>
                <td className="text-right">{fmt(total)}</td>
                <td className="text-right num-pos">{fmt(paid)}</td>
                <td className="text-right num-neg">{fmt(bal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function PurchaseReport({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-purchases", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,total,paid,balance,status,doc_type,parties(name)")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .in("doc_type", ["bill", "debit_note"])
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const bills = data.filter((r) => r.doc_type !== "debit_note");
  const returns = data.filter((r) => r.doc_type === "debit_note");
  const totalBills = bills.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalReturns = returns.reduce((s, r) => s + Number(r.total || 0), 0);
  const netPurchase = totalBills - totalReturns;
  const paid = bills.reduce((s, r) => s + Number(r.paid || 0), 0);
  const bal = bills.reduce((s, r) => s + Number(r.balance || 0), 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Purchase Bills</div>
          <div className="text-lg font-bold">{fmt(totalBills)}</div>
          <div className="text-xs text-muted-foreground">{bills.length} bills</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Purchase Returns</div>
          <div className="text-lg font-bold num-neg">- {fmt(totalReturns)}</div>
          <div className="text-xs text-muted-foreground">{returns.length} notes</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Net Purchase</div>
          <div className="text-lg font-bold num-pos">{fmt(netPurchase)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="text-lg font-bold num-neg">{fmt(bal)}</div>
          <div className="text-xs text-muted-foreground">Paid {fmt(paid)}</div>
        </div>
      </div>
      <div className="bg-card border rounded-md">
        <div className="px-3 py-2 border-b flex justify-between items-center">
          <h3 className="text-sm font-semibold">
            Purchase Report · {bills.length} bills · {returns.length} returns
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV(
                "purchase-report",
                data.map((r) => ({
                  Type: r.doc_type === "debit_note" ? "Debit Note" : "Bill",
                  No: r.bill_no,
                  Date: r.bill_date,
                  Supplier: r.parties?.name,
                  Total: r.total,
                  Paid: r.paid,
                  Balance: r.balance,
                  Status: r.status,
                })),
                {
                  title: "Purchase Report",
                  slug: "purchase-report",
                  from,
                  to,
                  filters: { from, to },
                },
              )
            }
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>No.</th>
                <th>Date</th>
                <th>Supplier</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span
                      className={`text-xs font-semibold ${r.doc_type === "debit_note" ? "num-neg" : ""}`}
                    >
                      {r.doc_type === "debit_note" ? "Return" : "Bill"}
                    </span>
                  </td>
                  <td className="font-mono text-xs">{r.bill_no}</td>
                  <td>{r.bill_date}</td>
                  <td className="font-medium">{r.parties?.name || "—"}</td>
                  <td className={`text-right ${r.doc_type === "debit_note" ? "num-neg" : ""}`}>
                    {r.doc_type === "debit_note" ? "- " : ""}
                    {fmt(r.total)}
                  </td>
                  <td className="text-right num-pos">{fmt(r.paid)}</td>
                  <td className="text-right num-neg">{fmt(r.balance)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted-foreground py-6">
                    No purchases in this period
                  </td>
                </tr>
              )}
            </tbody>
            {data.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/40">
                  <td colSpan={4} className="text-right">
                    Net Purchase:
                  </td>
                  <td className="text-right">{fmt(netPurchase)}</td>
                  <td className="text-right num-pos">{fmt(paid)}</td>
                  <td className="text-right num-neg">{fmt(bal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function ProfitLoss({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-pnl", companyId, from, to],
    queryFn: async () => {
      const [sales, purchases, expenses, salaries, otherIncomes] = await Promise.all([
        supabase
          .from("sales")
          .select("total,doc_type,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("invoice_date", from)
          .lte("invoice_date", to),
        supabase
          .from("purchases")
          .select("total,doc_type,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in("doc_type", ["bill", "debit_note"])
          .gte("bill_date", from)
          .lte("bill_date", to),
        supabase
          .from("expenses")
          .select("amount,tax,category,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("expense_date", from)
          .lte("expense_date", to),
        supabase
          .from("employee_payments")
          .select("amount,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("payment_date", from)
          .lte("payment_date", to),
        supabase
          .from("other_incomes")
          .select("amount,income_date,category_id,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("income_date", from)
          .lte("income_date", to),
      ]);
      const s = summarizePnl({
        sales: (sales.data || []) as any,
        purchases: (purchases.data || []) as any,
        expenses: (expenses.data || []) as any,
        salaries: (salaries.data || []) as any,
        otherIncome: (otherIncomes.data || []) as any,
      });
      return {
        revenue: s.netSales,
        grossSales: s.grossSales,
        salesReturns: s.salesReturns,
        grossPurchases: s.grossPurchases,
        returns: s.purchaseReturns,
        cogs: s.netPurchase,
        expTotal: s.expTotal + s.salaryTotal + s.damageLossTotal,
        salaryTotal: s.salaryTotal,
        expByCat: {
          ...s.expByCat,
          ...(s.salaryTotal ? { salary: s.salaryTotal } : {}),
        } as Record<string, number>,
        grossProfit: s.grossProfit,
        otherIncomeTotal: s.otherIncomeTotal,
        netProfit: s.netProfit,
      };
    },
  });
  if (!data)
    return (
      <div className="bg-card border rounded-md p-8 text-center text-muted-foreground">
        Loading…
      </div>
    );
  const pnlRows: Array<Record<string, unknown>> = [
    { section: "Revenue", line: "Gross Sales", amount: data.grossSales, company_id: companyId },
    {
      section: "Revenue",
      line: "Less: Sales Returns",
      amount: -data.salesReturns,
      company_id: companyId,
    },
    { section: "Revenue", line: "Net Sales", amount: data.revenue, company_id: companyId },
    { section: "COGS", line: "Purchases", amount: -data.grossPurchases, company_id: companyId },
    {
      section: "COGS",
      line: "Less: Purchase Returns",
      amount: data.returns,
      company_id: companyId,
    },
    { section: "COGS", line: "Net Purchases / COGS", amount: -data.cogs, company_id: companyId },
    {
      section: "Gross Profit",
      line: "Gross Profit",
      amount: data.grossProfit,
      company_id: companyId,
    },
    { section: "Other Income", line: "Total Other Income", amount: data.otherIncomeTotal, company_id: companyId },
    {
      section: "Total Income",
      line: "Total Income (Sales + Other)",
      amount: data.revenue + data.otherIncomeTotal,
      company_id: companyId,
    },
    ...Object.entries(data.expByCat).map(([cat, amt]) => ({
      section: "Operating Expenses",
      line: cat,
      amount: -Number(amt),
      company_id: companyId,
    })),
    {
      section: "Operating Expenses",
      line: "Total Expenses",
      amount: -data.expTotal,
      company_id: companyId,
    },
    { section: "Net Profit", line: "Net Profit", amount: data.netProfit, company_id: companyId },
  ];
  return (
    <div className="bg-card border rounded-md p-5 max-w-2xl">
      <div className="flex justify-between items-center mb-4 gap-2">
        <h3 className="text-lg font-bold">Profit & Loss Statement</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {from} → {to}
          </span>
          <ReportExportButtons
            slug="profit-loss"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Profit & Loss Statement",
              period: { from, to },
              filters: { from, to },
              columns: [
                { header: "Section", accessor: (r: any) => r.section ?? "" },
                { header: "Line", accessor: (r: any) => r.line ?? "" },
                { header: "Amount", align: "right", accessor: (r: any) => fmtAmount(r.amount) },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: pnlRows,
              totals: ["", "Net Profit", fmtAmount(data.netProfit)],
              signature: "Authorised Signatory",
            })}
          />
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <tr>
            <td className="py-2 font-semibold">Gross Sales</td>
            <td className="text-right num-pos py-2">{fmt(data.grossSales)}</td>
          </tr>
          {data.salesReturns > 0 && (
            <tr>
              <td className="py-2 pl-4 text-muted-foreground">Less: Sales Returns</td>
              <td className="text-right num-neg py-2">- {fmt(data.salesReturns)}</td>
            </tr>
          )}
          <tr className="border-t">
            <td className="py-2 font-semibold">Net Sales</td>
            <td className="text-right num-pos py-2 font-medium">{fmt(data.revenue)}</td>
          </tr>
          <tr>
            <td className="py-2 pl-4 text-muted-foreground">Purchases</td>
            <td className="text-right num-neg py-2">- {fmt(data.grossPurchases)}</td>
          </tr>
          <tr>
            <td className="py-2 pl-4 text-muted-foreground">Less: Purchase Returns</td>
            <td className="text-right num-pos py-2">+ {fmt(data.returns)}</td>
          </tr>
          <tr>
            <td className="py-2 pl-4 font-medium">Net Purchases / COGS</td>
            <td className="text-right num-neg py-2 font-medium">- {fmt(data.cogs)}</td>
          </tr>
          <tr className="border-t">
            <td className="py-2 font-semibold">Gross Profit</td>
            <td
              className={`text-right py-2 font-bold ${data.grossProfit >= 0 ? "num-pos" : "num-neg"}`}
            >
              {fmt(data.grossProfit)}
            </td>
          </tr>
          <tr>
            <td
              colSpan={2}
              className="pt-3 pb-1 text-xs uppercase text-muted-foreground tracking-wider"
            >
              Operating Expenses
            </td>
          </tr>
          {Object.entries(data.expByCat).map(([cat, amt]) => (
            <tr key={cat}>
              <td className="py-1 pl-4 text-muted-foreground capitalize">{cat}</td>
              <td className="text-right num-neg py-1">- {fmt(amt)}</td>
            </tr>
          ))}
          <tr className="border-t">
            <td className="py-2 font-semibold">Total Expenses</td>
            <td className="text-right num-neg py-2 font-bold">- {fmt(data.expTotal)}</td>
          </tr>
          <tr className="border-t-2 border-double">
            <td className="py-3 text-base font-bold">Net Profit</td>
            <td
              className={`text-right py-3 text-base font-bold ${data.netProfit >= 0 ? "num-pos" : "num-neg"}`}
            >
              {fmt(data.netProfit)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StockSummary({ companyId }: { companyId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-stock", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,sku,unit,stock,purchase_price,sale_price,low_stock_alert,is_service")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });
  const products = data.filter((i) => !i.is_service);
  const totalStockValue = stockValueOf(products as any);
  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">
          Stock Summary · Total Value: {fmt(totalStockValue)}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCSV(
              "stock-summary",
              products.map((r) => ({
                Item: r.name,
                SKU: r.sku,
                Stock: r.stock,
                Unit: r.unit,
                "Purchase Price": r.purchase_price,
                "Sale Price": r.sale_price,
                "Stock Value": Number(r.stock) * Number(r.purchase_price),
              })),
              { title: "Stock Summary", slug: "stock-summary" },
            )
          }
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Purchase</th>
              <th className="text-right">Sale</th>
              <th className="text-right">Stock Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((r) => {
              const low = r.low_stock_alert != null && Number(r.stock) <= Number(r.low_stock_alert);
              return (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="font-mono text-xs">{r.sku || "—"}</td>
                  <td className="text-right">
                    {Number(r.stock)} {r.unit}
                  </td>
                  <td className="text-right">{fmt(r.purchase_price)}</td>
                  <td className="text-right">{fmt(r.sale_price)}</td>
                  <td className="text-right font-semibold">
                    {fmt(Number(r.stock) * Number(r.purchase_price))}
                  </td>
                  <td>
                    {low ? (
                      <span className="text-sale text-xs font-semibold">LOW</span>
                    ) : (
                      <span className="text-success text-xs">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-6">
                  No items yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DayBook({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const navigate = useNavigate();
  const { data = [] } = useQuery({
    queryKey: ["rpt-daybook", companyId, from, to],
    queryFn: async () => {
      const [payments, expenses, cashTxns, loanPays, cheques, salaries] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id,payment_date,direction,amount,method,reference_no,status,deleted_at,reversed_at,parties(name)",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("payment_date", from)
          .lte("payment_date", to),
        supabase
          .from("expenses")
          .select(
            "id,expense_date,amount,tax,category,vendor,payment_method,status,deleted_at,reversed_at",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("expense_date", from)
          .lte("expense_date", to),
        supabase
          .from("cash_transactions")
          .select(
            "id,txn_date,direction,amount,category,notes,bank_account_id,reference_type,status,deleted_at,reversed_at",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "posted")
          .gte("txn_date", from)
          .lte("txn_date", to),
        supabase
          .from("loan_payments")
          .select("id,payment_date,amount,method,notes,status,deleted_at,reversed_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("payment_date", from)
          .lte("payment_date", to),
        supabase
          .from("cheques")
          .select(
            "id,cleared_at,cheque_date,direction,amount,cheque_number,status,deleted_at,reversed_at",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "cleared")
          .not("cleared_at", "is", null)
          .gte("cleared_at", from)
          .lte("cleared_at", to),
        supabase
          .from("employee_payments")
          .select(
            "id,payment_date,amount,method,notes,status,deleted_at,reversed_at,employees(name)",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("payment_date", from)
          .lte("payment_date", to),
      ]);
      return buildDayBook({
        payments: (payments.data || []) as any,
        expenses: (expenses.data || []) as any,
        cashTxns: (cashTxns.data || []) as any,
        loanPayments: (loanPays.data || []) as any,
        cheques: (cheques.data || []) as any,
        salaries: (salaries.data || []) as any,
      }).rows;
    },
  });
  const totalIn = data.reduce((s, r) => s + r.in, 0);
  const totalOut = data.reduce((s, r) => s + r.out, 0);
  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">
          Day Book · Net:{" "}
          <span className={totalIn - totalOut >= 0 ? "num-pos" : "num-neg"}>
            {fmt(totalIn - totalOut)}
          </span>
        </h3>
        <div className="flex gap-2">
          <ReportExportButtons
            slug="day-book"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Day Book",
              period: { from, to },
              filters: { from, to },
              columns: [
                { header: "Date", accessor: (r: any) => fmtDate(r.date) },
                { header: "Type", accessor: (r: any) => r.type ?? "" },
                {
                  header: "Party / Ref",
                  accessor: (r: any) => `${r.party ?? "—"} (${r.ref ?? "—"})`,
                },
                { header: "Method", accessor: (r: any) => r.method ?? "" },
                {
                  header: "In",
                  align: "right",
                  accessor: (r: any) => (r.in ? fmtAmount(r.in) : ""),
                },
                {
                  header: "Out",
                  align: "right",
                  accessor: (r: any) => (r.out ? fmtAmount(r.out) : ""),
                },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: data.map((r) => ({ ...r, company_id: companyId })),
              totals: ["Totals:", "", "", "", fmtAmount(totalIn), fmtAmount(totalOut)],
              signature: "Authorised Signatory",
            })}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV("day-book", data as unknown as Record<string, unknown>[], {
                title: "Day Book",
                slug: "day-book",
                from,
                to,
                filters: { from, to },
              })
            }
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Party / Ref</th>
              <th>Method</th>
              <th className="text-right">In</th>
              <th className="text-right">Out</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const target = r.refKind
                ? resolveReportDrilldown({ kind: r.refKind as DrilldownKind, id: r.refId ?? null })
                : { disabled: true as const, reason: "Details not available for this row" };
              const clickable = !target.disabled;
              const go = () => {
                if (!target.disabled) navigate({ to: target.to, params: target.params } as any);
              };
              return (
                <tr
                  key={r.refId ?? i}
                  role={clickable ? "link" : undefined}
                  tabIndex={clickable ? 0 : -1}
                  title={clickable ? "Open details" : target.disabled ? target.reason : undefined}
                  onClick={clickable ? go : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            go();
                          }
                        }
                      : undefined
                  }
                  className={clickable ? "cursor-pointer hover:bg-muted/40" : undefined}
                >
                  <td>{r.date}</td>
                  <td>{r.type}</td>
                  <td className="font-medium">
                    {r.party} <span className="text-muted-foreground text-xs">{r.ref}</span>
                  </td>
                  <td className="capitalize">{r.method}</td>
                  <td className="text-right num-pos">{r.in ? fmt(r.in) : ""}</td>
                  <td className="text-right num-neg">{r.out ? fmt(r.out) : ""}</td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted-foreground py-6">
                  No cash movements
                </td>
              </tr>
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={4} className="text-right">
                  Totals:
                </td>
                <td className="text-right num-pos">{fmt(totalIn)}</td>
                <td className="text-right num-neg">{fmt(totalOut)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function BalanceSheet({ companyId }: { companyId: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-balance-sheet", companyId],
    queryFn: async () => {
      const [banks, loans, parties, items] = await Promise.all([
        supabase
          .from("bank_accounts")
          .select("id,name,account_type,current_balance,provider")
          .is("deleted_at", null)
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("loans")
          .select("id,lender_name,outstanding,counterparty_type,status")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("status", "active"),
        supabase
          .from("parties")
          .select("id,name,phone,type,balance")
          .is("deleted_at", null)
          .eq("company_id", companyId),
        supabase
          .from("items")
          .select("stock,purchase_price,sale_price,is_service,deleted_at")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("is_active", true),
      ]);

      const cashRes = await supabase
        .from("cash_transactions")
        .select("direction,amount")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("status", "posted")
        .is("bank_account_id", null);
      const openingRes = await supabase
        .from("settings_kv")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "cash.opening_balance")
        .maybeSingle();
      const openingVal = openingRes.data?.value as { amount?: number } | number | null | undefined;
      const opening = typeof openingVal === "number" ? openingVal : Number(openingVal?.amount || 0);
      const cash =
        opening +
        (cashRes.data || []).reduce(
          (s: number, t: any) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)),
          0,
        );
      const bankAccts = (banks.data || []).filter((b: any) => b.account_type !== "mobile");
      const mobileAccts = (banks.data || []).filter((b: any) => b.account_type === "mobile");
      const bankTotal = bankAccts.reduce((s: number, b: any) => s + Number(b.current_balance), 0);
      const mobileTotal = mobileAccts.reduce(
        (s: number, b: any) => s + Number(b.current_balance),
        0,
      );
      const loanPayable = (loans.data || [])
        .filter((l: any) => l.counterparty_type !== "receivable")
        .reduce((s: number, l: any) => s + Number(l.outstanding), 0);
      const loanReceivable = (loans.data || [])
        .filter((l: any) => l.counterparty_type === "receivable")
        .reduce((s: number, l: any) => s + Number(l.outstanding), 0);
      const receivablesList = (parties.data || []).filter(
        (p: any) => p.type === "customer" && Number(p.balance) > 0,
      );
      const payablesList = (parties.data || []).filter(
        (p: any) => p.type === "supplier" && Number(p.balance) > 0,
      );
      const receivables = receivablesList.reduce((s: number, p: any) => s + Number(p.balance), 0);
      const payables = payablesList.reduce((s: number, p: any) => s + Number(p.balance), 0);
      const stockValue = stockValueOf((items.data || []) as any);
      return {
        cash,
        bankAccts,
        mobileAccts,
        bankTotal,
        mobileTotal,
        stockValue,
        loanPayable,
        loanReceivable,
        receivables,
        payables,
        receivablesList,
        payablesList,
      };
    },
  });

  if (!data) return null;
  const totalAssets =
    data.cash +
    data.bankTotal +
    data.mobileTotal +
    data.stockValue +
    data.loanReceivable +
    data.receivables;
  const totalLiabilities = data.loanPayable + data.payables;

  const bsRows: Array<Record<string, unknown>> = [
    { section: "Assets", line: "Cash In Hand", amount: data.cash, company_id: companyId },
    ...data.bankAccts.map((b: any) => ({
      section: "Assets",
      line: `Bank: ${b.name}`,
      amount: Number(b.current_balance),
      company_id: companyId,
    })),
    { section: "Assets", line: "Bank Subtotal", amount: data.bankTotal, company_id: companyId },
    ...data.mobileAccts.map((b: any) => ({
      section: "Assets",
      line: `Mobile: ${b.provider || b.name}`,
      amount: Number(b.current_balance),
      company_id: companyId,
    })),
    { section: "Assets", line: "Mobile Subtotal", amount: data.mobileTotal, company_id: companyId },
    {
      section: "Assets",
      line: "Accounts Receivable",
      amount: data.receivables,
      company_id: companyId,
    },
    {
      section: "Assets",
      line: "Loans Receivable",
      amount: data.loanReceivable,
      company_id: companyId,
    },
    {
      section: "Assets",
      line: "Stock / Inventory",
      amount: data.stockValue,
      company_id: companyId,
    },
    { section: "Assets", line: "Total Assets", amount: totalAssets, company_id: companyId },
    {
      section: "Liabilities",
      line: "Accounts Payable",
      amount: data.payables,
      company_id: companyId,
    },
    {
      section: "Liabilities",
      line: "Loans Payable",
      amount: data.loanPayable,
      company_id: companyId,
    },
    {
      section: "Liabilities",
      line: "Total Liabilities",
      amount: totalLiabilities,
      company_id: companyId,
    },
    {
      section: "Equity",
      line: "Net Worth",
      amount: totalAssets - totalLiabilities,
      company_id: companyId,
    },
  ];

  const trialRows: Array<Record<string, unknown>> = [
    { account: "Cash In Hand", debit: data.cash, credit: 0, company_id: companyId },
    { account: "Bank Accounts", debit: data.bankTotal, credit: 0, company_id: companyId },
    { account: "Mobile Banking", debit: data.mobileTotal, credit: 0, company_id: companyId },
    { account: "Accounts Receivable", debit: data.receivables, credit: 0, company_id: companyId },
    { account: "Loans Receivable", debit: data.loanReceivable, credit: 0, company_id: companyId },
    { account: "Stock / Inventory", debit: data.stockValue, credit: 0, company_id: companyId },
    { account: "Accounts Payable", debit: 0, credit: data.payables, company_id: companyId },
    { account: "Loans Payable", debit: 0, credit: data.loanPayable, company_id: companyId },
    {
      account: "Equity / Net Worth",
      debit: 0,
      credit: totalAssets - totalLiabilities,
      company_id: companyId,
    },
  ];
  const trialDebit = trialRows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const trialCredit = trialRows.reduce((s, r) => s + Number(r.credit || 0), 0);

  const receivablesRows = data.receivablesList.map((p: any) => ({
    name: p.name,
    phone: p.phone || "",
    balance: Number(p.balance),
    company_id: companyId,
  }));
  const payablesRows = data.payablesList.map((p: any) => ({
    name: p.name,
    phone: p.phone || "",
    balance: Number(p.balance),
    company_id: companyId,
  }));

  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Balance Sheet</h3>
          <div className="text-[11px] text-muted-foreground">
            Snapshot as of today. The period filter above does not apply to the balance sheet.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportExportButtons
            slug="balance-sheet"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Balance Sheet",
              columns: [
                { header: "Section", accessor: (r: any) => r.section ?? "" },
                { header: "Line", accessor: (r: any) => r.line ?? "" },
                { header: "Amount", align: "right", accessor: (r: any) => fmtAmount(r.amount) },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: bsRows,
              totals: ["", "Net Worth", fmtAmount(totalAssets - totalLiabilities)],
              signature: "Authorised Signatory",
            })}
          />
          <ReportExportButtons
            slug="trial-balance"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Trial Balance",
              columns: [
                { header: "Account", accessor: (r: any) => r.account ?? "" },
                {
                  header: "Debit",
                  align: "right",
                  accessor: (r: any) => (r.debit ? fmtAmount(r.debit) : ""),
                },
                {
                  header: "Credit",
                  align: "right",
                  accessor: (r: any) => (r.credit ? fmtAmount(r.credit) : ""),
                },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: trialRows,
              totals: ["Totals:", fmtAmount(trialDebit), fmtAmount(trialCredit)],
              signature: "Authorised Signatory",
            })}
          />
          <ReportExportButtons
            slug="receivables-report"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Receivables Report",
              columns: [
                { header: "Party", accessor: (r: any) => r.name ?? "" },
                { header: "Phone", accessor: (r: any) => r.phone ?? "" },
                {
                  header: "Amount Due",
                  align: "right",
                  accessor: (r: any) => fmtAmount(r.balance),
                },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: receivablesRows,
              totals: ["Total Receivables", "", fmtAmount(data.receivables)],
              signature: "Authorised Signatory",
            })}
          />
          <ReportExportButtons
            slug="payables-report"
            getContext={() => ({
              company: { name: null },
              companyId,
              title: "Payables Report",
              columns: [
                { header: "Party", accessor: (r: any) => r.name ?? "" },
                { header: "Phone", accessor: (r: any) => r.phone ?? "" },
                {
                  header: "Amount Owed",
                  align: "right",
                  accessor: (r: any) => fmtAmount(r.balance),
                },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: payablesRows,
              totals: ["Total Payables", "", fmtAmount(data.payables)],
              signature: "Authorised Signatory",
            })}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border rounded-md">
          <div className="px-3 py-2 border-b font-semibold text-sm bg-success/5">Assets</div>
          <div className="p-3 text-sm space-y-2">
            <div className="flex justify-between border-b pb-2">
              <span>Cash In Hand</span>
              <span className="font-semibold">{fmt(data.cash)}</span>
            </div>
            <div>
              <div className="font-medium mb-1">Bank Accounts</div>
              {data.bankAccts.map((b: any) => (
                <div key={b.id} className="flex justify-between text-xs text-muted-foreground pl-3">
                  <span>{b.name}</span>
                  <span>{fmt(b.current_balance)}</span>
                </div>
              ))}
              <div className="flex justify-between border-b pb-2 pt-1">
                <span className="pl-3">Subtotal</span>
                <span className="font-semibold">{fmt(data.bankTotal)}</span>
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">Mobile Banking</div>
              {data.mobileAccts.map((b: any) => (
                <div key={b.id} className="flex justify-between text-xs text-muted-foreground pl-3">
                  <span>{b.provider || b.name}</span>
                  <span>{fmt(b.current_balance)}</span>
                </div>
              ))}
              <div className="flex justify-between border-b pb-2 pt-1">
                <span className="pl-3">Subtotal</span>
                <span className="font-semibold">{fmt(data.mobileTotal)}</span>
              </div>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Accounts Receivable</span>
              <span className="font-semibold">{fmt(data.receivables)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Loans Receivable</span>
              <span className="font-semibold">{fmt(data.loanReceivable)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Stock / Inventory</span>
              <span className="font-semibold">{fmt(data.stockValue)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-bold">
              <span>Total Assets</span>
              <span className="num-pos">{fmt(totalAssets)}</span>
            </div>
          </div>
        </div>
        <div className="bg-card border rounded-md">
          <div className="px-3 py-2 border-b font-semibold text-sm bg-sale/5">Liabilities</div>
          <div className="p-3 text-sm space-y-2">
            <div className="flex justify-between border-b pb-2">
              <span>Accounts Payable (Suppliers)</span>
              <span className="font-semibold">{fmt(data.payables)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span>Loans Payable</span>
              <span className="font-semibold">{fmt(data.loanPayable)}</span>
            </div>
            <div className="flex justify-between pt-2 text-base font-bold">
              <span>Total Liabilities</span>
              <span className="num-neg">{fmt(totalLiabilities)}</span>
            </div>
            <div className="flex justify-between pt-3 mt-3 border-t-2 text-base font-bold">
              <span>Net Worth</span>
              <span className={totalAssets - totalLiabilities >= 0 ? "num-pos" : "num-neg"}>
                {fmt(totalAssets - totalLiabilities)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpenseReport({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [] } = useQuery({
    queryKey: ["rpt-exp", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const byCat: Record<string, number> = {};
  data.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0) + Number(e.tax || 0);
  });
  const total = data.reduce((s, r) => s + Number(r.amount || 0) + Number(r.tax || 0), 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div className="bg-card border rounded-md p-4 lg:col-span-1">
        <h3 className="text-sm font-semibold mb-3">By Category</h3>
        {Object.entries(byCat)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => (
            <div key={cat} className="flex justify-between py-1.5 border-b last:border-0 text-sm">
              <span className="capitalize">{cat}</span>
              <span className="font-semibold">{fmt(amt)}</span>
            </div>
          ))}
        <div className="flex justify-between mt-2 pt-2 border-t-2 text-base font-bold">
          <span>Total</span>
          <span className="num-neg">{fmt(total)}</span>
        </div>
      </div>
      <div className="lg:col-span-2 bg-card border rounded-md">
        <div className="px-3 py-2 border-b flex justify-between items-center">
          <h3 className="text-sm font-semibold">All Expenses · {data.length}</h3>
          <div className="flex gap-2">
            <ReportExportButtons
              slug="expense-report"
              getContext={() => ({
                company: { name: null },
                companyId,
                title: "Expense Report",
                period: { from, to },
                filters: { from, to },
                columns: [
                  { header: "Date", accessor: (r: any) => fmtDate(r.expense_date) },
                  { header: "Category", accessor: (r: any) => r.category ?? "" },
                  { header: "Vendor", accessor: (r: any) => r.vendor ?? "—" },
                  { header: "Method", accessor: (r: any) => r.payment_method ?? "" },
                  { header: "Amount", align: "right", accessor: (r: any) => fmtAmount(r.amount) },
                  { header: "Tax", align: "right", accessor: (r: any) => fmtAmount(r.tax || 0) },
                  {
                    header: "Total",
                    align: "right",
                    accessor: (r: any) => fmtAmount(Number(r.amount || 0) + Number(r.tax || 0)),
                  },
                ] as ReportColumn<Record<string, unknown>>[],
                rows: data.map((r) => ({ ...r, company_id: companyId })),
                totals: [
                  "Totals:",
                  "",
                  "",
                  "",
                  fmtAmount(data.reduce((s, r) => s + Number(r.amount || 0), 0)),
                  fmtAmount(data.reduce((s, r) => s + Number(r.tax || 0), 0)),
                  fmtAmount(total),
                ],
                signature: "Authorised Signatory",
              })}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCSV("expense-report", data, {
                  title: "Expense Report",
                  slug: "expense-report",
                  from,
                  to,
                  filters: { from, to },
                })
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Vendor</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.expense_date}</td>
                  <td className="capitalize">{r.category}</td>
                  <td>{r.vendor || "—"}</td>
                  <td className="capitalize">{r.payment_method}</td>
                  <td className="text-right">{fmt(r.amount)}</td>
                  <td className="text-right text-muted-foreground">{fmt(r.tax || 0)}</td>
                  <td className="text-right num-neg font-semibold">
                    {fmt(Number(r.amount || 0) + Number(r.tax || 0))}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">
                    No expenses
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PartyStatement({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const navigate = useNavigate();
  const [partyId, setPartyId] = useState("");
  const { data: parties = [] } = useQuery({
    queryKey: ["rpt-parties", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["rpt-stmt", companyId, partyId, from, to],
    enabled: !!partyId,
    queryFn: async () => {
      const [sales, purchases, payments] = await Promise.all([
        supabase
          .from("sales")
          .select("id,invoice_date,invoice_no,total,balance")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("party_id", partyId)
          .gte("invoice_date", from)
          .lte("invoice_date", to),
        supabase
          .from("purchases")
          .select("id,bill_date,bill_no,total,balance")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("party_id", partyId)
          .gte("bill_date", from)
          .lte("bill_date", to),
        supabase
          .from("payments")
          .select("id,payment_date,direction,amount,reference_no")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .eq("party_id", partyId)
          .gte("payment_date", from)
          .lte("payment_date", to),
      ]);
      const out: any[] = [];
      (sales.data || []).forEach((s: any) =>
        out.push({
          id: s.id,
          kind: "sale_invoice" as DrilldownKind,
          date: s.invoice_date,
          type: "Sale",
          ref: s.invoice_no,
          debit: s.total,
          credit: 0,
        }),
      );
      (purchases.data || []).forEach((p: any) =>
        out.push({
          id: p.id,
          kind: "purchase_bill" as DrilldownKind,
          date: p.bill_date,
          type: "Purchase",
          ref: p.bill_no,
          debit: 0,
          credit: p.total,
        }),
      );
      (payments.data || []).forEach((p: any) =>
        out.push({
          id: p.id,
          kind: (p.direction === "in" ? "payment_in" : "payment_out") as DrilldownKind,
          date: p.payment_date,
          type: p.direction === "in" ? "Payment In" : "Payment Out",
          ref: p.reference_no || "",
          debit: p.direction === "out" ? p.amount : 0,
          credit: p.direction === "in" ? p.amount : 0,
        }),
      );
      return out.sort((a, b) => (a.date > b.date ? 1 : -1));
    },
  });
  const debit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const credit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-md p-3 flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Label className="text-xs">Select Party</Label>
          <Select value={partyId} onValueChange={setPartyId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose party" />
            </SelectTrigger>
            <SelectContent>
              {parties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {partyId && (
          <div className="flex items-center gap-2">
            <ReportExportButtons
              slug="party-statement"
              getContext={() => {
                const partyName = parties.find((p: any) => p.id === partyId)?.name ?? "";
                const stmtRows: Array<Record<string, unknown>> = [
                  {
                    date: from,
                    type: "Opening Balance",
                    ref: "",
                    debit: 0,
                    credit: 0,
                    company_id: companyId,
                  },
                  ...rows.map((r: any) => ({ ...r, company_id: companyId })),
                  {
                    date: to,
                    type: "Closing Balance",
                    ref: "",
                    debit: debit - credit >= 0 ? debit - credit : 0,
                    credit: debit - credit < 0 ? credit - debit : 0,
                    company_id: companyId,
                  },
                ];
                return {
                  company: { name: null },
                  companyId,
                  title: `Party Statement — ${partyName}`,
                  period: { from, to },
                  filters: { party: partyName, from, to },
                  columns: [
                    { header: "Date", accessor: (r: any) => fmtDate(r.date) },
                    { header: "Type", accessor: (r: any) => r.type ?? "" },
                    { header: "Ref", accessor: (r: any) => r.ref ?? "" },
                    {
                      header: "Debit",
                      align: "right",
                      accessor: (r: any) => (r.debit ? fmtAmount(r.debit) : ""),
                    },
                    {
                      header: "Credit",
                      align: "right",
                      accessor: (r: any) => (r.credit ? fmtAmount(r.credit) : ""),
                    },
                  ] as ReportColumn<Record<string, unknown>>[],
                  rows: stmtRows,
                  totals: ["Totals:", "", "", fmtAmount(debit), fmtAmount(credit)],
                  signature: "Authorised Signatory",
                };
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCSV("party-statement", rows, {
                  title: "Party Statement",
                  slug: "party-statement",
                  from,
                  to,
                  filters: { from, to },
                })
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        )}
      </div>
      {partyId && (
        <div className="bg-card border rounded-md overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Ref</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => {
                const target = resolveReportDrilldown({ kind: r.kind, id: r.id });
                const clickable = !target.disabled;
                const go = () => {
                  if (!target.disabled) navigate({ to: target.to, params: target.params } as any);
                };
                return (
                  <tr
                    key={r.id ?? i}
                    role={clickable ? "link" : undefined}
                    tabIndex={clickable ? 0 : -1}
                    title={clickable ? "Open details" : target.disabled ? target.reason : undefined}
                    onClick={clickable ? go : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              go();
                            }
                          }
                        : undefined
                    }
                    className={clickable ? "cursor-pointer hover:bg-muted/40" : undefined}
                  >
                    <td>{r.date}</td>
                    <td>{r.type}</td>
                    <td className="font-mono text-xs">{r.ref}</td>
                    <td className="text-right">{r.debit ? fmt(r.debit) : ""}</td>
                    <td className="text-right">{r.credit ? fmt(r.credit) : ""}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted-foreground py-6">
                    No transactions
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-bold bg-muted/40">
                  <td colSpan={3} className="text-right">
                    Totals:
                  </td>
                  <td className="text-right">{fmt(debit)}</td>
                  <td className="text-right">{fmt(credit)}</td>
                </tr>
                <tr className="font-bold">
                  <td colSpan={3} className="text-right">
                    Balance:
                  </td>
                  <td
                    colSpan={2}
                    className={`text-right ${debit - credit >= 0 ? "num-neg" : "num-pos"}`}
                  >
                    {fmt(Math.abs(debit - credit))} {debit - credit >= 0 ? "Dr" : "Cr"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function TaxReport({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ["rpt-tax", companyId, from, to],
    queryFn: async () => {
      const [sales, purchases] = await Promise.all([
        supabase
          .from("sales")
          .select("tax")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("invoice_date", from)
          .lte("invoice_date", to),
        supabase
          .from("purchases")
          .select("tax")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .gte("bill_date", from)
          .lte("bill_date", to),
      ]);
      const collected = (sales.data || []).reduce((s, r: any) => s + Number(r.tax || 0), 0);
      const paid = (purchases.data || []).reduce((s, r: any) => s + Number(r.tax || 0), 0);
      return { collected, paid, payable: collected - paid };
    },
  });
  if (!data) return null;
  const taxRows: Array<Record<string, unknown>> = [
    { label: "Tax Collected (Output)", amount: data.collected, company_id: companyId },
    { label: "Tax Paid (Input)", amount: data.paid, company_id: companyId },
    { label: "Net Tax Payable", amount: data.payable, company_id: companyId },
  ];
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="bg-card border rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Tax Report</h3>
        <ReportExportButtons
          slug="tax-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: "Tax Report",
            period: { from, to },
            filters: { from, to },
            columns: [
              { header: "Line", accessor: (r: any) => r.label ?? "" },
              { header: "Amount", align: "right", accessor: (r: any) => fmtAmount(r.amount) },
            ] as ReportColumn<Record<string, unknown>>[],
            rows: taxRows,
            totals: ["Net Tax Payable", fmtAmount(data.payable)],
            signature: "Authorised Signatory",
          })}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border rounded-md p-5">
          <div className="text-xs text-muted-foreground">Tax Collected (Output)</div>
          <div className="text-2xl font-bold num-pos mt-1">{fmt(data.collected)}</div>
        </div>
        <div className="bg-card border rounded-md p-5">
          <div className="text-xs text-muted-foreground">Tax Paid (Input)</div>
          <div className="text-2xl font-bold num-neg mt-1">{fmt(data.paid)}</div>
        </div>
        <div className="bg-card border rounded-md p-5 border-primary">
          <div className="text-xs text-muted-foreground">Net Tax Payable</div>
          <div className={`text-2xl font-bold mt-1 ${data.payable >= 0 ? "num-neg" : "num-pos"}`}>
            {fmt(Math.abs(data.payable))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Reports() {
  const companyId = useCurrentCompanyId();
  const [period, setPeriod] = useState<Period>("month");
  const [fromD, setFromD] = useState("");
  const [toD, setToD] = useState("");
  const { from, to } = useMemo(() => periodRange(period, fromD, toD), [period, fromD, toD]);

  if (!companyId)
    return (
      <div>
        <PageHeader title="Reports" />
        <NoCompanySelected />
      </div>
    );

  return (
    <div>
      <PageHeader title="Reports" subtitle="Business insights and financial reports" />
      <PeriodPicker
        period={period}
        setPeriod={setPeriod}
        from={fromD}
        setFrom={setFromD}
        to={toD}
        setTo={setToD}
      />
      <Tabs defaultValue="sales">
        <TabsList className="flex-wrap h-auto mb-3">
          <TabsTrigger value="sales">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
            Sales
          </TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="daybook">Day Book</TabsTrigger>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="stock">Stock Summary</TabsTrigger>
          <TabsTrigger value="party">Party Statement</TabsTrigger>
          <TabsTrigger value="tax">Tax Report</TabsTrigger>
          <TabsTrigger value="expense">Expenses</TabsTrigger>
          <TabsTrigger value="other_income">Other Income</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <SaleReport companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="purchases">
          <PurchaseReport companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="daybook">
          <DayBook companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="pnl">
          <ProfitLoss companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="balance">
          <BalanceSheet companyId={companyId} />
        </TabsContent>
        <TabsContent value="stock">
          <StockSummary companyId={companyId} />
        </TabsContent>
        <TabsContent value="party">
          <PartyStatement companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="tax">
          <TaxReport companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="expense">
          <ExpenseReport companyId={companyId} from={from} to={to} />
        </TabsContent>
        <TabsContent value="other_income">
          <OtherIncomeReport companyId={companyId} from={from} to={to} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
