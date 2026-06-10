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

export const Route = createFileRoute("/app/cash/loan-payments/$id")({
  component: LoanPaymentDetail,
});

function LoanPaymentDetail() {
  const { id } = useParams({ from: "/app/cash/loan-payments/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["loan-payment-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("loan_payments")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        company_id: string;
        loan_id: string;
        payment_date: string;
        amount: number;
        interest_amount: number;
        principal_amount: number;
        method: string;
        bank_account_id: string | null;
        notes: string | null;
        status: string;
      } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Loan",
        action: "loan_payment.detail_opened",
        entityType: "loan_payment",
        entityId: q.data.id,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/cash" hash="loans">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Loan Payment" actions={back} />
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
        <PageHeader title="Loan Payment" actions={back} />
        <div className="p-8 text-center text-sale">Loan payment not found.</div>
      </div>
    );
  }

  const lp = q.data;
  return (
    <div>
      <PageHeader
        title={`Loan Payment · ${lp.id.slice(0, 8).toUpperCase()}`}
        subtitle="Read-only loan payment detail."
        actions={
          <div className="flex items-center gap-2">
            {back}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void logAudit({
                  companyId: lp.company_id,
                  module: "Loan",
                  action: "loan_payment.printed",
                  entityType: "loan_payment",
                  entityId: lp.id,
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
        <Field label="Loan ID" value={lp.loan_id} />
        <Field label="Payment date" value={lp.payment_date} />
        <Field label="Amount" value={String(lp.amount)} />
        <Field label="Principal" value={String(lp.principal_amount)} />
        <Field label="Interest" value={String(lp.interest_amount)} />
        <Field label="Method" value={lp.method} />
        <Field label="Bank account" value={lp.bank_account_id || "—"} />
        <Field label="Status" value={lp.status} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Notes</div>
          <div className="font-medium">{lp.notes || "—"}</div>
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
