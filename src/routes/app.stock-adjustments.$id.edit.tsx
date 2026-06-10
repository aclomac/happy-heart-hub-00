import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import {
  StockAdjustmentRowActions,
  type StockAdjustmentRow,
} from "@/components/erp/StockAdjustmentRowActions";
import { logAudit } from "@/lib/audit";
import { useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/stock-adjustments/$id/edit")({
  component: StockAdjustmentDetail,
});

function StockAdjustmentDetail() {
  const { id } = useParams({ from: "/app/stock-adjustments/$id/edit" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["stock-adjustment", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stock_adjustments")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (StockAdjustmentRow & {
            company_id: string;
            reason: string | null;
            status: string | null;
            posted_at: string | null;
            created_by: string | null;
            adjustment_type: string;
          })
        | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Inventory",
        action: "stock_adjustment.detail_opened",
        entityType: "stock_adjustment",
        entityId: q.data.id,
        referenceNo: q.data.reference_no,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/stock-adjustments">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Stock Adjustment" actions={back} />
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
        <PageHeader title="Stock Adjustment" actions={back} />
        <div className="p-8 text-center text-sale">Adjustment not found.</div>
      </div>
    );
  }

  const a = q.data;
  const refLabel = a.reference_no || a.id.slice(0, 8).toUpperCase();

  return (
    <div>
      <PageHeader
        title={`Stock Adjustment · ${refLabel}`}
        subtitle="Read-only detail. Posted adjustments cannot be edited."
        actions={
          <div className="flex items-center gap-2">
            {back}
            <StockAdjustmentRowActions adjustment={a} companyId={a.company_id} />
          </div>
        }
      />

      <div className="rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 px-3 py-2 mb-4 text-sm flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Editing posted stock adjustment is locked. Duplicate as new to make changes.
      </div>

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Reference no." value={refLabel} />
        <Field label="Date" value={a.adjustment_date} />
        <Field label="Type" value={a.adjustment_type} />
        <Field label="Warehouse ID" value={a.warehouse_id} />
        <Field label="Item ID" value={a.item_id} />
        <Field label="Quantity Δ" value={`${a.qty_delta >= 0 ? "+" : ""}${a.qty_delta}`} />
        <Field label="Reason" value={a.reason || "—"} />
        <Field label="Status" value={a.status || "posted"} />
        <Field label="Created by" value={a.created_by || "—"} />
      </div>
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
