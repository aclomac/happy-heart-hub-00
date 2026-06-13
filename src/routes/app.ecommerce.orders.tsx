import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import {
  getOrders, setOrders, getWebsites, getCouriers, getSettings,
  type EcoOrder, type EcoOrderStatus, type EcoDeliveryStatus,
} from "@/lib/demo/ecommerce";
import { getSales, setSales } from "@/lib/demo/sales";
import { genId } from "@/lib/demo/inventory";
import { getSteadfastConfig, steadfastService } from "@/lib/integrations/steadfast";
import { MoreVertical, Truck, FileText, Copy, Trash2, Plus, Send, Navigation } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/orders")({ component: OrdersPage });

const STATUSES: EcoOrderStatus[] = [
  "New", "Confirmed", "Processing", "Packed", "Ready to Ship", "Shipped",
  "Delivered", "Cancelled", "Returned", "Partially Returned", "Exchange", "Failed Delivery",
];


function OrdersPage() {
  const [list, setList] = useState<EcoOrder[]>(() => getOrders());
  const websites = getWebsites();
  const couriers = getCouriers();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [websiteFilter, setWebsiteFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const blankForm = {
    websiteId: websites[0]?.id || "",
    customerName: "", phone: "", address: "", district: "Dhaka",
    sku: "", productName: "", qty: 1, price: 0, deliveryCharge: 70, discount: 0,
    paymentMethod: "COD", status: "New" as EcoOrderStatus,
  };
  const [form, setForm] = useState(blankForm);

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
    const updated = [...list, next];
    setList(updated); setOrders(updated);
    setCreateOpen(false); setForm(blankForm);
    toast.success(`Order ${orderNo} created`);
  };


  const filtered = useMemo(() => list
    .filter((o) => statusFilter === "all" || o.status === statusFilter)
    .filter((o) => websiteFilter === "all" || o.websiteId === websiteFilter)
    .filter((o) => !q ||
      o.orderNo.toLowerCase().includes(q.toLowerCase()) ||
      o.customerName.toLowerCase().includes(q.toLowerCase()) ||
      o.phone.includes(q),
    )
    .sort((a, b) => +new Date(b.orderDate) - +new Date(a.orderDate)),
  [list, statusFilter, websiteFilter, q]);

  const updateStatus = (id: string, status: EcoOrderStatus) => {
    const next = list.map((o) => (o.id === id ? { ...o, status } : o));
    setList(next); setOrders(next);
    toast.success(`Order ${status}`);
  };

  const duplicate = (o: EcoOrder) => {
    const dup: EcoOrder = { ...o, id: `eo_${Math.random().toString(36).slice(2, 9)}`, orderNo: `${o.orderNo}-COPY`, status: "New" };
    const next = [...list, dup];
    setList(next); setOrders(next);
    toast.success("Order duplicated");
  };

  const del = (id: string) => {
    if (!confirm("Delete this order?")) return;
    const next = list.filter((o) => o.id !== id);
    setList(next); setOrders(next);
    toast.success("Deleted");
  };

  const convertToSale = (o: EcoOrder) => {
    if (o.convertedSaleId) { toast.info("Already converted"); return; }
    const settings = getSettings();
    const sales = getSales();
    const invoiceNo = `${settings.invoicePrefix}${new Date().getFullYear()}-${(sales.length + 1).toString().padStart(4, "0")}`;
    const saleId = genId("sale");
    sales.push({
      id: saleId,
      company_id: "demo",
      doc_type: "invoice",
      invoice_no: invoiceNo,
      invoice_date: o.orderDate,
      due_date: null,
      party_id: null,
      subtotal: o.subtotal,
      discount: o.discount,
      tax: 0,
      delivery_charge: o.deliveryCharge,
      labor_charge: 0,
      total: o.subtotal - o.discount + o.deliveryCharge,
      paid: o.paidAmount,
      balance: o.subtotal - o.discount + o.deliveryCharge - o.paidAmount,
      status: o.paidAmount >= o.codAmount ? "paid" : "open",
      payment_method: o.paymentMethod.toLowerCase(),
      notes: `Ecommerce order ${o.orderNo}`,
      reference_sale_id: null,
      po_no: null,
      po_date: null,
      billing_name: o.customerName,
      deleted_at: null,
      created_at: new Date().toISOString(),
    });
    setSales(sales);
    const next = list.map((x) => (x.id === o.id ? { ...x, convertedSaleId: saleId } : x));
    setList(next); setOrders(next);
    toast.success(`Converted → ${invoiceNo}`);
  };

  const sendSteadfast = async (o: EcoOrder) => {
    const settings = getSettings();
    const r = await steadfastService.createConsignment(getSteadfastConfig(), settings.integrationMode, o);
    setList(getOrders());
    r.status === "success" || r.status === "skipped" ? toast.success(r.message) : toast.error(r.message);
  };

  const trackSteadfast = async (o: EcoOrder) => {
    if (!o.trackingId) { toast.error("No tracking code on this order"); return; }
    const settings = getSettings();
    const r = await steadfastService.trackParcel(getSteadfastConfig(), settings.integrationMode, o.trackingId);
    if (r.deliveryStatus) {
      const next = list.map((x) => x.id === o.id ? { ...x, deliveryStatus: r.deliveryStatus as EcoDeliveryStatus } : x);
      setList(next); setOrders(next);
    }
    r.status === "success" || r.status === "skipped" ? toast.success(r.message) : toast.error(r.message);
  };


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
        <Input className="w-64" placeholder="Search order #, customer, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={websiteFilter} onValueChange={setWebsiteFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Website" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Websites</SelectItem>
            {websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2">Order #</th><th>Date</th><th>Website</th><th>Customer</th><th>District</th>
                <th>Total</th><th>COD</th><th>Paid</th><th>Status</th><th>Courier</th><th>Tracking</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const w = websites.find((x) => x.id === o.websiteId)?.name || "—";
                const cr = couriers.find((c) => c.id === o.courierId)?.name || "—";
                const total = o.subtotal - o.discount + o.deliveryCharge;
                return (
                  <tr key={o.id} className="border-b last:border-0">
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
                    <td className="font-mono text-xs">{o.trackingId || "—"}</td>
                    <td className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Confirmed")}>Confirm Order</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Packed")}>Pack Order</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Shipped")}><Truck className="w-3 h-3 mr-1" /> Mark Shipped</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Delivered")}>Mark Delivered</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Returned")}>Mark Returned</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateStatus(o.id, "Cancelled")}>Cancel Order</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => convertToSale(o)}><FileText className="w-3 h-3 mr-1" /> Convert to Sale Invoice</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicate(o)}><Copy className="w-3 h-3 mr-1" /> Duplicate</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => del(o.id)} className="text-rose-600"><Trash2 className="w-3 h-3 mr-1" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={12} className="py-8 text-center text-muted-foreground">No orders match.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

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
    </div>
  );

}
