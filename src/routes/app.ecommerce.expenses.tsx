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
import { getExpenses, setExpenses, getWebsites, getCouriers, genId, type EcoExpense } from "@/lib/demo/ecommerce";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/expenses")({ component: EcoExpensesPage });

const CATS: EcoExpense["category"][] = [
  "Courier charge", "Return charge", "Packaging", "Ads/Marketing",
  "Marketplace commission", "Payment gateway fee", "Staff/packing cost", "Miscellaneous",
];

function EcoExpensesPage() {
  const [list, setList] = useState<EcoExpense[]>(() => getExpenses());
  const websites = getWebsites();
  const couriers = getCouriers();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<EcoExpense>>({ category: "Courier charge", date: new Date().toISOString().slice(0, 10) });

  const add = () => {
    if (!form.amount) { toast.error("Amount required"); return; }
    const e: EcoExpense = {
      id: genId("ex"), category: form.category as EcoExpense["category"],
      amount: Number(form.amount), date: form.date || new Date().toISOString().slice(0, 10),
      websiteId: form.websiteId || null, courierId: form.courierId || null,
      notes: form.notes,
    };
    const next = [...list, e]; setList(next); setExpenses(next);
    setOpen(false); setForm({ category: "Courier charge", date: new Date().toISOString().slice(0, 10) });
    toast.success("Expense added");
  };
  const del = (id: string) => { const next = list.filter((e) => e.id !== id); setList(next); setExpenses(next); };

  return (
    <div>
      <PageHeader
        title="Ecommerce Expenses"
        subtitle="Courier, packaging, ads, commission, gateway fees"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add Expense</Button>
          </>
        }
      />
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted-foreground border-b"><th className="py-2">Date</th><th>Category</th><th>Amount</th><th>Website</th><th>Courier</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2">{e.date}</td>
                  <td>{e.category}</td>
                  <td>৳{e.amount.toLocaleString()}</td>
                  <td>{websites.find((w) => w.id === e.websiteId)?.name || "—"}</td>
                  <td>{couriers.find((c) => c.id === e.courierId)?.name || "—"}</td>
                  <td className="text-muted-foreground">{e.notes || "—"}</td>
                  <td className="text-right"><Button variant="ghost" size="sm" onClick={() => del(e.id)}><Trash2 className="w-3 h-3 text-rose-600" /></Button></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No expenses yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as EcoExpense["category"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount</Label><Input type="number" value={form.amount || ""} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} /></div>
            <div><Label>Date</Label><Input type="date" value={form.date || ""} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
            <div>
              <Label>Website (optional)</Label>
              <Select value={form.websiteId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, websiteId: v === "_none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="_none">None</SelectItem>{websites.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Courier (optional)</Label>
              <Select value={form.courierId || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, courierId: v === "_none" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent><SelectItem value="_none">None</SelectItem>{couriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
