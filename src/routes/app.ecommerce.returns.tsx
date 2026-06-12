import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import { getReturns, setReturns, getOrders, genId, type EcoReturn } from "@/lib/demo/ecommerce";
import { Plus, Check, X } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/returns")({ component: ReturnsPage });

function ReturnsPage() {
  const [list, setList] = useState<EcoReturn[]>(() => getReturns());
  const orders = getOrders();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<EcoReturn>>({ type: "Full Return", stockAction: "Add back to stock", status: "Pending" });

  const create = () => {
    if (!form.orderId) { toast.error("Select an order"); return; }
    const o = orders.find((x) => x.id === form.orderId);
    if (!o) return;
    const r: EcoReturn = {
      id: genId("er"), orderId: o.id, customer: o.customerName,
      sku: o.items[0]?.sku || "", qty: Number(form.qty || 1),
      reason: form.reason || "Customer request",
      type: form.type as EcoReturn["type"],
      returnCharge: Number(form.returnCharge || 0),
      refundAmount: Number(form.refundAmount || 0),
      stockAction: form.stockAction as EcoReturn["stockAction"],
      status: "Pending", notes: form.notes, createdAt: new Date().toISOString(),
    };
    const next = [...list, r]; setList(next); setReturns(next);
    setOpen(false); setForm({ type: "Full Return", stockAction: "Add back to stock", status: "Pending" });
    toast.success("Return created");
  };

  const setStatus = (id: string, status: EcoReturn["status"]) => {
    const next = list.map((r) => r.id === id ? { ...r, status } : r);
    setList(next); setReturns(next);
    toast.success(status);
  };

  return (
    <div>
      <PageHeader
        title="Return / Exchange"
        subtitle="Process customer returns, exchanges and failed deliveries"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New Return</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Order</th><th>Customer</th><th>SKU</th><th>Qty</th><th>Type</th><th>Reason</th><th>Refund</th><th>Stock</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((r) => {
                const o = orders.find((x) => x.id === r.orderId);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{o?.orderNo || r.orderId}</td>
                    <td>{r.customer}</td>
                    <td>{r.sku}</td>
                    <td>{r.qty}</td>
                    <td>{r.type}</td>
                    <td className="text-muted-foreground">{r.reason}</td>
                    <td>৳{r.refundAmount.toLocaleString()}</td>
                    <td>{r.stockAction}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="text-right">
                      {r.status === "Pending" && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, "Approved")}><Check className="w-3 h-3 text-emerald-600" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, "Rejected")}><X className="w-3 h-3 text-rose-600" /></Button>
                        </>
                      )}
                      {r.status === "Approved" && <Button variant="ghost" size="sm" onClick={() => setStatus(r.id, "Completed")}>Complete</Button>}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No returns yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Return</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Order</Label>
              <Select value={form.orderId} onValueChange={(v) => setForm((f) => ({ ...f, orderId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select order" /></SelectTrigger>
                <SelectContent>{orders.slice(0, 50).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.customerName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as EcoReturn["type"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Full Return", "Partial Return", "Exchange", "Failed Delivery"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Stock Action</Label>
              <Select value={form.stockAction} onValueChange={(v) => setForm((f) => ({ ...f, stockAction: v as EcoReturn["stockAction"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["Add back to stock", "Damaged stock", "No stock change"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={form.qty || 1} onChange={(e) => setForm((f) => ({ ...f, qty: Number(e.target.value) }))} /></div>
            <div><Label>Refund Amount</Label><Input type="number" value={form.refundAmount || 0} onChange={(e) => setForm((f) => ({ ...f, refundAmount: Number(e.target.value) }))} /></div>
            <div><Label>Return Charge</Label><Input type="number" value={form.returnCharge || 0} onChange={(e) => setForm((f) => ({ ...f, returnCharge: Number(e.target.value) }))} /></div>
            <div className="col-span-2"><Label>Reason</Label><Input value={form.reason || ""} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
