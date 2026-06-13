import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Cat = { id: string; name: string };

export function ItemEditDialog({
  itemId,
  companyId,
  open,
  onOpenChange,
  onSaved,
}: {
  itemId: string | null;
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    category_id: "",
    unit: "PCS",
    purchase_price: "",
    sale_price: "",
    stock: "",
    low_stock_alert: "",
    image_url: "",
    description: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const itemQ = useQuery({
    queryKey: ["item-edit", itemId, companyId],
    enabled: !!itemId && !!companyId && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("items")
        .select("*")
        .eq("id", itemId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const catsQ = useQuery({
    queryKey: ["item-categories", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await sb
        .from("item_categories")
        .select("id,name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as Cat[];
    },
  });

  useEffect(() => {
    if (itemQ.data) {
      const it = itemQ.data;
      setForm({
        name: it.name ?? "",
        sku: it.sku ?? "",
        barcode: it.barcode ?? "",
        category_id: it.category_id ?? "",
        unit: it.unit ?? "PCS",
        purchase_price: String(it.purchase_price ?? ""),
        sale_price: String(it.sale_price ?? ""),
        stock: String(it.stock ?? ""),
        low_stock_alert: it.low_stock_alert == null ? "" : String(it.low_stock_alert),
        image_url: it.image_url ?? "",
        description: it.description ?? "",
        is_active: it.is_active !== false,
      });
    }
  }, [itemQ.data]);

  useEffect(() => {
    if (open && itemId && itemQ.isFetched && !itemQ.data) {
      toast.error("Item not found");
      onOpenChange(false);
    }
  }, [open, itemId, itemQ.isFetched, itemQ.data, onOpenChange]);

  const handleSave = async () => {
    if (!itemId) return;
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const trimmedSku = form.sku.trim();
      if (trimmedSku && companyId) {
        const { data: existing } = await sb
          .from("items")
          .select("id")
          .eq("company_id", companyId)
          .ilike("sku", trimmedSku)
          .is("deleted_at", null)
          .neq("id", itemId)
          .maybeSingle();
        if (existing) throw new Error("Item code already exists.");
      }
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        sku: trimmedSku || null,
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        unit: form.unit || "PCS",
        purchase_price: Number(form.purchase_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        stock: Number(form.stock) || 0,
        low_stock_alert: form.low_stock_alert === "" ? null : Number(form.low_stock_alert),
        image_url: form.image_url.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      };
      const { error } = await sb.from("items").update(payload).eq("id", itemId);
      if (error) throw error;
      toast.success("Item updated");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items", companyId] }),
        qc.invalidateQueries({ queryKey: ["item-detail-full", itemId, companyId] }),
        qc.invalidateQueries({ queryKey: ["item-edit", itemId, companyId] }),
      ]);
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(`Item update failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const cats = catsQ.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        {itemQ.isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Item Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Item Code / SKU</Label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                value={form.category_id || "none"}
                onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div>
              <Label>Purchase Price</Label>
              <Input
                type="number"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              />
            </div>
            <div>
              <Label>Sale Price</Label>
              <Input
                type="number"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
              />
            </div>
            <div>
              <Label>Current Stock</Label>
              <Input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </div>
            <div>
              <Label>Low Stock Alert</Label>
              <Input
                type="number"
                value={form.low_stock_alert}
                onChange={(e) => setForm({ ...form, low_stock_alert: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Image URL</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                id="item-active"
              />
              <Label htmlFor="item-active" className="cursor-pointer">
                {form.is_active ? "Active" : "Inactive"}
              </Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || itemQ.isLoading}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
