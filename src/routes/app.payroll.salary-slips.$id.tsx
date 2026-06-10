import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft, Printer, FileText, Eye, History } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/app/payroll/salary-slips/$id")({
  component: SalarySlipDetail,
});

function SalarySlipDetail() {
  const { id } = useParams({ from: "/app/payroll/salary-slips/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["salary-slip-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("salary_slips")
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
    queryKey: ["salary-slip-employee", employeeId],
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

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Salary",
        action: "salary_slip.detail_opened",
        entityType: "salary_slip",
        entityId: String(q.data.id),
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
        <PageHeader title="Salary Slip" actions={back} />
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
        <PageHeader title="Salary Slip" actions={back} />
        <div className="p-8 text-center text-sale">Salary slip not found.</div>
      </div>
    );
  }

  const s = q.data;
  const net = Number(s.net ?? 0) || 0;
  const due = Number(s.due ?? 0) || 0;
  const paidAmt = net - due;
  const status = String(s.status ?? "unpaid").toLowerCase();
  const statusVariant: "default" | "secondary" | "destructive" =
    status === "paid" ? "default" : status === "partial" ? "secondary" : "destructive";
  const empName = empQ.data?.name ?? employeeId ?? DASH;

  const run = (action: "pdf" | "preview" | "print") =>
    void runSalarySlipPdfAction({
      action,
      slipId: String(s.id),
      companyId: String(s.company_id),
      source: "drilldown",
      employeeId: employeeId ?? null,
      month: (s.period_month as string | undefined) ?? null,
    });

  return (
    <div>
      <PageHeader
        title={`Salary Slip · ${safe(s.period_month)}`}
        subtitle={`Employee: ${empName}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            <Button variant="outline" size="sm" onClick={() => run("pdf")}>
              <FileText className="w-4 h-4 mr-1" /> Open PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => run("preview")}>
              <Eye className="w-4 h-4 mr-1" /> Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => run("print")}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            {employeeId ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/app/payroll" hash="payments" search={{ employee: employeeId } as never}>
                  <History className="w-4 h-4 mr-1" /> Payment history
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Employee" value={empName} />
        <Field label="Month" value={safe(s.period_month)} />
        <Field label="Days present" value={`${safe(s.days_present)} / ${safe(s.days_total)}`} />
        <Field label="Gross" value={num(s.gross)} />
        <Field label="Bonus" value={num(s.bonus)} />
        <Field label="Deductions" value={num(s.deductions)} />
        <Field label="Advance adj." value={num(s.advance ?? 0)} />
        <Field label="Net payable" value={num(net)} />
        <Field label="Paid" value={num(paidAmt)} />
        <Field label="Pending" value={num(due)} />
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <Badge variant={statusVariant} className="capitalize">
            {status}
          </Badge>
        </div>
        <Field label="Paid on" value={safe(s.paid_on)} />
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Notes</div>
          <div className="font-medium">{safe(s.notes)}</div>
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
