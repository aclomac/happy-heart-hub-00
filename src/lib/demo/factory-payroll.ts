/**
 * Local-only stores for Factory Employee Payroll & Production Labour.
 *
 * Backs the four new tables introduced by the staged Supabase migration
 * `20260617000000_factory_payroll.sql`:
 *   - labour_rates
 *   - contract_work_entries
 *   - contract_payments
 *   - contract_payment_allocations
 *
 * Used by the demo Supabase shim so the feature works in Local/Personal
 * Mode without applying the cloud migration.
 */
import { DEMO_COMPANY_ID } from "./constants";

export const DEMO_LABOUR_RATES_KEY = "erpovo_demo_labour_rates";
export const DEMO_CONTRACT_WORK_KEY = "erpovo_demo_contract_work_entries";
export const DEMO_CONTRACT_PAYMENTS_KEY = "erpovo_demo_contract_payments";
export const DEMO_CONTRACT_ALLOCATIONS_KEY = "erpovo_demo_contract_payment_allocations";

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

export type DemoLabourRate = {
  id: string;
  company_id: string;
  item_id: string;
  work_type: string;
  rate: number;
  unit: string | null;
  effective_date: string;
  employee_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DemoContractWorkEntry = {
  id: string;
  company_id: string;
  work_date: string;
  employee_id: string;
  item_id: string | null;
  work_type: string;
  qty: number;
  rate: number;
  total: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid";
  production_ref: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DemoContractPayment = {
  id: string;
  company_id: string;
  employee_id: string;
  payment_date: string;
  amount: number;
  method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  posted_txn_id: string | null;
  notes: string | null;
  status: "posted" | "reversed";
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DemoContractAllocation = {
  id: string;
  payment_id: string;
  work_entry_id: string;
  amount: number;
  created_at: string;
};

export const getLabourRates = () => read<DemoLabourRate>(DEMO_LABOUR_RATES_KEY);
export const setLabourRates = (v: DemoLabourRate[]) => write(DEMO_LABOUR_RATES_KEY, v);
export const getContractWorkEntries = () =>
  read<DemoContractWorkEntry>(DEMO_CONTRACT_WORK_KEY);
export const setContractWorkEntries = (v: DemoContractWorkEntry[]) =>
  write(DEMO_CONTRACT_WORK_KEY, v);
export const getContractPayments = () =>
  read<DemoContractPayment>(DEMO_CONTRACT_PAYMENTS_KEY);
export const setContractPayments = (v: DemoContractPayment[]) =>
  write(DEMO_CONTRACT_PAYMENTS_KEY, v);
export const getContractAllocations = () =>
  read<DemoContractAllocation>(DEMO_CONTRACT_ALLOCATIONS_KEY);
export const setContractAllocations = (v: DemoContractAllocation[]) =>
  write(DEMO_CONTRACT_ALLOCATIONS_KEY, v);

let _seeded = false;
export function ensureFactoryPayrollSeed() {
  if (!isBrowser()) return;
  if (_seeded) return;
  _seeded = true;
  // No automatic seed rows — the demo employees from `payroll.ts` start
  // with monthly/daily wage types. Contract rows are user-created.
  // Touch keys so the demo shim sees consistent shape.
  if (!localStorage.getItem(DEMO_LABOUR_RATES_KEY)) setLabourRates([]);
  if (!localStorage.getItem(DEMO_CONTRACT_WORK_KEY)) setContractWorkEntries([]);
  if (!localStorage.getItem(DEMO_CONTRACT_PAYMENTS_KEY)) setContractPayments([]);
  if (!localStorage.getItem(DEMO_CONTRACT_ALLOCATIONS_KEY)) setContractAllocations([]);
  // Silence "unused import" for DEMO_COMPANY_ID in case future seeds need it.
  void DEMO_COMPANY_ID;
}
