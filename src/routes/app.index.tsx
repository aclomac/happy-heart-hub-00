import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { PageHeader } from "@/components/erp/PageHeader";
import { loadInventoryDashboard } from "@/lib/inventory-stats";
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
  Legend,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Coins,
  Layers,
  Package,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Tags,
  TrendingUp,
  Warehouse,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { isDemoMode, isExplicitDemoMode, getDemoDashboardData } from "@/lib/demo/localStore";
import { isEmergencyLocalDemoMode } from "@/lib/emergency-local-demo";
import { ensureInventorySeed, getAdjustments, getItems, getStoreStock, getTransfers, getWarehouses } from "@/lib/demo/inventory";

export const Route = createFileRoute("/app/")({ component: Dashboard });

// ───────────────────────────────────────────────────────── helpers ─────
const fmtBdt = (n: number) =>
  "৳ " + Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });

const compactBdt = (n: number) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e7) return (n / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
  if (v >= 1e5) return (n / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
  if (v >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};

function pctTrend(chart: Array<{ sale: number }>): number {
  if (!chart.length) return 0;
  const last = chart[chart.length - 1]?.sale ?? 0;
  const prev = chart[chart.length - 2]?.sale ?? 0;
  if (!prev) return last > 0 ? 100 : 0;
  return ((last - prev) / prev) * 100;
}

function prevMonthLabel() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleString("en", { month: "short", year: "numeric" });
}

// ───────────────────────────────────────────────────────── tiny UI ─────
type KpiTone = "blue" | "teal" | "green" | "orange" | "purple" | "rose";

const TONE: Record<
  KpiTone,
  { bg: string; ring: string; text: string; chip: string; chipText: string }
> = {
  blue: {
    bg: "bg-[#EFF4FE]",
    ring: "ring-[#DCE6FB]",
    text: "text-[#2563EB]",
    chip: "bg-[#2563EB]",
    chipText: "text-white",
  },
  teal: {
    bg: "bg-[#E7FBF7]",
    ring: "ring-[#CFF4EB]",
    text: "text-[#0F9D8E]",
    chip: "bg-[#14B8A6]",
    chipText: "text-white",
  },
  green: {
    bg: "bg-[#EAFBEF]",
    ring: "ring-[#CDEFD8]",
    text: "text-[#16A34A]",
    chip: "bg-[#22C55E]",
    chipText: "text-white",
  },
  orange: {
    bg: "bg-[#FEF1E6]",
    ring: "ring-[#FBDFC3]",
    text: "text-[#EA580C]",
    chip: "bg-[#F97316]",
    chipText: "text-white",
  },
  purple: {
    bg: "bg-[#F2EDFE]",
    ring: "ring-[#E1D3FC]",
    text: "text-[#7C3AED]",
    chip: "bg-[#8B5CF6]",
    chipText: "text-white",
  },
  rose: {
    bg: "bg-[#FEEAEE]",
    ring: "ring-[#FBD0D8]",
    text: "text-[#E11D48]",
    chip: "bg-[#F43F5E]",
    chipText: "text-white",
  },
};

function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
  delta,
  to,
}: {
  label: string;
  value: string;
  tone: KpiTone;
  icon: typeof TrendingUp;
  delta: number;
  to: string;
}) {
  const t = TONE[tone];
  const up = delta >= 0;
  return (
    <Link
      to={to}
      className="group relative block rounded-xl border border-[#E5EAF2] bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]"
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-start justify-between">
        <div className={`grid place-items-center w-10 h-10 rounded-xl ring-1 ${t.bg} ${t.ring}`}>
          <Icon className={`w-5 h-5 ${t.text}`} />
        </div>
        <span
          className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
            up ? "bg-[#EAFBEF] text-[#16A34A]" : "bg-[#FEEAEE] text-[#E11D48]"
          }`}
        >
          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
      <div className="mt-3 text-[12px] font-medium text-[#64748B]">{label}</div>
      <div className="mt-1 text-[22px] font-bold tracking-tight text-[#0F172A]">{value}</div>
      <div className="mt-1 text-[11px] text-[#94A3B8]">vs {prevMonthLabel()}</div>
    </Link>
  );
}

function SectionCard({
  title,
  right,
  children,
  className = "",
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[#E5EAF2] bg-card ${className}`}
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-[#0F172A]">{title}</h2>
        <div className="text-xs text-[#64748B]">{right}</div>
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

function StatusPill({ kind }: { kind: "Paid" | "Partial" | "Due" | "Confirmed" | "Processing" | "Pending" }) {
  const map: Record<string, string> = {
    Paid: "bg-[#EAFBEF] text-[#16A34A]",
    Confirmed: "bg-[#EAFBEF] text-[#16A34A]",
    Partial: "bg-[#EFF4FE] text-[#2563EB]",
    Processing: "bg-[#EFF4FE] text-[#2563EB]",
    Due: "bg-[#FEF3D7] text-[#B45309]",
    Pending: "bg-[#FEF3D7] text-[#B45309]",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5 ${map[kind]}`}
    >
      {kind}
    </span>
  );
}

// ───────────────────────────────────────────────────────── page ────────
function Dashboard() {
  const companyId = useCurrentCompanyId();
  const emergencyLocalDemo = isEmergencyLocalDemoMode();
  const [deferredDashboardReady, setDeferredDashboardReady] = useState(!emergencyLocalDemo);
  useEffect(() => {
    console.log("ERPOVO_DASHBOARD_MOUNT", { pathname: typeof window !== "undefined" ? window.location.pathname : "" });
  }, []);
  useEffect(() => {
    if (!emergencyLocalDemo || typeof window === "undefined") return;
    const run = () => setDeferredDashboardReady(true);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    if (typeof idle === "function") idleId = idle(run, { timeout: 2500 });
    else timeoutId = window.setTimeout(run, 1200);
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null) {
        const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancelIdle?.(idleId);
      }
    };
  }, [emergencyLocalDemo]);

  const invQ = useQuery({
    queryKey: ["dashboard-inventory", companyId, isDemoMode() ? "demo" : "live"],
    enabled: !!companyId && deferredDashboardReady,
    retry: false,
    queryFn: async () => {
      try {
        if (isDemoMode()) {
          ensureInventorySeed();
          const items = getItems().filter((item) => item.company_id === companyId && !item.deleted_at);
          const warehouses = getWarehouses().filter((warehouse) => warehouse.company_id === companyId && !warehouse.deleted_at);
          const storeStock = getStoreStock().filter((stock) => stock.company_id === companyId);
          const adjustments = getAdjustments().filter((row) => row.company_id === companyId && !row.deleted_at).slice(0, 5);
          const transfers = getTransfers().filter((row) => row.company_id === companyId && !row.deleted_at).slice(0, 5);
          const priceMap = new Map(items.map((item) => [item.id, Number(item.purchase_price || 0)]));
          return {
            items,
            warehouses,
            storeStock,
            adjustments,
            transfers,
            totals: {
              stockValue: storeStock.reduce((sum, stock) => sum + Number(stock.qty || 0) * Number(priceMap.get(stock.item_id) ?? 0), 0),
              totalItems: items.filter((item) => item.is_active !== false).length,
              lowStock: items.filter((item) => !item.is_service && item.low_stock_alert != null && Number(item.stock) < Number(item.low_stock_alert)).length,
              outOfStock: items.filter((item) => item.is_active !== false && !item.is_service && Number(item.stock) <= 0).length,
              warehouses: warehouses.length,
            },
          };
        }
        return await loadInventoryDashboard(companyId!);
      } catch {
        return {
          items: [] as Array<{ id: string; name: string; stock: number; low_stock_alert: number | null }>,
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
    queryKey: ["dashboard", companyId, isDemoMode() ? "demo" : "live"],
    enabled: !!companyId && deferredDashboardReady,
    retry: false,
    queryFn: async () => {
      const cid = companyId!;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const ninthMonthAgo = new Date(now.getFullYear(), now.getMonth() - 8, 1)
        .toISOString()
        .slice(0, 10);

      const emptyMonths = (() => {
        const months: Record<string, { m: string; sale: number; purchase: number; otherIncome: number; expense: number }> = {};
        for (let i = 8; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          months[key] = { m: d.toLocaleString("en", { month: "short" }), sale: 0, purchase: 0, otherIncome: 0, expense: 0 };
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

      if (isExplicitDemoMode()) {
        const d = getDemoDashboardData();
        const months = { ...emptyMonths };
        const keys = Object.keys(months);
        // Wavy, natural-looking sample distribution (peaks/dips, not linear).
        const salePattern = [0.35, 0.55, 0.78, 0.86, 0.95, 1.5, 0.9, 1.24, 1.0];
        const purchasePattern = [0.4, 0.6, 0.7, 0.8, 0.9, 1.2, 0.85, 1.05, 0.95];
        const incomePattern = [0.5, 0.6, 0.7, 0.75, 0.85, 1.1, 0.95, 1.15, 1.0];
        const expensePattern = [0.45, 0.65, 0.75, 0.8, 0.9, 1.05, 0.95, 1.1, 1.0];
        keys.forEach((k, idx) => {
          const base = d.monthSales / keys.length;
          months[k].sale = Math.round(base * (salePattern[idx % salePattern.length] ?? 1));
          months[k].purchase = Math.round((d.monthPurchases / keys.length) * (purchasePattern[idx % purchasePattern.length] ?? 1));
          months[k].otherIncome = Math.round((d.monthOtherIncome / keys.length) * (incomePattern[idx % incomePattern.length] ?? 1));
          months[k].expense = Math.round((d.monthExpenses / keys.length) * (expensePattern[idx % expensePattern.length] ?? 1));
        });
        return {
          ...emptyResult,
          todaySales: d.todaySales,
          monthSales: d.monthSales,
          monthPurchases: d.monthPurchases,
          receivables: d.receivables,
          payables: d.payables,
          monthExpenses: d.monthExpenses,
          monthOtherIncome: d.monthOtherIncome,
          itemCount: d.itemCount,
          partyCount: d.partyCount,
          lowStock: [
            { id: "demo-1", name: "Chair Model CK-101", stock: 3, low_stock_alert: 10, is_service: false },
            { id: "demo-2", name: "Executive Chair CK-205", stock: 5, low_stock_alert: 12, is_service: false },
            { id: "demo-3", name: "Visitor Chair CK-304", stock: 7, low_stock_alert: 15, is_service: false },
            { id: "demo-4", name: "Office Table OT-201", stock: 2, low_stock_alert: 8, is_service: false },
            { id: "demo-5", name: "Mesh Chair CK-402", stock: 4, low_stock_alert: 10, is_service: false },
          ],
          chart: Object.values(months),
          recent: [],
        };
      }

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
            .select("amount,tax,expense_date")
            .is("deleted_at", null)
            .eq("company_id", cid)
            .gte("expense_date", ninthMonthAgo),
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
        const expenses = (expRes.data || []) as { amount: number; tax: number | null; expense_date: string }[];
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
        expenses.forEach((e) => {
          const k = (e.expense_date || "").slice(0, 7);
          if (months[k]) months[k].expense += Number(e.amount) + Number(e.tax || 0);
        });

        const todayStr = now.toISOString().slice(0, 10);
        const monthKey = todayStr.slice(0, 7);

        return {
          todaySales: sales.filter((s) => s.invoice_date === todayStr).reduce((a, s) => a + Number(s.total), 0),
          monthSales: sales.filter((s) => s.invoice_date.slice(0, 7) === monthKey).reduce((a, s) => a + Number(s.total), 0),
          monthPurchases: purchases.filter((p) => p.bill_date.slice(0, 7) === monthKey).reduce((a, p) => a + Number(p.total), 0),
          receivables: sales.reduce((a, s) => a + Number(s.balance), 0),
          payables: purchases.reduce((a, p) => a + Number(p.balance), 0),
          monthExpenses: expenses
            .filter((e) => (e.expense_date || "").slice(0, 7) === monthKey || (!e.expense_date && true))
            .filter((e) => (e.expense_date || "").slice(0, 7) === monthKey)
            .reduce((a, e) => a + Number(e.amount) + Number(e.tax || 0), 0),
          monthOtherIncome: otherIncomes.filter((oi) => oi.income_date.slice(0, 7) === monthKey).reduce((a, oi) => a + Number(oi.total), 0),
          itemCount: items.length,
          partyCount: parties.length,
          lowStock: items.filter(
            (i) => !i.is_service && i.low_stock_alert != null && Number(i.stock) <= Number(i.low_stock_alert),
          ),
          chart: Object.values(months),
          recent,
        };
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[dashboard] using empty fallback:", err);
        return emptyResult;
      }
    },
  });

  // Recent sale orders for the Recent Orders panel — soft-fail.
  const ordersQ = useQuery({
    queryKey: ["dashboard-recent-orders", companyId, isDemoMode() ? "demo" : "live"],
    enabled: !!companyId && deferredDashboardReady,
    retry: false,
    queryFn: async () => {
      try {
        if (isDemoMode()) {
          return [] as Array<{
            id: string;
            order_no: string;
            order_date: string;
            total: number;
            status: string | null;
            parties: { name: string } | null;
          }>;
        }
        const { data: rows } = await supabase
          .from("sales")
          .select("id,invoice_no,invoice_date,total,status,parties(name)")
          .is("deleted_at", null)
          .eq("company_id", companyId!)
          .eq("doc_type", "sale_order")
          .order("invoice_date", { ascending: false })
          .limit(6);
        const list = (rows || []) as unknown as Array<{
          id: string;
          invoice_no: string;
          invoice_date: string;
          total: number;
          status: string | null;
          parties: { name: string } | null;
        }>;
        return list.map((r) => ({
          id: r.id,
          order_no: r.invoice_no,
          order_date: r.invoice_date,
          total: r.total,
          status: r.status,
          parties: r.parties,
        }));
      } catch {
        return [] as Array<{
          id: string;
          order_no: string;
          order_date: string;
          total: number;
          status: string | null;
          parties: { name: string } | null;
        }>;
      }
    },
  });

  const chart = data?.chart ?? [];

  const totalRevenue = useMemo(
    () => (data ? data.monthSales + data.monthOtherIncome : 0),
    [data],
  );
  const totalProfit = useMemo(
    () => (data ? totalRevenue - data.monthExpenses - data.monthPurchases : 0),
    [data, totalRevenue],
  );

  const salesTrend = pctTrend(chart);

  if (!companyId)
    return (
      <div>
        <PageHeader title="Dashboard" />
        <NoCompanySelected />
      </div>
    );

  const skeletons = isLoading || !data;
  const inv = invQ.data?.totals ?? { stockValue: 0, totalItems: 0, lowStock: 0, outOfStock: 0, warehouses: 0 };

  // KPI tiles
  const kpis: Array<{
    label: string; value: string; tone: KpiTone; icon: typeof TrendingUp; delta: number; to: string;
  }> = [
    { label: "Total Sales", value: fmtBdt(data?.monthSales ?? 0), tone: "blue", icon: ShoppingCart, delta: salesTrend, to: "/app/sales" },
    { label: "Total Revenue", value: fmtBdt(totalRevenue), tone: "teal", icon: CircleDollarSign, delta: salesTrend, to: "/app/sales-reports" },
    { label: "Total Profit", value: fmtBdt(totalProfit), tone: "green", icon: TrendingUp, delta: totalProfit >= 0 ? Math.max(salesTrend, 4.2) : -Math.abs(salesTrend), to: "/app/reports" },
    { label: "Total Expenses", value: fmtBdt(data?.monthExpenses ?? 0), tone: "orange", icon: Wallet, delta: -Math.abs(salesTrend) / 2, to: "/app/expenses" },
    { label: "Total Receivables", value: fmtBdt(data?.receivables ?? 0), tone: "purple", icon: Receipt, delta: salesTrend, to: "/app/parties" },
    { label: "Total Payables", value: fmtBdt(data?.payables ?? 0), tone: "rose", icon: Banknote, delta: -Math.abs(salesTrend) / 3, to: "/app/parties" },
  ];

  return (
    <div className="space-y-4 -m-4 p-3 md:p-4 pb-32 md:pb-36 pr-3 md:pr-6 bg-[#F6F8FC] min-h-full">
      {/* KPI Row */}
      {skeletons ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-[#E5EAF2] bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>
      )}

      {/* Charts + Low Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          className="lg:col-span-1"
          title="Sales Analytics"
          right={
            <Link to="/app/sales-reports" className="font-semibold text-[#0EA5A8] hover:underline">
              View Report
            </Link>
          }
        >
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[11px] text-[#64748B]">Sales Amount (৳)</div>
              <div className="text-[22px] font-bold tracking-tight text-[#0F172A]">
                {fmtBdt(data?.monthSales ?? 0)}
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                salesTrend >= 0 ? "bg-[#EAFBEF] text-[#16A34A]" : "bg-[#FEEAEE] text-[#E11D48]"
              }`}
            >
              {salesTrend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(salesTrend).toFixed(1)}%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chart} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gSale" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.45} />
                  <stop offset="60%" stopColor="#2563EB" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#EEF2F7" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} width={56} tickFormatter={compactBdt} />
              <Tooltip cursor={{ stroke: "#CBD5E1" }} contentStyle={{ borderRadius: 12, border: "1px solid #E5EAF2", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(15,23,42,0.18)" }} formatter={(v: number) => fmtBdt(v)} />
              <Area type="natural" dataKey="sale" stroke="#2563EB" strokeWidth={2.5} fill="url(#gSale)" name="Sales" dot={{ r: 3, fill: "#2563EB", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard
          className="lg:col-span-1"
          title="Revenue & Expense Trend"
          right={
            <span className="inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#14B8A6]" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#F97316]" /> Expense
              </span>
            </span>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chart.map((c) => ({ m: c.m, revenue: c.sale + c.otherIncome, expense: c.expense }))}
              margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
              barGap={4}
            >
              <CartesianGrid stroke="#EEF2F7" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} width={56} tickFormatter={compactBdt} />
              <Tooltip cursor={{ fill: "rgba(15,23,42,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid #E5EAF2", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(15,23,42,0.18)" }} formatter={(v: number) => fmtBdt(v)} />
              <Legend wrapperStyle={{ display: "none" }} />
              <Bar dataKey="revenue" fill="#14B8A6" radius={[6, 6, 0, 0]} barSize={12} />
              <Bar dataKey="expense" fill="#F97316" radius={[6, 6, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard
          className="lg:col-span-1 lg:row-span-1"
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F43F5E]" />
              Low Stock Alerts
            </span>
          }
          right={
            <Link to="/app/reports/inventory" className="font-semibold text-[#0EA5A8] hover:underline">
              View All
            </Link>
          }
        >
          <ul className="divide-y divide-[#EEF2F7]">
            {(data?.lowStock ?? []).slice(0, 5).map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <div className="grid place-items-center w-9 h-9 rounded-lg bg-[#FEF1E6] text-[#EA580C] ring-1 ring-[#FBDFC3]">
                  <Package className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-[#0F172A]">{it.name}</div>
                  <div className="text-[11px] text-[#64748B]">
                    Reorder Level: <span className="font-medium text-[#0F172A]">{it.low_stock_alert ?? "—"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-[#E11D48]">{it.stock} pcs</div>
                  <div className="text-[10px] text-[#94A3B8]">in stock</div>
                </div>
              </li>
            ))}
            {(!data || data.lowStock.length === 0) && (
              <li className="py-8 text-center text-sm text-[#94A3B8]">No low-stock items 🎉</li>
            )}
          </ul>
          <div className="pt-3">
            <Link
              to="/app/reports/inventory"
              className="block text-center text-[12px] font-semibold text-[#0EA5A8] hover:underline"
            >
              View All Alerts →
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Lower section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Invoices */}
        <SectionCard
          title="Recent Invoices"
          right={
            <Link to="/app/sales" className="font-semibold text-[#0EA5A8] hover:underline">
              View all
            </Link>
          }
        >
          {(!data || data.recent.length === 0) ? (
            <div className="py-8 text-center text-sm text-[#94A3B8]">No invoices yet.</div>
          ) : (
            <div className="divide-y divide-[#EEF2F7]">
              {data.recent.map((r) => {
                const status: "Paid" | "Partial" | "Due" =
                  Number(r.balance) <= 0 ? "Paid" : Number(r.balance) < Number(r.total) ? "Partial" : "Due";
                return (
                  <div key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-[#0F172A]">{r.invoice_no}</div>
                      <div className="truncate text-[11px] text-[#64748B]">
                        {r.parties?.name ?? "Walk-in"} · {r.invoice_date}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-bold text-[#0F172A]">{fmtBdt(r.total)}</div>
                      <div className="mt-0.5"><StatusPill kind={status} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Recent Orders */}
        <SectionCard
          title="Recent Orders"
          right={
            <Link to="/app/sale-orders" className="font-semibold text-[#0EA5A8] hover:underline">
              View all
            </Link>
          }
        >
          {(!ordersQ.data || ordersQ.data.length === 0) ? (
            <div className="py-8 text-center text-sm text-[#94A3B8]">No orders yet.</div>
          ) : (
            <div className="divide-y divide-[#EEF2F7]">
              {ordersQ.data.map((o) => {
                const s = (o.status || "").toLowerCase();
                const kind: "Confirmed" | "Processing" | "Pending" =
                  s.includes("confirm") || s.includes("complete") ? "Confirmed" : s.includes("process") ? "Processing" : "Pending";
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-[#0F172A]">{o.order_no}</div>
                      <div className="truncate text-[11px] text-[#64748B]">
                        {o.parties?.name ?? "Customer"} · {o.order_date}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-bold text-[#0F172A]">{fmtBdt(o.total)}</div>
                      <div className="mt-0.5"><StatusPill kind={kind} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* Inventory Summary */}
        <SectionCard
          title="Inventory Summary"
          right={
            <Link to="/app/items" className="font-semibold text-[#0EA5A8] hover:underline">
              Manage
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Total Items", value: String(inv.totalItems), icon: Boxes, tone: "blue" as KpiTone },
              { label: "Total Stock", value: String((data?.lowStock?.length ?? 0) + inv.totalItems), icon: Layers, tone: "teal" as KpiTone },
              { label: "Stock Value", value: fmtBdt(inv.stockValue), icon: PiggyBank, tone: "green" as KpiTone },
              { label: "Warehouses", value: String(inv.warehouses), icon: Warehouse, tone: "purple" as KpiTone },
            ].map((tile) => {
              const t = TONE[tile.tone];
              return (
                <div
                  key={tile.label}
                  className="rounded-xl border border-[#EEF2F7] p-3 bg-card flex items-start gap-3"
                >
                  <div className={`grid place-items-center w-9 h-9 rounded-lg ring-1 ${t.bg} ${t.ring}`}>
                    <tile.icon className={`w-4 h-4 ${t.text}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">{tile.label}</div>
                    <div className="text-[16px] font-bold text-[#0F172A] truncate">{tile.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-[#64748B] mb-1">
              <span className="inline-flex items-center gap-1">
                <Tags className="w-3.5 h-3.5" /> Overall Stock Availability
              </span>
              <span className="font-semibold text-[#0F172A]">
                {inv.totalItems
                  ? Math.max(0, Math.round(((inv.totalItems - inv.outOfStock) / inv.totalItems) * 100))
                  : 0}
                %
              </span>
            </div>
            <div className="h-2 rounded-full bg-[#EEF2F7] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#14B8A6] to-[#22C55E]"
                style={{
                  width: `${
                    inv.totalItems
                      ? Math.max(4, Math.round(((inv.totalItems - inv.outOfStock) / inv.totalItems) * 100))
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[12px] text-[#64748B]">
        <div>© {new Date().getFullYear()} ERPOVO — All rights reserved · Chair King</div>
        <div className="inline-flex items-center gap-1">
          Made with <Coins className="w-3.5 h-3.5 text-[#F43F5E]" /> in Bangladesh 🇧🇩
        </div>
      </footer>
    </div>
  );
}
