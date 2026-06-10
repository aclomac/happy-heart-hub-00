import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Check, Crown, X } from "lucide-react";

export const Route = createFileRoute("/app/plans")({ component: Plans });

const plans = [
  {
    name: "Basic",
    price: "Free",
    sub: "1 month trial · then ৳ 0",
    desc: "Perfect for small shop owners getting started.",
    features: {
      Companies: "1",
      Devices: "1",
      "All core business features": true,
      "Payroll & Employees": false,
      Attendance: false,
      "Employee Payment": false,
      "Multi-user": false,
    },
    cta: "Start Free Trial",
    variant: "outline" as const,
  },
  {
    name: "Gold",
    price: "$60",
    sub: "per year · best for growing businesses",
    desc: "Includes payroll, attendance and employee management.",
    features: {
      Companies: "2",
      Devices: "2 (mix laptop/mobile)",
      "All core business features": true,
      "Payroll & Employees": true,
      Attendance: true,
      "Employee Payment": true,
      "Multi-user": false,
    },
    cta: "Upgrade to Gold",
    variant: "utility" as const,
    highlight: true,
  },
  {
    name: "Pro",
    price: "$100",
    sub: "per year · for serious businesses",
    desc: "Unlimited companies, multi-user, online store and all features.",
    features: {
      Companies: "Unlimited",
      Devices: "Up to 10",
      "All core business features": true,
      "Payroll & Employees": true,
      Attendance: true,
      "Employee Payment": true,
      "Multi-user": true,
    },
    cta: "Upgrade to Pro",
    variant: "default" as const,
  },
];

function Plans() {
  return (
    <div>
      <PageHeader title="Plans & Pricing" subtitle="Choose the plan that fits your business" />
      <div className="bg-success/10 border border-success/30 rounded-md p-3 mb-4 text-sm flex items-center gap-2">
        <Crown className="w-4 h-4 text-success" />
        You are currently on <strong>Pro plan</strong> · Renews on <strong>2027-05-12</strong> · 11
        months remaining
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`bg-card border rounded-lg p-6 ${p.highlight ? "border-utility border-2 shadow-md" : ""}`}
          >
            {p.highlight && (
              <div className="text-[10px] uppercase tracking-wider font-bold text-utility mb-2">
                Most Popular
              </div>
            )}
            <h3 className="text-lg font-bold">{p.name}</h3>
            <div className="mt-2">
              <span className="text-3xl font-bold">{p.price}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">{p.sub}</div>
            <p className="text-sm text-muted-foreground mt-3">{p.desc}</p>
            <Button variant={p.variant} size="sm" className="w-full mt-4">
              {p.cta}
            </Button>
            <ul className="mt-5 space-y-2 text-sm">
              {Object.entries(p.features).map(([k, v]) => (
                <li key={k} className="flex items-center gap-2">
                  {v === false ? (
                    <X className="w-4 h-4 text-sale" />
                  ) : (
                    <Check className="w-4 h-4 text-success" />
                  )}
                  <span className={v === false ? "text-muted-foreground" : ""}>
                    {k}
                    {typeof v === "string" && `: ${v}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-card border rounded-md p-5">
        <h3 className="font-semibold mb-2 text-sm">Current Subscription</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Plan</div>
            <div className="font-semibold">Pro</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Companies Used</div>
            <div className="font-semibold">3 / Unlimited</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Devices</div>
            <div className="font-semibold">3 / 10</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Expiry</div>
            <div className="font-semibold">2027-05-12</div>
          </div>
        </div>
        <Link to="/app/sync" className="text-xs text-primary mt-3 inline-block">
          Manage devices →
        </Link>
      </div>
    </div>
  );
}
