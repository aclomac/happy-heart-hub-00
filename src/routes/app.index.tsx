import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ArrowUpRight, Banknote, CircleDollarSign, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";

const FullDashboard = lazy(() => import("@/components/erp/dashboard/FullDashboard"));

export const Route = createFileRoute("/app/")({ component: Dashboard });

const lightweightCards = [
  { label: "Total Sales", value: "৳ 12,48,500", to: "/app/sales", icon: ShoppingCart, tone: "bg-blue-50 text-blue-700 border-blue-100" },
  { label: "Total Revenue", value: "৳ 14,35,250", to: "/app/sales", icon: CircleDollarSign, tone: "bg-teal-50 text-teal-700 border-teal-100" },
  { label: "Total Profit", value: "৳ 3,18,750", to: "/app/reports", icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { label: "Total Expenses", value: "৳ 1,76,200", to: "/app/expenses", icon: Wallet, tone: "bg-amber-50 text-amber-700 border-amber-100" },
  { label: "Total Receivables", value: "৳ 4,82,000", to: "/app/parties", icon: Receipt, tone: "bg-sky-50 text-sky-700 border-sky-100" },
  { label: "Total Payables", value: "৳ 2,24,500", to: "/app/parties", icon: Banknote, tone: "bg-rose-50 text-rose-700 border-rose-100" },
] as const;

const quickActions = [
  { label: "Add Sale", to: "/app/sales/new", variant: "default" },
  { label: "Open POS", to: "/app/pos", variant: "secondary" },
  { label: "Items", to: "/app/items", variant: "secondary" },
  { label: "Sales", to: "/app/sales", variant: "secondary" },
] as const;

function hasSearchFlag(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

function Dashboard() {
  const forceLite = hasSearchFlag("lite");
  const [showFullAnalytics, setShowFullAnalytics] = useState(() => hasSearchFlag("fullDashboard") && !forceLite);

  if (showFullAnalytics) {
    return (
      <Suspense fallback={<LightweightDashboard onLoadFull={() => {}} fullLoading />}>
        <FullDashboard />
      </Suspense>
    );
  }

  return <LightweightDashboard onLoadFull={() => setShowFullAnalytics(true)} forceLite={forceLite} />;
}

function LightweightDashboard({
  onLoadFull,
  forceLite = false,
  fullLoading = false,
}: {
  onLoadFull: () => void;
  forceLite?: boolean;
  fullLoading?: boolean;
}) {
  return (
    <div className="min-h-full -m-4 bg-[#F6F8FC] p-3 pb-32 pr-3 md:p-4 md:pb-36 md:pr-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#64748B]">Chair King overview</p>
        </div>
        <button
          type="button"
          onClick={onLoadFull}
          disabled={forceLite || fullLoading}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {fullLoading ? "Loading analytics…" : forceLite ? "Lite dashboard active" : "Load full analytics"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {lightweightCards.map((card) => (
          <Link
            key={card.label}
            to={card.to}
            className="group block rounded-xl border border-[#E5EAF2] bg-card p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className={`grid h-10 w-10 place-items-center rounded-xl border ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-[#94A3B8] opacity-0 transition group-hover:opacity-100" />
            </div>
            <div className="mt-3 text-[12px] font-medium text-[#64748B]">{card.label}</div>
            <div className="mt-1 truncate text-[22px] font-bold tracking-tight text-[#0F172A]">{card.value}</div>
          </Link>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-[#E5EAF2] bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#0F172A]">Quick actions</h2>
          <span className="text-xs font-medium text-[#64748B]">Low-power mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {quickActions.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              data-variant={q.variant}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#E5EAF2] bg-background px-3 text-sm font-semibold text-[#0F172A] transition hover:bg-muted"
            >
              {q.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}