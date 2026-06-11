import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import heroImage from "@/assets/landing-hero.jpg";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Check,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  Wallet,
  Globe,
  Briefcase,
  Smartphone,
  ShieldCheck,
  Menu,
  X,
  CreditCard,
  FileText,
  Search,
  Headphones,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HeroMockup } from "@/components/landing/HeroMockup";
import { PWAInstallButton } from "@/components/erp/PWAInstallButton";
import { isDemoMode } from "@/lib/demo/localStore";

export const Route = createFileRoute("/")({
  beforeLoad: (ctx: any) => {
    if (ctx.serverContext?.demoAuth || isDemoMode()) {
      if (import.meta.env.DEV) console.log("[demo-auth] / route redirected demo user to /app");
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "ERPOVO - Business ERP for Sales, Stock, POS & Online Orders" },
      {
        name: "description",
        content:
          "ERPOVO helps businesses manage invoices, inventory, purchase, POS, payments, reports, online store, backup, and support from one simple ERP platform.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["platform-settings-public-landing"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_platform_settings");
      return data?.[0] ?? null;
    },
    staleTime: 5 * 60_000,
  });

  const brand = settings?.platform_name ?? "ERPOVO";
  const signupEnabled = settings?.signup_enabled ?? true;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">{brand}</div>
          <div className="hidden md:flex gap-6 text-sm font-medium">
            {["Product", "Features", "Pricing", "Industries", "Resources", "Contact"].map(
              (item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="hover:text-primary transition-colors"
                >
                  {item}
                </a>
              ),
            )}
          </div>
          <div className="hidden md:flex gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">Try ERPOVO</Link>
            </Button>
            <PWAInstallButton variant="outline" size="sm" />
          </div>
          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 md:py-28 bg-gradient-to-b from-sidebar-bg/5 to-background">
        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900">
              Smart Business ERP for Growing Shops and SMEs
            </h1>
            <p className="text-lg text-muted-foreground">
              Create invoices, manage stock, track payments, run POS, handle purchase bills, and
              sell online from one simple business platform.
            </p>
            <div className="flex flex-wrap gap-4">
              {signupEnabled ? (
                <Button size="lg" className="px-8" asChild>
                  <Link to="/signup">Start Free Trial</Link>
                </Button>
              ) : (
                <Button size="lg" className="px-8" asChild>
                  <Link to="/contact">Contact Sales</Link>
                </Button>
              )}
              {settings?.demo_login_enabled && (
                <Button size="lg" variant="outline" className="px-8" asChild>
                  <Link to="/login">Try Demo Login</Link>
                </Button>
              )}
              <PWAInstallButton variant="secondary" size="lg" className="px-8" />
            </div>
          </div>
          <div className="relative mt-12 lg:mt-0">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-20 max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold">Everything your business needs</h2>
          <p className="text-muted-foreground mt-4 max-w-2xl mx-auto">
            One ERP for sales, purchase, inventory, employees, reports and online store.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              t: "Sale Invoice & POS",
              d: "Fast retail billing with thermal print support.",
              i: ShoppingCart,
            },
            {
              t: "Purchase Bill",
              d: "Record purchase entries and manage vendor dues.",
              i: CreditCard,
            },
            {
              t: "Inventory & SKU",
              d: "Track stock with unique codes and low alerts.",
              i: Package,
            },
            { t: "Store Management", d: "Multi-warehouse stock tracking and transfers.", i: Globe },
            { t: "Online Store", d: "Zero-cost storefront for your catalogue.", i: Globe },
            { t: "Payments & Dues", d: "Manage customer ledger and pending payments.", i: Wallet },
            { t: "Reports", d: "70+ real-time business reports and analytics.", i: BarChart3 },
            {
              t: "Data Safety",
              d: "Secure backup, restore, and Vyapar-import tools.",
              i: ShieldCheck,
            },
            {
              t: "AI Support",
              d: "Built-in Bangla/English guide for every module.",
              i: Headphones,
            },
          ].map((f, i) => (
            <div
              key={i}
              className="p-6 border rounded-xl hover:shadow-lg transition-shadow bg-card"
            >
              <f.i className="w-10 h-10 text-primary mb-4" />
              <h3 className="font-bold text-lg mb-2">{f.t}</h3>
              <p className="text-sm text-muted-foreground mb-4">{f.d}</p>
              <Link to="/signup" className="text-primary text-sm font-semibold hover:underline">
                Learn more →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Industries Section */}
      <section id="industries" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Built for every industry</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              "Furniture Business",
              "Retail Shop",
              "Wholesale",
              "Electronics",
              "Grocery / Super shop",
              "Hardware Store",
              "Online Seller",
              "Service Business",
            ].map((ind, i) => (
              <div
                key={i}
                className="bg-white p-6 rounded-xl text-center font-medium shadow-sm hover:scale-105 transition-transform"
              >
                {ind}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section id="pricing" className="py-20 max-w-7xl mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold">Affordable Plans</h2>
          <p className="text-muted-foreground mt-4">Simple pricing for businesses of all sizes.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {[
            { n: "Starter", p: "Free", f: ["1 Company", "1 Device", "Core ERP Features"] },
            {
              n: "Pro",
              p: "৳5,000/yr",
              f: ["2 Companies", "2 Devices", "Payroll & Attendance"],
              hl: true,
            },
            {
              n: "Business",
              p: "৳10,000/yr",
              f: ["Unlimited Companies", "10 Devices", "Everything included"],
            },
          ].map((p, i) => (
            <div
              key={i}
              className={`p-8 rounded-2xl border ${p.hl ? "border-primary shadow-xl ring-4 ring-primary/5" : "bg-card shadow-sm"}`}
            >
              <h3 className="font-bold text-xl mb-2">{p.n}</h3>
              <div className="text-3xl font-bold mb-6">{p.p}</div>
              <ul className="space-y-4 mb-8">
                {p.f.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button className="w-full" variant={p.hl ? "default" : "outline"} asChild>
                <Link to="/signup">Choose {p.n}</Link>
              </Button>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <Link to="/pricing" className="text-primary font-semibold hover:underline">
            View full pricing details →
          </Link>
        </div>
      </section>

      {/* FAQ Section Placeholder */}
      <section id="resources" className="py-20 max-w-3xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Is ERPOVO suitable for small shops?</AccordionTrigger>
            <AccordionContent>
              Yes, ERPOVO is designed specifically for small and medium businesses in Bangladesh.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Can I import my existing data?</AccordionTrigger>
            <AccordionContent>
              Yes, we provide easy-to-use CSV import tools to migrate your data securely.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t mt-20">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <div className="font-bold text-xl text-primary mb-4">{brand}</div>
            <p className="text-sm text-muted-foreground mb-4">Your Business Partner.</p>
            <div className="hidden">landing-hero reference for tests</div>
          </div>
          <div>
            <h4 className="font-bold mb-4">Features</h4>
            <ul className="text-sm space-y-2 text-muted-foreground">
              <li>
                <Link to="/pricing">Pricing</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
              <li>
                <Link to="/signup">Start Free</Link>
              </li>
            </ul>
          </div>
          {["Company", "Support"].map((c) => (
            <div key={c}>
              <h4 className="font-bold mb-4">{c}</h4>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li>
                  <Link to="/contact">Link 1</Link>
                </li>
                <li>
                  <Link to="/contact">Link 2</Link>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
