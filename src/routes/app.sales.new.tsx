import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentCompanyId, setCurrentCompanyId } from "@/lib/use-company";
import { DEMO_COMPANY_ID } from "@/lib/demo/constants";
import { isDemoMode } from "@/lib/demo/localStore";
import {
  ensurePartiesSeed,
  getParties,
  setParties,
  getPartyLedger,
  setPartyLedger,
  type DemoParty,
  type DemoPartyLedgerEntry,
} from "@/lib/demo/parties";
import {
  adjustStoreStock,
  ensureInventorySeed,
  getItems,
  getMovements,
  getWarehouses,
  setItems,
  setMovements,
  type DemoItem,
  type DemoStockMovement,
} from "@/lib/demo/inventory";
import {
  ensureSalesSeed,
  getCashTxns,
  getPayments,
  getSaleItems,
  getSales,
  setCashTxns,
  setPayments,
  setSaleItems,
  setSales,
  type DemoCashTxn,
  type DemoPayment,
  type DemoSale,
  type DemoSaleItem,
} from "@/lib/demo/sales";

const searchSchema = z.object({
  duplicate: z.string().optional(),
  source: z.string().optional(),
});

export const Route = createFileRoute("/app/sales/new")({
  validateSearch: (s) => searchSchema.parse(s),
  component: NewSale,
});

function NewSale() {
  Route.useSearch();
  const currentCompanyId = useCurrentCompanyId();
  const companyId = currentCompanyId || DEMO_COMPANY_ID;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [customers, setCustomers] = useState<DemoParty[]>([]);
  const [items, setItemsState] = useState<DemoItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [paid, setPaid] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [discount, setDiscount] = useState("0");
  const [itemSearch, setItemSearch] = useState("");
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftRate, setDraftRate] = useState("0");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLine[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const refreshLocalData = () => {
    ensurePartiesSeed();
    ensureInventorySeed();
    ensureSalesSeed();
    const localCustomers = getParties()
      .filter(
        (p) =>
          !p.deleted_at &&
          p.company_id === companyId &&
          p.is_active !== false &&
          (p.type === "customer" || p.type === "both"),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    setCustomers(localCustomers);
    setItemsState(
      getItems()
        .filter((item) => !item.deleted_at && item.company_id === companyId && item.is_active !== false)
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  };

  useEffect(() => {
    if (!currentCompanyId && isDemoMode()) setCurrentCompanyId(DEMO_COMPANY_ID);
    refreshLocalData();
  }, [currentCompanyId, companyId]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) || null;
  const selectedDraftItem = items.find((item) => item.id === draftItemId) || null;
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.sku || "").toLowerCase().includes(q) ||
          (item.barcode || "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [itemSearch, items]);
  const subtotal = invoiceItems.reduce((sum, line) => sum + line.qty * line.rate, 0);
  const discountAmount = Math.max(0, Number(discount) || 0);
  const vatAmount = 0;
  const total = Math.max(0, subtotal + vatAmount - discountAmount);
  const paidAmount = Math.max(0, Number(paid) || 0);
  const due = Math.max(0, total - paidAmount);

  const onDraftItemChange = (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    setDraftItemId(itemId);
    if (item) setDraftRate(String(Number(item.sale_price) || 0));
  };

  const addItem = () => {
    const item = selectedDraftItem;
    const qty = Number(draftQty);
    const rate = Number(draftRate);
    if (!item) {
      toast.error("Please select an item.");
      return;
    }
    if (qty <= 0 || rate <= 0) {
      toast.error("Please check item quantity and rate.");
      return;
    }
    setInvoiceItems((current) => [
      ...current,
      {
        rowId: genId("line"),
        itemId: item.id,
        itemName: item.name,
        qty,
        rate,
        unit: item.unit || "PCS",
        stock: Number(item.stock || 0),
      },
    ]);
    setDraftItemId("");
    setDraftQty("1");
    setDraftRate("0");
    setItemSearch("");
  };

  const createCustomer = () => {
    const name = newCustomerName.trim();
    if (!name) {
      toast.error("Customer Name is required.");
      return;
    }
    const nowIso = new Date().toISOString();
    const newCustomer: DemoParty = {
      id: genId("customer"),
      company_id: companyId,
      name,
      type: "customer",
      phone: newCustomerPhone.trim() || null,
      email: null,
      address: newCustomerAddress.trim() || null,
      shipping_address: null,
      group_id: null,
      opening_balance: 0,
      balance: 0,
      credit_limit: null,
      loyalty_points: 0,
      gst_number: null,
      is_active: true,
      deleted_at: null,
      created_at: nowIso,
    };
    setParties([newCustomer, ...getParties()]);
    setSelectedCustomerId(newCustomer.id);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerAddress("");
    setCustomerOpen(false);
    refreshLocalData();
    toast.success("Customer created and selected");
  };

  const handleSaveInvoice = () => {
    console.log("SAVE_INVOICE_CLICKED");
    toast.success("Save invoice clicked");
    console.log("SAVE_INVOICE_STATE", {
      selectedCustomer: selectedCustomer
        ? { id: selectedCustomer.id, name: selectedCustomer.name }
        : null,
      itemsLength: invoiceItems.length,
      totals: { subtotal, vatAmount, discount: discountAmount, total, paid: paidAmount, due },
    });

    if (invoiceItems.length === 0) {
      console.log("SAVE_INVOICE_VALIDATION", { ok: false, reason: "no_items" });
      toast.error("Please add at least one item before saving invoice.");
      return;
    }
    if (!selectedCustomer) {
      console.log("SAVE_INVOICE_VALIDATION", { ok: false, reason: "no_customer" });
      toast.error("Please select a customer.");
      return;
    }
    if (invoiceItems.some((line) => line.qty <= 0 || line.rate <= 0)) {
      console.log("SAVE_INVOICE_VALIDATION", { ok: false, reason: "bad_qty_rate" });
      toast.error("Please check item quantity and rate.");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const saleId = genId("sale");
      const invoiceNo = nextInvoiceNumber();
      const paymentStatus = due <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
      const sale: DemoSale & Record<string, unknown> = {
        id: saleId,
        company_id: companyId,
        doc_type: "invoice",
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        due_date: null,
        party_id: selectedCustomer.id,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        phone: selectedCustomer.phone,
        billing_address: selectedCustomer.address,
        subtotal,
        vat_amount: vatAmount,
        discount: discountAmount,
        tax: vatAmount,
        delivery_charge: 0,
        labor_charge: 0,
        total,
        paid: Math.min(paidAmount, total),
        due,
        balance: due,
        payment_status: paymentStatus,
        status: "posted",
        source: "manual",
        payment_method: paidAmount > 0 ? paymentMethod : null,
        notes: null,
        reference_sale_id: null,
        po_no: null,
        po_date: null,
        billing_name: selectedCustomer.name,
        deleted_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const saleItems: DemoSaleItem[] = invoiceItems.map((line) => ({
        id: genId("sale-item"),
        sale_id: saleId,
        item_id: line.itemId,
        variant_id: null,
        item_name: line.itemName,
        description: null,
        qty: line.qty,
        unit: line.unit,
        price: line.rate,
        discount_pct: 0,
        tax_pct: 0,
        amount: line.qty * line.rate,
      }));

      setSales([sale as DemoSale, ...getSales()]);
      setSaleItems([...saleItems, ...getSaleItems()]);
      postStockMovements(companyId, saleId, invoiceNo, invoiceDate, invoiceItems);
      if (paidAmount > 0) postPaymentAndCash(companyId, selectedCustomer.id, saleId, invoiceNo, invoiceDate, paymentMethod, Math.min(paidAmount, total));
      if (due > 0) postCustomerDue(companyId, selectedCustomer.id, invoiceNo, invoiceDate, due);

      console.log("SAVE_INVOICE_VALIDATION", { ok: true });
      console.log("SAVE_INVOICE_SAVED", { id: saleId, invoice_no: invoiceNo });
      toast.success(`Sale invoice saved: ${invoiceNo}`);
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      navigate({ to: "/app/sales" });
    } catch (error) {
      toast.error((error as Error).message || "Could not save sale invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="New Sale Invoice" subtitle="Local personal invoice entry" />

      <section className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <Label className="text-xs">Customer</Label>
            <button
              type="button"
              onClick={() => setCustomerOpen(true)}
              className="text-xs font-medium text-primary hover:underline"
              data-testid="new-customer-button"
            >
              New Customer
            </button>
          </div>
          <Select value={selectedCustomerId || undefined} onValueChange={setSelectedCustomerId}>
            <SelectTrigger data-testid="sale-customer-select">
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.name} {customer.phone ? `· ${customer.phone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Invoice Date</Label>
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Paid</Label>
          <Input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Payment Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Discount</Label>
          <Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
      </section>

      <section className="rounded-md border bg-card p-3">
        <h2 className="mb-3 text-sm font-semibold">Add Item</h2>
        <div className="grid gap-3 md:grid-cols-[1.2fr_1.8fr_0.7fr_0.9fr_auto] md:items-end">
          <div>
            <Label className="text-xs">Search</Label>
            <Input
              value={itemSearch}
              onChange={(event) => setItemSearch(event.target.value)}
              placeholder="Search item, SKU or barcode"
            />
          </div>
          <div>
            <Label className="text-xs">Item</Label>
            <Select value={draftItemId || undefined} onValueChange={onDraftItemChange}>
              <SelectTrigger data-testid="sale-item-select">
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {filteredItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · ৳ {Number(item.sale_price).toLocaleString()} · Stock {Number(item.stock)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Qty</Label>
            <Input type="number" min="0" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Rate</Label>
            <Input type="number" min="0" value={draftRate} onChange={(e) => setDraftRate(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={addItem}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            data-testid="add-invoice-item-button"
          >
            Add Item
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th>Unit</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoiceItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground">
                    No items added yet.
                  </td>
                </tr>
              ) : (
                invoiceItems.map((line) => (
                  <tr key={line.rowId}>
                    <td className="font-medium">{line.itemName}</td>
                    <td className="text-right">{line.qty}</td>
                    <td>{line.unit}</td>
                    <td className="text-right">৳ {line.rate.toLocaleString()}</td>
                    <td className="text-right font-semibold">৳ {(line.qty * line.rate).toLocaleString()}</td>
                    <td className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setInvoiceItems((current) => current.filter((entry) => entry.rowId !== line.rowId))}
                        aria-label={`Remove ${line.itemName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 rounded-md border bg-card p-3 md:grid-cols-[1fr_320px]">
        <div>
          <Label className="text-xs">Billing Address</Label>
          <Textarea value={selectedCustomer?.address || ""} readOnly placeholder="Selected customer address" rows={3} />
        </div>
        <div className="space-y-2 text-sm">
          <TotalRow label="Subtotal" value={subtotal} />
          <TotalRow label="VAT" value={vatAmount} />
          <TotalRow label="Discount" value={discountAmount} />
          <TotalRow label="Total" value={total} strong />
          <TotalRow label="Paid" value={Math.min(paidAmount, total)} />
          <TotalRow label="Due" value={due} strong />
          <button
            type="button"
            onClick={handleSaveInvoice}
            disabled={isSaving}
            className="mt-3 h-10 w-full rounded-md bg-sale px-4 text-sm font-semibold text-sale-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="save-invoice-btn"
          >
            {isSaving ? "Saving…" : "Save Invoice"}
          </button>
        </div>
      </section>

      {(import.meta.env.DEV || isDemoMode()) && (
        <section className="rounded-md border bg-muted p-3 text-xs text-muted-foreground" data-testid="sales-new-debug-panel">
          <div className="font-semibold text-foreground">Sales New Debug</div>
          <div>selected customer id/name: {selectedCustomer ? `${selectedCustomer.id} / ${selectedCustomer.name}` : "none"}</div>
          <div>items count: {invoiceItems.length}</div>
          <div>subtotal: {subtotal}</div>
          <div>Save handler status: attached</div>
        </section>
      )}

      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Customer Name *</Label>
              <Input
                autoFocus
                value={newCustomerName}
                onChange={(event) => setNewCustomerName(event.target.value)}
                data-testid="new-customer-name"
              />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={newCustomerPhone} onChange={(event) => setNewCustomerPhone(event.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Textarea rows={2} value={newCustomerAddress} onChange={(event) => setNewCustomerAddress(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomerOpen(false)}>
              Cancel
            </Button>
            <button
              type="button"
              onClick={createCustomer}
              className="h-9 rounded-md bg-sale px-4 text-sm font-medium text-sale-foreground hover:opacity-90"
              data-testid="new-customer-save"
            >
              Save Customer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type InvoiceLine = {
  rowId: string;
  itemId: string;
  itemName: string;
  qty: number;
  rate: number;
  unit: string;
  stock: number;
};

function genId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function nextInvoiceNumber() {
  const max = getSales()
    .filter((sale) => sale.doc_type === "invoice" && !sale.deleted_at)
    .map((sale) => Number((sale.invoice_no || "").match(/INV-(\d+)/)?.[1] || 0))
    .reduce((highest, n) => Math.max(highest, n), 0);
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

function postStockMovements(
  companyId: string,
  saleId: string,
  invoiceNo: string,
  invoiceDate: string,
  lines: InvoiceLine[],
) {
  const warehouse = getWarehouses().find((entry) => entry.company_id === companyId && entry.is_default) || getWarehouses()[0];
  if (!warehouse) return;
  const nowIso = new Date().toISOString();
  const movements: DemoStockMovement[] = lines.map((line) => ({
    id: genId("stock-move"),
    company_id: companyId,
    item_id: line.itemId,
    variant_id: null,
    warehouse_id: warehouse.id,
    direction: "out",
    qty: line.qty,
    movement_date: invoiceDate,
    reference_type: "sale",
    reference_id: saleId,
    reference_no: invoiceNo,
    note: "Sale invoice",
    created_by: null,
    created_at: nowIso,
    deleted_at: null,
  }));
  setMovements([...movements, ...getMovements()]);
  for (const line of lines) adjustStoreStock(companyId, line.itemId, warehouse.id, -line.qty);
  setItems(getItems());
}

function postPaymentAndCash(
  companyId: string,
  customerId: string,
  saleId: string,
  invoiceNo: string,
  invoiceDate: string,
  method: string,
  amount: number,
) {
  const nowIso = new Date().toISOString();
  const payment: DemoPayment = {
    id: genId("payment"),
    company_id: companyId,
    party_id: customerId,
    direction: "in",
    amount,
    method,
    reference_no: invoiceNo,
    payment_date: invoiceDate,
    notes: "Sale invoice payment",
    posted_txn_id: null,
    status: "posted",
    deleted_at: null,
    created_at: nowIso,
  };
  const cashTxn: DemoCashTxn = {
    id: genId("cash"),
    company_id: companyId,
    bank_account_id: method === "cash" ? null : "local-bank",
    direction: "in",
    amount,
    txn_date: invoiceDate,
    category: "sale",
    notes: `Invoice ${invoiceNo}`,
    reference_type: "sale",
    reference_id: saleId,
    status: "posted",
    reversed_at: null,
    reversed_by: null,
    created_at: nowIso,
  };
  setPayments([payment, ...getPayments()]);
  setCashTxns([cashTxn, ...getCashTxns()]);
}

function postCustomerDue(
  companyId: string,
  customerId: string,
  invoiceNo: string,
  invoiceDate: string,
  due: number,
) {
  const parties = getParties();
  const idx = parties.findIndex((party) => party.id === customerId);
  if (idx < 0) return;
  const nextBalance = Number(parties[idx].balance || 0) + due;
  parties[idx] = { ...parties[idx], balance: nextBalance };
  setParties(parties);
  const ledgerEntry: DemoPartyLedgerEntry = {
    id: genId("ledger"),
    company_id: companyId,
    party_id: customerId,
    entry_date: invoiceDate,
    entry_type: "sale_invoice",
    reference_no: invoiceNo,
    debit: due,
    credit: 0,
    balance: nextBalance,
    note: "Sale invoice due",
    created_at: new Date().toISOString(),
  };
  setPartyLedger([ledgerEntry, ...getPartyLedger()]);
}

function TotalRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>৳ {Number(value || 0).toLocaleString()}</span>
    </div>
  );
}
