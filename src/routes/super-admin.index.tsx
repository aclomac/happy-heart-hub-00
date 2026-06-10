import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Building2,
  Package,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ScrollText,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/super-admin/")({
  component: SuperAdminDashboard,
});

type Stats = {
  customers: number;
  companies: number;
  activeSubs: number;
  trialSubs: number;
  expiredSubs: number;
  activePlans: number;
  pendingPayments: number;
  underReviewPayments: number;
  approvedThisMonth: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  activeDevices: number;
  expiringSoon: number;
  couponUsage: number;
  recentCompanies: Array<{ id: string; name: string; created_at: string }>;
  recentAudits: Array<{
    id: string;
    action: string;
    target_type: string | null;
    created_at: string;
  }>;
  planBreakdown: Array<{ plan: string; count: number }>;
};

function useStats() {
  return useQuery<Stats>({
    queryKey: ["super-admin-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        customers,
        companies,
        subs,
        plans,
        pending,
        underReview,
        approvedMonth,
        monthRev,
        yearRev,
        activeDevices,
        expiringSoon,
        coupons,
        recentCompanies,
        recentAudits,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("company_subscriptions").select("status, plan_key"),
        supabase
          .from("subscription_plans")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "under_review"),
        supabase
          .from("payment_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .gte("reviewed_at", monthStart),
        supabase
          .from("payment_requests")
          .select("amount")
          .eq("status", "approved")
          .gte("reviewed_at", monthStart),
        supabase
          .from("payment_requests")
          .select("amount")
          .eq("status", "approved")
          .gte("reviewed_at", yearStart),
        supabase
          .from("devices")
          .select("id", { count: "exact", head: true })
          .gte("last_seen_at", sevenDaysAgo),
        supabase
          .from("company_subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .lte("expires_at", sevenDaysAhead)
          .gte("expires_at", now.toISOString()),
        supabase.from("coupon_redemptions").select("id", { count: "exact", head: true }),
        supabase
          .from("companies")
          .select("id, name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("platform_audit_logs")
          .select("id, action, target_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const subRows = (subs.data ?? []) as Array<{ status: string; plan_key: string }>;
      const planCounts = new Map<string, number>();
      subRows.forEach((r) =>
        planCounts.set(r.plan_key ?? "—", (planCounts.get(r.plan_key ?? "—") ?? 0) + 1),
      );

      const sumAmount = (rows: Array<{ amount: number | string }> | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

      return {
        customers: customers.count ?? 0,
        companies: companies.count ?? 0,
        activeSubs: subRows.filter((s) => s.status === "active").length,
        trialSubs: subRows.filter((s) => s.status === "trial").length,
        expiredSubs: subRows.filter((s) => s.status === "expired").length,
        activePlans: plans.count ?? 0,
        pendingPayments: pending.count ?? 0,
        underReviewPayments: underReview.count ?? 0,
        approvedThisMonth: approvedMonth.count ?? 0,
        monthlyRevenue: sumAmount(monthRev.data),
        yearlyRevenue: sumAmount(yearRev.data),
        activeDevices: activeDevices.count ?? 0,
        expiringSoon: expiringSoon.count ?? 0,
        couponUsage: coupons.count ?? 0,
        recentCompanies: recentCompanies.data ?? [],
        recentAudits: recentAudits.data ?? [],
        planBreakdown: Array.from(planCounts.entries()).map(([plan, count]) => ({
          plan,
          count,
        })),
      };
    },
  });
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: typeof Users;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
  }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</p>
          </div>
          <Icon className={`w-8 h-8 ${toneClass} opacity-50`} />
        </div>
      </CardContent>
    </Card>
  );
}

function SuperAdminDashboard() {
  const { data, isLoading } = useStats();
  const { t, tPlan } = useI18n();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t("Platform Dashboard")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("ERPOVO SaaS operations overview.")}
        </p>
      </header>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("Loading stats…")}</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label={t("Total Customers")} value={data.customers} icon={Users} />
            <StatCard label={t("Total Companies")} value={data.companies} icon={Building2} />
            <StatCard
              label={t("Active Subscriptions")}
              value={data.activeSubs}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={t("Trial Companies")}
              value={data.trialSubs}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label={t("Expired")}
              value={data.expiredSubs}
              icon={AlertTriangle}
              tone="danger"
            />
            <StatCard label={t("Active Plans")} value={data.activePlans} icon={Package} />
            <StatCard
              label={t("Pending Payments")}
              value={data.pendingPayments}
              icon={ScrollText}
              tone={data.pendingPayments > 0 ? "warning" : "default"}
            />
            <StatCard label={t("Active Devices (7d)")} value={data.activeDevices} icon={Users} />
            <StatCard
              label={t("Under Review")}
              value={data.underReviewPayments}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label={t("Approved this month")}
              value={data.approvedThisMonth}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={t("Monthly Revenue")}
              value={`$${data.monthlyRevenue.toFixed(2)}`}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={t("Yearly Revenue")}
              value={`$${data.yearlyRevenue.toFixed(2)}`}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label={t("Expiring in 7 days")}
              value={data.expiringSoon}
              icon={AlertTriangle}
              tone="warning"
            />
            <StatCard label={t("Coupon Redemptions")} value={data.couponUsage} icon={Package} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Plan-wise subscriptions")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.planBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No subscriptions yet.")}</p>
                ) : (
                  <ul className="space-y-2">
                    {data.planBreakdown.map((p) => (
                      <li key={p.plan} className="flex justify-between text-sm">
                        <span className="capitalize">{tPlan(p.plan)}</span>
                        <span className="font-semibold">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Recent companies")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentCompanies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("None.")}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.recentCompanies.map((c) => (
                      <li key={c.id} className="flex justify-between">
                        <Link
                          to="/super-admin/companies/$companyId"
                          params={{ companyId: c.id }}
                          className="hover:underline truncate"
                        >
                          {c.name}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("Recent audit events")}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentAudits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No audit events yet.")}</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data.recentAudits.map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          <span className="font-medium">{a.action}</span>
                          {a.target_type && (
                            <span className="text-muted-foreground"> · {a.target_type}</span>
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
