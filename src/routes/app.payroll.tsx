import {
  createFileRoute,
  useNavigate,
  useRouterState,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { FeatureGate } from "@/components/erp/FeatureGate";
import { EmployeesSection } from "@/components/erp/payroll/EmployeesSection";
import { AttendanceSection } from "@/components/erp/payroll/AttendanceSection";
import { SalarySetupSection } from "@/components/erp/payroll/SalarySetupSection";
import { SalaryPaymentsSection } from "@/components/erp/payroll/SalaryPaymentsSection";
import { PayrollReportsSection } from "@/components/erp/payroll/PayrollReportsSection";

export const Route = createFileRoute("/app/payroll")({ component: PayrollShell });

function PayrollShell() {
  const { pathname } = useLocation();
  return pathname === "/app/payroll" ? <Payroll /> : <Outlet />;
}

const TABS = [
  { hash: "employees", label: "Employees" },
  { hash: "attendance", label: "Attendance" },
  { hash: "salary-setup", label: "Salary Setup" },
  { hash: "payments", label: "Salary Payments" },
  { hash: "reports", label: "Payroll Reports" },
] as const;

type TabKey = (typeof TABS)[number]["hash"];

function Payroll() {
  const companyId = useCurrentCompanyId();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (s) => s.location.hash.replace(/^#/, "") });
  const active: TabKey = (TABS.find((t) => t.hash === hash)?.hash ?? "employees") as TabKey;

  const { data: stats } = useQuery({
    queryKey: ["payroll-stats", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [emps, att] = await Promise.all([
        supabase
          .from("employees")
          .select("id,base_salary,pay_type")
          .eq("company_id", companyId!)
          .eq("is_active", true),
        supabase.from("attendance").select("status").eq("company_id", companyId!).eq("date", today),
      ]);
      const total = (emps.data || []).length;
      const monthly = (emps.data || []).reduce(
        (s: number, e: { base_salary: number; pay_type: string }) =>
          s + Number(e.base_salary || 0) * (e.pay_type === "fixed" ? 1 : 26),
        0,
      );
      const present = (att.data || []).filter(
        (a: { status: string }) => a.status === "present",
      ).length;
      const onLeave = (att.data || []).filter(
        (a: { status: string }) => a.status === "leave",
      ).length;
      return { total, monthly, present, onLeave };
    },
  });

  if (!companyId)
    return (
      <div>
        <PageHeader title="Payroll & Employees" />
        <NoCompanySelected />
      </div>
    );

  return (
    <FeatureGate module="payroll" label="Payroll">
      <div>
        <PageHeader
          title="Payroll & Employees"
          subtitle="Employees, attendance, salary setup & payments"
        />
        <SummaryCards
          items={[
            { label: "Employees", value: String(stats?.total ?? 0) },
            { label: "Present Today", value: String(stats?.present ?? 0), tone: "success" },
            { label: "On Leave", value: String(stats?.onLeave ?? 0), tone: "warning" },
            {
              label: "Monthly Salary Est.",
              value: `৳ ${Math.round(stats?.monthly ?? 0).toLocaleString()}`,
            },
          ]}
        />

        <div className="border-b mt-3 mb-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const on = active === t.hash;
            return (
              <button
                key={t.hash}
                onClick={() => navigate({ to: "/app/payroll", hash: t.hash })}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {active === "employees" && <EmployeesSection companyId={companyId} />}
        {active === "attendance" && <AttendanceSection companyId={companyId} />}
        {active === "salary-setup" && <SalarySetupSection companyId={companyId} />}
        {active === "payments" && <SalaryPaymentsSection companyId={companyId} />}
        {active === "reports" && <PayrollReportsSection companyId={companyId} />}
      </div>
    </FeatureGate>
  );
}
