import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, ShoppingCart, X, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { nextDocNumber } from "@/lib/doc-number";
import { saveSaleInvoice } from "@/lib/sale-invoices";
import { toast } from "sonner";
import { printSaleReceiptNow } from "@/components/erp/InvoiceActions";
import { Printer } from "lucide-react";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import { MoneyText } from "@/components/erp/MoneyText";
import { useI18n } from "@/lib/i18n";
import { QuickAddCustomerDialog } from "@/components/erp/QuickAddCustomerDialog";
import { usePermission } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePWAStatus } from "@/components/erp/PWAProvider";

export const Route = createFileRoute("/app/pos")({ component: POS });

type Item = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  sale_price: number;
  tax_rate: number;
  unit: string;
  stock: number;
  is_service: boolean;
  image_url: string | null;
};
type Line = { item: Item; qty: number };

export function POS() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { isOffline } = usePWAStatus();
  const canAddCustomer = usePermission("parties", "add");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<Line[]>([]);
  // Radix Select forbids "" as an item value, so we use a sentinel for
  // "walk-in" and translate it back to null on persist.
  const WALK_IN = "__walkin__";
  const [partyId, setPartyId] = useState<string>(WALK_IN);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState(0);
  const [received, setReceived] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["pos-items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
          .from("items")
          .select("id,name,sku,category,sale_price,tax_rate,unit,stock,is_service,image_url")
          .is("deleted_at", null)
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("name");
      if (error) throw error;
      return data as Item[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["pos-parties", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id,name")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["customer", "both"])
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.category && set.add(i.category));
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (search === "" ||
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          (i.sku || "").toLowerCase().includes(search.toLowerCase())),
    );
  }, [items, search, category]);

  const addToCart = (item: Item) => {
    if (!item.is_service && Number(item.stock) <= 0) {
      toast.error(`${item.name} is out of stock`);
      return;
    }
    setCart((c) => {
      const ex = c.find((l) => l.item.id === item.id);
      if (ex) {
        if (!item.is_service && ex.qty + 1 > Number(item.stock)) {
          toast.warning(`Only ${item.stock} ${item.unit} in stock`);
          return c;
        }
        return c.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...c, { item, qty: 1 }];
    });
  };
  const changeQty = (id: string, delta: number) => {
    setCart((c) =>
      c
        .map((l) => (l.item.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  };
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.item.id !== id));
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setReceived(0);
    setPartyId(WALK_IN);
  };

  const subtotal = cart.reduce((s, l) => s + l.qty * Number(l.item.sale_price), 0);
  const tax = cart.reduce(
    (s, l) => s + (l.qty * Number(l.item.sale_price) * Number(l.item.tax_rate)) / 100,
    0,
  );
  const total = Math.max(0, subtotal + tax - discount);
  const balance = total - received;

  if (!companyId)
    return (
      <div>
        <PageHeader title="POS · Point of Sale" />
        <NoCompanySelected />
      </div>
    );

  const checkout = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setSaving(true);
    try {
      const invoiceNo = await nextDocNumber(companyId, "sales", "POS");
      const isCredit = paymentMethod === "credit";
      const effReceived = isCredit ? 0 : received;
      const effBalance = total - effReceived;
      const status = effBalance <= 0 ? "paid" : effReceived > 0 ? "partial" : "unpaid";
      const paidAmt = Math.min(effReceived, total);
      const method = (isCredit ? "cash" : paymentMethod) as
        | "cash"
        | "bank"
        | "mobile"
        | "card"
        | "cheque"
        | "upi";
      const saleId = await saveSaleInvoice({
        company_id: companyId,
        invoice_no: invoiceNo,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        party_id: partyId && partyId !== WALK_IN ? partyId : null,
        subtotal,
        discount,
        tax,
        delivery_charge: 0,
        total,
        paid: paidAmt,
        balance: Math.max(0, effBalance),
        status,
        notes: "POS Sale",
        payment_method: method,
        bank_account_id: null,
        doc_type: "invoice",
        affect_stock: -1,
        payment_direction: paidAmt > 0 ? "in" : null,
        receivable_sign: 1,

        items: cart.map((l) => ({
          item_id: l.item.id,
          variant_id: null,
          item_name: l.item.name,
          qty: l.qty,
          unit: l.item.unit,
          price: l.item.sale_price,
          discount_pct: 0,
          tax_pct: l.item.tax_rate,
          amount: l.qty * Number(l.item.sale_price) * (1 + Number(l.item.tax_rate) / 100),
        })),
      });

      toast.success(`Sale ${invoiceNo} completed`);
      setLastSaleId(saleId);
      qc.invalidateQueries({ queryKey: ["pos-items"] });
      // Auto-print thermal receipt
      printSaleReceiptNow(saleId, companyId).catch(() => {});
      clearCart();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="POS · Point of Sale"
        subtitle="Fast retail checkout"
        actions={
          lastSaleId ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => printSaleReceiptNow(lastSaleId, companyId!)}
            >
              <Printer className="w-3.5 h-3.5" />
              Reprint last receipt
            </Button>
          ) : undefined
        }
      />
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-3"
        style={{ minHeight: "calc(100vh - 220px)" }}
      >
        {/* Items grid */}
        <div className="bg-card border rounded-md flex flex-col">
          <div className="p-3 border-b flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search items by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2 content-start">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-background border rounded-md p-3 text-left hover:border-primary hover:shadow-md transition-all flex flex-col"
                data-testid="pos-item-card"
              >
                <div className="flex gap-2">
                  <ItemImageThumb
                    src={item.image_url}
                    alt={item.name}
                    className="w-12 h-12 rounded shrink-0"
                    iconClassName="w-4 h-4"
                    data-testid="pos-item-thumb"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium line-clamp-2">{item.name}</div>
                    {item.sku && (
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                        {item.sku}
                      </div>
                    )}
                  </div>
                </div>
                
                  <div className="flex justify-between items-end mt-auto pt-2">
                    <span className="text-primary font-bold">
                      <MoneyText value={`৳ ${Number(item.sale_price).toLocaleString()}`} />
                    </span>
                    {!item.is_service && (
                      <span className="text-[10px] text-muted-foreground">
                        {Number(item.stock)} {item.unit}
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => addToCart(item)}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">
                No items found
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="bg-card border rounded-md flex flex-col">
          <div className="p-3 border-b flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-semibold text-sm">Cart · {cart.length}</span>
            </div>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart}>
                <X className="w-3.5 h-3.5" />
                Clear
              </Button>
            )}
          </div>
          <div className="p-3 border-b flex gap-1.5">
            <div className="flex-1">
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("Walk-in Customer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WALK_IN}>{t("Walk-in Customer")}</SelectItem>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    data-testid="pos-add-customer-btn"
                    disabled={!canAddCustomer}
                    onClick={() => setShowQuickAdd(true)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {t("New Customer")}
                  </Button>
                </TooltipTrigger>
                {!canAddCustomer && (
                  <TooltipContent>
                    <p>{t("You do not have permission to add customers")}</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

            <QuickAddCustomerDialog
              open={showQuickAdd}
              onOpenChange={setShowQuickAdd}
              companyId={companyId!}
              onCreated={(p) => {
                qc.invalidateQueries({ queryKey: ["pos-parties", companyId] });
                setPartyId(p.id);
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                Click items to add to cart
              </div>
            ) : (
              cart.map((l) => {
                const price = Number(l.item.sale_price);
                return (
                  <div key={l.item.id} className="flex items-center gap-2 p-3 border-b">
                    <ItemImageThumb
                      src={l.item.image_url}
                      alt={l.item.name}
                      className="w-10 h-10 rounded shrink-0"
                      iconClassName="w-4 h-4"
                      data-testid="pos-cart-thumb"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.item.name}</div>
                      
                      <div className="text-xs text-muted-foreground">
                        <MoneyText value={`৳ ${price.toLocaleString()}`} /> ×{" "}
                        {l.qty}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => changeQty(l.item.id, -1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-semibold">{l.qty}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => changeQty(l.item.id, 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="font-semibold w-20 text-right text-sm">
                      <MoneyText
                        value={`৳ ${(l.qty * price).toLocaleString()}`}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeLine(l.item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-sale" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <div className="p-3 border-t space-y-2 text-sm bg-muted/30">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>
                <MoneyText value={`৳ ${subtotal.toLocaleString()}`} />
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>
                <MoneyText
                  value={`৳ ${tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                />
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Discount</span>
              <Input
                type="number"
                className="h-7 w-24 text-right"
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex justify-between border-t pt-2 text-lg">
              <span className="font-bold">Total</span>
              <span className="font-bold text-primary">
                <MoneyText
                  value={`৳ ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                />
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank">Bank/UPI</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="h-9"
                placeholder={paymentMethod === "credit" ? "Credit (no payment)" : "Received"}
                value={paymentMethod === "credit" ? "" : received || ""}
                disabled={paymentMethod === "credit"}
                onChange={(e) => setReceived(Number(e.target.value) || 0)}
              />
            </div>
            {received > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{balance > 0 ? "Balance" : "Change"}</span>
                <span className={`font-bold ${balance > 0 ? "num-neg" : "num-pos"}`}>
                  <MoneyText
                    value={`৳ ${Math.abs(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  />
                </span>
              </div>
            )}
            <Button
              variant="success"
              className="w-full h-10 mt-2"
              disabled={saving || cart.length === 0 || isOffline}
              onClick={checkout}
            >
              {saving
                ? "Processing…"
                : `Charge ৳ ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
