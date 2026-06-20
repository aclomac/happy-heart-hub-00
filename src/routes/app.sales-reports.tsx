import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { resolveReportDrilldown } from "@/lib/reports/drilldown";
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
import { exportCSV } from "@/lib/export-csv";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, type ReportColumn } from "@/lib/export";
import {
  Download,
  FileText,
  TrendingUp,
  Clock,
  Users,
  FolderOpen,
  Package,
  Undo2,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/app/sales-reports")({ component: SalesReports });

type ReportKey = "sale" | "bill_profit" | "aging" | "party" | "party_group" | "item" | "return";

const REPORTS: { key: ReportKey; label: string; desc: string; icon: any; tone: string }[] = [
  {
    key: "sale",
    label: "Sale Report",
    desc: "All invoices with totals & balances",
    icon: FileText,
    tone: "bg-blue-50 text-blue-600",
  },
  {
    key: "bill_profit",
    label: "Bill-wise Profit",
    desc: "Profit per invoice (revenue − COGS)",
    icon: TrendingUp,
    tone: "bg-emerald-50 text-emerald-600",
  },
  {
    key: "aging",
    label: "Sale Aging",
    desc: "Outstanding bucketed by overdue days",
    icon: Clock,
    tone: "bg-amber-50 text-amber-600",
  },
  {
    key: "party",
    label: "Party-wise Sale",
    desc: "Sales grouped by customer",
    icon: Users,
    tone: "bg-indigo-50 text-indigo-600",
  },
  {
    key: "party_group",
    label: "Sale by Party Group",
    desc: "Sales grouped by party group",
    icon: FolderOpen,
    tone: "bg-purple-50 text-purple-600",
  },
  {
    key: "item",
    label: "Item-wise Sale",
    desc: "Sales grouped by item with profit",
    icon: Package,
    tone: "bg-cyan-50 text-cyan-600",
  },
  {
    key: "return",
    label: "Sale Return Report",
    desc: "Credit notes by date / party",
    icon: Undo2,
    tone: "bg-rose-50 text-rose-600",
  },
];

function fmt(n: number) {
  return `৳ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SalesReports() {
  const companyId = useCurrentCompanyId();
  const today = new Date().toISOString().slice(0, 10);
  const m0 = new Date();
  m0.setDate(1);
  const firstOfMonth = m0.toISOString().slice(0, 10);

  const [active, setActive] = useState<ReportKey | null>(null);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Sales Reports" subtitle="Comprehensive sales analytics" />
        <NoCompanySelected />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sales Reports"
        subtitle="Comprehensive sales analytics & exports"
        actions={
          active ? (
            <Button variant="outline" size="sm" onClick={() => setActive(null)}>
              ← Back to hub
            </Button>
          ) : undefined
        }
      />

      {active && (
        <div className="bg-card border rounded-md p-3 mb-3 flex flex-wrap items-end gap-3">
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
        </div>
      )}

      {!active ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => setActive(r.key)}
                className="bg-card border rounded-md p-4 text-left hover:border-primary hover:shadow-md transition-all group"
              >
                <div
                  className={`w-10 h-10 rounded-md flex items-center justify-center mb-3 ${r.tone}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="font-semibold text-sm group-hover:text-primary">{r.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <ReportView companyId={companyId} from={from} to={to} which={active} />
      )}
    </div>
  );
}

function ReportView({
  companyId,
  from,
  to,
  which,
}: {
  companyId: string;
  from: string;
  to: string;
  which: ReportKey;
}) {
  if (which === "sale") return <SaleRpt companyId={companyId} from={from} to={to} />;
  if (which === "bill_profit") return <BillProfitRpt companyId={companyId} from={from} to={to} />;
  if (which === "aging") return <AgingRpt companyId={companyId} />;
  if (which === "party") return <PartyRpt companyId={companyId} from={from} to={to} />;
  if (which === "party_group") return <PartyGroupRpt companyId={companyId} from={from} to={to} />;
  if (which === "item") return <ItemRpt companyId={companyId} from={from} to={to} />;
  return <ReturnRpt companyId={companyId} from={from} to={to} />;
}

function Card({
  title,
  count,
  exportRows,
  exportName,
  from,
  to,
  companyId,
  reportSlug,
  reportColumns,
  reportTotals,
  reportTitle,
  children,
}: {
  title: string;
  count?: number;
  exportRows?: any[];
  exportName?: string;
  from?: string;
  to?: string;
  companyId?: string;
  reportSlug?: string;
  reportColumns?: ReportColumn<any>[];
  reportTotals?: (string | number | null | undefined)[];
  reportTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-md">
      <div className="px-3 py-2 border-b flex justify-between items-center">
        <h3 className="text-sm font-semibold">
          {title}
          {count !== undefined && ` · ${count}`}
        </h3>
        {exportRows && exportName && (
          <div className="flex gap-2">
            {reportSlug && reportColumns && (
              <ReportExportButtons
                slug={reportSlug}
                getContext={() => ({
                  company: { name: null },
                  companyId: companyId ?? null,
                  title: reportTitle ?? title,
                  period: { from: from ?? null, to: to ?? null },
                  filters: { from: from ?? null, to: to ?? null },
                  columns: reportColumns,
                  rows: (exportRows ?? []).map((r) => ({
                    ...r,
                    company_id: companyId,
                  })),
                  totals: reportTotals,
                  signature: "Authorised Signatory",
                })}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCSV(exportName, exportRows, {
                  title,
                  slug: exportName,
                  from: from ?? null,
                  to: to ?? null,
                  filters: { from: from ?? null, to: to ?? null },
                })
              }
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
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

function SaleRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-sale", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id,invoice_no,invoice_date,total,paid,balance,status,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
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
  const saleColumns: ReportColumn<any>[] = [
    { header: "Invoice", accessor: (r) => r.Invoice ?? "" },
    { header: "Date", accessor: (r) => fmtDate(r.Date) },
    { header: "Customer", accessor: (r) => r.Customer ?? "—" },
    { header: "Total", align: "right", accessor: (r) => fmtAmount(r.Total) },
    { header: "Paid", align: "right", accessor: (r) => fmtAmount(r.Paid) },
    { header: "Balance", align: "right", accessor: (r) => fmtAmount(r.Balance) },
    { header: "Status", accessor: (r) => r.Status ?? "" },
  ];
  const exportRows = data.map((r) => ({
    Invoice: r.invoice_no,
    Date: r.invoice_date,
    Customer: r.parties?.name,
    Total: r.total,
    Paid: r.paid,
    Balance: r.balance,
    Status: r.status,
  }));
  return (
    <Card
      title="Sale Report"
      count={data.length}
      exportName="sale-report"
      from={from}
      to={to}
      companyId={companyId}
      reportSlug="sales-report"
      reportTitle="Sales Report"
      reportColumns={saleColumns}
      reportTotals={["Totals:", "", "", fmtAmount(total), fmtAmount(paid), fmtAmount(bal), ""]}
      exportRows={exportRows}
    >
      {isLoading ? (
        <Loading />
      ) : (
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
            {data.map((r) => {
              const t = resolveReportDrilldown({ kind: "sale_invoice", id: r.id });
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
                  <td className="font-mono text-xs">{r.invoice_no}</td>
                  <td>{r.invoice_date}</td>
                  <td className="font-medium">{r.parties?.name || "—"}</td>
                  <td className="text-right">{fmt(r.total)}</td>
                  <td className="text-right num-pos">{fmt(r.paid)}</td>
                  <td className="text-right num-neg">{fmt(r.balance)}</td>
                  <td className="capitalize">{r.status}</td>
                </tr>
              );
            })}
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
      )}
    </Card>
  );
}

function BillProfitRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-profit", companyId, from, to],
    queryFn: async () => {
      const { data: sales } = await (supabase as any)
        .from("sales")
        .select("id,invoice_no,invoice_date,total,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
        .gte("invoice_date", from)
        .lte("invoice_date", to);
      const ids = (sales || []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data: items } = await supabase
        .from("sale_items")
        .select("sale_id,qty,price,discount_pct,item_id")
        .in("sale_id", ids);
      const itemIds = Array.from(new Set((items || []).map((i: any) => i.item_id).filter(Boolean)));
      const { data: itemsCost } =
        itemIds.length > 0
          ? await supabase
              .from("items")
              .select("id,purchase_price")
              .is("deleted_at", null)
              .in("id", itemIds as string[])
          : { data: [] };
      const costMap: Record<string, number> = {};
      (itemsCost || []).forEach((i: any) => {
        costMap[i.id] = Number(i.purchase_price || 0);
      });
      const profitBySale: Record<string, { revenue: number; cogs: number }> = {};
      (items || []).forEach((it: any) => {
        const rev =
          Number(it.qty || 0) * Number(it.price || 0) * (1 - Number(it.discount_pct || 0) / 100);
        const cogs = Number(it.qty || 0) * (it.item_id ? costMap[it.item_id] || 0 : 0);
        if (!profitBySale[it.sale_id]) profitBySale[it.sale_id] = { revenue: 0, cogs: 0 };
        profitBySale[it.sale_id].revenue += rev;
        profitBySale[it.sale_id].cogs += cogs;
      });
      return (sales || []).map((s: any) => {
        const p = profitBySale[s.id] || { revenue: Number(s.total), cogs: 0 };
        return {
          id: s.id,
          invoice_no: s.invoice_no,
          invoice_date: s.invoice_date,
          customer: s.parties?.name || "—",
          revenue: p.revenue,
          cogs: p.cogs,
          profit: p.revenue - p.cogs,
          margin: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0,
        };
      });
    },
  });
  const rev = data.reduce((s: number, r: any) => s + r.revenue, 0);
  const cogs = data.reduce((s: number, r: any) => s + r.cogs, 0);
  const prof = rev - cogs;
  return (
    <Card
      title="Bill-wise Profit"
      count={data.length}
      exportName="bill-wise-profit"
      from={from}
      to={to}
      exportRows={data}
    >
      {isLoading ? (
        <Loading />
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">COGS</th>
              <th className="text-right">Profit</th>
              <th className="text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.invoice_no}</td>
                <td>{r.invoice_date}</td>
                <td className="font-medium">{r.customer}</td>
                <td className="text-right">{fmt(r.revenue)}</td>
                <td className="text-right">{fmt(r.cogs)}</td>
                <td className={`text-right font-semibold ${r.profit >= 0 ? "num-pos" : "num-neg"}`}>
                  {fmt(r.profit)}
                </td>
                <td className="text-right">{r.margin.toFixed(1)}%</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted-foreground py-6">
                  No data
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
                <td className="text-right">{fmt(rev)}</td>
                <td className="text-right">{fmt(cogs)}</td>
                <td className={`text-right ${prof >= 0 ? "num-pos" : "num-neg"}`}>{fmt(prof)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Card>
  );
}

function AgingRpt({ companyId }: { companyId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-aging", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id,invoice_no,invoice_date,due_date,total,balance,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
        .gt("balance", 0)
        .order("invoice_date", { ascending: true });
      if (error) throw error;
      const today = new Date();
      return (data || []).map((r: any) => {
        const ref = r.due_date ? new Date(r.due_date) : new Date(r.invoice_date);
        const days = Math.floor((today.getTime() - ref.getTime()) / 86400000);
        const bucket =
          days <= 0
            ? "Current"
            : days <= 30
              ? "0-30"
              : days <= 60
                ? "31-60"
                : days <= 90
                  ? "61-90"
                  : "90+";
        return { ...r, days, bucket };
      });
    },
  });
  const buckets = useMemo(() => {
    const acc: Record<string, number> = { Current: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    data.forEach((r: any) => {
      acc[r.bucket] = (acc[r.bucket] || 0) + Number(r.balance);
    });
    return acc;
  }, [data]);
  const totalOutstanding = data.reduce((s: number, r: any) => s + Number(r.balance), 0);
  return (
    <>
      <div className="text-xs text-muted-foreground mb-2">
        Aging is calculated as of today and ignores the period filter above.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {Object.entries(buckets).map(([k, v]) => (
          <div key={k} className="bg-card border rounded-md p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{k}</div>
            <div className="text-base font-bold mt-1">{fmt(v)}</div>
          </div>
        ))}
      </div>
      <Card
        title={`Sale Aging · Outstanding: ${fmt(totalOutstanding)}`}
        count={data.length}
        exportName="sale-aging"
        exportRows={data.map((r: any) => ({
          Invoice: r.invoice_no,
          Date: r.invoice_date,
          Due: r.due_date,
          Customer: r.parties?.name,
          Balance: r.balance,
          Days: r.days,
          Bucket: r.bucket,
        }))}
      >
        {isLoading ? (
          <Loading />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Due</th>
                <th>Customer</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Days</th>
                <th>Bucket</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.invoice_no}</td>
                  <td>{r.invoice_date}</td>
                  <td>{r.due_date || "—"}</td>
                  <td className="font-medium">{r.parties?.name || "—"}</td>
                  <td className="text-right num-neg font-semibold">{fmt(r.balance)}</td>
                  <td className="text-right">{r.days}</td>
                  <td>{r.bucket}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-6">
                    No outstanding invoices
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function PartyRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-party", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("party_id,total,balance,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
        .gte("invoice_date", from)
        .lte("invoice_date", to);
      if (error) throw error;
      const map: Record<string, { name: string; total: number; balance: number; count: number }> =
        {};
      (data || []).forEach((r: any) => {
        const k = r.party_id || "unknown";
        if (!map[k])
          map[k] = { name: r.parties?.name || "Walk-in", total: 0, balance: 0, count: 0 };
        map[k].total += Number(r.total || 0);
        map[k].balance += Number(r.balance || 0);
        map[k].count += 1;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    },
  });
  const total = data.reduce((s, r) => s + r.total, 0);
  const bal = data.reduce((s, r) => s + r.balance, 0);
  return (
    <Card
      title="Party-wise Sale"
      count={data.length}
      exportName="party-wise-sale"
      from={from}
      to={to}
      exportRows={data}
    >
      {isLoading ? (
        <Loading />
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="text-right">Invoices</th>
              <th className="text-right">Total Sale</th>
              <th className="text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.name}</td>
                <td className="text-right">{r.count}</td>
                <td className="text-right font-semibold">{fmt(r.total)}</td>
                <td className="text-right num-neg">{fmt(r.balance)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-6">
                  No data
                </td>
              </tr>
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td className="text-right">Totals:</td>
                <td></td>
                <td className="text-right">{fmt(total)}</td>
                <td className="text-right num-neg">{fmt(bal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Card>
  );
}

function PartyGroupRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-pg", companyId, from, to],
    queryFn: async () => {
      const { data: sales } = await (supabase as any)
        .from("sales")
        .select("party_id,total,balance")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
        .gte("invoice_date", from)
        .lte("invoice_date", to);
      const partyIds = Array.from(
        new Set((sales || []).map((s: any) => s.party_id).filter(Boolean)),
      );
      const { data: parties } =
        partyIds.length > 0
          ? await supabase
              .from("parties")
              .select("id,group_id")
              .is("deleted_at", null)
              .in("id", partyIds as string[])
          : { data: [] };
      const { data: groups } = await supabase
        .from("party_groups")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId);
      const partyGroup: Record<string, string | null> = {};
      (parties || []).forEach((p: any) => {
        partyGroup[p.id] = p.group_id;
      });
      const groupName: Record<string, string> = { _none: "Ungrouped" };
      (groups || []).forEach((g: any) => {
        groupName[g.id] = g.name;
      });
      const map: Record<string, { name: string; total: number; balance: number; count: number }> =
        {};
      (sales || []).forEach((s: any) => {
        const g = (s.party_id && partyGroup[s.party_id]) || "_none";
        if (!map[g]) map[g] = { name: groupName[g] || "Ungrouped", total: 0, balance: 0, count: 0 };
        map[g].total += Number(s.total || 0);
        map[g].balance += Number(s.balance || 0);
        map[g].count += 1;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    },
  });
  return (
    <Card
      title="Sale by Party Group"
      count={data.length}
      exportName="sale-party-group"
      from={from}
      to={to}
      exportRows={data}
    >
      {isLoading ? (
        <Loading />
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Group</th>
              <th className="text-right">Invoices</th>
              <th className="text-right">Total</th>
              <th className="text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.name}</td>
                <td className="text-right">{r.count}</td>
                <td className="text-right font-semibold">{fmt(r.total)}</td>
                <td className="text-right num-neg">{fmt(r.balance)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted-foreground py-6">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ItemRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-item", companyId, from, to],
    queryFn: async () => {
      const { data: sales } = await (supabase as any)
        .from("sales")
        .select("id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "invoice")
        .gte("invoice_date", from)
        .lte("invoice_date", to);
      const ids = (sales || []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data: items } = await supabase
        .from("sale_items")
        .select("item_id,item_name,qty,price,discount_pct")
        .in("sale_id", ids);
      const itemIds = Array.from(new Set((items || []).map((i: any) => i.item_id).filter(Boolean)));
      const { data: costRows } =
        itemIds.length > 0
          ? await supabase
              .from("items")
              .select("id,purchase_price")
              .is("deleted_at", null)
              .in("id", itemIds as string[])
          : { data: [] };
      const cost: Record<string, number> = {};
      (costRows || []).forEach((c: any) => {
        cost[c.id] = Number(c.purchase_price || 0);
      });
      const map: Record<string, { name: string; qty: number; revenue: number; cogs: number }> = {};
      (items || []).forEach((it: any) => {
        const k = it.item_id || it.item_name;
        if (!map[k]) map[k] = { name: it.item_name, qty: 0, revenue: 0, cogs: 0 };
        const rev =
          Number(it.qty || 0) * Number(it.price || 0) * (1 - Number(it.discount_pct || 0) / 100);
        map[k].qty += Number(it.qty || 0);
        map[k].revenue += rev;
        map[k].cogs += Number(it.qty || 0) * (it.item_id ? cost[it.item_id] || 0 : 0);
      });
      return Object.values(map)
        .map((r) => ({ ...r, profit: r.revenue - r.cogs }))
        .sort((a, b) => b.revenue - a.revenue);
    },
  });
  return (
    <Card
      title="Item-wise Sale"
      count={data.length}
      exportName="item-wise-sale"
      exportRows={data}
      from={from}
      to={to}
    >
      {isLoading ? (
        <Loading />
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">COGS</th>
              <th className="text-right">Profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td className="font-medium">{r.name}</td>
                <td className="text-right">{r.qty}</td>
                <td className="text-right">{fmt(r.revenue)}</td>
                <td className="text-right">{fmt(r.cogs)}</td>
                <td className={`text-right font-semibold ${r.profit >= 0 ? "num-pos" : "num-neg"}`}>
                  {fmt(r.profit)}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-6">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ReturnRpt({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["sr-return", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id,invoice_no,invoice_date,total,reference_sale_id,parties(name)")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("doc_type", "credit_note")
        .gte("invoice_date", from)
        .lte("invoice_date", to)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const total = data.reduce((s, r) => s + Number(r.total || 0), 0);
  return (
    <Card
      title="Sale Return Report"
      count={data.length}
      exportName="sale-returns"
      from={from}
      to={to}
      exportRows={data.map((r) => ({
        "Credit Note": r.invoice_no,
        Date: r.invoice_date,
        Customer: r.parties?.name,
        Amount: r.total,
        "Linked Invoice": r.reference_sale_id,
      }))}
    >
      {isLoading ? (
        <Loading />
      ) : (
        <table className="erp-table">
          <thead>
            <tr>
              <th>Credit Note</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Linked Invoice</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.invoice_no}</td>
                <td>{r.invoice_date}</td>
                <td className="font-medium">{r.parties?.name || "—"}</td>
                <td className="text-muted-foreground text-xs">
                  {r.reference_sale_id ? "Linked" : "Standalone"}
                </td>
                <td className="text-right num-neg font-semibold">{fmt(r.total)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-6">
                  No returns in this period
                </td>
              </tr>
            )}
          </tbody>
          {data.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={4} className="text-right">
                  Total:
                </td>
                <td className="text-right num-neg">{fmt(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </Card>
  );
}
