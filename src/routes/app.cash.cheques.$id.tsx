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

export const Route = createFileRoute("/app/cash/cheques/$id")({
  component: ChequeDetail,
});

function ChequeDetail() {
  const { id } = useParams({ from: "/app/cash/cheques/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["cheque-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("cheques")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        company_id: string;
        cheque_number: string;
        party_id: string | null;
        bank_account_id: string | null;
        amount: number;
        direction: string;
        status: string;
        cheque_date: string;
        cleared_at: string | null;
        notes: string | null;
        posted_txn_id: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Cheque",
        action: "cheque.detail_opened",
        entityType: "cheque",
        entityId: q.data.id,
        referenceNo: q.data.cheque_number,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/cash" hash="cheques">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Cheque" actions={back} />
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
        <PageHeader title="Cheque" actions={back} />
        <div className="p-8 text-center text-sale">Cheque not found.</div>
      </div>
    );
  }

  const c = q.data;
  return (
    <div>
      <PageHeader
        title={`Cheque · ${c.cheque_number}`}
        subtitle="Read-only cheque detail."
        actions={
          <div className="flex items-center gap-2">
            {back}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void logAudit({
                  companyId: c.company_id,
                  module: "Cheque",
                  action: "cheque.printed",
                  entityType: "cheque",
                  entityId: c.id,
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
        <Field label="Cheque #" value={c.cheque_number} />
        <Field label="Direction" value={c.direction} />
        <Field label="Amount" value={String(c.amount)} />
        <Field label="Cheque date" value={c.cheque_date} />
        <Field label="Cleared at" value={c.cleared_at || "—"} />
        <Field label="Status" value={c.status} />
        <Field label="Party" value={c.party_id || "—"} />
        <Field label="Bank account" value={c.bank_account_id || "—"} />
        <Field label="Linked txn" value={c.posted_txn_id || "—"} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Notes</div>
          <div className="font-medium">{c.notes || "—"}</div>
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
