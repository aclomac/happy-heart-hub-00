import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/utilities/bulk-update-items")({
  component: BulkUpdateItems,
});

type Item = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_alert: number | null;
};

type Edit = { sale_price?: string; purchase_price?: string; low_stock_alert?: string };

function BulkUpdateItems() {
  const companyId = useCurrentCompanyId();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["bulk-items", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id,name,sku,unit,sale_price,purchase_price,stock,low_stock_alert")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as Item[];
    },
  });

  const filtered = items.filter(
    (i) =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.sku ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const setField = (id: string, field: keyof Edit, value: string) =>
    setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));

  const dirtyCount = Object.keys(edits).filter((id) => {
    const e = edits[id];
    return (
      e &&
      (e.sale_price !== undefined ||
        e.purchase_price !== undefined ||
        e.low_stock_alert !== undefined)
    );
  }).length;

  const handleSave = async () => {
    if (!companyId || dirtyCount === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const [id, e] of Object.entries(edits)) {
        const orig = items.find((i) => i.id === id);
        if (!orig) continue;
        const patch: {
          sale_price?: number;
          purchase_price?: number;
          low_stock_alert?: number | null;
        } = {};
        if (e.sale_price !== undefined && e.sale_price !== String(orig.sale_price)) {
          const n = Number(e.sale_price);
          if (Number.isFinite(n) && n >= 0) patch.sale_price = n;
        }
        if (e.purchase_price !== undefined && e.purchase_price !== String(orig.purchase_price)) {
          const n = Number(e.purchase_price);
          if (Number.isFinite(n) && n >= 0) patch.purchase_price = n;
        }
        if (e.low_stock_alert !== undefined) {
          const trimmed = e.low_stock_alert.trim();
          if (trimmed === "") patch.low_stock_alert = null;
          else {
            const n = Number(trimmed);
            if (Number.isFinite(n) && n >= 0) patch.low_stock_alert = n;
          }
        }
        if (Object.keys(patch).length === 0) continue;
        const { error } = await supabase
          .from("items")
          .update(patch)
          .eq("id", id)
          .eq("company_id", companyId);
        if (error) fail++;
        else ok++;
      }
      if (ok > 0) toast.success(`Updated ${ok} item(s)`);
      if (fail > 0) toast.error(`${fail} item(s) failed`);
      void logAudit({
        companyId,
        module: "Other",
        action: "updated",
        entityType: "items_bulk",
        metadata: { updated: ok, failed: fail },
      });
      setEdits({});
      qc.invalidateQueries({ queryKey: ["bulk-items", companyId] });
      qc.invalidateQueries({ queryKey: ["items", companyId] });
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return (
      <div>
        <PageHeader title="Bulk Update Items" />
        <NoCompanySelected />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Bulk Update Items"
        subtitle="Edit sale price, purchase price, and low-stock alert for many items at once"
        actions={
          <>
            <Link to="/app/utilities">
              <Button variant="outline" size="sm">
                Back
              </Button>
            </Link>
            <Button onClick={handleSave} disabled={busy || dirtyCount === 0} size="sm">
              {busy ? "Saving…" : `Save ${dirtyCount} change(s)`}
            </Button>
          </>
        }
      />
      <div className="bg-card border rounded-md p-4 space-y-3">
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="border rounded-md overflow-auto max-h-[600px]">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">SKU</th>
                <th className="p-2 text-left">Unit</th>
                <th className="p-2 text-right">Stock</th>
                <th className="p-2 text-right w-28">Sale Price</th>
                <th className="p-2 text-right w-28">Purchase Price</th>
                <th className="p-2 text-right w-28">Low Stock Alert</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted-foreground">
                    No items.
                  </td>
                </tr>
              )}
              {filtered.map((i) => {
                const e = edits[i.id] ?? {};
                return (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">{i.name}</td>
                    <td className="p-2">{i.sku ?? "—"}</td>
                    <td className="p-2">{i.unit}</td>
                    <td className="p-2 text-right">{i.stock}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={String(i.sale_price)}
                        onChange={(ev) => setField(i.id, "sale_price", ev.target.value)}
                        className="h-7 text-right"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={String(i.purchase_price)}
                        onChange={(ev) => setField(i.id, "purchase_price", ev.target.value)}
                        className="h-7 text-right"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={i.low_stock_alert == null ? "" : String(i.low_stock_alert)}
                        onChange={(ev) => setField(i.id, "low_stock_alert", ev.target.value)}
                        className="h-7 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
