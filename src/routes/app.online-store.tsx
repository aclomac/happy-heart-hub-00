import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingCart, Package, Share2, Edit, Eye, RefreshCw, TrendingUp, Plus, Store,
} from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/erp/MoneyText";
import { OnlineStoreOverview } from "@/components/erp/online-store/OnlineStoreOverview";
import { OnlineOrdersList } from "@/components/erp/online-store/OnlineOrdersList";
import { OnlineCatalogueManager } from "@/components/erp/online-store/OnlineCatalogueManager";
import { StoreInfoDialog } from "@/components/erp/online-store/StoreInfoDialog";
import {
  ensureOnlineStoreSeed, getOnlineStore, getOnlineStats,
} from "@/lib/demo/online-store";

export const Route = createFileRoute("/app/online-store")({
  component: OnlineStorePage,
});

function OnlineStorePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => { ensureOnlineStoreSeed(); }, []);

  const store = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineStore(); }, [tick]);
  const stats = useMemo(() => getOnlineStats(), [tick]);

  const shareStore = () => {
    if (!store?.slug) { toast.error(t("Please configure your online store first")); return; }
    navigator.clipboard.writeText(`${window.location.origin}/store/${store.slug}`);
    toast.success(t("Store link copied"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Online Store")}
        actions={
          <div className="flex gap-2">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard icon={Eye} color="bg-blue-100 text-blue-600" label={t("Store Views")} value={String(store.view_count || 0)} />
            <StatCard icon={ShoppingCart} color="bg-green-100 text-green-600" label={t("Total Orders")} value={String(stats.totalOrders)} />
            <StatCard icon={Package} color="bg-orange-100 text-orange-600" label={t("Open Orders")} value={String(stats.openOrders)} />
            <StatCard icon={TrendingUp} color="bg-purple-100 text-purple-600" label={t("Order Value")} value={<MoneyText value={stats.orderValue} />} />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
              <TabsTrigger value="orders">{t("Manage Orders")}</TabsTrigger>
              <TabsTrigger value="catalogue">{t("Catalogue")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><OnlineStoreOverview store={store} stats={stats} /></TabsContent>
            <TabsContent value="orders"><OnlineOrdersList /></TabsContent>
            <TabsContent value="catalogue"><OnlineCatalogueManager /></TabsContent>
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
