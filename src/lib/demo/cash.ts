/**
 * Local-only Cash & Bank repository for ERPOVO demo mode.
 *
 * Seeds Chair King with realistic cheques, bank transfers, loan accounts,
 * loan payments, cash reconciliations and extra bank/mobile accounts so
 * the Cash & Bank module renders meaningful data without Supabase.
 *
 * Also seeds a small set of `cash_transactions` keyed to each bank account
 * so the Money In / Money Out / running-balance aggregates have rows to
 * read. Mutated through the demo Supabase shim in `demoDb.ts`.
 */
import { DEMO_COMPANY_ID } from "./constants";
import {
  getBankAccounts,
  setBankAccounts,
  type DemoBankAccount,
} from "./purchases";
import { getCashTxns, setCashTxns, type DemoCashTxn } from "./sales";

export const DEMO_CHEQUES_KEY = "erpovo_demo_cheques";
export const DEMO_BANK_TRANSFERS_KEY = "erpovo_demo_bank_transfers";
export const DEMO_LOANS_KEY = "erpovo_demo_loans";
export const DEMO_LOAN_PAYMENTS_KEY = "erpovo_demo_loan_payments";
export const DEMO_RECONCILIATIONS_KEY = "erpovo_demo_reconciliations";

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

// Known bank account IDs (also defined in purchases.ts seed).
export const BANK_CASH = "demo-bank-01";
export const BANK_DBBL = "demo-bank-02";
export const BANK_BKASH = "demo-bank-03";
export const BANK_BRAC = "demo-bank-04";
export const BANK_NAGAD = "demo-bank-05";

// ---------- Types ----------
export type DemoCheque = {
  id: string;
  company_id: string;
  cheque_no: string;
  cheque_date: string;
  amount: number;
  direction: "received" | "issued";
  party_id: string | null;
  bank_account_id: string | null;
  status: "pending" | "cleared" | "bounced" | "cancelled";
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoBankTransfer = {
  id: string;
  company_id: string;
  from_bank_id: string | null;
  to_bank_id: string | null;
  amount: number;
  transfer_date: string;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DemoLoan = {
  id: string;
  company_id: string;
  loan_name: string;
  lender: string | null;
  loan_type: string;
  principal: number;
  interest_rate: number;
  outstanding: number;
  start_date: string;
  end_date: string | null;
  bank_account_id: string | null;
  notes: string | null;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
};

export type DemoLoanPayment = {
  id: string;
  company_id: string;
  loan_id: string;
  payment_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  bank_account_id: string | null;
  notes: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
};

export type DemoReconciliation = {
  id: string;
  company_id: string;
  recon_date: string;
  store: string | null;
  opening_balance: number;
  system_balance: number;
  physical_balance: number;
  difference: number;
  status: string;
  note: string | null;
  attachment_url: string | null;
  responsible_user_id: string | null;
  created_by: string | null;
  posted_by: string | null;
  adjustment_txn_id: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
};

// ---------- Stores ----------
export const getCheques = () => read<DemoCheque>(DEMO_CHEQUES_KEY);
export const setCheques = (v: DemoCheque[]) => write(DEMO_CHEQUES_KEY, v);
export const getBankTransfers = () => read<DemoBankTransfer>(DEMO_BANK_TRANSFERS_KEY);
export const setBankTransfers = (v: DemoBankTransfer[]) => write(DEMO_BANK_TRANSFERS_KEY, v);
export const getLoans = () => read<DemoLoan>(DEMO_LOANS_KEY);
export const setLoans = (v: DemoLoan[]) => write(DEMO_LOANS_KEY, v);
export const getLoanPayments = () => read<DemoLoanPayment>(DEMO_LOAN_PAYMENTS_KEY);
export const setLoanPayments = (v: DemoLoanPayment[]) => write(DEMO_LOAN_PAYMENTS_KEY, v);
export const getReconciliations = () => read<DemoReconciliation>(DEMO_RECONCILIATIONS_KEY);
export const setReconciliations = (v: DemoReconciliation[]) =>
  write(DEMO_RECONCILIATIONS_KEY, v);

// ---------- Seeds ----------
const EXTRA_BANK_SEED: DemoBankAccount[] = [
  {
    id: BANK_BRAC,
    company_id: C,
    name: "BRAC Bank Current Account",
    account_type: "bank",
    current_balance: 320000,
    is_active: true,
    deleted_at: null,
    created_at: now(),
  },
  {
    id: BANK_NAGAD,
    company_id: C,
    name: "Nagad Merchant",
    account_type: "mobile",
    current_balance: 28500,
    is_active: true,
    deleted_at: null,
    created_at: now(),
  },
];

const CASH_TXNS_SEED: DemoCashTxn[] = [
  // Bank deposits / withdrawals so dashboard aggregates aren't empty.
  { id: "demo-ct-001", company_id: C, bank_account_id: BANK_DBBL, direction: "in", amount: 50000, txn_date: daysAgo(20), category: "Deposit", notes: "Customer payment", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-002", company_id: C, bank_account_id: BANK_DBBL, direction: "out", amount: 18000, txn_date: daysAgo(12), category: "Withdrawal", notes: "Office expenses", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-003", company_id: C, bank_account_id: BANK_BRAC, direction: "in", amount: 90000, txn_date: daysAgo(10), category: "Deposit", notes: "Bulk sale settlement", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-004", company_id: C, bank_account_id: BANK_BRAC, direction: "out", amount: 25000, txn_date: daysAgo(4), category: "Supplier payment", notes: "BILL-0005", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-005", company_id: C, bank_account_id: BANK_BKASH, direction: "in", amount: 12500, txn_date: daysAgo(6), category: "Mobile receipt", notes: "Online sale", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-006", company_id: C, bank_account_id: BANK_NAGAD, direction: "in", amount: 8500, txn_date: daysAgo(2), category: "Mobile receipt", notes: "Walk-in customer", reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  // Cash in hand movements
  { id: "demo-ct-007", company_id: C, bank_account_id: null, direction: "in", amount: 12000, txn_date: daysAgo(8), category: "Cash sale", notes: null, reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-ct-008", company_id: C, bank_account_id: null, direction: "out", amount: 4500, txn_date: daysAgo(3), category: "Petty expense", notes: null, reference_type: "manual", reference_id: null, status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
];

const CHEQUES_SEED: DemoCheque[] = [
  { id: "demo-chq-001", company_id: C, cheque_no: "DBBL-100231", cheque_date: daysAgo(15), amount: 35000, direction: "received", party_id: "demo-pty-c01", bank_account_id: BANK_DBBL, status: "cleared", notes: "Against INV-0001", deleted_at: null, created_at: now() },
  { id: "demo-chq-002", company_id: C, cheque_no: "BRAC-770451", cheque_date: daysAgo(5), amount: 48000, direction: "received", party_id: "demo-pty-c02", bank_account_id: BANK_BRAC, status: "pending", notes: "Post-dated 5 days", deleted_at: null, created_at: now() },
  { id: "demo-chq-003", company_id: C, cheque_no: "DBBL-100412", cheque_date: daysAgo(8), amount: 22000, direction: "issued", party_id: "demo-pty-s01", bank_account_id: BANK_DBBL, status: "cleared", notes: "Supplier payment", deleted_at: null, created_at: now() },
  { id: "demo-chq-004", company_id: C, cheque_no: "BRAC-770502", cheque_date: daysAgo(2), amount: 15000, direction: "issued", party_id: "demo-pty-s03", bank_account_id: BANK_BRAC, status: "pending", notes: null, deleted_at: null, created_at: now() },
  { id: "demo-chq-005", company_id: C, cheque_no: "DBBL-100118", cheque_date: daysAgo(35), amount: 9000, direction: "received", party_id: "demo-pty-c03", bank_account_id: BANK_DBBL, status: "bounced", notes: "Insufficient funds", deleted_at: null, created_at: now() },
];

const BANK_TRANSFERS_SEED: DemoBankTransfer[] = [
  { id: "demo-bxf-001", company_id: C, from_bank_id: BANK_DBBL, to_bank_id: BANK_BRAC, amount: 50000, transfer_date: daysAgo(18), notes: "Operating float", deleted_at: null, created_at: now() },
  { id: "demo-bxf-002", company_id: C, from_bank_id: BANK_BKASH, to_bank_id: BANK_DBBL, amount: 20000, transfer_date: daysAgo(9), notes: "bKash settlement", deleted_at: null, created_at: now() },
  { id: "demo-bxf-003", company_id: C, from_bank_id: null, to_bank_id: BANK_DBBL, amount: 30000, transfer_date: daysAgo(4), notes: "Cash deposit", deleted_at: null, created_at: now() },
];

const LOANS_SEED: DemoLoan[] = [
  { id: "demo-loan-01", company_id: C, loan_name: "BRAC Bank SME Loan", lender: "BRAC Bank", loan_type: "term_loan", principal: 1000000, interest_rate: 12, outstanding: 720000, start_date: daysAgo(540), end_date: daysAgo(-540), bank_account_id: BANK_BRAC, notes: "5 year working capital", is_active: true, deleted_at: null, created_at: now() },
  { id: "demo-loan-02", company_id: C, loan_name: "DBBL Vehicle Loan", lender: "Dutch-Bangla Bank", loan_type: "vehicle_loan", principal: 400000, interest_rate: 10.5, outstanding: 180000, start_date: daysAgo(720), end_date: daysAgo(-180), bank_account_id: BANK_DBBL, notes: "Pickup truck", is_active: true, deleted_at: null, created_at: now() },
];

const LOAN_PAYMENTS_SEED: DemoLoanPayment[] = [
  { id: "demo-lp-001", company_id: C, loan_id: "demo-loan-01", payment_date: daysAgo(45), principal_amount: 15000, interest_amount: 7200, total_amount: 22200, bank_account_id: BANK_BRAC, notes: "EMI Jan", status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-lp-002", company_id: C, loan_id: "demo-loan-01", payment_date: daysAgo(15), principal_amount: 15000, interest_amount: 7050, total_amount: 22050, bank_account_id: BANK_BRAC, notes: "EMI Feb", status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
  { id: "demo-lp-003", company_id: C, loan_id: "demo-loan-02", payment_date: daysAgo(10), principal_amount: 8000, interest_amount: 1575, total_amount: 9575, bank_account_id: BANK_DBBL, notes: "Monthly EMI", status: "posted", reversed_at: null, reversed_by: null, created_at: now() },
];

const RECONS_SEED: DemoReconciliation[] = [
  { id: "demo-rec-001", company_id: C, recon_date: daysAgo(7), store: "Main store", opening_balance: 125000, system_balance: 140500, physical_balance: 140500, difference: 0, status: "posted", note: "Weekly cash count", attachment_url: null, responsible_user_id: null, created_by: null, posted_by: null, adjustment_txn_id: null, is_cancelled: false, cancelled_at: null, cancelled_by: null, reversed_at: null, reversed_by: null, created_at: now() },
];

// ---------- Seed orchestration ----------
let _seeded = false;
export function ensureCashSeed() {
  if (!isBrowser()) return;
  if (_seeded) return;
  _seeded = true;

  // Top up bank accounts with BRAC + Nagad if missing.
  const banks = getBankAccounts();
  if (banks.length) {
    const ids = new Set(banks.map((b) => b.id));
    const additions = EXTRA_BANK_SEED.filter((b) => !ids.has(b.id));
    if (additions.length) setBankAccounts([...banks, ...additions]);
  }

  if (getCashTxns().length === 0) setCashTxns(CASH_TXNS_SEED);
  if (getCheques().length === 0) setCheques(CHEQUES_SEED);
  if (getBankTransfers().length === 0) setBankTransfers(BANK_TRANSFERS_SEED);
  if (getLoans().length === 0) setLoans(LOANS_SEED);
  if (getLoanPayments().length === 0) setLoanPayments(LOAN_PAYMENTS_SEED);
  if (getReconciliations().length === 0) setReconciliations(RECONS_SEED);
}

// ---------- Dashboard helpers ----------
export function getDemoCashInHand(): number {
  return getCashTxns()
    .filter((t) => t.status === "posted" && !t.bank_account_id)
    .reduce(
      (s, t) => s + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)),
      0,
    );
}

export function getDemoBankBalance(): number {
  return getBankAccounts()
    .filter((b) => !b.deleted_at && b.account_type === "bank")
    .reduce((s, b) => s + Number(b.current_balance || 0), 0);
}

export function getDemoMobileBalance(): number {
  return getBankAccounts()
    .filter((b) => !b.deleted_at && b.account_type === "mobile")
    .reduce((s, b) => s + Number(b.current_balance || 0), 0);
}

export function getDemoLoanOutstanding(): number {
  return getLoans()
    .filter((l) => !l.deleted_at && l.is_active)
    .reduce((s, l) => s + Number(l.outstanding || 0), 0);
}
