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
import {
  getDeliveryCharges, setDeliveryCharges, getCouriers, genId, type EcoDeliveryCharge,
} from "@/lib/demo/ecommerce";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/delivery-charge")({ component: DeliveryChargePage });

function DeliveryChargePage() {
  const [list, setList] = useState<EcoDeliveryCharge[]>(() => getDeliveryCharges());
  const couriers = getCouriers();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<EcoDeliveryCharge>>({ status: "active", deliveryCharge: 80, returnCharge: 40, codChargePct: 1, minCodFee: 10 });

  const add = () => {
    if (!form.area || !form.courierId) { toast.error("Area and courier required"); return; }
    const entry: EcoDeliveryCharge = {
      id: genId("dc"), area: form.area, courierId: form.courierId,
      deliveryCharge: Number(form.deliveryCharge || 0),
      returnCharge: Number(form.returnCharge || 0),
      codChargePct: Number(form.codChargePct || 0),
      minCodFee: Number(form.minCodFee || 0),
      status: (form.status as "active" | "inactive") || "active",
    };
    const next = [...list, entry]; setList(next); setDeliveryCharges(next);
    setOpen(false);
    setForm({ status: "active", deliveryCharge: 80, returnCharge: 40, codChargePct: 1, minCodFee: 10 });
    toast.success("Rule added");
  };
  const del = (id: string) => {
    const next = list.filter((d) => d.id !== id); setList(next); setDeliveryCharges(next);
  };

  return (
    <div>
      <PageHeader
        title="Delivery Charge"
        subtitle="Configure delivery charges by area and courier"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Rule</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Area</th><th>Courier</th><th>Delivery</th><th>Return</th><th>COD %</th><th>Min COD Fee</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2">{d.area}</td>
                  <td>{couriers.find((c) => c.id === d.courierId)?.name || "—"}</td>
                  <td>৳{d.deliveryCharge}</td>
                  <td>৳{d.returnCharge}</td>
                  <td>{d.codChargePct}%</td>
                  <td>৳{d.minCodFee}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td className="text-right"><Button variant="ghost" size="sm" onClick={() => del(d.id)}><Trash2 className="w-3 h-3 text-rose-600" /></Button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No rules. Add one to start.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Delivery Charge Rule</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Area/District</Label><Input value={form.area || ""} onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))} /></div>
            <div>
              <Label>Courier</Label>
              <Select value={form.courierId} onValueChange={(v) => setForm((f) => ({ ...f, courierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Delivery Charge</Label><Input type="number" value={form.deliveryCharge || 0} onChange={(e) => setForm((f) => ({ ...f, deliveryCharge: Number(e.target.value) }))} /></div>
            <div><Label>Return Charge</Label><Input type="number" value={form.returnCharge || 0} onChange={(e) => setForm((f) => ({ ...f, returnCharge: Number(e.target.value) }))} /></div>
            <div><Label>COD %</Label><Input type="number" value={form.codChargePct || 0} onChange={(e) => setForm((f) => ({ ...f, codChargePct: Number(e.target.value) }))} /></div>
            <div><Label>Min COD Fee</Label><Input type="number" value={form.minCodFee || 0} onChange={(e) => setForm((f) => ({ ...f, minCodFee: Number(e.target.value) }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
