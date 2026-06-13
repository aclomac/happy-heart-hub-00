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
import { DisabledLiveButton, StatusBadge } from "@/components/erp/ecommerce/EcommerceUI";
import { DiagnosticsPanel } from "@/components/erp/ecommerce/DiagnosticsPanel";
import { getCouriers, setCouriers, getSettings, genId, type EcoCourier, type CourierType } from "@/lib/demo/ecommerce";
import { getSteadfastConfig, steadfastService } from "@/lib/integrations/steadfast";
import { Pencil, Trash2, Plus, Plug } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/courier")({ component: CourierPage });

const TYPES: CourierType[] = ["Manual Courier", "Pathao", "Steadfast", "RedX", "Paperfly", "Sundarban", "Other"];

function CourierPage() {
  const [list, setList] = useState<EcoCourier[]>(() => getCouriers());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EcoCourier | null>(null);
  const [form, setForm] = useState<Partial<EcoCourier>>({ type: "Manual Courier", status: "active", defaultDeliveryCharge: 80, returnCharge: 40, codChargePct: 1 });

  const save = () => {
    if (!form.name) { toast.error("Name required"); return; }
    if (editing) {
      const next = list.map((c) => c.id === editing.id ? ({ ...editing, ...form } as EcoCourier) : c);
      setList(next); setCouriers(next);
    } else {
      const c: EcoCourier = {
        id: genId("cr"), name: form.name!,
        type: (form.type as CourierType) || "Manual Courier",
        apiKey: form.apiKey, apiSecret: form.apiSecret, baseUrl: form.baseUrl,
        defaultDeliveryCharge: Number(form.defaultDeliveryCharge || 0),
        returnCharge: Number(form.returnCharge || 0),
        codChargePct: Number(form.codChargePct || 0),
        status: (form.status as "active" | "inactive") || "active",
      };
      const next = [...list, c]; setList(next); setCouriers(next);
    }
    toast.success("Saved");
    setOpen(false); setEditing(null);
    setForm({ type: "Manual Courier", status: "active", defaultDeliveryCharge: 80, returnCharge: 40, codChargePct: 1 });
  };

  const del = (id: string) => {
    if (!confirm("Delete courier?")) return;
    const next = list.filter((c) => c.id !== id); setList(next); setCouriers(next);
    toast.success("Deleted");
  };

  return (
    <div>
      <PageHeader
        title="Courier Management"
        subtitle="Configure Pathao, Steadfast, RedX, Paperfly and manual couriers"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Add Courier</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Name</th><th>Type</th><th>Delivery</th><th>Return</th><th>COD %</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td>{c.type}</td>
                  <td>৳{c.defaultDeliveryCharge}</td>
                  <td>৳{c.returnCharge}</td>
                  <td>{c.codChargePct}%</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DisabledLiveButton reason="Live courier API requires credentials."><Plug className="w-3 h-3 mr-1" /> Test API</DisabledLiveButton>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setForm(c); setOpen(true); }}><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(c.id)}><Trash2 className="w-3 h-3 text-rose-600" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No couriers configured.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Courier" : "Add Courier"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CourierType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Delivery Charge</Label><Input type="number" value={form.defaultDeliveryCharge || 0} onChange={(e) => setForm((f) => ({ ...f, defaultDeliveryCharge: Number(e.target.value) }))} /></div>
            <div><Label>Return Charge</Label><Input type="number" value={form.returnCharge || 0} onChange={(e) => setForm((f) => ({ ...f, returnCharge: Number(e.target.value) }))} /></div>
            <div><Label>COD Charge %</Label><Input type="number" value={form.codChargePct || 0} onChange={(e) => setForm((f) => ({ ...f, codChargePct: Number(e.target.value) }))} /></div>
            <div><Label>Base URL</Label><Input value={form.baseUrl || ""} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} /></div>
            <div><Label>API Key</Label><Input value={form.apiKey || ""} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} /></div>
            <div><Label>API Secret</Label><Input value={form.apiSecret || ""} onChange={(e) => setForm((f) => ({ ...f, apiSecret: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
