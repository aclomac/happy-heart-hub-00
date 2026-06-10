import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2, ArrowLeft, User, FileText } from "lucide-react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompanyId } from "@/lib/use-company";
import { logAudit } from "@/lib/audit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const DASH = "—";
const safe = (v: unknown): string => {
  if (v === null || v === undefined) return DASH;
  const s = String(v).trim();
  return s.length ? s : DASH;
};

export const Route = createFileRoute("/app/payroll/attendance/$id")({
  component: AttendanceDetail,
});

function AttendanceDetail() {
  const { id } = useParams({ from: "/app/payroll/attendance/$id" });
  const companyId = useCurrentCompanyId();

  const q = useQuery({
    queryKey: ["attendance-detail", id, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await sb.from("attendance").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const employeeId = q.data?.employee_id as string | undefined;
  const empQ = useQuery({
    queryKey: ["attendance-employee", employeeId],
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
        module: "Other",
        action: "attendance.detail_opened",
        entityType: "attendance",
        entityId: String(q.data.id),
        metadata: { source: "drilldown" },
      });
    }
  }, [q.data, companyId]);

  const back = (
    <Button asChild variant="outline" size="sm">
      <Link to="/app/payroll" hash="attendance">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back
      </Link>
    </Button>
  );

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title="Attendance" actions={back} />
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
        <PageHeader title="Attendance" actions={back} />
        <div className="p-8 text-center text-sale">Attendance record not found.</div>
      </div>
    );
  }

  const a = q.data;
  const empName = empQ.data?.name ?? employeeId ?? DASH;

  return (
    <div>
      <PageHeader
        title={`Attendance · ${safe(a.date)}`}
        subtitle={`Employee: ${empName}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {back}
            {employeeId ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/app/payroll/employees/$id" params={{ id: employeeId }}>
                  <User className="w-4 h-4 mr-1" /> Employee
                </Link>
              </Button>
            ) : null}
            {employeeId ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/app/payroll" hash="salaries" search={{ employee: employeeId } as never}>
                  <FileText className="w-4 h-4 mr-1" /> Salary
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="rounded-md border bg-card p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Field label="Employee" value={empName} />
        <Field label="Date" value={safe(a.date)} />
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <Badge variant="secondary" className="capitalize">
            {safe(a.status)}
          </Badge>
        </div>
        <div className="col-span-full">
          <div className="text-xs text-muted-foreground">Note</div>
          <div className="font-medium">{safe(a.note)}</div>
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
