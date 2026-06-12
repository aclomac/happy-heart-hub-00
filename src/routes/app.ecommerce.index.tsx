import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Store, ShoppingBag, Truck, RefreshCw, Wallet, TrendingUp, AlertCircle,
  PackageSearch, BarChart3, FileText, Settings, ListChecks,
} from "lucide-react";
import { getWebsites, getOrders, getCodEntries, getProducts, computeProfitLoss } from "@/lib/demo/ecommerce";

export const Route = createFileRoute("/app/ecommerce/")({ component: EcommerceDashboard });

function EcommerceDashboard() {
  const websites = getWebsites();
  const orders = getOrders();
  const cod = getCodEntries();
  const products = getProducts();

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const by = (s: string) => orders.filter((o) => o.status === s).length;
    const pl = computeProfitLoss();
    return {
      websites: websites.length,
      today: orders.filter((o) => o.orderDate === today).length,
      pending: by("New") + by("Confirmed"),
      processing: by("Processing") + by("Packed") + by("Ready to Ship"),
      shipped: by("Shipped"),
      delivered: by("Delivered"),
      cancelled: by("Cancelled"),
      returned: by("Returned") + by("Partially Returned"),
      totalSales: pl.grossSales + pl.deliveryIncome,
      codPending: cod.filter((c) => c.status === "Pending").reduce((s, c) => s + c.codAmount, 0),
      courierCharge: pl.courierExpense,
      returnLoss: pl.returnLoss,
      netProfit: pl.netProfit,
      lowStock: products.filter((p) => p.stock <= 5).length,
    };
  }, [orders, websites, cod, products, today]);

  const cards: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; tone?: string }[] = [
    { label: "Total Websites", value: stats.websites, icon: Store },
    { label: "Today Orders", value: stats.today, icon: ShoppingBag },
    { label: "Pending Orders", value: stats.pending, icon: AlertCircle, tone: "text-amber-600" },
    { label: "Processing", value: stats.processing, icon: RefreshCw },
    { label: "Shipped", value: stats.shipped, icon: Truck },
    { label: "Delivered", value: stats.delivered, icon: ShoppingBag, tone: "text-emerald-600" },
    { label: "Cancelled", value: stats.cancelled, icon: AlertCircle, tone: "text-rose-600" },
    { label: "Returned", value: stats.returned, icon: RefreshCw, tone: "text-rose-600" },
    { label: "Total Sales", value: `৳${stats.totalSales.toLocaleString()}`, icon: TrendingUp, tone: "text-emerald-700" },
    { label: "COD Pending", value: `৳${stats.codPending.toLocaleString()}`, icon: Wallet, tone: "text-amber-700" },
    { label: "Courier Charge", value: `৳${stats.courierCharge.toLocaleString()}`, icon: Truck },
    { label: "Return Loss", value: `৳${stats.returnLoss.toLocaleString()}`, icon: AlertCircle, tone: "text-rose-700" },
    { label: "Net Profit", value: `৳${stats.netProfit.toLocaleString()}`, icon: TrendingUp, tone: stats.netProfit >= 0 ? "text-emerald-700" : "text-rose-700" },
    { label: "Low Stock Products", value: stats.lowStock, icon: PackageSearch, tone: "text-amber-700" },
  ];

  const quickLinks = [
    { to: "/app/ecommerce/websites", label: "Websites / Stores", icon: Store },
    { to: "/app/ecommerce/orders", label: "Website Orders", icon: ShoppingBag },
    { to: "/app/ecommerce/order-sync", label: "Order Sync", icon: RefreshCw },
    { to: "/app/ecommerce/courier", label: "Couriers", icon: Truck },
    { to: "/app/ecommerce/cod", label: "COD Collection", icon: Wallet },
    { to: "/app/ecommerce/profit-loss", label: "Profit & Loss", icon: TrendingUp },
    { to: "/app/ecommerce/reports", label: "Reports", icon: BarChart3 },
    { to: "/app/ecommerce/sync-logs", label: "Sync Logs", icon: FileText },
    { to: "/app/ecommerce/settings", label: "Integration Settings", icon: Settings },
    { to: "/app/ecommerce/tracking", label: "Delivery Tracking", icon: ListChecks },
  ];

  // Orders by website + status summary
  const byWebsite = websites.map((w) => ({
    name: w.name,
    count: orders.filter((o) => o.websiteId === w.id).length,
    sales: orders.filter((o) => o.websiteId === w.id).reduce((s, o) => s + (o.subtotal - o.discount + o.deliveryCharge), 0),
  }));

  return (
    <div>
      <PageHeader title="Ecommerce Dashboard" subtitle="Multi-website orders, courier, COD and profit overview" />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <c.icon className={`w-4 h-4 ${c.tone || "text-muted-foreground"}`} />
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              </div>
              <div className={`text-lg font-semibold ${c.tone || ""}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="font-semibold mb-3">Orders & Sales by Website</div>
            <div className="space-y-2">
              {byWebsite.map((b) => (
                <div key={b.name} className="flex items-center justify-between border-b last:border-0 pb-2">
                  <div className="text-sm">{b.name}</div>
                  <div className="text-sm text-muted-foreground">{b.count} orders · ৳{b.sales.toLocaleString()}</div>
                </div>
              ))}
              {byWebsite.length === 0 && <div className="text-sm text-muted-foreground">No websites yet.</div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="font-semibold mb-3">Courier Status Summary</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Delivered: <b>{stats.delivered}</b></div>
              <div>In Transit: <b>{stats.shipped}</b></div>
              <div>Returned: <b>{stats.returned}</b></div>
              <div>Cancelled: <b>{stats.cancelled}</b></div>
              <div>COD Pending: <b>৳{stats.codPending.toLocaleString()}</b></div>
              <div>COD Collected: <b>৳{(stats.totalSales - stats.codPending).toLocaleString()}</b></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {quickLinks.map((q) => (
          <Link key={q.to} to={q.to} className="bg-card border rounded-md p-3 hover:border-primary transition-all flex items-center gap-2">
            <q.icon className="w-4 h-4 text-primary" />
            <span className="text-sm">{q.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
