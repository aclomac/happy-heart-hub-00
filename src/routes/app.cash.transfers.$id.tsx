import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/app/cash/transfers/$id")({
  component: CashTransferDetail,
});

function CashTransferDetail() {
  const { id } = useParams({ from: "/app/cash/transfers/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["cash-transaction", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("cash_transactions")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        company_id: string;
        txn_date: string;
        direction: string;
        amount: number;
        category: string | null;
        notes: string | null;
        bank_account_id: string | null;
        reference_type: string | null;
        status: string | null;
        created_by: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      const kind = q.data.bank_account_id ? "bank_transfer" : "cash_transfer";
      void logAudit({
        companyId,
        module: "Cash",
        action: `${kind}.detail_opened`,
        entityType: kind,
        entityId: q.data.id,
        referenceNo: q.data.category ?? null,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/cash">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Transfer" actions={back} />
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
        <PageHeader title="Transfer" actions={back} />
        <div className="p-8 text-center text-sale">Transfer not found.</div>
      </div>
    );
  }

  const t = q.data;
  const kind = t.bank_account_id ? "Bank Transfer" : "Cash Transfer";
  const refLabel = t.id.slice(0, 8).toUpperCase();

  return (
    <div>
      <PageHeader
        title={`${kind} · ${refLabel}`}
        subtitle="Read-only transfer detail."
        actions={
          <div className="flex items-center gap-2">
            {back}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void logAudit({
                  companyId: t.company_id,
                  module: "Cash",
                  action: "cash_transfer.printed",
                  entityType: "cash_transfer",
                  entityId: t.id,
                  metadata: {},
                });
                window.print();
              }}
            >
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </div>
        }
      />

      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Type" value={kind} />
        <Field label="Direction" value={t.direction} />
        <Field label="Date" value={t.txn_date} />
        <Field label="Amount" value={String(t.amount)} />
        <Field label="Category" value={t.category || "—"} />
        <Field label="Bank account" value={t.bank_account_id || "—"} />
        <Field label="Reference" value={t.reference_type || "—"} />
        <Field label="Status" value={t.status || "posted"} />
        <Field label="Created by" value={t.created_by || "—"} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Notes</div>
          <div className="font-medium">{t.notes || "—"}</div>
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
