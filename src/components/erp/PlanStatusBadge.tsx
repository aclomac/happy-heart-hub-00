import { Link } from "@tanstack/react-router";
import { Crown, Sparkles, Clock, XCircle, AlertTriangle } from "lucide-react";
import { useSubscription, type PlanKey, type ResolvedStatus } from "@/lib/use-subscription";

type Props = {
  size?: "sm" | "md";
  asLink?: boolean;
  plan?: PlanKey;
  status?: ResolvedStatus;
  className?: string;
};

function describe(plan: PlanKey, status: ResolvedStatus) {
  if (status === "expired") {
    return {
      label: "Expired",
      Icon: AlertTriangle,
      tone: "bg-slate-800 text-rose-200 ring-1 ring-slate-700",
    };
  }
  if (status === "pending_upgrade") {
    return {
      label: "Pending Upgrade",
      Icon: Clock,
      tone: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
    };
  }
  if (status === "rejected_payment") {
    return {
      label: "Payment Rejected",
      Icon: XCircle,
      tone: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
    };
  }
  if (status === "trial") {
    return {
      label: "Basic Trial",
      Icon: Sparkles,
      tone: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
    };
  }
  // active
  if (plan === "pro") {
    return {
      label: "Pro Active",
      Icon: Crown,
      tone: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
    };
  }
  if (plan === "gold") {
    return {
      label: "Gold Active",
      Icon: Crown,
      tone: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
    };
  }
  return {
    label: "Basic",
    Icon: Crown,
    tone: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  };
}

export function PlanStatusBadge({
  size = "sm",
  asLink = true,
  plan,
  status,
  className = "",
}: Props) {
  const { data } = useSubscription();
  const p: PlanKey = plan ?? data?.plan ?? "basic";
  const s: ResolvedStatus = status ?? data?.status ?? "expired";

  if (!plan && !data) return null;

  const { label, Icon, tone } = describe(p, s);
  const sizeCls = size === "sm" ? "px-2 py-0.5 text-[11px] gap-1" : "px-3 py-1 text-xs gap-1.5";
  const iconCls = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  const content = (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeCls} ${tone} ${className}`}
    >
      <Icon className={iconCls} />
      {label}
    </span>
  );

  if (!asLink) return content;
  return (
    <Link to="/app/subscription" className="hover:opacity-80 transition">
      {content}
    </Link>
  );
}
