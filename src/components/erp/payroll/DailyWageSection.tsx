import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/EmptyState";
import { TableSkeleton } from "@/components/erp/TableSkeleton";
import { exportCSV } from "@/lib/export-csv";
import { Download } from "lucide-react";
import {
  computeDailyWageRegister,
  type DailyWageEmployee,
  type AttendanceRow,
} from "@/lib/daily-wage";

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export function DailyWageSection({ companyId }: { companyId: string }) {
  const init = monthRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["daily-wage-employees", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,code,name,pay_type,daily_wage,base_salary,is_active")
        .eq("company_id", companyId)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as (DailyWageEmployee & {
        is_active: boolean;
      })[];
    },
  });

  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: ["daily-wage-attendance", companyId, from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("employee_id,date,status,note")
        .eq("company_id", companyId)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return (data || []) as AttendanceRow[];
    },
  });

  const rows = useMemo(
    () => computeDailyWageRegister(employees, attendance, from, to),
    [employees, attendance, from, to],
  );

  const totals = rows.reduce(
    (s, r) => ({
      days: s.days + r.days_present,
      ot: s.ot + r.overtime_hours,
      pay: s.pay + r.total_pay,
    }),
    { days: 0, ot: 0, pay: 0 },
  );

  function onExport() {
    exportCSV(
      `daily-wage-${from}-to-${to}.csv`,
      rows.map((r) => ({
        code: r.employee.code ?? "",
        name: r.employee.name,
        daily_wage: r.employee.daily_wage,
        days_present: r.days_present,
        days_absent: r.days_absent,
        overtime_hours: r.overtime_hours,
        base_pay: r.base_pay,
        overtime_pay: r.overtime_pay,
        total_pay: r.total_pay,
      })),
    );
  }

  if (empLoading || attLoading) return <TableSkeleton rows={6} cols={7} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onExport} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No daily-wage employees"
          description="Add employees with pay_type = 'daily' or a daily wage > 0 to see them here. Mark attendance in the Attendance tab to compute pay."
        />
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Employee</th>
                <th className="px-3 py-2 text-right">Daily Wage</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-right">Absent</th>
                <th className="px-3 py-2 text-right">OT Hrs</th>
                <th className="px-3 py-2 text-right">Base Pay</th>
                <th className="px-3 py-2 text-right">OT Pay</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.employee.code ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.employee.name}</td>
                  <td className="px-3 py-2 text-right">
                    ৳ {Number(r.employee.daily_wage).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{r.days_present}</td>
                  <td className="px-3 py-2 text-right text-sale">{r.days_absent}</td>
                  <td className="px-3 py-2 text-right">{r.overtime_hours}</td>
                  <td className="px-3 py-2 text-right">
                    ৳ {r.base_pay.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    ৳ {r.overtime_pay.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    ৳ {r.total_pay.toLocaleString()}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Totals
                </td>
                <td className="px-3 py-2 text-right">{totals.days}</td>
                <td className="px-3 py-2 text-right" />
                <td className="px-3 py-2 text-right">{totals.ot}</td>
                <td className="px-3 py-2 text-right" colSpan={2} />
                <td className="px-3 py-2 text-right">
                  ৳ {Math.round(totals.pay).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Source: Attendance tab. Pay = (present + 0.5 × half-day + overtime
        days) × daily wage + overtime hours × overtime rate.
      </p>
    </div>
  );
}
