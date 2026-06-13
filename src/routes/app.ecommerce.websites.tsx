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
import {
  getWebsites, setWebsites, genId, type EcoWebsite, type WebsitePlatform,
} from "@/lib/demo/ecommerce";
import { Trash2, Pencil, Plug, RefreshCw, Plus } from "lucide-react";

export const Route = createFileRoute("/app/ecommerce/websites")({ component: WebsitesPage });

const PLATFORMS: WebsitePlatform[] = [
  "WooCommerce", "Shopify", "Custom Website", "Facebook Shop", "Daraz", "Manual Store", "Other",
];

function WebsitesPage() {
  const [list, setList] = useState<EcoWebsite[]>(() => getWebsites());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EcoWebsite | null>(null);
  const [form, setForm] = useState<Partial<EcoWebsite>>({ platform: "WooCommerce", status: "active" });

  const save = () => {
    if (!form.name || !form.url) {
      toast.error("Name and URL are required");
      return;
    }
    if (editing) {
      const next = list.map((w) => (w.id === editing.id ? { ...editing, ...form } as EcoWebsite : w));
      setList(next); setWebsites(next);
      toast.success("Website updated");
    } else {
      const w: EcoWebsite = {
        id: genId("web"),
        name: form.name!,
        url: form.url!,
        platform: (form.platform as WebsitePlatform) || "Custom Website",
        apiBaseUrl: form.apiBaseUrl,
        apiKey: form.apiKey,
        apiSecret: form.apiSecret,
        webhookSecret: form.webhookSecret,
        defaultWarehouse: form.defaultWarehouse,
        defaultCourier: form.defaultCourier,
        defaultPaymentMethod: form.defaultPaymentMethod,
        status: (form.status as "active" | "inactive") || "active",
        notes: form.notes,
        createdAt: new Date().toISOString(),
      };
      const next = [...list, w];
      setList(next); setWebsites(next);
      toast.success("Website added");
    }
    setOpen(false); setEditing(null); setForm({ platform: "WooCommerce", status: "active" });
  };

  const del = (id: string) => {
    if (!confirm("Delete this website?")) return;
    const next = list.filter((w) => w.id !== id);
    setList(next); setWebsites(next);
    toast.success("Deleted");
  };

  const startEdit = (w: EcoWebsite) => {
    setEditing(w); setForm(w); setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Websites / Stores"
        subtitle="Connect WooCommerce, Shopify, Daraz, Facebook Shop and custom websites"
        actions={
          <>
            <Link to="/app/ecommerce"><Button variant="outline" size="sm">Back</Button></Link>
            <Button size="sm" onClick={() => { setEditing(null); setForm({ platform: "WooCommerce", status: "active" }); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Website
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2">Name</th>
                <th>Platform</th>
                <th>URL</th>
                <th>Status</th>
                <th>Default Courier</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{w.name}</td>
                  <td>{w.platform}</td>
                  <td className="text-muted-foreground truncate max-w-[200px]">{w.url}</td>
                  <td><StatusBadge status={w.status} /></td>
                  <td>{w.defaultCourier || "—"}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DisabledLiveButton reason="Live API test requires real credentials.">
                        <Plug className="w-3 h-3 mr-1" /> Test
                      </DisabledLiveButton>
                      <Link to="/app/ecommerce/order-sync"><Button variant="ghost" size="sm"><RefreshCw className="w-3 h-3 mr-1" /> Sync</Button></Link>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(w)}><Pencil className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => del(w.id)}><Trash2 className="w-3 h-3 text-rose-600" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No websites yet. Click <b>Add Website</b>.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "Edit Website" : "Add Website"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name || ""} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>URL</Label><Input value={form.url || ""} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} /></div>
            <div>
              <Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v as WebsitePlatform }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as "active" | "inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="col-span-2 text-xs text-muted-foreground border rounded p-2 bg-muted/30">
              API Key / Secret are managed only in <Link to="/app/ecommerce/settings" className="underline">Integration Settings</Link>. This keeps credentials in one place.
            </div>
            <div><Label>Default Warehouse</Label><Input value={form.defaultWarehouse || ""} onChange={(e) => setForm((f) => ({ ...f, defaultWarehouse: e.target.value }))} /></div>
            <div><Label>Default Courier</Label><Input value={form.defaultCourier || ""} onChange={(e) => setForm((f) => ({ ...f, defaultCourier: e.target.value }))} /></div>
            <div><Label>Default Payment Method</Label><Input value={form.defaultPaymentMethod || ""} onChange={(e) => setForm((f) => ({ ...f, defaultPaymentMethod: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes || ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
