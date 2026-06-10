import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  Loader2,
  ArrowLeft,
  Calendar,
  FileText,
  Wallet,
  History,
  Lock,
  Printer,
  Eye,
} from "lucide-react";
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

export const Route = createFileRoute("/app/payroll/employees/$id")({
  component: EmployeeDetail,
});

type SlipRow = {
  id: string;
  period_month: string;
  net: number;
  due: number;
  status: string;
  paid_on: string | null;
};

type PayRow = {
  id: string;
  payment_date: string;
  amount: number;
  method: string;
  reference_no: string | null;
  status: string;
};

function EmployeeDetail() {
  const { id } = useParams({ from: "/app/payroll/employees/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["employee-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const slipsQ = useQuery({
    queryKey: ["employee-detail-slips", id, companyId],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data } = await sb
        .from("salary_slips")
        .select("id,period_month,net,due,status,paid_on")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("employee_id", id)
        .order("period_month", { ascending: false })
        .limit(12);
      return ((data as SlipRow[] | null) ?? []) as SlipRow[];
    },
  });

  const paysQ = useQuery({
    queryKey: ["employee-detail-pays", id, companyId],
    enabled: !!companyId && !!id,
    queryFn: async () => {
      const { data } = await sb
        .from("employee_payments")
        .select("id,payment_date,amount,method,reference_no,status")
        .is("deleted_at", null)
        .eq("company_id", companyId)
        .eq("employee_id", id)
        .order("payment_date", { ascending: false })
        .limit(12);
      return ((data as PayRow[] | null) ?? []) as PayRow[];
    },
  });

  // Best-effort linked slip per payment: same employee + period_month equal to YYYY-MM of payment_date
  const slipByMonth = useMemo(() => {
    const m = new Map<string, SlipRow>();
    for (const s of slipsQ.data ?? []) {
      const key = String(s.period_month ?? "").slice(0, 7);
      if (key && !m.has(key)) m.set(key, s);
    }
    return m;
  }, [slipsQ.data]);

  useEffect(() => {
    if (q.data && companyId) {
      void logAudit({
        companyId,
        module: "Salary",
        action: "employee.detail_opened",
        entityType: "employee",
        entityId: String(q.data.id),
        referenceNo: safe(q.data.code) !== DASH ? String(q.data.code) : String(q.data.name ?? ""),
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/payroll" hash="employees">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Employee" actions={back} />
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
        <PageHeader title="Employee" actions={back} />
        <div className="p-8 text-center text-sale">Employee not found.</div>
      </div>
    );
  }

  const e = q.data;
  const empId = String(e.id);
  const isActive = Boolean(e.is_active);
  const search = { employee: empId } as never;

  const runSlip = (action: "pdf" | "preview" | "print", slip: SlipRow) =>
    void runSalarySlipPdfAction({
      action,
      slipId: slip.id,
      companyId: String(companyId),
      source: "employee_detail",
      employeeId: empId,
      month: slip.period_month,
    });

  return (
    <div>
      <PageHeader
        title={`Employee · ${safe(e.name)}`}
        subtitle={
          isActive
            ? "Read-only detail view. Use Payroll module to edit."
            : "Inactive employee — locked read-only view."
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            <Button asChild variant="outline" size="sm">
              <Link to="/app/payroll" hash="attendance" search={search}>
                <Calendar className="w-4 h-4 mr-1" /> Attendance
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/payroll" hash="salaries" search={search}>
                <FileText className="w-4 h-4 mr-1" /> Salary slips
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/payroll" hash="payments" search={search}>
                <Wallet className="w-4 h-4 mr-1" /> Payments
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/audit" search={{ entityId: empId } as never}>
                <History className="w-4 h-4 mr-1" /> History
              </Link>
            </Button>
            {!isActive ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="w-3 h-3" /> Locked
              </Badge>
            ) : null}
          </div>
        }
      />
      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Name" value={safe(e.name)} />
        <Field label="Code" value={safe(e.code)} />
        <Field label="Designation" value={safe(e.designation)} />
        <Field label="Department" value={safe(e.department)} />
        <Field label="Phone" value={safe(e.phone)} />
        <Field label="Email" value={safe(e.email)} />
        <Field label="Salary type" value={safe(e.salary_type ?? e.pay_type)} />
        <Field label="Base salary" value={num(e.base_salary)} />
        <Field label="Daily wage" value={e.daily_wage != null ? num(e.daily_wage) : DASH} />
        <Field label="Joining date" value={safe(e.joining_date)} />
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      {/* Recent salary slips */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Recent salary slips</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/payroll" hash="salaries" search={search}>
              View salary slips
            </Link>
          </Button>
        </div>
        {slipsQ.isLoading ? (
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : (slipsQ.data ?? []).length === 0 ? (
          <div
            data-testid="emp-slips-empty"
            className="rounded-md border bg-card p-4 text-sm text-muted-foreground"
          >
            No salary slips yet for this employee.
          </div>
        ) : (
          <div className="rounded-md border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right">Due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(slipsQ.data ?? []).map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{safe(s.period_month)}</td>
                    <td className="px-3 py-2 text-right">{num(s.net)}</td>
                    <td className="px-3 py-2 text-right">{num(s.due)}</td>
                    <td className="px-3 py-2">{safe(s.status)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button asChild variant="outline" size="sm">
                          <Link to="/app/payroll/salary-slips/$id" params={{ id: s.id }}>
                            <FileText className="w-3 h-3 mr-1" /> View Slip
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => runSlip("pdf", s)}>
                          <FileText className="w-3 h-3 mr-1" /> Open PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => runSlip("preview", s)}>
                          <Eye className="w-3 h-3 mr-1" /> Preview
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => runSlip("print", s)}>
                          <Printer className="w-3 h-3 mr-1" /> Print
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent salary payments */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Recent salary payments</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/payroll" hash="payments" search={search}>
              View payments
            </Link>
          </Button>
        </div>
        {paysQ.isLoading ? (
          <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : (paysQ.data ?? []).length === 0 ? (
          <div
            data-testid="emp-pays-empty"
            className="rounded-md border bg-card p-4 text-sm text-muted-foreground"
          >
            No salary payments yet for this employee.
          </div>
        ) : (
          <div className="rounded-md border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(paysQ.data ?? []).map((p) => {
                  const monthKey = String(p.payment_date ?? "").slice(0, 7);
                  const linkedSlip = slipByMonth.get(monthKey) ?? null;
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{safe(p.payment_date)}</td>
                      <td className="px-3 py-2 text-right">{num(p.amount)}</td>
                      <td className="px-3 py-2">{safe(p.method)}</td>
                      <td className="px-3 py-2">{safe(p.reference_no)}</td>
                      <td className="px-3 py-2">{safe(p.status)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <Button asChild variant="outline" size="sm">
                            <Link to="/app/payroll/salary-payments/$id" params={{ id: p.id }}>
                              <Wallet className="w-3 h-3 mr-1" /> View Payment
                            </Link>
                          </Button>
                          {linkedSlip ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runSlip("pdf", linkedSlip)}
                              >
                                <FileText className="w-3 h-3 mr-1" /> Slip PDF
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => runSlip("print", linkedSlip)}
                              >
                                <Printer className="w-3 h-3 mr-1" /> Slip Print
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              title="No linked salary slip for this month"
                            >
                              <FileText className="w-3 h-3 mr-1" /> No linked slip
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
