import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, RefreshCcw, ArrowUpRight, AlertTriangle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, useDeviceGuard, PLAN_LIMITS } from "@/lib/use-subscription";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { isDemoMode, getVisibleDemoCompanies } from "@/lib/demo/localStore";

export function DashboardSubscriptionCard() {
  const { data: sub } = useSubscription();
  const { deviceCount, maxDevices } = useDeviceGuard();

  const companyCountQ = useQuery({
    queryKey: ["company-count", sub?.subscription?.owner_id, isDemoMode() ? "demo" : "live"],
    enabled: !!sub?.subscription?.owner_id,
    queryFn: async () => {
      if (isDemoMode()) return getVisibleDemoCompanies().length;
      const { count, error } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", sub!.subscription!.owner_id);
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!sub) return null;

  const meta = PLAN_LIMITS[sub.plan];
  const maxCompaniesDisplay =
    sub.features.maxCompanies === Infinity ? "∞" : String(sub.features.maxCompanies);
  const usedCompanies = companyCountQ.data ?? 0;
  const expiresLabel = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "—";

  let cta: {
    label: string;
    to: string;
    params?: { plan: "gold" | "pro" };
    icon: typeof Crown;
    variant: "default" | "outline";
  } = {
    label: "Manage Plan",
    to: "/app/subscription",
    icon: ArrowUpRight,
    variant: "outline",
  };
  if (sub.status === "expired") {
    cta = {
      label: "Renew Plan",
      to: "/app/upgrade/$plan",
      params: { plan: "gold" },
      icon: RefreshCcw,
      variant: "default",
    };
  } else if (sub.status === "rejected_payment") {
    cta = {
      label: "Submit New Payment",
      to: "/app/upgrade/$plan",
      params: { plan: "gold" },
      icon: RefreshCcw,
      variant: "default",
    };
  } else if (sub.status === "pending_upgrade") {
    cta = { label: "View Request", to: "/app/subscription", icon: Clock, variant: "outline" };
  } else if (sub.plan === "basic") {
    cta = {
      label: "Upgrade Now",
      to: "/app/upgrade/$plan",
      params: { plan: "gold" },
      icon: Crown,
      variant: "default",
    };
  }

  return (
    <div className="bg-card border rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 text-white flex items-center justify-center">
            <Crown className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold capitalize">{meta.label} Plan</span>
              <PlanStatusBadge size="sm" asLink={false} />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {sub.status === "expired"
                ? "Subscription expired"
                : sub.status === "trial"
                  ? `Trial ends in ${sub.daysRemaining} day${sub.daysRemaining === 1 ? "" : "s"}`
                  : sub.expiresAt
                    ? `Renews on ${expiresLabel}`
                    : "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <Metric label="Companies" value={`${usedCompanies} / ${maxCompaniesDisplay}`} />
          <Metric label="Devices" value={`${deviceCount} / ${maxDevices}`} />
          <Metric label="Expires" value={expiresLabel} />
          {cta.params ? (
            <Link to={cta.to} params={cta.params}>
              <Button size="sm" variant={cta.variant}>
                <cta.icon className="w-4 h-4" />
                {cta.label}
              </Button>
            </Link>
          ) : (
            <Link to={cta.to}>
              <Button size="sm" variant={cta.variant}>
                <cta.icon className="w-4 h-4" />
                {cta.label}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {sub.status === "pending_upgrade" && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Your payment request is under review.</span>
        </div>
      )}

      {sub.status === "rejected_payment" && (
        <div className="mt-3 flex items-start gap-2 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Payment rejected
            {sub.latestPaymentRequest?.reject_reason
              ? `: ${sub.latestPaymentRequest.reject_reason}`
              : "."}
          </span>
        </div>
      )}

      {sub.status === "expired" && (
        <div className="mt-3 flex items-start gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Your subscription has expired. Renew to unlock all modules.</span>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
