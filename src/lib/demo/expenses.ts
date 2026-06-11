/**
 * Local-only expenses repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic expense categories and entries. Backed
 * by localStorage and mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./localStore";

export const DEMO_EXPENSES_KEY = "erpovo_demo_expenses";
export const DEMO_EXPENSE_CATEGORIES_KEY = "erpovo_demo_expense_categories";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

function read<T>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
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

export type DemoExpense = {
  id: string;
  company_id: string;
  expense_no: string;
  expense_date: string;
  category: string | null;
  category_id: string | null;
  vendor: string | null;
  store: string | null;
  amount: number;
  tax: number;
  payment_method: "cash" | "bank" | "mobile";
  bank_account_id: string | null;
  notes: string | null;
  attachment_url: string | null;
  is_recurring: boolean;
  recurrence: string | null;
  status: string;
  posted_txn_id: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  created_by: string | null;
  deleted_at: string | null;
};

export type DemoExpenseCategory = {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

const CATS: DemoExpenseCategory[] = [
  "Office Rent",
  "Staff Salary",
  "Transport",
  "Marketing",
  "Utility Bill",
  "Repair & Maintenance",
  "Packaging",
  "Miscellaneous",
].map((name, i) => ({
  id: `demo-exc-${String(i + 1).padStart(2, "0")}`,
  company_id: C,
  name,
  is_active: true,
  deleted_at: null,
  created_at: now(),
}));

const CAT = (name: string) => CATS.find((c) => c.name === name)!;

const EXP_SEED: Omit<DemoExpense, "created_at">[] = [
  { id: "demo-exp-001", company_id: C, expense_no: "EXP-0001", expense_date: daysAgo(30), category: "Office Rent", category_id: CAT("Office Rent").id, vendor: "Landlord (Karwan Bazar)", store: null, amount: 35000, tax: 0, payment_method: "bank", bank_account_id: "demo-bank-02", notes: "Monthly shop rent", attachment_url: null, is_recurring: true, recurrence: "monthly", status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-002", company_id: C, expense_no: "EXP-0002", expense_date: daysAgo(28), category: "Utility Bill", category_id: CAT("Utility Bill").id, vendor: "DESCO", store: null, amount: 8500, tax: 0, payment_method: "bank", bank_account_id: "demo-bank-02", notes: "Electricity bill", attachment_url: null, is_recurring: true, recurrence: "monthly", status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-003", company_id: C, expense_no: "EXP-0003", expense_date: daysAgo(25), category: "Staff Salary", category_id: CAT("Staff Salary").id, vendor: "Showroom Staff", store: null, amount: 42000, tax: 0, payment_method: "cash", bank_account_id: null, notes: "3 salesmen", attachment_url: null, is_recurring: true, recurrence: "monthly", status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-004", company_id: C, expense_no: "EXP-0004", expense_date: daysAgo(20), category: "Transport", category_id: CAT("Transport").id, vendor: "Pickup Truck Hire", store: null, amount: 3200, tax: 0, payment_method: "cash", bank_account_id: null, notes: "Delivery to Modern Furniture", attachment_url: null, is_recurring: false, recurrence: null, status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-005", company_id: C, expense_no: "EXP-0005", expense_date: daysAgo(15), category: "Marketing", category_id: CAT("Marketing").id, vendor: "Facebook Ads", store: null, amount: 5000, tax: 0, payment_method: "mobile", bank_account_id: "demo-bank-03", notes: "Boost showroom posts", attachment_url: null, is_recurring: false, recurrence: null, status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-006", company_id: C, expense_no: "EXP-0006", expense_date: daysAgo(10), category: "Repair & Maintenance", category_id: CAT("Repair & Maintenance").id, vendor: "AC Servicing Co.", store: null, amount: 2200, tax: 0, payment_method: "cash", bank_account_id: null, notes: "Showroom AC service", attachment_url: null, is_recurring: false, recurrence: null, status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-007", company_id: C, expense_no: "EXP-0007", expense_date: daysAgo(6), category: "Packaging", category_id: CAT("Packaging").id, vendor: "Box & Wrap Mart", store: null, amount: 1450, tax: 0, payment_method: "cash", bank_account_id: null, notes: "Bubble wrap + cartons", attachment_url: null, is_recurring: false, recurrence: null, status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
  { id: "demo-exp-008", company_id: C, expense_no: "EXP-0008", expense_date: daysAgo(2), category: "Miscellaneous", category_id: CAT("Miscellaneous").id, vendor: "Stationery Shop", store: null, amount: 850, tax: 0, payment_method: "cash", bank_account_id: null, notes: "Receipt rolls and pens", attachment_url: null, is_recurring: false, recurrence: null, status: "posted", posted_txn_id: null, reversed_at: null, reversed_by: null, created_by: null, deleted_at: null },
];

export function getExpenses(): DemoExpense[] { return read<DemoExpense>(DEMO_EXPENSES_KEY); }
export function setExpenses(v: DemoExpense[]) { write(DEMO_EXPENSES_KEY, v); }
export function getExpenseCategories(): DemoExpenseCategory[] { return read<DemoExpenseCategory>(DEMO_EXPENSE_CATEGORIES_KEY); }
export function setExpenseCategories(v: DemoExpenseCategory[]) { write(DEMO_EXPENSE_CATEGORIES_KEY, v); }

export function ensureExpensesSeed() {
  if (!isBrowser()) return;
  if (getExpenseCategories().length === 0) setExpenseCategories(CATS);
  if (getExpenses().length === 0) {
    setExpenses(EXP_SEED.map((e) => ({ ...e, created_at: now() })));
  }
}

const firstOfMonth = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

export function getDemoMonthExpenses(): number {
  return getExpenses()
    .filter((e) => !e.deleted_at && e.expense_date >= firstOfMonth)
    .reduce((s, e) => s + Number(e.amount) + Number(e.tax || 0), 0);
}
