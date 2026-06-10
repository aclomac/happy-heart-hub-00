import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft, Package } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/items/$id/edit")({ component: ItemDetail });

function ItemDetail() {
  const { id } = useParams({ from: "/app/items/$id/edit" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["item-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("items")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        company_id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        category: string | null;
        unit: string;
        sale_price: number;
        purchase_price: number;
        stock: number;
        low_stock_alert: number | null;
        is_active: boolean;
      } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Other",
        action: "item.detail_opened",
        entityType: "item",
        entityId: q.data.id,
        referenceNo: q.data.sku ?? q.data.name,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/items">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Item" actions={back} />
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
          Loading…
        </div>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div>
        <PageHeader title="Item" actions={back} />
        <div className="p-8 text-center text-sale">Item not found.</div>
      </div>
    );
  }

  const it = q.data;
  const low = it.low_stock_alert != null && Number(it.stock) <= Number(it.low_stock_alert);

  return (
    <div>
      <PageHeader title={`Item · ${it.name}`} subtitle="Read-only detail view." actions={back} />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Name" value={it.name} />
        <Field label="SKU" value={it.sku || "—"} />
        <Field label="Barcode" value={it.barcode || "—"} />
        <Field label="Category" value={it.category || "—"} />
        <Field label="Unit" value={it.unit} />
        <Field label="Sale price" value={String(it.sale_price)} />
        <Field label="Purchase price" value={String(it.purchase_price)} />
        <Field label="Stock" value={`${it.stock}${low ? " (low)" : ""}`} />
        <Field label="Status" value={it.is_active ? "Active" : "Inactive"} />
      </div>

      {low && (
        <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 px-3 py-2 text-sm flex items-center gap-2">
          <Package className="w-4 h-4" />
          Low stock alert: current stock {it.stock} ≤ alert {it.low_stock_alert}.
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-all">{value}</div>
    </div>
  );
}
