import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileText, Printer } from "lucide-react";
import { runSalarySlipPdfAction } from "@/lib/pdf/salary-slip-actions";
import { useMemo, useState } from "react";
import { SummaryCards } from "@/components/erp/SummaryCards";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { exportCSV } from "@/lib/export-csv";
import { parseSetup } from "@/lib/payroll-setup";
import { toast } from "sonner";
import { ReportExportButtons } from "@/components/erp/ReportExportButtons";
import { fmtAmount, fmtDate, fmtQty, type ReportColumn } from "@/lib/export";

type Slip = {
  id: string;
  employee_id: string;
  period_month: string;
  days_present: number;
  days_total: number;
  gross: number;
  bonus: number;
  deductions: number;
  advance: number;
  net: number;
  status: string;
  paid_on: string | null;
};
type Emp = {
  id: string;
  name: string;
  code: string | null;
  department: string | null;
  notes: string | null;
};
type Att = { employee_id: string; date: string; status: string; note: string | null };

const REPORTS = [
  { key: "monthly", label: "Monthly Salary" },
  { key: "employee", label: "Employee-wise" },
  { key: "attendance", label: "Attendance" },
  { key: "advance", label: "Advance Salary" },
  { key: "bd", label: "Bonus & Deduction" },
] as const;
type ReportKey = (typeof REPORTS)[number]["key"];

function parseOT(note: string | null) {
  const m = note?.match(/OT:(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}
function money(n: number | string) {
  return `৳ ${Math.round(Number(n)).toLocaleString()}`;
}

export function PayrollReportsSection({ companyId }: { companyId: string }) {
  const [report, setReport] = useState<ReportKey>("monthly");

  return (
    <div>
      <div className="flex gap-1 mb-3 border-b overflow-x-auto">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReport(r.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${report === r.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {report === "monthly" && <MonthlyReport companyId={companyId} />}
      {report === "employee" && <EmployeeReport companyId={companyId} />}
      {report === "attendance" && <AttendanceReport companyId={companyId} />}
      {report === "advance" && <AdvanceReport companyId={companyId} />}
      {report === "bd" && <BonusDeductionReport companyId={companyId} />}
    </div>
  );
}

function useEmployees(companyId: string) {
  return useQuery({
    queryKey: ["employees-report", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,code,department,notes")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return data as Emp[];
    },
  });
}

function MonthlyReport({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: emps = [] } = useEmployees(companyId);
  const { data: slips = [], isLoading } = useQuery({
    queryKey: ["report-monthly", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("company_id", companyId)
        .eq("period_month", month)
        .is("deleted_at", null);
      if (error) throw error;
      return data as Slip[];
    },
  });
  const empMap = new Map(emps.map((e) => [e.id, e]));
  const totals = slips.reduce(
    (a, s) => ({
      gross: a.gross + Number(s.gross),
      bonus: a.bonus + Number(s.bonus),
      deductions: a.deductions + Number(s.deductions),
      advance: a.advance + Number(s.advance),
      net: a.net + Number(s.net),
      paid: a.paid + (s.status === "paid" ? Number(s.net) : 0),
      pending: a.pending + (s.status !== "paid" ? Number(s.net) : 0),
    }),
    { gross: 0, bonus: 0, deductions: 0, advance: 0, net: 0, paid: 0, pending: 0 },
  );

  const rows = slips.map((s) => ({
    Employee: empMap.get(s.employee_id)?.name || "",
    Code: empMap.get(s.employee_id)?.code || "",
    Department: empMap.get(s.employee_id)?.department || "",
    Days: `${s.days_present}/${s.days_total}`,
    Gross: s.gross,
    Bonus: s.bonus,
    Deductions: s.deductions,
    Advance: s.advance,
    Net: s.net,
    Status: s.status,
    PaidOn: s.paid_on || "",
  }));

  return (
    <ReportShell
      controls={
        <>
          <div>
            <Label className="text-xs">Month</Label>
            <Input
              className="h-9 w-44"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </>
      }
      onExport={() =>
        rows.length
          ? exportCSV(`monthly-salary-${month}`, rows, {
              title: "Monthly Salary",
              slug: `monthly-salary-${month}`,
            })
          : toast.error("Nothing to export")
      }
      pdfPrint={
        <ReportExportButtons<(typeof slips)[number] & Record<string, unknown>>
          slug="monthly-salary-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: `Monthly Salary — ${month}`,
            period: { from: `${month}-01`, to: `${month}-01` },
            filters: { extra: { Month: month } },
            columns: [
              {
                header: "Employee",
                accessor: (r) => empMap.get(r.employee_id)?.name || "",
              },
              {
                header: "Code",
                accessor: (r) => empMap.get(r.employee_id)?.code || "",
              },
              {
                header: "Dept",
                accessor: (r) => empMap.get(r.employee_id)?.department || "",
              },
              {
                header: "Days",
                align: "right",
                accessor: (r) => `${fmtQty(r.days_present)}/${fmtQty(r.days_total)}`,
              },
              { header: "Gross", align: "right", accessor: (r) => fmtAmount(r.gross) },
              { header: "Bonus", align: "right", accessor: (r) => fmtAmount(r.bonus) },
              { header: "Deduct", align: "right", accessor: (r) => fmtAmount(r.deductions) },
              { header: "Advance", align: "right", accessor: (r) => fmtAmount(r.advance) },
              { header: "Net", align: "right", accessor: (r) => fmtAmount(r.net) },
              { header: "Status", accessor: (r) => r.status },
              { header: "Paid On", accessor: (r) => fmtDate(r.paid_on) },
            ] satisfies ReportColumn<(typeof slips)[number] & Record<string, unknown>>[],
            rows: slips.map((s) => ({ ...s, company_id: companyId })) as ((typeof slips)[number] &
              Record<string, unknown>)[],
            totals: [
              "Totals",
              "",
              "",
              "",
              fmtAmount(totals.gross),
              fmtAmount(totals.bonus),
              fmtAmount(totals.deductions),
              fmtAmount(totals.advance),
              fmtAmount(totals.net),
              "",
              "",
            ],
            signature: "Authorised Signatory",
          })}
        />
      }
    >
      <SummaryCards
        items={[
          { label: "Gross", value: money(totals.gross) },
          { label: "Bonus", value: money(totals.bonus), tone: "success" },
          { label: "Deductions", value: money(totals.deductions), tone: "sale" },
          { label: "Advance", value: money(totals.advance), tone: "sale" },
          { label: "Net", value: money(totals.net) },
          { label: "Paid", value: money(totals.paid), tone: "success" },
          { label: "Pending", value: money(totals.pending), tone: "warning" },
        ]}
      />
      <div className="bg-card border rounded-md overflow-x-auto mt-3">
        {isLoading ? (
          <TableSkeleton rows={5} cols={8} />
        ) : slips.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={`No slips for ${month}`}
            description="Generate salary slips first."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dept</th>
                <th className="text-right">Days</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Bonus</th>
                <th className="text-right">Deduct</th>
                <th className="text-right">Net</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium">{empMap.get(s.employee_id)?.name || "—"}</td>
                  <td>{empMap.get(s.employee_id)?.department || "—"}</td>
                  <td className="text-right">
                    {s.days_present}/{s.days_total}
                  </td>
                  <td className="text-right">{money(s.gross)}</td>
                  <td className="text-right text-success">{money(s.bonus)}</td>
                  <td className="text-right text-sale">{money(s.deductions)}</td>
                  <td className="text-right font-bold num-pos">{money(s.net)}</td>
                  <td>
                    {s.status === "paid" ? (
                      <span className="text-success text-xs font-semibold">Paid</span>
                    ) : (
                      <span className="text-warning text-xs font-semibold">Pending</span>
                    )}
                  </td>
                  <td className="text-right">
                    <SlipRowActions
                      slipId={s.id}
                      companyId={companyId}
                      employeeId={s.employee_id}
                      month={s.period_month}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ReportShell>
  );
}

function EmployeeReport({ companyId }: { companyId: string }) {
  const { data: emps = [] } = useEmployees(companyId);
  const [empId, setEmpId] = useState<string>("");
  const effectiveId = empId || emps[0]?.id || "";
  const { data: slips = [], isLoading } = useQuery({
    queryKey: ["report-emp", companyId, effectiveId],
    enabled: !!effectiveId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("company_id", companyId)
        .eq("employee_id", effectiveId)
        .is("deleted_at", null)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data as Slip[];
    },
  });
  const emp = emps.find((e) => e.id === effectiveId);
  const rows = slips.map((s) => ({
    Month: s.period_month,
    Days: `${s.days_present}/${s.days_total}`,
    Gross: s.gross,
    Bonus: s.bonus,
    Deductions: s.deductions,
    Advance: s.advance,
    Net: s.net,
    Status: s.status,
    PaidOn: s.paid_on || "",
  }));
  return (
    <ReportShell
      controls={
        <div>
          <Label className="text-xs">Employee</Label>
          <Select value={effectiveId} onValueChange={setEmpId}>
            <SelectTrigger className="h-9 w-64">
              <SelectValue placeholder="Pick employee" />
            </SelectTrigger>
            <SelectContent>
              {emps.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      onExport={() =>
        rows.length
          ? exportCSV(`employee-${emp?.name || "report"}`, rows, {
              title: `Employee Report — ${emp?.name || ""}`,
              slug: `employee-${emp?.name || "report"}`,
            })
          : toast.error("Nothing to export")
      }
      pdfPrint={
        <ReportExportButtons<(typeof slips)[number] & Record<string, unknown>>
          slug="employee-wise-salary-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: `${emp?.name || "Employee"} — Salary History`,
            period: { from: null, to: null },
            filters: { extra: { Employee: emp?.name || "" } },
            columns: [
              { header: "Month", accessor: (r) => r.period_month },
              {
                header: "Days",
                align: "right",
                accessor: (r) => `${fmtQty(r.days_present)}/${fmtQty(r.days_total)}`,
              },
              { header: "Gross", align: "right", accessor: (r) => fmtAmount(r.gross) },
              { header: "Bonus", align: "right", accessor: (r) => fmtAmount(r.bonus) },
              { header: "Deduct", align: "right", accessor: (r) => fmtAmount(r.deductions) },
              { header: "Advance", align: "right", accessor: (r) => fmtAmount(r.advance) },
              { header: "Net", align: "right", accessor: (r) => fmtAmount(r.net) },
              { header: "Status", accessor: (r) => r.status },
              { header: "Paid On", accessor: (r) => fmtDate(r.paid_on) },
            ] satisfies ReportColumn<(typeof slips)[number] & Record<string, unknown>>[],
            rows: slips.map((s) => ({ ...s, company_id: companyId })) as ((typeof slips)[number] &
              Record<string, unknown>)[],
            signature: "Authorised Signatory",
          })}
        />
      }
    >
      <div className="bg-card border rounded-md overflow-x-auto mt-3">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : slips.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No history"
            description="No salary slips yet for this employee."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Days</th>
                <th className="text-right">Gross</th>
                <th className="text-right">Bonus</th>
                <th className="text-right">Deduct</th>
                <th className="text-right">Net</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono">{s.period_month}</td>
                  <td className="text-right">
                    {s.days_present}/{s.days_total}
                  </td>
                  <td className="text-right">{money(s.gross)}</td>
                  <td className="text-right text-success">{money(s.bonus)}</td>
                  <td className="text-right text-sale">{money(s.deductions)}</td>
                  <td className="text-right font-bold num-pos">{money(s.net)}</td>
                  <td>
                    {s.status === "paid" ? (
                      <span className="text-success text-xs font-semibold">
                        Paid {s.paid_on || ""}
                      </span>
                    ) : (
                      <span className="text-warning text-xs font-semibold">Pending</span>
                    )}
                  </td>
                  <td className="text-right">
                    <SlipRowActions
                      slipId={s.id}
                      companyId={companyId}
                      employeeId={s.employee_id}
                      month={s.period_month}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ReportShell>
  );
}

function AttendanceReport({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: emps = [] } = useEmployees(companyId);
  const start = `${month}-01`;
  const end = useMemo(() => {
    const d = new Date(`${start}T00:00:00`);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  }, [start]);
  const { data: marks = [], isLoading } = useQuery({
    queryKey: ["report-att", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("employee_id,date,status,note")
        .eq("company_id", companyId)
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data as Att[];
    },
  });
  const summary = emps.map((e) => {
    const r = marks.filter((m) => m.employee_id === e.id);
    return {
      Employee: e.name,
      Code: e.code || "",
      Department: e.department || "",
      Present: r.filter((x) => x.status === "present").length,
      Absent: r.filter((x) => x.status === "absent").length,
      Half: r.filter((x) => x.status === "half").length,
      Leave: r.filter((x) => x.status === "leave").length,
      "OT Hours": r.filter((x) => x.status === "overtime").reduce((s, x) => s + parseOT(x.note), 0),
    };
  });
  return (
    <ReportShell
      controls={
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            className="h-9 w-44"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      }
      onExport={() =>
        summary.length
          ? exportCSV(`attendance-${month}`, summary, {
              title: "Attendance Summary",
              slug: `attendance-${month}`,
              filters: { extra: { Month: month } },
            })
          : toast.error("Nothing to export")
      }
      pdfPrint={
        <ReportExportButtons<(typeof summary)[number] & Record<string, unknown>>
          slug="attendance-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: `Attendance — ${month}`,
            period: { from: start, to: end },
            filters: { from: start, to: end, extra: { Month: month } },
            columns: [
              { header: "Employee", accessor: (r) => String(r.Employee || "") },
              { header: "Code", accessor: (r) => String(r.Code || "") },
              { header: "Dept", accessor: (r) => String(r.Department || "") },
              { header: "Present", align: "right", accessor: (r) => fmtQty(r.Present) },
              { header: "Absent", align: "right", accessor: (r) => fmtQty(r.Absent) },
              { header: "Half", align: "right", accessor: (r) => fmtQty(r.Half) },
              { header: "Leave", align: "right", accessor: (r) => fmtQty(r.Leave) },
              { header: "OT (h)", align: "right", accessor: (r) => fmtQty(r["OT Hours"]) },
            ] satisfies ReportColumn<(typeof summary)[number] & Record<string, unknown>>[],
            rows: summary.map((s) => ({
              ...s,
              company_id: companyId,
            })) as ((typeof summary)[number] & Record<string, unknown>)[],
            signature: "Authorised Signatory",
          })}
        />
      }
    >
      <div className="bg-card border rounded-md overflow-x-auto mt-3">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : summary.length === 0 ? (
          <EmptyState icon={FileText} title="No employees" />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dept</th>
                <th className="text-right">P</th>
                <th className="text-right">A</th>
                <th className="text-right">H</th>
                <th className="text-right">L</th>
                <th className="text-right">OT (h)</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((s, i) => (
                <tr key={i}>
                  <td className="font-medium">{s.Employee}</td>
                  <td>{s.Department || "—"}</td>
                  <td className="text-right text-success font-semibold">{s.Present}</td>
                  <td className="text-right text-sale font-semibold">{s.Absent}</td>
                  <td className="text-right text-warning font-semibold">{s.Half}</td>
                  <td className="text-right text-utility font-semibold">{s.Leave}</td>
                  <td className="text-right text-primary font-semibold">{s["OT Hours"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ReportShell>
  );
}

function AdvanceReport({ companyId }: { companyId: string }) {
  const { data: emps = [], isLoading } = useEmployees(companyId);
  type Row = {
    Employee: string;
    Code: string;
    Date: string;
    Amount: number;
    Recovered: number;
    Outstanding: number;
  };
  const rows: Row[] = [];
  emps.forEach((e) => {
    const setup = parseSetup(e.notes);
    setup.advances.forEach((a) => {
      rows.push({
        Employee: e.name,
        Code: e.code || "",
        Date: a.date,
        Amount: Number(a.amount),
        Recovered: Number(a.recovered),
        Outstanding: Math.max(0, Number(a.amount) - Number(a.recovered)),
      });
    });
  });
  rows.sort((a, b) => b.Date.localeCompare(a.Date));
  const totals = rows.reduce(
    (a, r) => ({ amt: a.amt + r.Amount, rec: a.rec + r.Recovered, out: a.out + r.Outstanding }),
    { amt: 0, rec: 0, out: 0 },
  );
  return (
    <ReportShell
      controls={null}
      onExport={() =>
        rows.length
          ? exportCSV("advance-salary", rows, { title: "Advance Salary", slug: "advance-salary" })
          : toast.error("Nothing to export")
      }
      pdfPrint={
        <ReportExportButtons<Row & Record<string, unknown>>
          slug="advance-salary-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: "Advance Salary",
            period: { from: null, to: null },
            filters: {},
            columns: [
              { header: "Date", accessor: (r) => fmtDate(r.Date) },
              { header: "Employee", accessor: (r) => r.Employee },
              { header: "Code", accessor: (r) => r.Code },
              { header: "Amount", align: "right", accessor: (r) => fmtAmount(r.Amount) },
              { header: "Recovered", align: "right", accessor: (r) => fmtAmount(r.Recovered) },
              { header: "Outstanding", align: "right", accessor: (r) => fmtAmount(r.Outstanding) },
            ] satisfies ReportColumn<Row & Record<string, unknown>>[],
            rows: rows.map((r) => ({ ...r, company_id: companyId })) as (Row &
              Record<string, unknown>)[],
            totals: [
              "Totals",
              "",
              "",
              fmtAmount(totals.amt),
              fmtAmount(totals.rec),
              fmtAmount(totals.out),
            ],
            signature: "Authorised Signatory",
          })}
        />
      }
    >
      <SummaryCards
        items={[
          { label: "Total Advances", value: money(totals.amt) },
          { label: "Recovered", value: money(totals.rec), tone: "success" },
          { label: "Outstanding", value: money(totals.out), tone: "warning" },
        ]}
      />
      <div className="bg-card border rounded-md overflow-x-auto mt-3">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No advances"
            description="Log advances from the Salary Setup tab."
          />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Recovered</th>
                <th className="text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.Date}</td>
                  <td className="font-medium">
                    {r.Employee}
                    <div className="text-xs text-muted-foreground">{r.Code}</div>
                  </td>
                  <td className="text-right">{money(r.Amount)}</td>
                  <td className="text-right text-success">{money(r.Recovered)}</td>
                  <td className="text-right font-semibold text-warning">{money(r.Outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ReportShell>
  );
}

function BonusDeductionReport({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: emps = [] } = useEmployees(companyId);
  const { data: slips = [], isLoading } = useQuery({
    queryKey: ["report-bd", companyId, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salary_slips")
        .select("*")
        .eq("company_id", companyId)
        .eq("period_month", month)
        .is("deleted_at", null);
      if (error) throw error;
      return data as Slip[];
    },
  });
  const empMap = new Map(emps.map((e) => [e.id, e]));
  const rows = slips.map((s) => ({
    Employee: empMap.get(s.employee_id)?.name || "",
    Code: empMap.get(s.employee_id)?.code || "",
    Bonus: s.bonus,
    Deductions: s.deductions,
    Advance: s.advance,
  }));
  const totals = rows.reduce(
    (a, r) => ({
      b: a.b + Number(r.Bonus),
      d: a.d + Number(r.Deductions),
      a: a.a + Number(r.Advance),
    }),
    { b: 0, d: 0, a: 0 },
  );
  return (
    <ReportShell
      controls={
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            className="h-9 w-44"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      }
      onExport={() =>
        rows.length
          ? exportCSV(`bonus-deduction-${month}`, rows, {
              title: "Bonus / Deduction",
              slug: `bonus-deduction-${month}`,
              filters: { extra: { Month: month } },
            })
          : toast.error("Nothing to export")
      }
      pdfPrint={
        <ReportExportButtons<(typeof slips)[number] & Record<string, unknown>>
          slug="bonus-deduction-report"
          getContext={() => ({
            company: { name: null },
            companyId,
            title: `Bonus & Deductions — ${month}`,
            period: { from: `${month}-01`, to: `${month}-01` },
            filters: { extra: { Month: month } },
            columns: [
              {
                header: "Employee",
                accessor: (r) => empMap.get(r.employee_id)?.name || "",
              },
              {
                header: "Code",
                accessor: (r) => empMap.get(r.employee_id)?.code || "",
              },
              { header: "Bonus", align: "right", accessor: (r) => fmtAmount(r.bonus) },
              { header: "Deductions", align: "right", accessor: (r) => fmtAmount(r.deductions) },
              { header: "Advance", align: "right", accessor: (r) => fmtAmount(r.advance) },
            ] satisfies ReportColumn<(typeof slips)[number] & Record<string, unknown>>[],
            rows: slips.map((s) => ({ ...s, company_id: companyId })) as ((typeof slips)[number] &
              Record<string, unknown>)[],
            totals: ["Totals", "", fmtAmount(totals.b), fmtAmount(totals.d), fmtAmount(totals.a)],
            signature: "Authorised Signatory",
          })}
        />
      }
    >
      <SummaryCards
        items={[
          { label: "Bonus Total", value: money(totals.b), tone: "success" },
          { label: "Deduction Total", value: money(totals.d), tone: "sale" },
          { label: "Advance Recovery", value: money(totals.a), tone: "warning" },
        ]}
      />
      <div className="bg-card border rounded-md overflow-x-auto mt-3">
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title={`No slips for ${month}`} />
        ) : (
          <table className="erp-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="text-right">Bonus</th>
                <th className="text-right">Deductions</th>
                <th className="text-right">Advance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="font-medium">
                    {r.Employee}
                    <div className="text-xs text-muted-foreground">{r.Code}</div>
                  </td>
                  <td className="text-right text-success">{money(r.Bonus)}</td>
                  <td className="text-right text-sale">{money(r.Deductions)}</td>
                  <td className="text-right text-warning">{money(r.Advance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ReportShell>
  );
}

function ReportShell({
  controls,
  onExport,
  pdfPrint,
  children,
}: {
  controls: React.ReactNode;
  onExport: () => void;
  pdfPrint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-card border rounded-md p-3 flex items-end gap-3 flex-wrap">
        {controls}
        <div className="ml-auto flex gap-2">
          {pdfPrint}
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

function SlipRowActions({
  slipId,
  companyId,
  employeeId,
  month,
}: {
  slipId: string;
  companyId: string;
  employeeId: string;
  month: string;
}) {
  const run = (action: "pdf" | "print") =>
    void runSalarySlipPdfAction({
      action,
      slipId,
      companyId,
      employeeId,
      month,
      source: "payroll_report",
    });
  return (
    <div className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        title="Open PDF"
        onClick={() => run("pdf")}
        aria-label="Open salary slip PDF"
      >
        <FileText className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        title="Print"
        onClick={() => run("print")}
        aria-label="Print salary slip"
      >
        <Printer className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
