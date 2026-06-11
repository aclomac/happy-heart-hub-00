/**
 * Local-only Payroll repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic employees, attendance for the current
 * month, salary slips for the current month and a few employee_payments.
 * Mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./constants";

export const DEMO_EMPLOYEES_KEY = "erpovo_demo_employees";
export const DEMO_ATTENDANCE_KEY = "erpovo_demo_attendance";
export const DEMO_SALARY_SLIPS_KEY = "erpovo_demo_salary_slips";
export const DEMO_EMPLOYEE_PAYMENTS_KEY = "erpovo_demo_employee_payments";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, value: T[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const today = new Date();
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return isoDate(d);
};
const now = () => new Date().toISOString();
const C = DEMO_COMPANY_ID;
const PERIOD_MONTH = isoDate(today).slice(0, 7); // YYYY-MM

// ---------- Types ----------
export type DemoEmployee = {
  id: string;
  company_id: string;
  code: string | null;
  name: string;
  designation: string | null;
  department: string | null;
  pay_type: string;
  base_salary: number;
  daily_wage: number;
  phone: string | null;
  email: string | null;
  address: string | null;
  joining_date: string | null;
  notes: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type DemoAttendance = {
  id: string;
  company_id: string;
  employee_id: string;
  date: string;
  status: string;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoSalarySlip = {
  id: string;
  company_id: string;
  employee_id: string;
  period_month: string;
  days_present: number;
  days_total: number;
  gross: number;
  bonus: number;
  deductions: number;
  advance: number;
  net: number;
  due: number;
  status: string;
  paid_on: string | null;
  posted_txn_id: string | null;
  posted_at: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoEmployeePayment = {
  id: string;
  company_id: string;
  employee_id: string;
  slip_id: string | null;
  amount: number;
  method: string;
  bank_account_id: string | null;
  payment_date: string;
  notes: string | null;
  posted_txn_id: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
};

// ---------- Stores ----------
export const getEmployees = () => read<DemoEmployee>(DEMO_EMPLOYEES_KEY);
export const setEmployees = (v: DemoEmployee[]) => write(DEMO_EMPLOYEES_KEY, v);
export const getAttendance = () => read<DemoAttendance>(DEMO_ATTENDANCE_KEY);
export const setAttendance = (v: DemoAttendance[]) => write(DEMO_ATTENDANCE_KEY, v);
export const getSalarySlips = () => read<DemoSalarySlip>(DEMO_SALARY_SLIPS_KEY);
export const setSalarySlips = (v: DemoSalarySlip[]) => write(DEMO_SALARY_SLIPS_KEY, v);
export const getEmployeePayments = () => read<DemoEmployeePayment>(DEMO_EMPLOYEE_PAYMENTS_KEY);
export const setEmployeePayments = (v: DemoEmployeePayment[]) =>
  write(DEMO_EMPLOYEE_PAYMENTS_KEY, v);

// ---------- Seeds ----------
const EMPLOYEES_SEED: DemoEmployee[] = [
  { id: "demo-emp-01", company_id: C, code: "EMP-001", name: "Md. Rahim Uddin", designation: "Sales Manager", department: "Sales", pay_type: "fixed", base_salary: 45000, daily_wage: 0, phone: "01711000001", email: "rahim@chairking.demo", address: "Mirpur, Dhaka", joining_date: daysAgo(900), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-02", company_id: C, code: "EMP-002", name: "Tanvir Hasan", designation: "Accountant", department: "Accounts", pay_type: "fixed", base_salary: 38000, daily_wage: 0, phone: "01711000002", email: "tanvir@chairking.demo", address: "Mohammadpur, Dhaka", joining_date: daysAgo(720), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-03", company_id: C, code: "EMP-003", name: "Mehedi Hasan", designation: "Warehouse Officer", department: "Warehouse", pay_type: "fixed", base_salary: 28000, daily_wage: 0, phone: "01711000003", email: "mehedi@chairking.demo", address: "Tejgaon, Dhaka", joining_date: daysAgo(540), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-04", company_id: C, code: "EMP-004", name: "Arif Hossain", designation: "Delivery Assistant", department: "Delivery", pay_type: "daily", base_salary: 0, daily_wage: 900, phone: "01711000004", email: null, address: "Jatrabari, Dhaka", joining_date: daysAgo(380), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-05", company_id: C, code: "EMP-005", name: "Nusrat Jahan", designation: "Customer Support Executive", department: "Support", pay_type: "fixed", base_salary: 25000, daily_wage: 0, phone: "01711000005", email: "nusrat@chairking.demo", address: "Banani, Dhaka", joining_date: daysAgo(300), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-06", company_id: C, code: "EMP-006", name: "Mamun Mia", designation: "Technician", department: "Technical", pay_type: "fixed", base_salary: 26000, daily_wage: 0, phone: "01711000006", email: null, address: "Gulshan, Dhaka", joining_date: daysAgo(420), notes: null, is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-emp-07", company_id: C, code: "EMP-007", name: "Rafiq Islam", designation: "Showroom Salesman", department: "Sales", pay_type: "fixed", base_salary: 22000, daily_wage: 0, phone: "01711000007", email: null, address: "Uttara, Dhaka", joining_date: daysAgo(200), notes: null, is_active: true, deleted_at: null, created_at: now() },
];

function buildAttendanceSeed(): DemoAttendance[] {
  const out: DemoAttendance[] = [];
  // Mark last 5 working days for each employee.
  for (let i = 0; i < 5; i++) {
    const d = daysAgo(i);
    for (const e of EMPLOYEES_SEED) {
      // simple rotation: vary status to make summary realistic
      const status =
        i === 0 && e.id === "demo-emp-04" ? "absent"
        : i === 1 && e.id === "demo-emp-05" ? "half_day"
        : i === 2 && e.id === "demo-emp-07" ? "late"
        : "present";
      out.push({
        id: `demo-att-${e.id}-${i}`,
        company_id: C,
        employee_id: e.id,
        date: d,
        status,
        note: null,
        deleted_at: null,
        created_at: now(),
      });
    }
  }
  return out;
}

function buildSalarySlipsSeed(): DemoSalarySlip[] {
  return EMPLOYEES_SEED.map((e, i): DemoSalarySlip => {
    const gross = e.pay_type === "daily" ? e.daily_wage * 22 : e.base_salary;
    const bonus = i === 0 ? 2000 : 0;
    const deductions = i === 1 ? 500 : 0;
    const advance = 0;
    const net = gross + bonus - deductions - advance;
    const status: string = i < 3 ? "paid" : i < 5 ? "partial" : "pending";
    return {
      id: `demo-slip-${e.id}`,
      company_id: C,
      employee_id: e.id,
      period_month: PERIOD_MONTH,
      days_present: 22,
      days_total: 24,
      gross,
      bonus,
      deductions,
      advance,
      net,
      due: status === "paid" ? 0 : status === "partial" ? Math.round(net / 2) : net,
      status,
      paid_on: status === "paid" ? daysAgo(2) : null,
      posted_txn_id: null,
      posted_at: status === "paid" ? now() : null,
      notes: null,
      deleted_at: null,
      created_at: now(),
    };
  });
}

function buildEmployeePaymentsSeed(slips: DemoSalarySlip[]): DemoEmployeePayment[] {
  return slips
    .filter((s) => s.status === "paid" || s.status === "partial")
    .map((s, i) => ({
      id: `demo-epay-${s.id}`,
      company_id: C,
      employee_id: s.employee_id,
      slip_id: s.id,
      amount: s.status === "paid" ? s.net : Math.round(s.net / 2),
      method: i % 2 === 0 ? "bank" : "cash",
      bank_account_id: i % 2 === 0 ? "demo-bank-02" : null,
      payment_date: s.paid_on ?? daysAgo(2),
      notes: `Payment for ${s.period_month}`,
      posted_txn_id: null,
      status: "posted",
      deleted_at: null,
      created_at: now(),
    }));
}

let _seeded = false;
export function ensurePayrollSeed() {
  if (!isBrowser()) return;
  if (_seeded) return;
  _seeded = true;
  if (getEmployees().length === 0) setEmployees(EMPLOYEES_SEED);
  if (getAttendance().length === 0) setAttendance(buildAttendanceSeed());
  const slips = getSalarySlips();
  if (slips.length === 0) {
    const seeded = buildSalarySlipsSeed();
    setSalarySlips(seeded);
    setEmployeePayments(buildEmployeePaymentsSeed(seeded));
  }
}

// ---------- Dashboard helpers ----------
export function getDemoEmployeeCount(): number {
  return getEmployees().filter((e) => !e.deleted_at && e.is_active).length;
}

export function getDemoTodayAttendance(): { present: number; absent: number } {
  const t = isoDate(today);
  const rows = getAttendance().filter((a) => !a.deleted_at && a.date === t);
  return {
    present: rows.filter((a) => a.status === "present" || a.status === "late" || a.status === "half_day").length,
    absent: rows.filter((a) => a.status === "absent").length,
  };
}

export function getDemoMonthSalary(): { payable: number; paid: number; due: number } {
  const slips = getSalarySlips().filter(
    (s) => !s.deleted_at && s.period_month === PERIOD_MONTH,
  );
  const payable = slips.reduce((s, r) => s + Number(r.net || 0), 0);
  const due = slips.reduce((s, r) => s + Number(r.due || 0), 0);
  return { payable, paid: payable - due, due };
}
