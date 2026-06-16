/**
 * Daily wage / Hajira calculation helpers.
 *
 * Source of truth: existing `attendance` rows.
 *   present     → 1 day
 *   half        → 0.5 day
 *   overtime    → 1 day + extra OT hours (note "OT:2.5")
 *   late/leave  → 0 days (configurable later)
 *
 * Pay = days_present * daily_wage + overtime_hours * overtime_rate.
 */
import { parseOT } from "@/lib/attendance-calc";

export type DailyWageEmployee = {
  id: string;
  name: string;
  code: string | null;
  daily_wage: number;
  /** overtime_rate may be absent on legacy demo employees — default 0 */
  overtime_rate?: number | null;
  pay_type?: string | null;
  wage_type?: string | null;
};

export type AttendanceRow = {
  employee_id: string;
  date: string;
  status: string;
  note: string | null;
};

export type DailyWageRow = {
  employee: DailyWageEmployee;
  days_present: number; // present + 0.5 × half
  days_absent: number;
  overtime_hours: number;
  base_pay: number;
  overtime_pay: number;
  total_pay: number;
};

/** True if employee should appear on the Daily Wage register. */
export function isDailyWageEmployee(emp: DailyWageEmployee): boolean {
  if (emp.wage_type === "daily") return true;
  if (emp.pay_type === "daily") return true;
  if ((emp.wage_type ?? emp.pay_type) == null && Number(emp.daily_wage) > 0)
    return true;
  return false;
}

export function computeDailyWageRow(
  emp: DailyWageEmployee,
  marks: AttendanceRow[],
): DailyWageRow {
  const present = marks.filter((m) => m.status === "present").length;
  const half = marks.filter((m) => m.status === "half").length;
  const absent = marks.filter((m) => m.status === "absent").length;
  const otMarks = marks.filter((m) => m.status === "overtime");
  // Overtime mark also counts as a present day for the base salary calc.
  const overtime_hours = otMarks.reduce((s, m) => s + parseOT(m.note), 0);
  const days_present = present + 0.5 * half + otMarks.length;
  const wage = Number(emp.daily_wage) || 0;
  const otRate = Number(emp.overtime_rate ?? 0) || 0;
  const base_pay = Math.round(days_present * wage * 100) / 100;
  const overtime_pay = Math.round(overtime_hours * otRate * 100) / 100;
  return {
    employee: emp,
    days_present,
    days_absent: absent,
    overtime_hours,
    base_pay,
    overtime_pay,
    total_pay: Math.round((base_pay + overtime_pay) * 100) / 100,
  };
}

export function computeDailyWageRegister(
  employees: DailyWageEmployee[],
  attendance: AttendanceRow[],
  from: string,
  to: string,
): DailyWageRow[] {
  const inRange = attendance.filter((a) => a.date >= from && a.date <= to);
  const byEmp = new Map<string, AttendanceRow[]>();
  for (const a of inRange) {
    const arr = byEmp.get(a.employee_id) ?? [];
    arr.push(a);
    byEmp.set(a.employee_id, arr);
  }
  return employees
    .filter(isDailyWageEmployee)
    .map((e) => computeDailyWageRow(e, byEmp.get(e.id) ?? []));
}
