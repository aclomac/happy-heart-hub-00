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
import { Search, Plus, Minus, Trash2, ShoppingCart, X, UserPlus, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

const POS_CART_KEY = "erpovo_demo_pos_cart";
type PersistedCart = {
  cart: Line[];
  partyId: string;
  paymentMethod: string;
  discount: number;
  received: number;
  vatPct?: number;
  notes?: string;
};
function loadPersistedCart(): PersistedCart | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_CART_KEY);
    return raw ? (JSON.parse(raw) as PersistedCart) : null;
  } catch {
    return null;
  }
}
import { getSales } from "@/lib/demo/sales";

/**
 * Generate next POS invoice number in format POS-YYYY-####.
 * Scans existing sales (demo localStorage) to keep the sequence unique
 * per calendar year and stable across refresh.
 */
function nextPosInvoiceNo(): string {
  const year = new Date().getFullYear();
  const prefix = `POS-${year}-`;
  let max = 0;
  try {
    for (const s of getSales()) {
      const no = s.invoice_no || "";
      if (!no.startsWith(prefix)) continue;
      const n = parseInt(no.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  } catch {
    /* ignore */
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
import { saveSaleInvoice } from "@/lib/sale-invoices";
import { toast } from "sonner";
import { printSaleReceiptNow } from "@/components/erp/InvoiceActions";
import { Printer } from "lucide-react";
import { ItemImageThumb } from "@/components/erp/ItemImageThumb";
import { MoneyText } from "@/components/erp/MoneyText";
import { useI18n } from "@/lib/i18n";
import { QuickAddCustomerDialog } from "@/components/erp/QuickAddCustomerDialog";
import { usePermission } from "@/lib/permissions";

import { usePWAStatus } from "@/components/erp/PWAProvider";

export const Route = createFileRoute("/app/pos")({ component: POS });

const WALK_IN_VALUE = "__walkin__";

function CustomerCombobox({
  value,
  onChange,
  parties,
  walkInLabel,
  searchPlaceholder,
  emptyLabel,
  onAddNew,
  addNewLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  parties: { id: string; name: string; phone: string | null; email: string | null }[];
  walkInLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  onAddNew?: (typed: string) => void;
  addNewLabel: (typed: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = parties.find((p) => p.id === value);
  const label =
    value === WALK_IN_VALUE || !selected
      ? walkInLabel
      : selected.phone
        ? `${selected.name} · ${selected.phone}`
        : selected.name;
  const trimmed = query.trim();
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
          data-testid="pos-customer-combobox"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command
          filter={(itemValue, search) => {
            if (!search) return 1;
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            autoFocus
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-stretch gap-2 px-2 py-3 text-sm">
                <span className="text-muted-foreground">{emptyLabel}</span>
                {onAddNew && trimmed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onAddNew(trimmed);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    {addNewLabel(trimmed)}
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`${walkInLabel} walkin`}
                onSelect={() => {
                  onChange(WALK_IN_VALUE);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === WALK_IN_VALUE ? "opacity-100" : "opacity-0",
                  )}
                />
                {walkInLabel}
              </CommandItem>
              {parties.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.phone ?? ""} ${p.email ?? ""} ${p.id}`}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 mt-0.5 shrink-0",
                      value === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{p.name}</span>
                    {p.phone && (
                      <span className="text-xs text-muted-foreground truncate">
                        {p.phone}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {onAddNew && trimmed && (
                <CommandItem
                  value={`__add_new__ ${trimmed}`}
                  onSelect={() => {
                    onAddNew(trimmed);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {addNewLabel(trimmed)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  const WALK_IN = "__walkin__";
  const persisted = useMemo(() => loadPersistedCart(), []);
  const [cart, setCart] = useState<Line[]>(persisted?.cart ?? []);
  const [partyId, setPartyId] = useState<string>(persisted?.partyId ?? WALK_IN);
  const [paymentMethod, setPaymentMethod] = useState(persisted?.paymentMethod ?? "cash");
  const [discount, setDiscount] = useState(persisted?.discount ?? 0);
  const [received, setReceived] = useState(persisted?.received ?? 0);
  const [vatPct, setVatPct] = useState(persisted?.vatPct ?? 0);
  const [notes, setNotes] = useState(persisted?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [lastInvoiceNo, setLastInvoiceNo] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddPrefill, setQuickAddPrefill] = useState<{ name?: string; phone?: string }>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        POS_CART_KEY,
        JSON.stringify({ cart, partyId, paymentMethod, discount, received, vatPct, notes }),
      );
    } catch {
      /* ignore */
    }
  }, [cart, partyId, paymentMethod, discount, received, vatPct, notes]);


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
        .select("id,name,phone,email")
        .is("deleted_at", null)
        .eq("company_id", companyId!)
        .in("type", ["customer", "both"])
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; phone: string | null; email: string | null }[];
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
        .map((l) => {
          if (l.item.id !== id) return l;
          const next = l.qty + delta;
          if (delta > 0 && !l.item.is_service && next > Number(l.item.stock)) {
            toast.warning(`Only ${l.item.stock} ${l.item.unit} in stock`);
            return l;
          }
          return { ...l, qty: Math.max(0, next) };
        })
        .filter((l) => l.qty > 0),
    );
  };
  const setQty = (id: string, raw: string) => {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 0) return;
    setCart((c) =>
      c
        .map((l) => {
          if (l.item.id !== id) return l;
          let q = n;
          if (!l.item.is_service && q > Number(l.item.stock)) {
            toast.warning(`Only ${l.item.stock} ${l.item.unit} in stock`);
            q = Number(l.item.stock);
          }
          return { ...l, qty: q };
        })
        .filter((l) => l.qty > 0),
    );
  };
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.item.id !== id));
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setReceived(0);
    setPartyId(WALK_IN);
    setVatPct(0);
    setNotes("");
    if (typeof window !== "undefined") {
      try { localStorage.removeItem(POS_CART_KEY); } catch { /* ignore */ }
    }
  };

  const subtotal = cart.reduce((s, l) => s + l.qty * Number(l.item.sale_price), 0);
  const itemTax = cart.reduce(
    (s, l) => s + (l.qty * Number(l.item.sale_price) * Number(l.item.tax_rate)) / 100,
    0,
  );
  const extraVat = Math.max(0, subtotal) * (Math.max(0, vatPct) / 100);
  const tax = itemTax + extraVat;
  const total = Math.max(0, subtotal + tax - Math.max(0, discount));
  const balance = total - Math.max(0, received);

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
    if (discount < 0) {
      toast.error("Discount cannot be negative");
      return;
    }
    if (received < 0) {
      toast.error("Received amount cannot be negative");
      return;
    }
    if (vatPct < 0) {
      toast.error("VAT cannot be negative");
      return;
    }
    for (const l of cart) {
      if (!l.item.is_service && l.qty > Number(l.item.stock)) {
        toast.error(`${l.item.name}: only ${l.item.stock} ${l.item.unit} in stock`);
        return;
      }
      if (!l.item.is_service && Number(l.item.stock) <= 0) {
        toast.error(`${l.item.name} is out of stock`);
        return;
      }
    }
    setSaving(true);
    try {
      const invoiceNo = nextPosInvoiceNo();
      const isCredit = paymentMethod === "credit";
      const effReceived = isCredit ? 0 : received;
      const effBalance = total - effReceived;
      const status = effBalance <= 0 ? "paid" : effReceived > 0 ? "partial" : "unpaid";
      const paidAmt = Math.min(effReceived, total);
      // Map UI methods (bkash/nagad) onto the saveSaleInvoice enum.
      const methodMap: Record<string, "cash" | "bank" | "mobile" | "card" | "cheque" | "upi"> = {
        cash: "cash",
        bank: "bank",
        card: "card",
        bkash: "mobile",
        nagad: "mobile",
        credit: "cash",
      };
      const method = methodMap[paymentMethod] ?? "cash";
      const noteParts = ["POS Sale"];
      if (paymentMethod === "bkash") noteParts.push("Paid via bKash");
      if (paymentMethod === "nagad") noteParts.push("Paid via Nagad");
      if (notes.trim()) noteParts.push(notes.trim());
      const saleId = await saveSaleInvoice({
        company_id: companyId,
        invoice_no: invoiceNo,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: null,
        party_id: partyId && partyId !== WALK_IN ? partyId : null,
        subtotal,
        discount: Math.max(0, discount),
        tax,
        delivery_charge: 0,
        total,
        paid: paidAmt,
        balance: Math.max(0, effBalance),
        status,
        notes: noteParts.join(" · "),
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
      setLastInvoiceNo(invoiceNo);
      qc.invalidateQueries({ queryKey: ["pos-items"] });
      // Auto-print thermal receipt (safe; never throws to UI)
      printSaleReceiptNow(saleId, companyId).catch(() => {
        toast.message("Receipt preview unavailable in demo mode");
      });
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
            {filtered.map((item) => {
              const outOfStock = !item.is_service && Number(item.stock) <= 0;
              return (
              <button
                type="button"
                key={item.id}
                onClick={() => addToCart(item)}
                disabled={outOfStock}
                className={`bg-background border rounded-md p-3 text-left transition-all flex flex-col cursor-pointer ${
                  outOfStock
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:border-primary hover:shadow-md active:scale-[0.98]"
                }`}
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
                      <span className={`text-[10px] ${outOfStock ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {outOfStock ? "Out of Stock" : `${Number(item.stock)} ${item.unit}`}
                      </span>
                    )}
                    <Button
                      asChild
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                    >
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(item);
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </span>
                    </Button>
                  </div>
              </button>
              );
            })}
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
              <CustomerCombobox
                value={partyId}
                onChange={setPartyId}
                parties={parties}
                walkInLabel={t("Walk-in Customer")}
                searchPlaceholder={t("Search customer by name or phone…")}
                emptyLabel={t("No customer found")}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              data-testid="pos-add-customer-btn"
              title={!canAddCustomer ? t("You do not have permission to add customers") : undefined}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowQuickAdd(true);
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              {t("New Customer")}
            </Button>

            <QuickAddCustomerDialog
              open={showQuickAdd}
              onOpenChange={setShowQuickAdd}
              companyId={companyId ?? ""}
              onCreated={(p) => {
                qc.invalidateQueries({ queryKey: ["pos-parties", companyId] });
                setPartyId(p.id);
                toast.success(t("Customer added and selected"));
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
                      <Input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) => setQty(l.item.id, e.target.value)}
                        className="h-7 w-12 text-center text-sm font-semibold px-1"
                      />

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
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">VAT %</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-7 w-24 text-right"
                value={vatPct || ""}
                placeholder="0"
                onChange={(e) => setVatPct(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Tax (items + VAT)</span>
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
                min={0}
                className="h-7 w-24 text-right"
                value={discount || ""}
                placeholder="0"
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
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
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="credit">Credit / Due</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                className="h-9"
                placeholder={paymentMethod === "credit" ? "Credit (no payment)" : "Received"}
                value={paymentMethod === "credit" ? "" : received || ""}
                disabled={paymentMethod === "credit"}
                onChange={(e) => setReceived(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <Input
              className="h-9"
              placeholder="Payment notes (optional)"
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className="font-semibold">
                {paymentMethod === "credit" || received <= 0
                  ? "Due"
                  : balance <= 0
                    ? "Paid"
                    : "Partial"}
              </span>
            </div>
            {received > 0 && paymentMethod !== "credit" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{balance > 0 ? "Balance Due" : "Change"}</span>
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
            {lastSaleId && lastInvoiceNo && cart.length === 0 && (
              <div className="border rounded-md p-3 mt-2 bg-success/5 space-y-2">
                <div className="text-xs font-semibold text-success">
                  Last sale: {lastInvoiceNo}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      printSaleReceiptNow(lastSaleId, companyId!).catch(() =>
                        toast.message("Receipt preview unavailable in demo mode"),
                      )
                    }
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/app/sales/${lastSaleId}/edit`, "_blank")}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLastSaleId(null);
                      setLastInvoiceNo(null);
                    }}
                  >
                    New
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
