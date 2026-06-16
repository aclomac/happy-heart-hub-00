// Parse / serialize per-employee salary setup stored in employees.notes
// as a JSON block. Falls back to free-text if not JSON.

export type SalaryRule = { name: string; amount: number; type: "fixed" | "percent" };
export type AdvanceEntry = { date: string; amount: number; recovered: number; note?: string };
export type ContractSetup = {
  default_work_type: string;
  default_item_id: string;
  default_rate: number;
  payment_cycle: "daily" | "weekly" | "monthly" | "on_demand";
  notes: string;
};
export type EmployeeSetup = {
  fixed: { monthly: number; working_days: number };
  daily: { rate: number; default_days: number };
  bonuses: SalaryRule[];
  deductions: SalaryRule[];
  overtime: { rate_per_hour: number; multiplier: number };
  advances: AdvanceEntry[];
  contract: ContractSetup;
  free_notes?: string;
};

export const DEFAULT_SETUP: EmployeeSetup = {
  fixed: { monthly: 0, working_days: 26 },
  daily: { rate: 0, default_days: 26 },
  bonuses: [],
  deductions: [],
  overtime: { rate_per_hour: 0, multiplier: 1 },
  advances: [],
  contract: {
    default_work_type: "",
    default_item_id: "",
    default_rate: 0,
    payment_cycle: "on_demand",
    notes: "",
  },
};


const TAG = "__SETUP__:";

export function parseSetup(notes: string | null | undefined): EmployeeSetup {
  if (!notes) return { ...DEFAULT_SETUP };
  const idx = notes.indexOf(TAG);
  if (idx === -1) return { ...DEFAULT_SETUP, free_notes: notes };
  try {
    const json = notes.slice(idx + TAG.length).trim();
    const parsed = JSON.parse(json);
    const free = notes.slice(0, idx).trim();
    return { ...DEFAULT_SETUP, ...parsed, free_notes: free || undefined };
  } catch {
    return { ...DEFAULT_SETUP, free_notes: notes };
  }
}

export function serializeSetup(setup: EmployeeSetup): string {
  const { free_notes, ...rest } = setup;
  const head = free_notes ? `${free_notes}\n` : "";
  return `${head}${TAG}${JSON.stringify(rest)}`;
}

export type SalaryCalcInput = {
  pay_type: string;
  base_salary: number;
  daily_wage?: number;
  days_present: number;
  days_total: number;
  overtime_hours?: number;
  setup: EmployeeSetup;
};

export type SalaryCalcResult = {
  base: number;
  overtime: number;
  gross: number;
  bonus_total: number;
  deduction_total: number;
  advance_recovery: number;
  net: number;
  bonus_breakdown: { name: string; amount: number }[];
  deduction_breakdown: { name: string; amount: number }[];
};

export function isContractPayType(payType: string | null | undefined): boolean {
  return payType === "contract";
}

export function calcSalary(i: SalaryCalcInput): SalaryCalcResult {
  // Contract / piece-rate workers are paid from Contract Work entries,
  // not from monthly/daily salary generation. Return zeros so they are
  // safely no-ops if accidentally included.
  if (isContractPayType(i.pay_type)) {
    return {
      base: 0,
      overtime: 0,
      gross: 0,
      bonus_total: 0,
      deduction_total: 0,
      advance_recovery: 0,
      net: 0,
      bonus_breakdown: [],
      deduction_breakdown: [],
    };
  }
  const isFixed = i.pay_type === "fixed";
  const working = isFixed ? Math.max(1, i.setup.fixed.working_days || i.days_total || 26) : 1;
  const base = isFixed
    ? (Number(i.setup.fixed.monthly || i.base_salary) * i.days_present) / working
    : Number(i.setup.daily.rate || i.daily_wage || i.base_salary) * i.days_present;
  const overtime =
    Number(i.overtime_hours || 0) *
    Number(i.setup.overtime.rate_per_hour || 0) *
    Number(i.setup.overtime.multiplier || 1);
  const gross = base + overtime;


  const apply = (rules: SalaryRule[]) => {
    const breakdown: { name: string; amount: number }[] = [];
    let total = 0;
    for (const r of rules) {
      const amt =
        r.type === "percent" ? (gross * Number(r.amount || 0)) / 100 : Number(r.amount || 0);
      breakdown.push({
        name: r.name || (r.type === "percent" ? `${r.amount}%` : "—"),
        amount: amt,
      });
      total += amt;
    }
    return { total, breakdown };
  };
  const b = apply(i.setup.bonuses);
  const d = apply(i.setup.deductions);
  const advance_recovery = i.setup.advances.reduce(
    (s, a) => s + Math.max(0, Number(a.amount || 0) - Number(a.recovered || 0)),
    0,
  );
  const recovery = Math.min(advance_recovery, gross + b.total - d.total);
  const net = gross + b.total - d.total - recovery;

  return {
    base,
    overtime,
    gross,
    bonus_total: b.total,
    deduction_total: d.total,
    advance_recovery: recovery,
    net,
    bonus_breakdown: b.breakdown,
    deduction_breakdown: d.breakdown,
  };
}
