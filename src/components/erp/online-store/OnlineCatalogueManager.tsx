import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/erp/MoneyText";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ensureOnlineStoreSeed, getOnlineProducts, setOnlineProducts,
} from "@/lib/demo/online-store";

export function OnlineCatalogueManager() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all"); // all | published | unpublished
  const [stock, setStock] = useState<string>("all"); // all | in | low | out
  const [featured, setFeatured] = useState<string>("all"); // all | yes | no
  const [tick, setTick] = useState(0);

  const items = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineProducts(); }, [tick]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((p) => p.category))).sort(),
    [items],
  );

  const toggleVisible = (sku: string) => {
    const next = getOnlineProducts().map((p) => p.sku === sku ? { ...p, visible: !p.visible } : p);
    setOnlineProducts(next);
    setTick((n) => n + 1);
    toast.success(t("Updated"));
  };

  const updatePrice = (sku: string, raw: string) => {
    const price = parseFloat(raw);
    if (isNaN(price)) return;
    const next = getOnlineProducts().map((p) => p.sku === sku ? { ...p, discount_price: price } : p);
    setOnlineProducts(next);
    setTick((n) => n + 1);
    toast.success(t("Price updated"));
  };

  const filtered = items.filter((p) => {
    const q = search.toLowerCase();
    if (q && !(
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )) return false;
    if (category !== "all" && p.category !== category) return false;
    if (status === "published" && !p.visible) return false;
    if (status === "unpublished" && p.visible) return false;
    if (stock === "in" && p.stock <= 0) return false;
    if (stock === "low" && !(p.stock > 0 && p.stock <= 10)) return false;
    if (stock === "out" && p.stock !== 0) return false;
    if (featured === "yes" && !p.featured) return false;
    if (featured === "no" && p.featured) return false;
    return true;
  });

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t("Search item")} className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder={t("Category")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Categories")}</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Status")}</SelectItem>
            <SelectItem value="published">{t("Published")}</SelectItem>
            <SelectItem value="unpublished">{t("Unpublished")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stock} onValueChange={setStock}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Stock")}</SelectItem>
            <SelectItem value="in">{t("In Stock")}</SelectItem>
            <SelectItem value="low">{t("Low Stock")}</SelectItem>
            <SelectItem value="out">{t("Out of Stock")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={featured} onValueChange={setFeatured}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Items")}</SelectItem>
            <SelectItem value="yes">{t("Featured")}</SelectItem>
            <SelectItem value="no">{t("Not Featured")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-xs text-muted-foreground">
        {t("Showing")} {filtered.length} / {items.length}
      </div>
      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Item Name")}</TableHead>
              <TableHead>{t("Category")}</TableHead>
              <TableHead>{t("Stock")}</TableHead>
              <TableHead>{t("ERP Price")}</TableHead>
              <TableHead>{t("Online Price")}</TableHead>
              <TableHead className="text-right">{t("Visible Online")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("No items found")}</TableCell></TableRow>
            ) : filtered.map((item) => (
              <TableRow key={item.sku}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded object-cover border" loading="lazy" />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {item.name}
                        {item.featured && <Badge variant="secondary" className="text-[10px]">{t("Featured")}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{item.sku}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
                <TableCell>{item.stock === 0 ? <Badge variant="destructive">{t("Out")}</Badge> : item.stock}</TableCell>
                <TableCell><MoneyText value={item.sale_price} /></TableCell>
                <TableCell>
                  <Input type="number" defaultValue={item.discount_price}
                    onBlur={(e) => updatePrice(item.sku, e.target.value)} className="w-24 h-8" />
                </TableCell>
                <TableCell className="text-right">
                  <Switch checked={item.visible} onCheckedChange={() => toggleVisible(item.sku)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
