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
import { getPayments, setPayments, getOrders, genId, type EcoPayment } from "@/lib/demo/ecommerce";
import { Plus, Download } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/payments")({ component: PaymentsPage });

const TYPES: EcoPayment["type"][] = ["COD", "bKash", "Nagad", "Bank Transfer", "Card", "Cash", "Partial Payment"];

function PaymentsPage() {
  const [list, setList] = useState<EcoPayment[]>(() => getPayments());
  const orders = getOrders();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<EcoPayment>>({ type: "COD", date: new Date().toISOString().slice(0, 10) });

  const add = () => {
    if (!form.orderId || !form.amount) { toast.error("Order and amount required"); return; }
    const p: EcoPayment = {
      id: genId("pm"), orderId: form.orderId, type: form.type as EcoPayment["type"],
      amount: Number(form.amount), date: form.date || new Date().toISOString().slice(0, 10),
      reference: form.reference, notes: form.notes,
    };
    const next = [...list, p]; setList(next); setPayments(next);
    setOpen(false); setForm({ type: "COD", date: new Date().toISOString().slice(0, 10) });
    toast.success("Payment recorded");
  };

  const exportCsv = () => {
    const rows = [["Date", "Order", "Type", "Amount", "Reference"].join(","), ...list.map((p) => {
      const o = orders.find((x) => x.id === p.orderId);
      return [p.date, o?.orderNo || p.orderId, p.type, p.amount, p.reference || ""].join(",");
    })].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = "ecommerce-payments.csv"; a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div>
      <PageHeader
        title="Ecommerce Payments"
        subtitle="COD, bKash, Nagad, Bank, Card and partial payments"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" /> Export</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Payment</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Date</th><th>Order</th><th>Type</th><th>Amount</th><th>Reference</th></tr></thead>
            <tbody>
              {list.map((p) => {
                const o = orders.find((x) => x.id === p.orderId);
                return (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{p.date}</td>
                    <td className="font-mono text-xs">{o?.orderNo || p.orderId}</td>
                    <td>{p.type}</td>
                    <td>৳{p.amount.toLocaleString()}</td>
                    <td className="text-muted-foreground">{p.reference || "—"}</td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No payments recorded.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Payment</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Order</Label>
              <Select value={form.orderId} onValueChange={(v) => setForm((f) => ({ ...f, orderId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{orders.slice(0, 50).map((o) => <SelectItem key={o.id} value={o.id}>{o.orderNo} · {o.customerName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as EcoPayment["type"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} /></div>
            <div><Label>Date</Label><Input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div><Label>Reference</Label><Input value={form.reference || ""} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
