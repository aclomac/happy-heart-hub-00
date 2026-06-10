import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useI18n } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/erp/MoneyText";
import { toast } from "sonner";
import { useState } from "react";
import { Search } from "lucide-react";

export function OnlineCatalogueManager() {
  const { t } = useI18n();
  const companyId = useCurrentCompanyId();
  const [search, setSearch] = useState("");

  const { data: items, isLoading, refetch } = useQuery({
    queryKey: ["online-catalogue-items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // Fetch all items and their online store settings
      const { data: allItems, error: itemsError } = await supabase
        .from("items")
        .select("id, name, sku, sale_price")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");

      if (itemsError) throw itemsError;

      const { data: onlineItems, error: onlineError } = await supabase
        .from("online_store_items")
        .select("*")
        .eq("company_id", companyId!);

      if (onlineError) throw onlineError;

      return allItems.map(item => {
        const online = onlineItems?.find(oi => oi.item_id === item.id);
        return {
          ...item,
          is_active: !!online?.visible,
          online_price: online?.online_price || item.sale_price,
          online_item_id: online?.id
        };
      });
    },
  });

  const toggleOnline = async (item: any) => {
    if (item.online_item_id) {
      // Update existing
      const { error } = await supabase
        .from("online_store_items")
        .update({ visible: !item.is_active })
        .eq("id", item.online_item_id);

      if (error) toast.error(t("Failed to update"));
      else refetch();
    } else {
      // Create new
      const { error } = await supabase
        .from("online_store_items")
        .insert({
          company_id: companyId!,
          item_id: item.id,
          visible: true,
          online_price: item.sale_price || 0
        });

      if (error) toast.error(t("Failed to add to store"));
      else refetch();
    }
  };

  const updatePrice = async (item: any, newPrice: string) => {
    const price = parseFloat(newPrice);
    if (isNaN(price)) return;

    if (item.online_item_id) {
      const { error } = await supabase
        .from("online_store_items")
        .update({ online_price: price })
        .eq("id", item.online_item_id);

      if (error) toast.error(t("Failed to update price"));
      else refetch();
    } else {
      const { error } = await supabase
        .from("online_store_items")
        .insert({
          company_id: companyId!,
          item_id: item.id,
          visible: true,
          online_price: price
        });

      if (error) toast.error(t("Failed to update price"));
      else refetch();
    }
  };

  const filteredItems = items?.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.sku?.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) return <div className="py-8 text-center">{t("Loading…")}</div>;

  return (
    <div className="mt-6 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder={t("Search item")} 
          className="pl-10" 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Item Name")}</TableHead>
              <TableHead>{t("ERP Price")}</TableHead>
              <TableHead>{t("Online Price")}</TableHead>
              <TableHead className="text-right">{t("Visible Online")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filteredItems?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {t("No items found")}
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.sku}</div>
                  </TableCell>
                  <TableCell>
                    <MoneyText value={item.sale_price || 0} />
                  </TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      defaultValue={item.online_price}
                      onBlur={(e) => updatePrice(item, e.target.value)}
                      className="w-24 h-8"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch 
                      checked={item.is_active} 
                      onCheckedChange={() => toggleOnline(item)} 
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
