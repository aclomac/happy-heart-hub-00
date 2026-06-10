import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { Share2, ExternalLink, Globe, Phone, MapPin, Tag, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MoneyText } from "@/components/erp/MoneyText";

export function OnlineStoreOverview({ store, stats }: any) {
  const { t } = useI18n();

  const shareStore = () => {
    const url = `${window.location.origin}/store/${store.slug}`;
    navigator.clipboard.writeText(url);
    toast.success(t("Store link copied"));
  };

  const previewStore = () => {
    window.open(`/store/${store.slug}`, "_blank");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {t("Store Information")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center overflow-hidden border">
              {store.logo_url ? (
                <img src={store.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Globe className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-lg">{store.store_name}</h4>
              <p className="text-sm text-muted-foreground">{store.description || t("No description")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{store.settings?.address || t("Address not set")}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span>{store.whatsapp_number || t("WhatsApp not set")}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Tag className="w-4 h-4" />
              <span>{store.settings?.category || t("Category not set")}</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between p-3 bg-muted rounded-md border">
              <div className="text-xs truncate mr-2">
                {window.location.origin}/store/{store.slug}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={shareStore}>
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={previewStore}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            {t("Store Reports")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-muted-foreground">{t("Total Orders")}</span>
              <span className="font-bold">{stats?.totalOrders || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-muted-foreground">{t("Open Orders")}</span>
              <span className="font-bold">{stats?.openOrders || 0}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-muted-foreground">{t("Total Sales")}</span>
              <span className="font-bold"><MoneyText value={`৳ ${stats?.orderValue?.toLocaleString() || "0"}`} /></span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-muted-foreground">{t("Conversion Rate")}</span>
              <span className="font-bold">
                {store.view_count > 0 
                  ? ((stats?.totalOrders / store.view_count) * 100).toFixed(1) + "%" 
                  : "0%"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
