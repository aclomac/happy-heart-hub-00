import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import {
  getOrders, setOrders, getWebsites, getCouriers, getSettings,
  type EcoOrder, type EcoOrderStatus,
} from "@/lib/demo/ecommerce";
import { getSales, setSales } from "@/lib/demo/sales";
import { genId } from "@/lib/demo/inventory";
import { getSteadfastConfig, steadfastService } from "@/lib/integrations/steadfast";
import { MoreVertical, Truck, FileText, Copy, Trash2, Plus, Send, Navigation, Pencil, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/orders")({ component: OrdersPage });

const STATUSES: EcoOrderStatus[] = [
  "New", "Confirmed", "Processing", "Packed", "Ready to Ship", "Shipped",
  "Delivered", "Cancelled", "Returned", "Partially Returned", "Exchange", "Failed Delivery",
];

const PAGE_SIZES = [10, 25, 50, 100];

function OrdersPage() {
  const [list, setList] = useState<EcoOrder[]>(() => getOrders());
  const websites = getWebsites();
  const couriers = getCouriers();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [websiteFilter, setWebsiteFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EcoOrder | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<{ ids: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const blankForm = {
    websiteId: websites[0]?.id || "",
    customerName: "", phone: "", address: "", district: "Dhaka",
    sku: "", productName: "", qty: 1, price: 0, deliveryCharge: 70, discount: 0,
    paymentMethod: "COD", status: "New" as EcoOrderStatus,
  };
  const [form, setForm] = useState(blankForm);

  const persist = (next: EcoOrder[]) => { setList(next); setOrders(next); };

  const createOrder = () => {
    if (!form.websiteId) { toast.error("Select a website"); return; }
    if (!form.customerName || !form.phone) { toast.error("Customer name and phone required"); return; }
    if (!form.productName || form.qty <= 0 || form.price <= 0) { toast.error("Product, qty and price required"); return; }
    const subtotal = form.qty * form.price;
    const total = subtotal - form.discount + form.deliveryCharge;
    const orderNo = `MAN-${Date.now().toString().slice(-7)}`;
    const next: EcoOrder = {
      id: genId("eo"), websiteId: form.websiteId, orderNo,
      customerName: form.customerName, phone: form.phone, address: form.address, district: form.district,
      orderDate: new Date().toISOString().slice(0, 10),
      items: [{ sku: form.sku, name: form.productName, qty: form.qty, price: form.price }],
      subtotal, discount: form.discount, deliveryCharge: form.deliveryCharge,
      codAmount: total, paidAmount: 0,
      paymentMethod: form.paymentMethod, status: form.status,
      courierId: null, trackingId: null, deliveryStatus: "Pending",
      returnStatus: null, source: "Manual",
      createdAt: new Date().toISOString(),
    };
    persist([...list, next]);
    setCreateOpen(false); setForm(blankForm);
    toast.success(`Order ${orderNo} created`);
  };

  const filtered = useMemo(() => list
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => websiteFilter === "all" || o.websiteId === websiteFilter)
    .filter((o) => !q ||
      o.orderNo.toLowerCase().includes(q.toLowerCase()) ||
      o.customerName.toLowerCase().includes(q.toLowerCase()) ||
      o.phone.includes(q) ||
      (o.trackingId || "").toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) => +new Date(b.orderDate) - +new Date(a.orderDate)),
  [list, statusFilter, websiteFilter, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateStatus = (id: string, status: EcoOrderStatus) => {
    persist(list.map((o) => (o.id === id ? { ...o, status } : o)));
    toast.success(`Order ${status}`);
  };

  const duplicate = (o: EcoOrder) => {
    const dup: EcoOrder = { ...o, id: `eo_${Math.random().toString(36).slice(2, 9)}`, orderNo: `${o.orderNo}-COPY`, status: "New" };
    persist([...list, dup]);
    toast.success("Order duplicated");
  };

  const confirmDelete = (ids: string[]) => setConfirmOpen({ ids });
  const doDelete = () => {
    if (!confirmOpen) return;
    const ids = new Set(confirmOpen.ids);
    persist(list.filter((o) => !ids.has(o.id)));
    setSelected(new Set()); setConfirmOpen(null);
    toast.success(`Deleted ${ids.size} order(s)`);
  };

  const convertToSale = (o: EcoOrder) => {
    if (o.convertedSaleId) { toast.info("Already converted"); return; }
    const settings = getSettings();
    const sales = getSales();
    const invoiceNo = `${settings.invoicePrefix}${new Date().getFullYear()}-${(sales.length + 1).toString().padStart(4, "0")}`;
    const saleId = genId("sale");
    sales.push({
      id: saleId, company_id: "demo", doc_type: "invoice", invoice_no: invoiceNo,
      invoice_date: o.orderDate, due_date: null, party_id: null,
      subtotal: o.subtotal, discount: o.discount, tax: 0,
      delivery_charge: o.deliveryCharge, labor_charge: 0,
      total: o.subtotal - o.discount + o.deliveryCharge,
      paid: o.paidAmount, balance: o.subtotal - o.discount + o.deliveryCharge - o.paidAmount,
      status: o.paidAmount >= o.codAmount ? "paid" : "open",
      payment_method: o.paymentMethod.toLowerCase(), notes: `Ecommerce order ${o.orderNo}`,
      reference_sale_id: null, po_no: null, po_date: null, billing_name: o.customerName,
      deleted_at: null, created_at: new Date().toISOString(),
    });
    setSales(sales);
    persist(list.map((x) => (x.id === o.id ? { ...x, convertedSaleId: saleId } : x)));
    toast.success(`Converted → ${invoiceNo}`);
  };

  const sendSteadfast = async (o: EcoOrder) => {
    const settings = getSettings();
    const r = await steadfastService.createConsignment(getSteadfastConfig(), settings.integrationMode, o);
    setList(getOrders());
    r.status === "success" || r.status === "skipped" ? toast.success(r.message) : toast.error(r.message);
  };

  const trackSteadfast = async (o: EcoOrder) => {
    const code = o.trackingCode || o.trackingId;
    if (!code) { toast.error("No tracking code on this order"); return; }
    const settings = getSettings();
    const r = await steadfastService.trackParcel(getSteadfastConfig(), settings.integrationMode, code);
    if (r.deliveryStatus) {
      persist(list.map((x) => x.id === o.id ? { ...x, deliveryStatus: r.deliveryStatus!, courierLastSyncedAt: new Date().toISOString() } : x));
    }
    r.status === "success" || r.status === "skipped" ? toast.success(r.message) : toast.error(r.message);
  };

  const bulkSendSteadfast = async () => {
    if (selected.size === 0) { toast.error("Select orders"); return; }
    const settings = getSettings();
    const cfg = getSteadfastConfig();
    let ok = 0, fail = 0;
    for (const id of selected) {
      const o = list.find((x) => x.id === id);
      if (!o) continue;
      const r = await steadfastService.createConsignment(cfg, settings.integrationMode, o);
      r.status === "success" || r.status === "skipped" ? ok++ : fail++;
    }
    setList(getOrders()); setSelected(new Set());
    toast.success(`Sent ${ok} to Steadfast, ${fail} failed`);
  };

  const bulkStatus = (status: EcoOrderStatus) => {
    if (selected.size === 0) { toast.error("Select orders"); return; }
    persist(list.map((o) => selected.has(o.id) ? { ...o, status } : o));
    toast.success(`Updated ${selected.size} order(s)`);
    setSelected(new Set());
  };

  const exportCsv = () => {
    const ids = selected.size > 0 ? selected : new Set(filtered.map((o) => o.id));
    const rows = [
      ["Order No", "Date", "Customer", "Phone", "Status", "Total", "Courier", "Tracking", "Tracking URL"].join(","),
      ...filtered.filter((o) => ids.has(o.id)).map((o) => [
        o.orderNo, o.orderDate, o.customerName, o.phone, o.status,
        o.subtotal - o.discount + o.deliveryCharge,
        o.courierName || "", o.trackingCode || o.trackingId || "", o.trackingUrl || "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "orders.csv"; a.click();
    toast.success("Exported CSV");
  };

  const saveEdit = () => {
    if (!editing) return;
    persist(list.map((o) => o.id === editing.id ? editing : o));
    setEditing(null); toast.success("Order updated");
  };

  const toggleAll = (check: boolean) => {
    if (check) setSelected(new Set([...selected, ...pageItems.map((o) => o.id)]));
    else { const next = new Set(selected); pageItems.forEach((o) => next.delete(o.id)); setSelected(next); }
  };
  const toggleOne = (id: string, check: boolean) => {
    const next = new Set(selected);
    if (check) next.add(id); else next.delete(id);
    setSelected(next);
  };
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((o) => selected.has(o.id));

  const start = filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, filtered.length);

  return (
    <div>
      <PageHeader
        title="Website Orders"
        subtitle="All ecommerce orders across connected websites"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Order</Button>
            <Link to="/app/ecommerce/order-sync"><Button size="sm">Sync / Import Orders</Button></Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Input className="w-64" placeholder="Search order, customer, phone, tracking…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select value={websiteFilter} onValueChange={(v) => { setWebsiteFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Website" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Websites</SelectItem>
            {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv}>Export CSV</Button>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={bulkSendSteadfast}><Send className="w-3 h-3 mr-1" /> Send to Steadfast</Button>
              <Select onValueChange={(v) => bulkStatus(v as EcoOrderStatus)}>
                <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Bulk Status" /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="destructive" onClick={() => confirmDelete([...selected])}><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 w-8"><Checkbox checked={allOnPageSelected} onCheckedChange={(v) => toggleAll(!!v)} /></th>
                <th>Order #</th><th>Date</th><th>Website</th><th>Customer</th><th>District</th>
                <th>Total</th><th>COD</th><th>Paid</th><th>Status</th><th>Courier</th><th>Tracking</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => {
                const w = websites.find((x) => x.id === o.websiteId)?.name || "—";
                const cr = o.courierName || couriers.find((c) => c.id === o.courierId)?.name || "—";
                const total = o.subtotal - o.discount + o.deliveryCharge;
                const trackCode = o.trackingCode || o.trackingId;
                return (
                  <tr key={o.id} className="border-b last:border-0">
                    <td><Checkbox checked={selected.has(o.id)} onCheckedChange={(v) => toggleOne(o.id, !!v)} /></td>
                    <td className="py-2 font-mono text-xs">{o.orderNo}</td>
                    <td>{o.orderDate}</td>
                    <td>{w}</td>
                    <td>{o.customerName}<div className="text-xs text-muted-foreground">{o.phone}</div></td>
                    <td>{o.district}</td>
                    <td>৳{total.toLocaleString()}</td>
                    <td>৳{o.codAmount.toLocaleString()}</td>
                    <td>৳{o.paidAmount.toLocaleString()}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td>{cr}</td>
                    <td className="font-mono text-xs">
                      {trackCode ? (
                        o.trackingUrl ? (
                          <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">
                            {trackCode}<ExternalLink className="w-3 h-3" />
                          </a>
                        ) : trackCode
                      ) : "—"}
                    </td>
                    <td className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setEditing(o)}><Pencil className="w-3 h-3 mr-1" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Confirmed")}>Confirm Order</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Packed")}>Pack Order</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Shipped")}><Truck className="w-3 h-3 mr-1" /> Mark Shipped</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Delivered")}>Mark Delivered</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Returned")}>Mark Returned</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Cancelled")}>Cancel Order</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => sendSteadfast(o)}><Send className="w-3 h-3 mr-1" /> Send to Steadfast</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => trackSteadfast(o)}><Navigation className="w-3 h-3 mr-1" /> Track Steadfast Parcel</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => convertToSale(o)}><FileText className="w-3 h-3 mr-1" /> Convert to Sale Invoice</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicate(o)}><Copy className="w-3 h-3 mr-1" /> Duplicate</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => confirmDelete([o.id])} className="text-rose-600"><Trash2 className="w-3 h-3 mr-1" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && <tr><td colSpan={13} className="py-8 text-center text-muted-foreground">No orders match.</td></tr>}
            </tbody>
          </table>

          <div className="flex items-center justify-between pt-3 text-sm">
            <div className="text-muted-foreground">Showing {start}–{end} of {filtered.length}</div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Page size</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</Button>
              <span className="text-xs">Page {safePage} / {totalPages}</span>
              <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Manual Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Website</Label>
              <Select value={form.websiteId} onValueChange={(v) => setForm((f) => ({ ...f, websiteId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select website" /></SelectTrigger>
                <SelectContent>{websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Customer Name</Label><Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div><Label>District</Label><Input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} /></div>
            <div><Label>Payment Method</Label><Input value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} /></div>
            <div><Label>Product Name</Label><Input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} /></div>
            <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} /></div>
            <div><Label>Unit Price</Label><Input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))} /></div>
            <div><Label>Discount</Label><Input type="number" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: Number(e.target.value) }))} /></div>
            <div><Label>Delivery Charge</Label><Input type="number" value={form.deliveryCharge} onChange={(e) => setForm((f) => ({ ...f, deliveryCharge: Number(e.target.value) }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as EcoOrderStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createOrder}>Create Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit Order {editing?.orderNo}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Customer Name</Label><Input value={editing.customerName} onChange={(e) => setEditing({ ...editing, customerName: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
              <div className="col-span-2"><Label>Address</Label><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              <div><Label>District</Label><Input value={editing.district} onChange={(e) => setEditing({ ...editing, district: e.target.value })} /></div>
              <div><Label>Payment Method</Label><Input value={editing.paymentMethod} onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })} /></div>
              <div><Label>COD Amount</Label><Input type="number" value={editing.codAmount} onChange={(e) => setEditing({ ...editing, codAmount: Number(e.target.value) })} /></div>
              <div><Label>Delivery Charge</Label><Input type="number" value={editing.deliveryCharge} onChange={(e) => setEditing({ ...editing, deliveryCharge: Number(e.target.value) })} /></div>
              <div><Label>Paid Amount</Label><Input type="number" value={editing.paidAmount} onChange={(e) => setEditing({ ...editing, paidAmount: Number(e.target.value) })} /></div>
              <div>
                <Label>Courier</Label>
                <Select value={editing.courierId || "_none"} onValueChange={(v) => setEditing({ ...editing, courierId: v === "_none" ? null : v, courierName: v === "_none" ? null : couriers.find((c) => c.id === v)?.name || null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as EcoOrderStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Tracking Code</Label><Input value={editing.trackingCode || editing.trackingId || ""} onChange={(e) => setEditing({ ...editing, trackingCode: e.target.value, trackingId: e.target.value })} /></div>
              <div className="col-span-2"><Label>Tracking URL</Label><Input value={editing.trackingUrl || ""} onChange={(e) => setEditing({ ...editing, trackingUrl: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete order(s)?</DialogTitle>
            <DialogDescription>This will remove {confirmOpen?.ids.length} order(s) locally. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
