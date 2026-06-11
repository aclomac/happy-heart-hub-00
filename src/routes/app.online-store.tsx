import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ShoppingCart, Package, Share2, Edit, Eye, RefreshCw, TrendingUp, Plus, Store,
  Users, Ticket, Megaphone, BarChart3, Settings, Truck, CreditCard, Sparkles, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/erp/MoneyText";
import { OnlineStoreOverview } from "@/components/erp/online-store/OnlineStoreOverview";
import { OnlineOrdersList } from "@/components/erp/online-store/OnlineOrdersList";
import { OnlineCatalogueManager } from "@/components/erp/online-store/OnlineCatalogueManager";
import { StoreInfoDialog } from "@/components/erp/online-store/StoreInfoDialog";
import {
  ensureOnlineStoreSeed, getOnlineStore, getOnlineStats, getOnlineCustomers,
  getOnlineCoupons, getOnlineCampaigns, setOnlineStore,
} from "@/lib/demo/online-store";
import { resetAndReseedDemo } from "@/lib/demo/resetDemo";

export const Route = createFileRoute("/app/online-store")({
  component: OnlineStorePage,
});

function OnlineStorePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { ensureOnlineStoreSeed(); }, []);

  const store = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineStore(); }, [tick]);
  const stats = useMemo(() => getOnlineStats(), [tick]);
  const customers = useMemo(() => getOnlineCustomers(), [tick]);
  const coupons = useMemo(() => getOnlineCoupons(), [tick]);
  const campaigns = useMemo(() => getOnlineCampaigns(), [tick]);

  const shareStore = () => {
    if (!store?.slug) { toast.error(t("Please configure your online store first")); return; }
    navigator.clipboard.writeText(`${window.location.origin}/store/${store.slug}`);
    toast.success(t("Store link copied"));
  };

  const handleReset = () => {
    if (typeof window !== "undefined" &&
        !window.confirm(t("Reset all local demo data and reload Chair King demo content?"))) return;
    resetAndReseedDemo();
    toast.success(t("Full demo data reloaded"));
    setTimeout(() => {
      navigate({ to: "/app" });
      if (typeof window !== "undefined") window.location.reload();
    }, 500);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Online Store")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <Sparkles className="w-4 h-4 mr-2" />{t("Reset & Load Full Demo Data")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTick((n) => n + 1)}>
              <RefreshCw className="w-4 h-4 mr-2" />{t("Sync")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />{t("Edit Store Info")}
            </Button>
            <Button size="sm" onClick={shareStore}>
              <Share2 className="w-4 h-4 mr-2" />{t("Share Online Store")}
            </Button>
          </div>
        }
      />

      {!store ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Store className="w-12 h-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t("Store not configured yet")}</h3>
            <Button onClick={() => setIsEditDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />{t("Setup Store")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Eye} color="bg-blue-100 text-blue-600" label={t("Store Views")} value={String(store.view_count || 0)} />
            <StatCard icon={ShoppingCart} color="bg-green-100 text-green-600" label={t("Total Orders")} value={String(stats.totalOrders)} />
            <StatCard icon={Package} color="bg-orange-100 text-orange-600" label={t("Open Orders")} value={String(stats.openOrders)} />
            <StatCard icon={TrendingUp} color="bg-purple-100 text-purple-600" label={t("Order Value")} value={<MoneyText value={stats.orderValue} />} />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="overview"><Store className="w-4 h-4 mr-1" />{t("Dashboard")}</TabsTrigger>
              <TabsTrigger value="catalogue"><Package className="w-4 h-4 mr-1" />{t("Products")}</TabsTrigger>
              <TabsTrigger value="orders"><ShoppingCart className="w-4 h-4 mr-1" />{t("Orders")}</TabsTrigger>
              <TabsTrigger value="customers"><Users className="w-4 h-4 mr-1" />{t("Customers")}</TabsTrigger>
              <TabsTrigger value="coupons"><Ticket className="w-4 h-4 mr-1" />{t("Coupons")}</TabsTrigger>
              <TabsTrigger value="campaigns"><Megaphone className="w-4 h-4 mr-1" />{t("Campaigns")}</TabsTrigger>
              <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 mr-1" />{t("Analytics")}</TabsTrigger>
              <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1" />{t("Settings")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><OnlineStoreOverview store={store} stats={stats} /></TabsContent>
            <TabsContent value="catalogue"><OnlineCatalogueManager /></TabsContent>
            <TabsContent value="orders"><OnlineOrdersList /></TabsContent>
            <TabsContent value="customers"><CustomersTab customers={customers} /></TabsContent>
            <TabsContent value="coupons"><CouponsTab coupons={coupons} /></TabsContent>
            <TabsContent value="campaigns"><CampaignsTab campaigns={campaigns} /></TabsContent>
            <TabsContent value="analytics"><AnalyticsTab stats={stats} store={store} /></TabsContent>
            <TabsContent value="settings"><SettingsTab store={store} onChange={() => setTick((n) => n + 1)} /></TabsContent>
          </Tabs>
        </>
      )}

      {isEditDialogOpen && (
        <StoreInfoDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          store={store}
          onSuccess={() => { setTick((n) => n + 1); setIsEditDialogOpen(false); }}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomersTab({ customers }: { customers: any[] }) {
  const { t } = useI18n();
  return (
    <div className="mt-6 border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Customer")}</TableHead>
            <TableHead>{t("Phone")}</TableHead>
            <TableHead>{t("City")}</TableHead>
            <TableHead className="text-right">{t("Orders")}</TableHead>
            <TableHead className="text-right">{t("Total Spent")}</TableHead>
            <TableHead className="text-right">{t("Due")}</TableHead>
            <TableHead>{t("Last Order")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t("No customers yet")}</TableCell></TableRow>
          ) : customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.phone}</TableCell>
              <TableCell>{c.city}</TableCell>
              <TableCell className="text-right">{c.total_orders}</TableCell>
              <TableCell className="text-right"><MoneyText value={c.total_spent} /></TableCell>
              <TableCell className="text-right">{c.due > 0 ? <span className="text-destructive"><MoneyText value={c.due} /></span> : "-"}</TableCell>
              <TableCell>{c.last_order_date}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CouponsTab({ coupons }: { coupons: any[] }) {
  const { t } = useI18n();
  const copy = (code: string) => { navigator.clipboard.writeText(code); toast.success(t("Copied")); };
  return (
    <div className="mt-6 border rounded-md overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Code")}</TableHead>
            <TableHead>{t("Description")}</TableHead>
            <TableHead>{t("Discount")}</TableHead>
            <TableHead>{t("Uses")}</TableHead>
            <TableHead>{t("Status")}</TableHead>
            <TableHead>{t("Expires")}</TableHead>
            <TableHead className="text-right">{t("Action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.map((c) => (
            <TableRow key={c.id}>
              <TableCell><Badge variant="outline" className="font-mono">{c.code}</Badge></TableCell>
              <TableCell>{c.description}</TableCell>
              <TableCell>
                {c.discount_type === "percent" ? `${c.discount_value}%` :
                 c.discount_type === "shipping" ? t("Free Shipping") :
                 <MoneyText value={c.discount_value} />}
              </TableCell>
              <TableCell>{c.uses} / {c.max_uses}</TableCell>
              <TableCell><Badge variant={c.active ? "default" : "secondary"}>{c.active ? t("Active") : t("Inactive")}</Badge></TableCell>
              <TableCell className="text-xs">{c.expires_at}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={() => copy(c.code)}>
                  <Copy className="w-3 h-3 mr-1" />{t("Copy")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CampaignsTab({ campaigns }: { campaigns: any[] }) {
  const { t } = useI18n();
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalReach = campaigns.reduce((s, c) => s + c.reach, 0);
  const totalConv = campaigns.reduce((s, c) => s + c.conversions, 0);
  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Total Spend")}</div><div className="text-2xl font-bold"><MoneyText value={totalSpent} /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Total Reach")}</div><div className="text-2xl font-bold">{totalReach.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Conversions")}</div><div className="text-2xl font-bold">{totalConv}</div></CardContent></Card>
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Campaign")}</TableHead>
              <TableHead>{t("Channel")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Budget")}</TableHead>
              <TableHead>{t("Reach")}</TableHead>
              <TableHead>{t("Clicks")}</TableHead>
              <TableHead>{t("Conv.")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><Badge variant="outline">{c.channel}</Badge></TableCell>
                <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                <TableCell>
                  <div className="text-xs"><MoneyText value={c.spent} /> / <MoneyText value={c.budget} /></div>
                  <Progress value={(c.spent / Math.max(c.budget, 1)) * 100} className="h-1 mt-1" />
                </TableCell>
                <TableCell>{c.reach.toLocaleString()}</TableCell>
                <TableCell>{c.clicks.toLocaleString()}</TableCell>
                <TableCell>{c.conversions}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AnalyticsTab({ stats, store }: { stats: any; store: any }) {
  const { t } = useI18n();
  const maxRev = Math.max(1, ...stats.revenueChart.map((d: any) => d.value));
  const conv = store.view_count > 0 ? ((stats.totalOrders / store.view_count) * 100).toFixed(2) + "%" : "0%";
  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Revenue (30d)")}</div><div className="text-xl font-bold"><MoneyText value={stats.monthSales} /></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Delivered")}</div><div className="text-xl font-bold">{stats.deliveredOrders}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Cancelled / Returned")}</div><div className="text-xl font-bold">{stats.cancelledOrders}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">{t("Conversion Rate")}</div><div className="text-xl font-bold">{conv}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-md">{t("Last 7 Days Revenue")}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-40">
            {stats.revenueChart.map((d: any) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-primary/80 rounded-t" style={{ height: `${(d.value / maxRev) * 100}%`, minHeight: "2px" }} />
                <div className="text-[10px] text-muted-foreground">{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-md">{t("Top Products")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>{t("Product")}</TableHead><TableHead className="text-right">{t("Qty")}</TableHead><TableHead className="text-right">{t("Revenue")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {stats.topProducts.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">{t("No data")}</TableCell></TableRow> :
                  stats.topProducts.map((p: any) => (
                    <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.qty}</TableCell><TableCell className="text-right"><MoneyText value={p.revenue} /></TableCell></TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-md">{t("Low Stock Alerts")}</CardTitle></CardHeader>
          <CardContent>
            {stats.lowStock.length === 0 ? <p className="text-sm text-muted-foreground">{t("All products are in stock")}</p> :
              <ul className="space-y-2">
                {stats.lowStock.map((p: any) => (
                  <li key={p.name} className="flex justify-between items-center text-sm border-b pb-1">
                    <span>{p.name}</span>
                    <Badge variant={p.stock === 0 ? "destructive" : "secondary"}>{p.stock === 0 ? t("Out") : `${p.stock} ${t("left")}`}</Badge>
                  </li>
                ))}
              </ul>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsTab({ store, onChange }: { store: any; onChange: () => void }) {
  const { t } = useI18n();
  const [inside, setInside] = useState<number>(store.settings?.delivery_charge_inside ?? 80);
  const [outside, setOutside] = useState<number>(store.settings?.delivery_charge_outside ?? 150);
  const [cod, setCod] = useState<boolean>(store.settings?.cod_available ?? true);
  const [methods, setMethods] = useState<string[]>(store.settings?.payment_methods ?? ["COD", "bKash", "Nagad", "Bank Transfer"]);

  const toggleMethod = (m: string) => {
    setMethods((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  };

  const save = () => {
    const current = getOnlineStore();
    if (!current) return;
    setOnlineStore({
      ...current,
      settings: {
        ...current.settings,
        delivery_charge_inside: Number(inside) || 0,
        delivery_charge_outside: Number(outside) || 0,
        cod_available: cod,
        payment_methods: methods,
      },
    });
    toast.success(t("Settings saved"));
    onChange();
  };

  const allMethods = ["COD", "bKash", "Nagad", "Rocket", "Bank Transfer", "Card"];

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-md flex items-center gap-2"><Truck className="w-4 h-4" />{t("Delivery Settings")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Delivery charge (inside Dhaka)")}</Label>
            <Input type="number" value={inside} onChange={(e) => setInside(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>{t("Delivery charge (outside Dhaka)")}</Label>
            <Input type="number" value={outside} onChange={(e) => setOutside(Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <Label>{t("Cash on Delivery (COD)")}</Label>
            <Switch checked={cod} onCheckedChange={setCod} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-md flex items-center gap-2"><CreditCard className="w-4 h-4" />{t("Payment Settings")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("Choose which payment methods customers see at checkout.")}</p>
          {allMethods.map((m) => (
            <div key={m} className="flex items-center justify-between border-b pb-2">
              <Label>{m}</Label>
              <Switch checked={methods.includes(m)} onCheckedChange={() => toggleMethod(m)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="md:col-span-2 flex justify-end">
        <Button onClick={save}>{t("Save Settings")}</Button>
      </div>
    </div>
  );
}
