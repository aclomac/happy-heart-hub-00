import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { StatusBadge } from "@/components/erp/StatusBadge";
import { DashboardSubscriptionCard } from "@/components/erp/DashboardSubscriptionCard";
import { LowStockAlerts } from "@/components/erp/dashboard/LowStockAlerts";
import { loadInventoryDashboard } from "@/lib/inventory-stats";
import { Warehouse, ArrowRightLeft } from "lucide-react";

import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { MoneyText } from "@/components/erp/MoneyText";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  Bell,
  Plus,
  ShoppingCart,
  FileMinus,
  Users,
  Package,
  Wallet,
  TrendingUp,
  Receipt,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { isDemoMode, getDemoDashboardData } from "@/lib/demo/localStore";


import { useSubscription, planAllowsModule } from "@/lib/use-subscription";
import { Lock, Crown } from "lucide-react";

export const Route = createFileRoute("/app/")({ component: Dashboard });

function PayrollDashboardLock() {
  const { data: sub } = useSubscription();
  if (!sub || planAllowsModule(sub.plan, "payroll") || sub.isExpired) return null;
  return (
    <div className="mb-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow">
          <Lock className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-semibold text-amber-900">
            Payroll, Employees & Attendance are locked
          </div>
          <div className="text-xs text-amber-800">
            Upgrade to Gold to unlock HR features and multi-device access.
          </div>
        </div>
      </div>
      <Link to="/app/upgrade/$plan" params={{ plan: "gold" }}>
        <Button size="sm" className="bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90">
          <Crown className="w-4 h-4" />
          Upgrade Plan
        </Button>
      </Link>
    </div>
  );
}

function toneColor(t?: string) {
  return t === "success"
    ? "var(--color-success)"
    : t === "sale"
      ? "var(--color-sale)"
      : t === "warning"
        ? "var(--color-utility)"
        : "var(--color-foreground)";
}

function Dashboard() {
  const companyId = useCurrentCompanyId();
  const { t } = useI18n();


  const invQ = useQuery({
    queryKey: ["dashboard-inventory", companyId],
    enabled: !!companyId,
    retry: false,
    queryFn: async () => {
      try {
        return await loadInventoryDashboard(companyId!);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[dashboard-inventory] empty fallback:", err);
        return {
          items: [],
          warehouses: [],
          storeStock: [],
          adjustments: [],
          transfers: [],
          totals: { stockValue: 0, totalItems: 0, lowStock: 0, outOfStock: 0, warehouses: 0 },
        };
      }
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", companyId],
    enabled: !!companyId,
    retry: false,
    queryFn: async () => {
      const cid = companyId!;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const ninthMonthAgo = new Date(now.getFullYear(), now.getMonth() - 8, 1)
        .toISOString()
        .slice(0, 10);

      // Empty-safe shape returned whenever the backend is unreachable
      // (demo mode / Supabase down). Dashboard renders cleanly with zeros.
      const emptyMonths = (() => {
        const months: Record<string, { m: string; sale: number; purchase: number; otherIncome: number }> = {};
        for (let i = 8; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          months[key] = { m: d.toLocaleString("en", { month: "short" }), sale: 0, purchase: 0, otherIncome: 0 };
        }
        return months;
      })();
      const emptyResult = {
        todaySales: 0,
        monthSales: 0,
        monthPurchases: 0,
        receivables: 0,
        payables: 0,
        monthExpenses: 0,
        monthOtherIncome: 0,
        itemCount: 0,
        partyCount: 0,
        lowStock: [] as { id: string; name: string; stock: number; low_stock_alert: number | null; is_service: boolean }[],
        topReceivables: [] as { id: string; name: string; balance: number }[],
        chart: Object.values(emptyMonths),
        recent: [] as {
          id: string;
          invoice_no: string;
          invoice_date: string;
          total: number;
          balance: number;
          status: string;
          parties: { name: string } | null;
        }[],
      };

      try {
        const [salesRes, purchasesRes, itemsRes, partiesRes, expRes, recentRes, oiRes] = await Promise.all([
          supabase
            .from("sales")
            .select("invoice_date,total,paid,balance")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .gte("invoice_date", ninthMonthAgo),
          supabase
            .from("purchases")
            .select("bill_date,total,paid,balance")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .eq("doc_type", "bill")
            .gte("bill_date", ninthMonthAgo),
          supabase
            .from("items")
            .select("id,name,stock,low_stock_alert,is_service")
            .is("deleted_at", null)
            .eq("company_id", cid),
          supabase
            .from("parties")
            .select("id,name,balance")
            .is("deleted_at", null)
            .eq("company_id", cid),
          supabase
            .from("expenses")
            .select("amount,tax")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .gte("expense_date", monthStart),
          supabase
            .from("sales")
            .select("id,invoice_no,invoice_date,total,balance,status,parties(name)")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .order("invoice_date", { ascending: false })
            .limit(6),
          supabase
            .from("other_incomes")
            .select("income_date,total:amount")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .gte("income_date", ninthMonthAgo),
        ]);

        // Soft-fail: ignore per-query errors and treat as empty arrays.
        const sales = (salesRes.data || []) as {
          invoice_date: string; total: number; paid: number; balance: number;
        }[];
        const purchases = (purchasesRes.data || []) as {
          bill_date: string; total: number; paid: number; balance: number;
        }[];
        const items = (itemsRes.data || []) as {
          id: string; name: string; stock: number; low_stock_alert: number | null; is_service: boolean;
        }[];
        const parties = (partiesRes.data || []) as { id: string; name: string; balance: number }[];
        const expenses = (expRes.data || []) as { amount: number; tax: number | null }[];
        const otherIncomes = (oiRes?.data || []) as { income_date: string; total: number }[];
        const recent = (recentRes.data || []) as typeof emptyResult.recent;

        const months = { ...emptyMonths };
        sales.forEach((s) => {
          const k = s.invoice_date.slice(0, 7);
          if (months[k]) months[k].sale += Number(s.total);
        });
        purchases.forEach((p) => {
          const k = p.bill_date.slice(0, 7);
          if (months[k]) months[k].purchase += Number(p.total);
        });
        otherIncomes.forEach((oi) => {
          const k = oi.income_date.slice(0, 7);
          if (months[k]) months[k].otherIncome += Number(oi.total);
        });

        const todayStr = now.toISOString().slice(0, 10);
        const monthKey = todayStr.slice(0, 7);

        return {
          todaySales: sales.filter((s) => s.invoice_date === todayStr).reduce((a, s) => a + Number(s.total), 0),
          monthSales: sales.filter((s) => s.invoice_date.slice(0, 7) === monthKey).reduce((a, s) => a + Number(s.total), 0),
          monthPurchases: purchases.filter((p) => p.bill_date.slice(0, 7) === monthKey).reduce((a, p) => a + Number(p.total), 0),
          receivables: sales.reduce((a, s) => a + Number(s.balance), 0),
          payables: purchases.reduce((a, p) => a + Number(p.balance), 0),
          monthExpenses: expenses.reduce((a, e) => a + Number(e.amount) + Number(e.tax || 0), 0),
          monthOtherIncome: otherIncomes.filter((oi) => oi.income_date.slice(0, 7) === monthKey).reduce((a, oi) => a + Number(oi.total), 0),
          itemCount: items.length,
          partyCount: parties.length,
          lowStock: items.filter(
            (i) => !i.is_service && i.low_stock_alert != null && Number(i.stock) <= Number(i.low_stock_alert),
          ),
          topReceivables: parties
            .filter((p) => Number(p.balance) > 0)
            .sort((a, b) => Number(b.balance) - Number(a.balance))
            .slice(0, 6),
          chart: Object.values(months),
          recent,
        };
      } catch (err) {
        // Backend unreachable (demo mode, network, RLS) — render empty dashboard
        // instead of surfacing a destructive error toast.
        if (import.meta.env.DEV) console.warn("[dashboard] using empty fallback:", err);
        return emptyResult;
      }
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title="Dashboard" />
        <NoCompanySelected />
      </div>
    );

  const quickActions = [
    { label: "Add Sale", icon: ShoppingCart, to: "/app/sales/new", variant: "sale" as const },
    {
      label: "Add Purchase",
      icon: FileMinus,
      to: "/app/purchases/new",
      variant: "default" as const,
    },
    { label: "Add Party", icon: Users, to: "/app/parties", variant: "outline" as const },
    { label: "Add Item", icon: Package, to: "/app/items", variant: "outline" as const },
    { label: "Add Expense", icon: Wallet, to: "/app/cash", variant: "outline" as const },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Live business overview"
        actions={
          <Button variant="sale" size="sm" asChild>
            <Link to="/app/sales/new" aria-label="New Sale">
              <Plus className="w-4 h-4" />
              New Sale
            </Link>
          </Button>
        }
      />

      <DashboardSubscriptionCard />

      <PayrollDashboardLock />

      {isLoading || !data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-card border rounded-lg p-4 animate-pulse"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="h-3 w-20 bg-muted rounded mb-3" />
                <div className="h-6 w-24 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="bg-card border rounded-md">
            <TableSkeleton rows={5} cols={5} />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              {
                label: "Today's Sales",
                value: <MoneyText value={`৳ ${data.todaySales.toLocaleString()}`} />,
                tone: "success" as const,
                icon: TrendingUp,
              },
              {
                label: "Month Sales",
                value: <MoneyText value={`৳ ${data.monthSales.toLocaleString()}`} />,
                tone: "primary" as const,
                icon: ShoppingCart,
              },
              {
                label: "Month Other Income",
                value: <MoneyText value={`৳ ${data.monthOtherIncome.toLocaleString()}`} />,
                tone: "success" as const,
                icon: TrendingUp,
              },
              {
                label: "Receivables",
                value: <MoneyText value={`৳ ${data.receivables.toLocaleString()}`} />,
                tone: "warning" as const,
                icon: Receipt,
              },
              {
                label: "Payables",
                value: <MoneyText value={`৳ ${data.payables.toLocaleString()}`} />,
                tone: "sale" as const,
                icon: FileMinus,
              },
              {
                label: "Month Expenses",
                value: <MoneyText value={`৳ ${data.monthExpenses.toLocaleString()}`} />,
                tone: "warning" as const,
                icon: Wallet,
              },
              {
                label: "Low Stock",
                value: String(data.lowStock.length),
                tone: (data.lowStock.length ? "sale" : "muted") as "sale" | "muted",
                icon: data.lowStock.length ? AlertCircle : Package,
              },
              ].map((k) => {
              const toneMap = {
                success: "text-success bg-success/10",
                sale: "text-sale bg-sale/10",
                warning: "text-utility bg-utility/10",
                primary: "text-primary bg-primary/10",
                muted: "text-foreground bg-muted",
              } as const;
              const cls = toneMap[k.tone];
              const [textCls, bgCls] = cls.split(" ");
              return (
                <div
                  key={k.label}
                  className="relative bg-card border rounded-lg px-4 py-3 overflow-hidden transition-all hover:-translate-y-0.5"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${textCls.replace("text-", "bg-")} opacity-70`}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-muted-foreground uppercase tracking-wide truncate font-medium">
                        {k.label}
                      </div>
                      <div className={`text-lg font-semibold mt-1 ${textCls} truncate`}>
                        {k.value}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 w-9 h-9 rounded-md ${bgCls} flex items-center justify-center`}
                    >
                      <k.icon className={`w-4 h-4 ${textCls}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {invQ.data && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
              {[
                {
                  label: "Stock Value",
                  value: `৳ ${Math.round(invQ.data.totals.stockValue).toLocaleString()}`,
                  tone: "primary" as const,
                  icon: Package,
                },
                {
                  label: "Total Items",
                  value: String(invQ.data.totals.totalItems),
                  tone: "success" as const,
                  icon: Package,
                },
                {
                  label: "Low Stock",
                  value: String(invQ.data.totals.lowStock),
                  tone: (invQ.data.totals.lowStock ? "warning" : "muted") as "warning" | "muted",
                  icon: AlertTriangle,
                },
                {
                  label: "Out of Stock",
                  value: String(invQ.data.totals.outOfStock),
                  tone: (invQ.data.totals.outOfStock ? "sale" : "muted") as "sale" | "muted",
                  icon: AlertCircle,
                },
                {
                  label: "Warehouses",
                  value: String(invQ.data.totals.warehouses),
                  tone: "primary" as const,
                  icon: Warehouse,
                },
                {
                  label: "Recent Transfers",
                  value: String(invQ.data.transfers.length),
                  tone: "primary" as const,
                  icon: ArrowRightLeft,
                },
              ].map((k) => {
                const toneMap = {
                  success: "text-success bg-success/10",
                  sale: "text-sale bg-sale/10",
                  warning: "text-utility bg-utility/10",
                  primary: "text-primary bg-primary/10",
                  muted: "text-foreground bg-muted",
                } as const;
                const cls = toneMap[k.tone];
                const [textCls, bgCls] = cls.split(" ");
                return (
                  <div
                    key={k.label}
                    className="relative bg-card border rounded-lg px-4 py-3 overflow-hidden"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${textCls.replace("text-", "bg-")} opacity-70`}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide truncate font-medium">
                          {k.label}
                        </div>
                        <div className={`text-lg font-semibold mt-1 ${textCls} truncate`}>
                          {k.value}
                        </div>
                      </div>
                      <div
                        className={`shrink-0 w-9 h-9 rounded-md ${bgCls} flex items-center justify-center`}
                      >
                        <k.icon className={`w-4 h-4 ${textCls}`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {companyId && (
            <div className="mb-4">
              <LowStockAlerts companyId={companyId} />
            </div>
          )}


          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">

            <div className="lg:col-span-2 bg-card border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold text-sm">Sales vs Purchase</h2>
                <span className="text-xs text-muted-foreground">Last 9 months</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data.chart}>
                  <defs>
                    <linearGradient id="gs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-utility)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-utility)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="sale"
                    stroke="var(--color-primary)"
                    fill="url(#gs)"
                    name="Sales"
                  />
                  <Area
                    type="monotone"
                    dataKey="purchase"
                    stroke="var(--color-utility)"
                    fill="url(#gp)"
                    name="Purchase"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border rounded-md p-4">
              <h2 className="font-semibold text-sm mb-2">Monthly Profit</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.chart.map((s) => ({ m: s.m, profit: (s.sale + s.otherIncome) - (s.purchase) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="m" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="profit" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            <div className="lg:col-span-2 bg-card border rounded-md p-4">
              <h2 className="font-semibold text-sm mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {quickActions.map((q) => (
                  <Button
                    key={q.label}
                    variant={q.variant}
                    size="sm"
                    className="justify-start w-full"
                    asChild
                  >
                    <Link to={q.to}>
                      <q.icon className="w-4 h-4" />
                      {q.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
            <div className="bg-card border rounded-md p-4">
              <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Alerts
              </h2>
              <ul className="space-y-2">
                {data.lowStock.length > 0 && (
                  <li className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: toneColor("sale") }}
                    />
                    <span>
                      Low stock on {data.lowStock.length} item{data.lowStock.length > 1 ? "s" : ""}{" "}
                      — reorder recommended
                    </span>
                  </li>
                )}
                {data.receivables > 0 && (
                  <li className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: toneColor("warning") }}
                    />
                    <span>
                      Outstanding receivables:{" "}
                      <MoneyText value={`৳ ${data.receivables.toLocaleString()}`} />
                    </span>
                  </li>
                )}
                {data.payables > 0 && (
                  <li className="flex items-start gap-2 text-xs">
                    <AlertTriangle
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: toneColor("warning") }}
                    />
                    <span>
                      Outstanding payables:{" "}
                      <MoneyText value={`৳ ${data.payables.toLocaleString()}`} />
                    </span>
                  </li>
                )}
                {data.lowStock.length === 0 && data.receivables === 0 && data.payables === 0 && (
                  <li className="text-xs text-muted-foreground">All clear. No active alerts.</li>
                )}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-card border rounded-md">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="font-semibold text-sm">Recent Invoices</h2>
                <Link to="/app/sales" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              {data.recent.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No invoices yet.
                </div>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Party</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id}>
                        <td className="text-muted-foreground">{r.invoice_date}</td>
                        <td className="font-medium">{r.invoice_no}</td>
                        <td>{r.parties?.name || "—"}</td>
                        <td className="text-right num-pos font-semibold">
                          <MoneyText value={`৳ ${Number(r.total).toLocaleString()}`} />
                        </td>
                        <td>
                          <StatusBadge status={Number(r.balance) <= 0 ? "Paid" : "Unpaid"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-card border rounded-md">
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold text-sm">Top Receivables</h2>
              </div>
              {data.topReceivables.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No outstanding balances.
                </div>
              ) : (
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReceivables.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="text-right num-pos font-semibold">
                          <MoneyText value={`৳ ${Number(p.balance).toLocaleString()}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
