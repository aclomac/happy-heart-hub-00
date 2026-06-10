import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { useEffect } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import {
  StockTransferRowActions,
  type StockTransferRow,
} from "@/components/erp/StockTransferRowActions";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/stock-transfers/$id/edit")({
  component: StockTransferDetail,
});

function StockTransferDetail() {
  const { id } = useParams({ from: "/app/stock-transfers/$id/edit" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["stock-transfer", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("stock_transfers")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (StockTransferRow & {
            company_id: string;
            status: string | null;
            created_by: string | null;
          })
        | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Inventory",
        action: "stock_transfer.detail_opened",
        entityType: "stock_transfer",
        entityId: q.data.id,
        referenceNo: q.data.transfer_no,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/stock-transfers" search={{ from: undefined, item: undefined }}>
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Stock Transfer" actions={back} />
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
        <PageHeader title="Stock Transfer" actions={back} />
        <div className="p-8 text-center text-sale">Transfer not found.</div>
      </div>
    );
  }

  const t = q.data;
  const refLabel = t.transfer_no || t.id.slice(0, 8).toUpperCase();

  return (
    <div>
      <PageHeader
        title={`Stock Transfer · ${refLabel}`}
        subtitle="Read-only detail. Posted transfers cannot be edited."
        actions={
          <div className="flex items-center gap-2">
            {back}
            <StockTransferRowActions transfer={t} companyId={t.company_id} />
          </div>
        }
      />

      <div className="rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 px-3 py-2 mb-4 text-sm flex items-center gap-2">
        <Lock className="w-4 h-4" />
        Editing posted stock transfer is locked. Duplicate as new to make changes.
      </div>

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Transfer #" value={refLabel} />
        <Field label="Date" value={t.transfer_date} />
        <Field label="From warehouse" value={t.from_warehouse_id} />
        <Field label="To warehouse" value={t.to_warehouse_id} />
        <Field label="Status" value={t.status || "posted"} />
        <Field label="Created by" value={t.created_by || "—"} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Note</div>
          <div className="font-medium">{t.note || "—"}</div>
        </div>
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
