import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/erp/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Store, 
  ShoppingCart, 
  Package, 
  Share2, 
  Edit, 
  Eye, 
  RefreshCw,
  Copy,
  ExternalLink,
  Plus
} from "lucide-react";
import { toast } from "sonner";
import { MoneyText } from "@/components/erp/MoneyText";
import { OnlineStoreOverview } from "@/components/erp/online-store/OnlineStoreOverview";
import { OnlineOrdersList } from "@/components/erp/online-store/OnlineOrdersList";
import { OnlineCatalogueManager } from "@/components/erp/online-store/OnlineCatalogueManager";
import { StoreInfoDialog } from "@/components/erp/online-store/StoreInfoDialog";

export const Route = createFileRoute("/app/online-store")({
  component: OnlineStorePage,
});

function OnlineStorePage() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const [activeTab, setActiveTab] = useState("overview");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: store, isLoading: isStoreLoading, refetch: refetchStore } = useQuery({
    queryKey: ["online-store-settings", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_store_settings")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["online-store-stats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: allOrders } = await supabase
        .from("online_orders")
        .select("status, total")
        .eq("company_id", companyId!);

      const totalOrders = allOrders?.length || 0;
      const openOrders = allOrders?.filter(o => !["Completed", "Cancelled"].includes(o.status)).length || 0;
      const orderValue = allOrders?.filter(o => o.status !== "Cancelled").reduce((sum, o) => sum + (o.total || 0), 0) || 0;

      return {
        totalOrders,
        openOrders,
        orderValue,
      };
    },
  });

  const shareStore = () => {
    if (!store?.slug) {
      toast.error(t("Please configure your online store first"));
      return;
    }
    const url = `${window.location.origin}/store/${store.slug}`;
    navigator.clipboard.writeText(url);
    toast.success(t("Store link copied"));
  };

  const previewStore = () => {
    if (!store?.slug) return;
    window.open(`/store/${store.slug}`, "_blank");
  };

  if (isStoreLoading) {
    return <div className="p-8 text-center">{t("Loading…")}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Online Store")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setActiveTab("overview")}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("Sync")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
              <Edit className="w-4 h-4 mr-2" />
              {t("Edit Store Info")}
            </Button>
            <Button size="sm" onClick={shareStore}>
              <Share2 className="w-4 h-4 mr-2" />
              {t("Share Online Store")}
            </Button>
          </div>
        }
      />

      {!store ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Store className="w-12 h-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-medium">{t("Store not configured yet")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("Sell online with a free storefront. Catalogue your items, share the link with customers, accept orders and sync them back to ERPOVO automatically.")}
              </p>
            </div>
            <Button onClick={() => setIsEditDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t("Setup Store")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                    <Eye className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Store Views")}</p>
                    <p className="text-2xl font-bold">{store.view_count || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg text-green-600">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Total Orders")}</p>
                    <p className="text-2xl font-bold">{stats?.totalOrders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Open Orders")}</p>
                    <p className="text-2xl font-bold">{stats?.openOrders || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                    <MoneyText value={0} className="hidden" /> {/* to ensure component used */}
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("Order Value")}</p>
                    <p className="text-2xl font-bold">
                      <MoneyText value={stats?.orderValue || 0} />
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
              <TabsTrigger value="orders">{t("Manage Orders")}</TabsTrigger>
              <TabsTrigger value="catalogue">{t("Catalogue")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <OnlineStoreOverview store={store} stats={stats} />
            </TabsContent>
            <TabsContent value="orders">
              <OnlineOrdersList />
            </TabsContent>
            <TabsContent value="catalogue">
              <OnlineCatalogueManager />
            </TabsContent>
          </Tabs>
        </>
      )}

      {isEditDialogOpen && (
        <StoreInfoDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          store={store}
          onSuccess={() => {
            refetchStore();
            setIsEditDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
