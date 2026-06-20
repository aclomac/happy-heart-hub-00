import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveReportDrilldown } from "@/lib/reports/drilldown";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { SummaryCards } from "@/components/erp/SummaryCards";
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
import { fmtAmount, fmtDate, type ReportColumn, type ReportExportContext } from "@/lib/export";
import { Download, Printer, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/app/purchase-reports")({ component: PurchaseReports });

type Period = "today" | "7d" | "30d" | "month" | "year" | "custom";

function periodRange(p: Period, fromStr: string, toStr: string) {
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
  if (p === "year") return { from: `${today.getFullYear()}-01-01`, to: iso(today) };
  return { from: fromStr || iso(today), to: toStr || iso(today) };
}

const fmt = (n: number) =>
  `৳ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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

function ReportToolbar({
  title,
  count,
  onCSV,
  report,
}: {
  title: string;
  count: number;
  onCSV: () => void;
  report?: {
    slug: string;
    getContext: () => ReportExportContext<Record<string, unknown>>;
  };
}) {
  return (
    <div className="px-3 py-2 border-b flex justify-between items-center">
      <h3 className="text-sm font-semibold">
        {title} · {count} rows
      </h3>
      <div className="flex gap-2">
        {report ? (
          <ReportExportButtons slug={report.slug} getContext={report.getContext} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" />
            Print
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onCSV}>
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>
    </div>
  );
}

function PurchaseReports() {
  const companyId = useCurrentCompanyId();
  const [period, setPeriod] = useState<Period>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => periodRange(period, from, to), [period, from, to]);

  if (!companyId)
    return (
      <div>
        <PageHeader title="Purchase Reports" />
        <NoCompanySelected />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Purchase Reports"
        subtitle="Purchases, suppliers, items, returns, and expenses"
      />
      <PeriodPicker
        period={period}
        setPeriod={setPeriod}
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
      />

      <Tabs defaultValue="purchase" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1 mb-3">
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
          <TabsTrigger value="bill">Bill-wise</TabsTrigger>
          <TabsTrigger value="supplier">Supplier-wise</TabsTrigger>
          <TabsTrigger value="item">By Item</TabsTrigger>
          <TabsTrigger value="po">Purchase Orders</TabsTrigger>
          <TabsTrigger value="debit">Debit / Returns</TabsTrigger>
          <TabsTrigger value="expense">Expense</TabsTrigger>
          <TabsTrigger value="ecat">Expense Category</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase">
          <PurchaseSummary companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="bill">
          <BillWise companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="supplier">
          <SupplierWise companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="item">
          <ByItem companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="po">
          <PORReport companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="debit">
          <DebitReport companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="expense">
          <ExpenseReport companyId={companyId} {...range} />
        </TabsContent>
        <TabsContent value="ecat">
          <ExpenseCategoryReport companyId={companyId} {...range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type DR = { companyId: string; from: string; to: string };

function PurchaseSummary({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-summary", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,total,paid,balance,status,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "bill")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const { data: returnsTotal = 0 } = useQuery({
    queryKey: ["pr-summary-returns", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("total,status")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "debit_note")
        .gte("bill_date", from)
        .lte("bill_date", to);
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.status !== "cancelled")
        .reduce((s, r: any) => s + Number(r.total || 0), 0);
    },
  });
  const total = data.reduce((s, r) => s + Number(r.total || 0), 0);
  const paid = data.reduce((s, r) => s + Number(r.paid || 0), 0);
  const bal = data.reduce((s, r) => s + Number(r.balance || 0), 0);
  const net = total - Number(returnsTotal);
  return (
    <>
      <SummaryCards
        items={[
          { label: "Total Purchases", value: fmt(total), tone: "primary" },
          { label: "Purchase Returns", value: fmt(returnsTotal), tone: "sale" },
          { label: "Net Purchase", value: fmt(net), tone: "success" },
          { label: "Paid", value: fmt(paid), tone: "success" },
          { label: "Outstanding", value: fmt(bal), tone: "warning" },
          { label: "Bills", value: String(data.length), tone: "muted" },
        ]}
      />
      <div className="bg-card border rounded-md">
        <ReportToolbar
          title="Purchase Report"
          count={data.length}
          onCSV={() =>
            exportCSV(
              "purchase-report",
              data.map((r) => ({
                Bill: r.bill_no,
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
          report={{
            slug: "purchase-report",
            getContext: () => ({
              company: { name: null },
              companyId,
              title: "Purchase Report",
              period: { from, to },
              filters: { from, to },
              columns: [
                { header: "Bill", accessor: (r: any) => r.bill_no ?? "" },
                { header: "Date", accessor: (r: any) => fmtDate(r.bill_date) },
                { header: "Supplier", accessor: (r: any) => r.parties?.name ?? "—" },
                { header: "Total", align: "right", accessor: (r: any) => fmtAmount(r.total) },
                { header: "Paid", align: "right", accessor: (r: any) => fmtAmount(r.paid) },
                { header: "Balance", align: "right", accessor: (r: any) => fmtAmount(r.balance) },
                { header: "Status", accessor: (r: any) => r.status ?? "" },
              ] as ReportColumn<Record<string, unknown>>[],
              rows: data.map((r) => ({ ...r, company_id: companyId })),
              totals: ["Totals:", "", "", fmtAmount(total), fmtAmount(paid), fmtAmount(bal), ""],
              signature: "Authorised Signatory",
            }),
          }}
        />
        <div className="overflow-x-auto">
          {isLoading ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty />
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Bill</th>
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
                    <td className="font-mono text-xs">{r.bill_no}</td>
                    <td>{r.bill_date}</td>
                    <td className="font-medium">{r.parties?.name || "—"}</td>
                    <td className="text-right">{fmt(r.total)}</td>
                    <td className="text-right num-pos">{fmt(r.paid)}</td>
                    <td className="text-right num-neg">{fmt(r.balance)}</td>
                    <td className="capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function BillWise({ companyId, from, to }: DR) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-bill", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,due_date,total,paid,balance,status,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "bill")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("balance", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <div className="bg-card border rounded-md">
      <ReportToolbar
        title="Bill-wise Purchase"
        count={data.length}
        onCSV={() =>
          exportCSV(
            "bill-wise",
            data.map((r) => ({
              Bill: r.bill_no,
              Date: r.bill_date,
              Due: r.due_date,
              Supplier: r.parties?.name,
              Total: r.total,
              Paid: r.paid,
              Balance: r.balance,
              Status: r.status,
            })),
            { title: "Bill-wise Purchase", slug: "bill-wise", from, to, filters: { from, to } },
          )
        }
      />
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Date</th>
                <th>Due</th>
                <th>Supplier</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const t = resolveReportDrilldown({ kind: "purchase_bill", id: r.id });
                const open = () => {
                  if (!t.disabled) navigate({ to: t.to, params: t.params });
                };
                return (
                  <tr
                    key={r.id}
                    tabIndex={t.disabled ? -1 : 0}
                    role={t.disabled ? undefined : "link"}
                    title={t.disabled ? t.reason : "Open details"}
                    className={
                      t.disabled
                        ? undefined
                        : "cursor-pointer hover:bg-muted/40 focus:bg-muted/50 outline-none"
                    }
                    onClick={t.disabled ? undefined : open}
                    onKeyDown={
                      t.disabled
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              open();
                            }
                          }
                    }
                  >
                    <td className="font-mono text-xs">{r.bill_no}</td>
                    <td>{r.bill_date}</td>
                    <td className="text-muted-foreground">{r.due_date || "—"}</td>
                    <td className="font-medium">{r.parties?.name || "—"}</td>
                    <td className="text-right">{fmt(r.total)}</td>
                    <td className="text-right num-pos">{fmt(r.paid)}</td>
                    <td className="text-right num-neg">{fmt(r.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SupplierWise({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-supplier", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("party_id,total,paid,balance,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "bill")
        .gte("bill_date", from)
        .lte("bill_date", to);
      if (error) throw error;
      const map = new Map<
        string,
        { name: string; total: number; paid: number; balance: number; count: number }
      >();
      for (const r of data as any[]) {
        const k = r.party_id || "unassigned";
        const cur = map.get(k) || {
          name: r.parties?.name || "—",
          total: 0,
          paid: 0,
          balance: 0,
          count: 0,
        };
        cur.total += Number(r.total || 0);
        cur.paid += Number(r.paid || 0);
        cur.balance += Number(r.balance || 0);
        cur.count += 1;
        map.set(k, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    },
  });
  return (
    <div className="bg-card border rounded-md">
      <ReportToolbar
        title="Supplier-wise Purchase"
        count={data.length}
        onCSV={() =>
          exportCSV(
            "supplier-wise",
            data.map((r) => ({
              Supplier: r.name,
              Bills: r.count,
              Total: r.total,
              Paid: r.paid,
              Balance: r.balance,
            })),
            {
              title: "Supplier-wise Purchase",
              slug: "supplier-wise",
              from,
              to,
              filters: { from, to },
            },
          )
        }
      />
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="text-right">Bills</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right">{fmt(r.total)}</td>
                  <td className="text-right num-pos">{fmt(r.paid)}</td>
                  <td className="text-right num-neg">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ByItem({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-item", companyId, from, to],
    queryFn: async () => {
      const { data: bills, error } = await supabase
        .from("purchases")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "bill")
        .gte("bill_date", from)
        .lte("bill_date", to);
      if (error) throw error;
      const ids = (bills || []).map((b: any) => b.id);
      if (ids.length === 0) return [];
      const { data: items, error: e2 } = await supabase
        .from("purchase_items")
        .select("item_name,qty,unit,price,amount")
        .in("purchase_id", ids);
      if (e2) throw e2;
      const map = new Map<string, { name: string; qty: number; amount: number; unit: string }>();
      for (const it of (items || []) as any[]) {
        const cur = map.get(it.item_name) || {
          name: it.item_name,
          qty: 0,
          amount: 0,
          unit: it.unit,
        };
        cur.qty += Number(it.qty || 0);
        cur.amount += Number(it.amount || 0);
        map.set(it.item_name, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    },
  });
  return (
    <div className="bg-card border rounded-md">
      <ReportToolbar
        title="Purchase by Item"
        count={data.length}
        onCSV={() =>
          exportCSV(
            "purchase-by-item",
            data.map((r) => ({
              Item: r.name,
              Qty: r.qty,
              Unit: r.unit,
              Amount: r.amount,
            })),
            {
              title: "Purchase by Item",
              slug: "purchase-by-item",
              from,
              to,
              filters: { from, to },
            },
          )
        }
      />
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-right">{r.qty}</td>
                  <td>{r.unit}</td>
                  <td className="text-right">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PORReport({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-po", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,due_date,total,status,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "purchase_order")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  return (
    <div className="bg-card border rounded-md">
      <ReportToolbar
        title="Purchase Order Report"
        count={data.length}
        onCSV={() =>
          exportCSV(
            "po-report",
            data.map((r) => ({
              PO: r.bill_no,
              Date: r.bill_date,
              Expected: r.due_date,
              Supplier: r.parties?.name,
              Total: r.total,
              Status: r.status,
            })),
            { title: "Purchase Order Report", slug: "po-report", from, to, filters: { from, to } },
          )
        }
      />
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Date</th>
                <th>Expected</th>
                <th>Supplier</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.bill_no}</td>
                  <td>{r.bill_date}</td>
                  <td className="text-muted-foreground">{r.due_date || "—"}</td>
                  <td className="font-medium">{r.parties?.name || "—"}</td>
                  <td className="text-right">{fmt(r.total)}</td>
                  <td className="capitalize">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DebitReport({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-debit", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id,bill_no,bill_date,total,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "debit_note")
        .gte("bill_date", from)
        .lte("bill_date", to)
        .order("bill_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const total = data.reduce((s, r) => s + Number(r.total || 0), 0);
  return (
    <>
      <SummaryCards
        items={[
          { label: "Total Returns", value: fmt(total), tone: "sale" },
          { label: "Notes", value: String(data.length), tone: "muted" },
        ]}
      />
      <div className="bg-card border rounded-md">
        <ReportToolbar
          title="Debit Note / Purchase Return"
          count={data.length}
          onCSV={() =>
            exportCSV(
              "debit-notes",
              data.map((r) => ({
                Note: r.bill_no,
                Date: r.bill_date,
                Supplier: r.parties?.name,
                Amount: r.total,
              })),
              { title: "Debit Notes", slug: "debit-notes", from, to, filters: { from, to } },
            )
          }
        />
        <div className="overflow-x-auto">
          {isLoading ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty />
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Note #</th>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.bill_no}</td>
                    <td>{r.bill_date}</td>
                    <td className="font-medium">{r.parties?.name || "—"}</td>
                    <td className="text-right num-neg">{fmt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function ExpenseReport({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-exp", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("id,expense_date,vendor,amount,category,payment_method,notes")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to)
        .order("expense_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const total = data.reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <>
      <SummaryCards
        items={[
          { label: "Total Expenses", value: fmt(total), tone: "sale" },
          { label: "Entries", value: String(data.length), tone: "muted" },
        ]}
      />
      <div className="bg-card border rounded-md">
        <ReportToolbar
          title="Expense Report"
          count={data.length}
          onCSV={() =>
            exportCSV(
              "expense-report",
              data.map((r) => ({
                Date: r.expense_date,
                Vendor: r.vendor,
                Category: r.category,
                Method: r.payment_method,
                Amount: r.amount,
                Notes: r.notes,
              })),
              { title: "Expense Report", slug: "expense-report", from, to, filters: { from, to } },
            )
          }
          report={{
            slug: "expense-report",
            getContext: () => ({
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
              ] as ReportColumn<Record<string, unknown>>[],
              rows: data.map((r) => ({ ...r, company_id: companyId })),
              totals: ["Totals:", "", "", "", fmtAmount(total)],
              signature: "Authorised Signatory",
            }),
          }}
        />
        <div className="overflow-x-auto">
          {isLoading ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty />
          ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Method</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.expense_date}</td>
                    <td className="font-medium">{r.vendor || "—"}</td>
                    <td className="capitalize">{r.category}</td>
                    <td className="capitalize">{r.payment_method}</td>
                    <td className="text-right num-neg">{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function ExpenseCategoryReport({ companyId, from, to }: DR) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["pr-ecat", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("category,amount")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .gte("expense_date", from)
        .lte("expense_date", to);
      if (error) throw error;
      const map = new Map<string, { category: string; amount: number; count: number }>();
      for (const r of (data || []) as any[]) {
        const k = r.category || "uncategorized";
        const cur = map.get(k) || { category: k, amount: 0, count: 0 };
        cur.amount += Number(r.amount || 0);
        cur.count += 1;
        map.set(k, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    },
  });
  const total = data.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="bg-card border rounded-md">
      <ReportToolbar
        title="Expense by Category"
        count={data.length}
        onCSV={() =>
          exportCSV(
            "expense-category",
            data.map((r) => ({
              Category: r.category,
              Entries: r.count,
              Amount: r.amount,
            })),
            {
              title: "Expense by Category",
              slug: "expense-category",
              from,
              to,
              filters: { from, to },
            },
          )
        }
      />
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loading />
        ) : data.length === 0 ? (
          <Empty />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Entries</th>
                <th className="text-right">Amount</th>
                <th className="text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium capitalize">{r.category}</td>
                  <td className="text-right">{r.count}</td>
                  <td className="text-right num-neg">{fmt(r.amount)}</td>
                  <td className="text-right text-muted-foreground">
                    {total > 0 ? ((r.amount / total) * 100).toFixed(1) : "0"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">No data in this period.</div>
  );
}
function Loading() {
  return (
    <div className="p-8 text-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
      Loading…
    </div>
  );
}
