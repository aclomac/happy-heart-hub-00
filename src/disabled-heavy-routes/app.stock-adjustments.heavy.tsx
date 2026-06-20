import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, PackageMinus } from "lucide-react";
import { StockAdjustmentRowActions } from "@/components/erp/StockAdjustmentRowActions";

import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { EmptyState } from "@/components/erp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import {
  computeAdjustmentDelta,
  postStockAdjustment,
  getItemStoreStock,
  type AdjustmentType,
} from "@/lib/stock";

export const Route = createFileRoute("/app/stock-adjustments")({
  component: StockAdjustmentsShell,
});

function StockAdjustmentsShell() {
  const { pathname } = useLocation();
  return pathname === "/app/stock-adjustments" ? <StockAdjustmentsPage /> : <Outlet />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Adj = {
  id: string;
  adjustment_date: string;
  adjustment_type: AdjustmentType;
  qty_delta: number;
  reason: string | null;
  reference_no: string | null;
  item_id: string;
  warehouse_id: string;
};

function StockAdjustmentsPage() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["stock-adjustments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stock_adjustments")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("adjustment_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Adj[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["items-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("items")
        .select("id,name,stock,unit")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      return (data ?? []) as { id: string; name: string; stock: number; unit: string }[];
    },
  });

  const warehousesQ = useQuery({
    queryKey: ["warehouses-min", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("warehouses")
        .select("id,name,is_default")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("name");
      return (data ?? []) as { id: string; name: string; is_default: boolean }[];
    },
  });

  const itemMap = useMemo(
    () => new Map((itemsQ.data ?? []).map((i) => [i.id, i.name])),
    [itemsQ.data],
  );
  const whMap = useMemo(
    () => new Map((warehousesQ.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQ.data],
  );

  if (!companyId) return <NoCompanySelected />;

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        subtitle="Increase, decrease, set, damage/loss or opening stock correction"
        actions={
          <Button
            onClick={() => setOpen(true)}
            className="bg-primary text-primary-foreground gap-2"
          >
            <Plus className="w-4 h-4" /> Add Stock Adjustment
          </Button>
        }
      />

      <div className="rounded-md border bg-card">
        {listQ.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : !listQ.data?.length ? (
          <EmptyState
            icon={PackageMinus}
            title="No stock adjustments yet"
            description="Adjust stock for damage, opening balance corrections, or manual increase / decrease."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Store</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Qty Δ</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data.map((a) => (
                <tr key={a.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">{a.adjustment_date}</td>
                  <td className="px-3 py-2">{itemMap.get(a.item_id) || "—"}</td>
                  <td className="px-3 py-2">{whMap.get(a.warehouse_id) || "—"}</td>
                  <td className="px-3 py-2 capitalize">{a.adjustment_type}</td>
                  <td
                    className={`px-3 py-2 text-right font-medium ${a.qty_delta >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    {a.qty_delta >= 0 ? "+" : ""}
                    {a.qty_delta}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{a.reason || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <StockAdjustmentRowActions adjustment={a} companyId={companyId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AdjustmentFormDialog
        open={open}
        onClose={() => setOpen(false)}
        companyId={companyId}
        items={itemsQ.data ?? []}
        warehouses={warehousesQ.data ?? []}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["stock-adjustments", companyId] });
          qc.invalidateQueries({ queryKey: ["items-min", companyId] });
          setOpen(false);
        }}
      />
    </div>
  );
}

function AdjustmentFormDialog({
  open,
  onClose,
  companyId,
  items,
  warehouses,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  items: { id: string; name: string; stock: number; unit: string }[];
  warehouses: { id: string; name: string; is_default: boolean }[];
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultWh = warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? "";

  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState(defaultWh);
  const [type, setType] = useState<AdjustmentType>("increase");
  const [qtyInput, setQtyInput] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [refNo, setRefNo] = useState("");
  const [date, setDate] = useState(today);
  const [currentStock, setCurrentStock] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWarehouseId(defaultWh);
  }, [defaultWh]);

  useEffect(() => {
    if (!itemId || !warehouseId) {
      setCurrentStock(0);
      return;
    }
    getItemStoreStock(companyId, itemId, warehouseId).then(setCurrentStock);
  }, [companyId, itemId, warehouseId]);

  const delta = computeAdjustmentDelta(type, Number(qtyInput) || 0, currentStock);
  const newStock = currentStock + delta;

  const reset = () => {
    setItemId("");
    setQtyInput(0);
    setReason("");
    setRefNo("");
    setType("increase");
  };

  const selectedItem = items.find((i) => i.id === itemId);
  const totalItemStock = Number(selectedItem?.stock ?? 0);

  const save = async () => {
    if (!itemId || !warehouseId) {
      toast.error("Pick an item and a store");
      return;
    }
    const q = Number(qtyInput);
    if (type !== "set" && (!Number.isFinite(q) || q <= 0)) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (type === "set" && (!Number.isFinite(q) || q < 0)) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    setSaving(true);
    const r = await postStockAdjustment({
      companyId,
      itemId,
      warehouseId,
      type,
      qtyInput: Number(qtyInput),
      currentStock,
      reason: reason || null,
      referenceNo: refNo || null,
      adjustmentDate: date,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Stock adjusted");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Stock Adjustment</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Reference no.</Label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} />
          </div>
          <div>
            <Label>Item</Label>
            <Select value={itemId} onValueChange={setItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Store</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose store" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Adjustment type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AdjustmentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">Increase Stock</SelectItem>
                <SelectItem value="decrease">Decrease Stock</SelectItem>
                <SelectItem value="set">Set Stock Quantity</SelectItem>
                <SelectItem value="damage">Damage / Loss</SelectItem>
                <SelectItem value="opening">Opening Stock Correction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{type === "set" ? "Target quantity" : "Quantity"}</Label>
            <Input
              type="number"
              value={qtyInput}
              onChange={(e) => setQtyInput(Number(e.target.value))}
            />
          </div>
          <div className="col-span-2 space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Current (selected store)</div>
                <div className="font-semibold">{currentStock}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Change</div>
                <div className={`font-semibold ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {delta >= 0 ? "+" : ""}
                  {delta}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">New (selected store)</div>
                <div className="font-semibold">{newStock}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              This is selected store stock, not total item stock.
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Total item stock: </span>
              <span className="font-semibold">{totalItemStock}</span>
            </div>
          </div>
          <div className="col-span-2">
            <Label>Reason / note</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
