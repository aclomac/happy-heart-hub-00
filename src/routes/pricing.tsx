import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

type Plan = {
  id: string;
  key: string;
  label: string;
  monthly_price: number;
  yearly_price: number;
  price: number;
  max_companies: number;
  max_devices: number;
  user_limit: number;
  features: Record<string, boolean>;
  sort_order: number;
};

const FALLBACK_PLANS: Plan[] = [
  {
    id: "f-basic",
    key: "basic",
    label: "Basic",
    monthly_price: 0,
    yearly_price: 0,
    price: 0,
    max_companies: 1,
    max_devices: 1,
    user_limit: 1,
    features: { sales: true, inventory: true, purchases: true, reports: true },
    sort_order: 1,
  },
  {
    id: "f-gold",
    key: "gold",
    label: "Gold",
    monthly_price: 500,
    yearly_price: 5000,
    price: 5000,
    max_companies: 2,
    max_devices: 2,
    user_limit: 3,
    features: {
      sales: true,
      inventory: true,
      purchases: true,
      reports: true,
      payroll: true,
      multi_user: true,
    },
    sort_order: 2,
  },
  {
    id: "f-pro",
    key: "pro",
    label: "Pro",
    monthly_price: 1000,
    yearly_price: 10000,
    price: 10000,
    max_companies: 999999,
    max_devices: 10,
    user_limit: 10,
    features: {
      sales: true,
      inventory: true,
      purchases: true,
      reports: true,
      payroll: true,
      multi_user: true,
      api: true,
    },
    sort_order: 3,
  },
];

const FEATURE_LABELS: Record<string, string> = {
  sales: "Sales & POS",
  inventory: "Inventory & Items",
  purchases: "Purchases & Expenses",
  reports: "Reports & Analytics",
  payroll: "Payroll & Attendance",
  multi_user: "Multi-user access",
  api: "API access",
};

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — ERPOVO Business ERP" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for ERPOVO. Start a 1-month free trial. Upgrade to Gold or Pro as your business grows.",
      },
      { property: "og:title", content: "ERPOVO Pricing — Plans for every business" },
      {
        property: "og:description",
        content: "Free trial. Gold and Pro plans. Manual & gateway payment supported.",
      },
      { property: "og:url", content: "https://erp-evo-pro.lovable.app/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://erp-evo-pro.lovable.app/pricing" }],
  }),
  component: PricingPage,
});

function fmt(n: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(n);
}

function PricingPage() {
  const [period, setPeriod] = useState<"monthly" | "yearly">("yearly");

  const { data: plans = FALLBACK_PLANS } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select(
          "id,key,label,monthly_price,yearly_price,price,max_companies,max_devices,user_limit,features,sort_order",
        )
        .eq("is_active", true)
        .order("sort_order");
      if (error || !data || data.length === 0) return FALLBACK_PLANS;
      return data as Plan[];
    },
    staleTime: 5 * 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">
              E
            </div>
            <div className="font-bold text-lg">ERPOVO</div>
          </Link>
          <nav className="hidden md:flex gap-6 text-sm text-muted-foreground">
            <Link to="/">Home</Link>
            <Link to="/pricing" className="text-foreground font-semibold">
              Pricing
            </Link>
            <Link to="/contact">Contact</Link>
          </nav>
          <div className="flex gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="default" size="sm">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-14">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h1 className="text-4xl md:text-5xl font-bold">Simple, transparent pricing</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Start free for 1 month. Upgrade anytime. Pay monthly or yearly — yearly saves more.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
            <button
              onClick={() => setPeriod("monthly")}
              className={`px-4 py-1.5 rounded-md transition ${
                period === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`px-4 py-1.5 rounded-md transition ${
                period === "yearly" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Yearly · Save
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {plans.map((p, i) => {
            const popular = p.key === "gold" || (plans.length === 3 && i === 1);
            const price = period === "monthly" ? p.monthly_price : p.yearly_price;
            const free = price === 0 && p.key === "basic";
            return (
              <div
                key={p.id}
                className={`bg-card border rounded-xl p-6 flex flex-col ${
                  popular ? "border-2 border-utility shadow-xl scale-[1.02]" : ""
                }`}
              >
                {popular && (
                  <div className="text-[10px] uppercase tracking-wider font-bold text-utility mb-2">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold">{p.label}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  {free ? (
                    <span className="text-4xl font-bold">Free</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">৳{fmt(price)}</span>
                      <span className="text-sm text-muted-foreground">
                        /{period === "monthly" ? "mo" : "yr"}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {free ? "1-month trial included" : "Cancel anytime"}
                </p>

                <ul className="mt-5 space-y-2 text-sm flex-1">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success" />
                    {p.max_companies >= 999999 ? "Unlimited" : p.max_companies} compan
                    {p.max_companies === 1 ? "y" : "ies"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success" />
                    {p.max_devices} device{p.max_devices === 1 ? "" : "s"}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-success" />
                    {p.user_limit} user{p.user_limit === 1 ? "" : "s"}
                  </li>
                  {Object.entries(p.features ?? {})
                    .filter(([, v]) => v)
                    .map(([k]) => (
                      <li key={k} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-success" />
                        {FEATURE_LABELS[k] ?? k}
                      </li>
                    ))}
                </ul>

                <div className="mt-6">
                  {free ? (
                    <Link to="/signup">
                      <Button variant="default" className="w-full">
                        Start Free Trial
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Link to="/app/upgrade/$plan" params={{ plan: p.key }}>
                      <Button variant={popular ? "utility" : "default"} className="w-full">
                        Upgrade to {p.label}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          <div className="bg-card border rounded-xl p-6 flex flex-col md:col-span-3">
            <div className="md:flex items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold">Custom / Enterprise</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Need more devices, branches, custom integrations or on-premise deployment? Talk to
                  our sales team.
                </p>
              </div>
              <Link to="/contact">
                <Button variant="outline" className="mt-4 md:mt-0">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Prices in BDT. Bank transfer, bKash, Nagad and card payments supported.
        </p>
      </section>

      <footer className="border-t bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between text-sm text-muted-foreground">
          <div>© 2026 ERPOVO. Premium Business ERP.</div>
          <div className="flex gap-4">
            <Link to="/pricing">Pricing</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
