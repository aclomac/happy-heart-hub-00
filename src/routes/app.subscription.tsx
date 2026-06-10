import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { useSubscription, PLAN_LIMITS, daysRemaining, type PlanKey } from "@/lib/use-subscription";
import { PlanStatusBadge } from "@/components/erp/PlanStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Check,
  Crown,
  Sparkles,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Eye,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyPaymentRequests, checkIsAdmin } from "@/lib/billing.functions";

export const Route = createFileRoute("/app/subscription")({ component: SubscriptionPage });

const PLANS: {
  key: PlanKey;
  price: number;
  popular?: boolean;
  icon: typeof Crown;
  tagline: string;
  features: string[];
}[] = [
  {
    key: "basic",
    price: 0,
    icon: Shield,
    tagline: "30-day free trial",
    features: [
      "1 Company",
      "1 Device",
      "Sales, Purchase, Items, Parties",
      "POS & Cash management",
      "Reports & Tax",
      "Email support",
    ],
  },
  {
    key: "gold",
    price: 60,
    popular: true,
    icon: Crown,
    tagline: "Best for small teams",
    features: [
      "2 Companies",
      "2 Devices",
      "Everything in Basic",
      "Payroll & Attendance",
      "Employee Management",
      "Priority support",
    ],
  },
  {
    key: "pro",
    price: 100,
    icon: Sparkles,
    tagline: "For growing businesses",
    features: [
      "Unlimited Companies",
      "10 Devices",
      "Everything in Gold",
      "Advanced Reports",
      "Custom branding on invoices",
      "Dedicated account manager",
    ],
  },
];

function SubscriptionPage() {
  const { data: sub, isLoading } = useSubscription();
  const days = daysRemaining(sub);

  const listMine = useServerFn(listMyPaymentRequests);
  const isAdminFn = useServerFn(checkIsAdmin);
  const requestsQ = useQuery({ queryKey: ["my-payment-requests"], queryFn: () => listMine() });
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn() });

  if (useChildMatches().length > 0) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Subscription & Billing"
        subtitle="Choose the plan that fits your business"
      />

      {isLoading || !sub ? (
        <div className="p-8 text-center text-muted-foreground">Loading…</div>
      ) : (
        <>
          {/* Current plan banner */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-6 mb-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider opacity-70">Current Plan</div>
                <div className="flex items-center gap-3 mt-1">
                  <Crown className="w-6 h-6 text-amber-400" />
                  <span className="text-2xl font-bold capitalize">{sub.plan}</span>
                  <PlanStatusBadge size="sm" asLink={false} />
                </div>

                <div className="text-sm opacity-80 mt-2">
                  {sub.status === "expired"
                    ? "Plan expired — please renew"
                    : sub.status === "trial"
                      ? `Trial ends in ${days} days`
                      : sub.status === "pending_upgrade"
                        ? "Your upgrade is awaiting admin approval"
                        : sub.status === "rejected_payment"
                          ? "Last payment was rejected — submit a new request"
                          : sub.expiresAt
                            ? `Renews on ${new Date(sub.expiresAt).toLocaleDateString()}`
                            : ""}
                </div>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="opacity-60 text-xs">Companies</div>
                  <div className="text-xl font-bold">
                    {sub.features.maxCompanies === Infinity ? "∞" : sub.features.maxCompanies}
                  </div>
                </div>
                <div>
                  <div className="opacity-60 text-xs">Devices</div>
                  <div className="text-xl font-bold">{sub.features.maxDevices}</div>
                </div>
                <div>
                  <div className="opacity-60 text-xs">Expires</div>
                  <div className="text-sm font-medium">
                    {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
            </div>
            {adminQ.data?.isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/app/admin/payments">
                  <Button size="sm" variant="secondary">
                    Admin: Payments
                  </Button>
                </Link>
                <Link to="/app/admin/payment-settings">
                  <Button size="sm" variant="secondary">
                    Admin: Payment Methods
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {sub.status === "rejected_payment" && sub.latestPaymentRequest && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-900">Payment Rejected</div>
                  <div className="text-sm text-rose-800">
                    {sub.latestPaymentRequest.reject_reason ||
                      "Your last payment request was rejected by the admin."}
                  </div>
                </div>
              </div>
              <Link
                to="/app/upgrade/$plan"
                params={{
                  plan: (sub.latestPaymentRequest.plan === "pro" ? "pro" : "gold") as PlanKey,
                }}
              >
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white">
                  Submit New Payment
                </Button>
              </Link>
            </div>
          )}

          {sub.status === "pending_upgrade" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900">Pending Upgrade</div>
                <div className="text-sm text-amber-800">
                  Your payment request is under review. We'll unlock the upgrade once it's approved.
                </div>
              </div>
            </div>
          )}

          {/* Plans grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLANS.map((p) => {
              const isCurrent = sub.plan === p.key && !sub.isExpired;
              const Icon = p.icon;
              return (
                <div
                  key={p.key}
                  className={`relative bg-card border-2 rounded-xl p-6 flex flex-col ${
                    p.popular ? "border-amber-500 shadow-lg shadow-amber-100/30" : "border-border"
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Most Popular
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <Icon
                      className={`w-5 h-5 ${p.key === "pro" ? "text-indigo-600" : p.key === "gold" ? "text-amber-500" : "text-slate-500"}`}
                    />
                    <h3 className="font-bold text-lg capitalize">{p.key}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.tagline}</p>
                  <div className="mt-4 mb-4">
                    <span className="text-4xl font-bold">${p.price}</span>
                    <span className="text-muted-foreground text-sm">
                      {p.price === 0 ? " trial" : " / year"}
                    </span>
                  </div>
                  <ul className="space-y-2 text-sm flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="outline" className="mt-5 w-full" disabled>
                      Current Plan
                    </Button>
                  ) : p.key === "basic" ? (
                    <Button variant="outline" className="mt-5 w-full" disabled>
                      Free trial only
                    </Button>
                  ) : (
                    <Link to="/app/upgrade/$plan" params={{ plan: p.key }} className="mt-5">
                      <Button
                        variant={p.popular ? "default" : "outline"}
                        className={`w-full ${p.popular ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                      >
                        <Crown className="w-4 h-4" />
                        Upgrade to {PLAN_LIMITS[p.key].label}
                      </Button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment history */}
          <div className="mt-8 bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/40">
              <h3 className="font-bold text-sm">My Payment Requests</h3>
            </div>
            {requestsQ.isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
            ) : !requestsQ.data?.requests.length ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No payment requests yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2">Submitted</th>
                      <th className="text-left px-4 py-2">Plan</th>
                      <th className="text-left px-4 py-2">Period</th>
                      <th className="text-left px-4 py-2">Method</th>
                      <th className="text-left px-4 py-2">Txn ID</th>
                      <th className="text-right px-4 py-2">Amount</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-left px-4 py-2">Reason / Note</th>
                      <th className="text-right px-4 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsQ.data.requests.map((r) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-4 py-2 whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 capitalize font-medium">{r.plan}</td>
                        <td className="px-4 py-2 text-xs capitalize">{r.billing_period ?? "—"}</td>
                        <td className="px-4 py-2 uppercase text-xs">{r.method}</td>
                        <td className="px-4 py-2 font-mono text-xs">{r.transaction_id}</td>
                        <td className="px-4 py-2 text-right">
                          {Number(r.amount).toFixed(2)} {r.currency ?? "USD"}
                        </td>
                        <td className="px-4 py-2">
                          {r.status === "pending" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                          {r.status === "under_review" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                              <Eye className="w-3 h-3" />
                              Under review
                            </span>
                          )}
                          {r.status === "approved" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Approved
                            </span>
                          )}
                          {r.status === "rejected" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" />
                              Rejected
                            </span>
                          )}
                          {r.status === "cancelled" && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded-full">
                              Cancelled
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-[16rem]">
                          {r.reject_reason ?? r.admin_note ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {r.status === "approved" && (
                            <Link
                              to="/app/subscription/receipt/$id"
                              params={{ id: r.id }}
                              target="_blank"
                            >
                              <Button size="sm" variant="ghost">
                                <FileText className="w-4 h-4" />
                                Receipt
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
