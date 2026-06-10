import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Globe, Phone, MapPin, Tag, Package } from "lucide-react";
import { MoneyText } from "@/components/erp/MoneyText";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/store/$slug")({
  component: StorefrontPage,
});

function StorefrontPage() {
  const { slug } = Route.useParams();
  const { t } = useI18n();

  // 1. Fetch Store Settings (Publicly accessible)
  const { data: store, isLoading: isStoreLoading } = useQuery({
    queryKey: ["public-store-settings", slug],
    queryFn: async () => {
      // Security: Select only public-facing fields. NO internal IDs or sensitive settings.
      const { data, error } = await supabase
        .from("online_store_settings")
        .select("store_name, description, logo_url, whatsapp_number, settings, company_id")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch Catalogue (Publicly accessible, scoped to this company)
  const { data: catalogue, isLoading: isCatalogueLoading } = useQuery({
    queryKey: ["public-catalogue", store?.company_id],
    enabled: !!store?.company_id,
    queryFn: async () => {
      // Security: Join items with online_store_items. 
      // Select ONLY public fields (name, description, image, price).
      // NO purchase_price, NO margin, NO supplier_id.
      const { data, error } = await supabase
        .from("online_store_items")
        .select(`
          online_price,
          online_description,
          online_image_url,
          online_category,
          items (
            name,
            unit,
            sale_price
          )
        `)
        .eq("company_id", store!.company_id)
        .eq("visible", true);
      
      if (error) throw error;
      return data;
    },
  });

  if (isStoreLoading) return <div className="p-12 text-center">{t("Loading…")}</div>;
  if (!store) return <div className="p-12 text-center text-muted-foreground">{t("Store not found")}</div>;

  const address = (store.settings as any)?.address;
  const category = (store.settings as any)?.category;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt="Logo" className="w-8 h-8 rounded object-cover" />
            ) : (
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold">
                {store.store_name[0]}
              </div>
            )}
            <span className="font-bold text-lg">{store.store_name}</span>
          </div>
          <Button variant="outline" size="sm">
            <ShoppingCart className="w-4 h-4 mr-2" />
            {t("Cart")} (0)
          </Button>
        </div>
      </header>

      {/* Store Banner */}
      <div className="bg-white border-b py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <h1 className="text-3xl font-extrabold">{store.store_name}</h1>
          <p className="text-muted-foreground max-w-2xl">{store.description}</p>
          
          <div className="flex flex-wrap gap-4 text-sm">
            {category && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Tag className="w-4 h-4" />
                <span>{category}</span>
              </div>
            )}
            {store.whatsapp_number && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>{store.whatsapp_number}</span>
              </div>
            )}
            {address && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <span>{address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Catalogue */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {isCatalogueLoading ? (
          <div className="text-center py-12">{t("Loading products…")}</div>
        ) : !catalogue?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("No products available in the online store yet.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogue.map((row: any, i) => (
              <Card key={i} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {row.online_image_url ? (
                    <img 
                      src={row.online_image_url} 
                      alt={row.items?.name} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <Globe className="w-12 h-12 text-slate-200" />
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  {row.online_category && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {row.online_category}
                    </Badge>
                  )}
                  <h3 className="font-bold truncate">{row.items?.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                    {row.online_description}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <div className="font-bold text-lg text-primary">
                      <MoneyText value={row.online_price || row.items?.sale_price || 0} />
                    </div>
                    <Button size="sm">
                      {t("Add to Cart")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t mt-12 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-4">
          <p className="text-sm text-muted-foreground font-medium">
            Powered by <span className="text-primary">ERPOVO</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
