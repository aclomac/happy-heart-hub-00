import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft, Printer, FileText, History } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";
import { runSalarySlipPdfAction } from "@/lib/pdf/salary-slip-actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DASH = "—";
const safe = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length ? s : DASH;
};
const num = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : DASH;
};

export const Route = createFileRoute("/app/payroll/salary-payments/$id")({
  component: SalaryPaymentDetail,
});

function SalaryPaymentDetail() {
  const { id } = useParams({ from: "/app/payroll/salary-payments/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["salary-payment-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("employee_payments")
        .select("*")
        .is("deleted_at", null)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const employeeId = q.data?.employee_id as string | undefined;
  const empQ = useQuery({
    queryKey: ["salary-payment-employee", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await sb
        .from("employees")
        .select("id,name,code")
        .eq("id", employeeId)
        .maybeSingle();
      return data as { id: string; name: string; code: string | null } | null;
    },
  });

  // Best-effort linked slip: latest slip for this employee covering this payment date
  const slipQ = useQuery({
    queryKey: ["salary-payment-linked-slip", employeeId, q.data?.payment_date],
    enabled: !!employeeId && !!q.data?.payment_date && !!companyId,
    queryFn: async () => {
      const { data } = await sb
        .from("salary_slips")
        .select("id,period_month,paid_on")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("employee_id", employeeId)
        .order("period_month", { ascending: false })
        .limit(1);
      const row = Array.isArray(data) && data.length ? data[0] : null;
      return row as { id: string; period_month: string } | null;
    },
  });

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Salary",
        action: "salary_payment.detail_opened",
        entityType: "salary_payment",
        entityId: String(q.data.id),
        referenceNo: (q.data.reference_no as string | null) ?? undefined,
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/payroll" hash="payments">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Salary Payment" actions={back} />
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
        <PageHeader title="Salary Payment" actions={back} />
        <div className="p-8 text-center text-sale">Salary payment not found.</div>
      </div>
    );
  }

  const p = q.data;
  const empName = empQ.data?.name ?? employeeId ?? DASH;
  const refDisplay =
    safe(p.reference_no) !== DASH ? String(p.reference_no) : String(p.id).slice(0, 8).toUpperCase();

  return (
    <div>
      <PageHeader
        title={`Salary Payment · ${refDisplay}`}
        subtitle={`Employee: ${empName}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  void logAudit({
                    companyId: String(p.company_id),
                    module: "Salary",
                    action: "salary_payment.printed",
                    entityType: "salary_payment",
                    entityId: String(p.id),
                    metadata: {},
                  });
                  window.print();
                } catch {
                  // Print failures should never crash the page.
                }
              }}
            >
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            {slipQ.data ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link to="/app/payroll/salary-slips/$id" params={{ id: slipQ.data.id }}>
                    <FileText className="w-4 h-4 mr-1" /> Linked slip
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runSalarySlipPdfAction({
                      action: "pdf",
                      slipId: slipQ.data!.id,
                      companyId: String(p.company_id),
                      employeeId: employeeId ?? null,
                      month: slipQ.data!.period_month,
                      source: "salary_payment",
                    })
                  }
                >
                  <FileText className="w-4 h-4 mr-1" /> Slip PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void runSalarySlipPdfAction({
                      action: "print",
                      slipId: slipQ.data!.id,
                      companyId: String(p.company_id),
                      employeeId: employeeId ?? null,
                      month: slipQ.data!.period_month,
                      source: "salary_payment",
                    })
                  }
                >
                  <Printer className="w-4 h-4 mr-1" /> Slip Print
                </Button>
              </>
            ) : null}
            {employeeId ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/app/payroll" hash="payments" search={{ employee: employeeId } as never}>
                  <History className="w-4 h-4 mr-1" /> History
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Employee" value={empName} />
        <Field label="Amount" value={num(p.amount)} />
        <Field label="Payment date" value={safe(p.payment_date)} />
        <Field label="Method" value={safe(p.method)} />
        <Field label="Reference no" value={safe(p.reference_no)} />
        <Field label="Status" value={safe(p.status)} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Note</div>
          <div className="font-medium">{safe(p.notes)}</div>
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
