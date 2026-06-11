import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { ShoppingCart, Phone, MapPin, Tag, Package, Plus, Minus, Trash2, CheckCircle2 } from "lucide-react";
import { MoneyText } from "@/components/erp/MoneyText";
import { toast } from "sonner";
import {
  ensureOnlineStoreSeed,
  getOnlineStore,
  getOnlineProducts,
  addOnlineOrder,
  type DemoOnlineProduct,
  type DemoOnlineOrder,
} from "@/lib/demo/online-store";

export const Route = createFileRoute("/store/$slug")({
  component: StorefrontPage,
});

type CartLine = { sku: string; name: string; qty: number; price: number };

function StorefrontPage() {
  const { slug } = Route.useParams();
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<DemoOnlineOrder | null>(null);

  useEffect(() => { ensureOnlineStoreSeed(); }, []);
  const store = useMemo(() => { ensureOnlineStoreSeed(); return getOnlineStore(); }, []);
  const products = useMemo<DemoOnlineProduct[]>(
    () => getOnlineProducts().filter((p) => p.visible && p.status === "published"),
    [tick],
  );

  if (!store) {
    return <div className="p-12 text-center text-muted-foreground">{t("Store not found")}</div>;
  }
  // The local demo only knows one store; we still honor the slug visually.
  const isMatch = !store.slug || store.slug === slug;
  if (!isMatch) {
    return <div className="p-12 text-center text-muted-foreground">{t("Store not found")}</div>;
  }

  const addToCart = (p: DemoOnlineProduct) => {
    setCart((prev) => {
      const ex = prev.find((l) => l.sku === p.sku);
      if (ex) return prev.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { sku: p.sku, name: p.name, qty: 1, price: p.discount_price || p.sale_price }];
    });
    toast.success(t("Added to cart"));
    setCartOpen(true);
  };

  const updateQty = (sku: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.sku === sku ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  };
  const removeLine = (sku: string) => setCart((prev) => prev.filter((l) => l.sku !== sku));
  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const address = (store.settings as any)?.address;
  const category = (store.settings as any)?.category;

  return (
    <div className="min-h-screen bg-slate-50">
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
          <Button variant="outline" size="sm" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            {t("Cart")} ({cartCount})
          </Button>
        </div>
      </header>

      <div className="bg-white border-b py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <h1 className="text-3xl font-extrabold">{store.store_name}</h1>
          <p className="text-muted-foreground max-w-2xl">{store.description}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {category && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Tag className="w-4 h-4" /><span>{category}</span>
              </div>
            )}
            {store.whatsapp_number && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="w-4 h-4" /><span>{store.whatsapp_number}</span>
              </div>
            )}
            {address && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="w-4 h-4" /><span>{address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!products.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{t("No products available in the online store yet.")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <Card key={p.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-12 h-12 text-slate-200" />
                  )}
                </div>
                <CardContent className="p-4 space-y-2">
                  {p.category && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {p.category}
                    </Badge>
                  )}
                  <h3 className="font-bold truncate">{p.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                    {p.short_description}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <div className="font-bold text-lg text-primary">
                      <MoneyText value={p.discount_price || p.sale_price} />
                    </div>
                    <Button size="sm" disabled={p.stock <= 0} onClick={() => addToCart(p)}>
                      {p.stock <= 0 ? t("Out of stock") : t("Add to Cart")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <footer className="py-12 border-t mt-12 bg-white">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground font-medium">
            Powered by <span className="text-primary">ERPOVO</span>
          </p>
        </div>
      </footer>

      {/* Cart sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>{t("Your Cart")} ({cartCount})</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {cart.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">{t("Cart is empty")}</div>
            ) : (
              cart.map((l) => (
                <div key={l.sku} className="flex items-center gap-2 border rounded-md p-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <MoneyText value={l.price} /> × {l.qty}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.sku, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{l.qty}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.sku, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLine(l.sku)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <SheetFooter className="border-t pt-3 flex-col gap-2 sm:flex-col sm:space-x-0">
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">{t("Subtotal")}</span>
              <span className="font-bold"><MoneyText value={subtotal} /></span>
            </div>
            <Button
              className="w-full"
              disabled={cart.length === 0}
              onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}
            >
              {t("Checkout")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        store={store}
        onPlaced={(order) => {
          setConfirmed(order);
          setCart([]);
          setCheckoutOpen(false);
          setTick((n) => n + 1);
        }}
      />

      <Dialog open={!!confirmed} onOpenChange={(o) => !o && setConfirmed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" /> {t("Order placed")}
            </DialogTitle>
          </DialogHeader>
          {confirmed && (
            <div className="space-y-2 text-sm">
              <div>
                {t("Order number")}: <span className="font-mono font-bold">{confirmed.order_no}</span>
              </div>
              <div>{t("Customer")}: {confirmed.customer_name} ({confirmed.customer_phone})</div>
              <div>{t("Items")}: {confirmed.items.reduce((s, i) => s + i.qty, 0)}</div>
              <div className="font-medium">
                {t("Total")}: <MoneyText value={confirmed.total} />
              </div>
              <p className="text-muted-foreground pt-2">
                {t("We'll contact you shortly to confirm your order.")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setConfirmed(null)}>{t("Continue shopping")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckoutDialog({
  open, onOpenChange, cart, store, onPlaced,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cart: CartLine[];
  store: NonNullable<ReturnType<typeof getOnlineStore>>;
  onPlaced: (order: DemoOnlineOrder) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [method, setMethod] = useState<DemoOnlineOrder["payment_method"]>("COD");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const delivery =
    city === "Dhaka"
      ? store.settings?.delivery_charge_inside ?? 0
      : store.settings?.delivery_charge_outside ?? 0;
  const total = subtotal + delivery;

  const submit = () => {
    if (!name.trim() || !phone.trim() || !addr.trim()) {
      toast.error(t("Please fill name, phone and address"));
      return;
    }
    if (cart.length === 0) {
      toast.error(t("Cart is empty"));
      return;
    }
    setBusy(true);
    try {
      const order = addOnlineOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: addr.trim(),
        city,
        items: cart,
        delivery_charge: delivery,
        payment_method: method,
        notes: notes.trim(),
      });
      toast.success(`${t("Order placed")}: ${order.order_no}`);
      onPlaced(order);
    } catch (e: any) {
      toast.error(e?.message || t("Failed to place order"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("Checkout")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t("Full name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>{t("Phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("City")}</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna", "Other"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("Address")}</Label>
            <Textarea value={addr} onChange={(e) => setAddr(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>{t("Payment method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as DemoOnlineOrder["payment_method"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="COD">COD</SelectItem>
                <SelectItem value="bKash">bKash</SelectItem>
                <SelectItem value="Nagad">Nagad</SelectItem>
                <SelectItem value="Bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("Notes (optional)")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
            <div className="flex justify-between"><span>{t("Subtotal")}</span><MoneyText value={subtotal} /></div>
            <div className="flex justify-between"><span>{t("Delivery")}</span><MoneyText value={delivery} /></div>
            <div className="flex justify-between font-bold pt-1 border-t"><span>{t("Total")}</span><MoneyText value={total} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={submit} disabled={busy}>{busy ? t("Placing…") : t("Place order")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
