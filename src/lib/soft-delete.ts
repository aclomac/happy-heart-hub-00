import { supabase } from "@/integrations/supabase/client";
import { logAudit, type AuditModule } from "@/lib/audit";
import { reverseOnce, postOnce } from "@/lib/cash-ledger";
import { reversePurchaseBillImpacts, repostPurchaseBillImpacts } from "@/lib/purchase-bills";
import { reverseDebitNoteImpacts, repostDebitNoteImpacts } from "@/lib/debit-notes";
import { reverseSaleInvoiceImpacts, repostSaleInvoiceImpacts } from "@/lib/sale-invoices";
import { reversePaymentOutImpacts, repostPaymentOutImpacts } from "@/lib/payment-out";
import { toast } from "sonner";

// Modules covered by the soft-delete system. Each maps to a Supabase table
// and a small set of hooks that reverse / re-apply balance/stock impact.
export type SoftDeleteModule =
  | "sales"
  | "estimates"
  | "sale_orders"
  | "delivery_challans"
  | "credit_notes"
  | "purchases"
  | "purchase_orders"
  | "debit_notes"
  | "expenses"
  | "payment_in"
  | "payment_out"
  | "parties"
  | "party_groups"
  | "items"
  | "item_categories"
  | "expense_categories"
  | "cash_in_hand"
  | "bank_accounts"
  | "mobile_banking"
  | "cheques"
  | "loans"
  | "loan_payments"
  | "employee_payments"
  | "salary_slips"
  | "cash_reconciliations"
  | "bank_transfers"
  | "warehouses"
  | "stock_adjustments"
  | "stock_transfers"
  | "other_income";

interface ModuleConfig {
  table: string; // Supabase table name
  module: AuditModule | string; // Audit module label
  refField?: string; // human reference (e.g. bill_no, expense_no, name)
  amountField?: string; // numeric column for recycle-bin display
  partyField?: string; // text/name column for recycle bin
  /** Called BEFORE the row is marked deleted; should reverse balance/stock idempotently. */
  onDelete?: (
    row: Record<string, unknown>,
  ) => Promise<{ amountImpact?: number; stockImpact?: number }>;
  /** Called AFTER restore flags are cleared; should re-apply balance/stock idempotently. */
  onRestore?: (row: Record<string, unknown>) => Promise<void>;
  /** Returns string with a blocking reason if restore must be denied. */
  blockRestore?: (row: Record<string, unknown>) => Promise<string | null>;
  /** Returns string with reason if permanent delete must be blocked. */
  blockPermanent?: (row: Record<string, unknown>) => Promise<string | null>;
  /** Returns string with reason if soft-delete must be blocked. */
  blockDelete?: (row: Record<string, unknown>) => Promise<string | null>;
}

export const MODULES: Record<SoftDeleteModule, ModuleConfig> = {
  sales: {
    table: "sales",
    module: "Sales",
    refField: "invoice_no",
    amountField: "total",
    partyField: "party_name",
    async onDelete(row) {
      await reverseSaleInvoiceImpacts(row.id as string);
      return { amountImpact: -Number(row.total || 0) };
    },
    async onRestore(row) {
      await repostSaleInvoiceImpacts(row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  estimates: {
    table: "sales",
    module: "Sales",
    refField: "invoice_no",
    amountField: "total",
    partyField: "party_name",
  },
  sale_orders: {
    table: "sales",
    module: "Sales",
    refField: "invoice_no",
    amountField: "total",
    partyField: "party_name",
  },
  delivery_challans: {
    table: "sales",
    module: "Sales",
    refField: "invoice_no",
    amountField: "total",
    partyField: "party_name",
    async onDelete(row) {
      await reverseSaleInvoiceImpacts(row.id as string);
      return {};
    },
    async onRestore(row) {
      await repostSaleInvoiceImpacts(row.id as string);
    },
  },
  credit_notes: {
    table: "sales",
    module: "Sales",
    refField: "invoice_no",
    amountField: "total",
    partyField: "party_name",
    async onDelete(row) {
      await reverseSaleInvoiceImpacts(row.id as string);
      return { amountImpact: Number(row.total || 0) };
    },
    async onRestore(row) {
      await repostSaleInvoiceImpacts(row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  purchases: {
    table: "purchases",
    module: "Purchases",
    refField: "bill_no",
    amountField: "total",
    async onDelete(row) {
      await reversePurchaseBillImpacts(row.id as string);
      return { amountImpact: -Number(row.total || 0) };
    },
    async onRestore(row) {
      await repostPurchaseBillImpacts(row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  purchase_orders: {
    table: "purchases",
    module: "Purchases",
    refField: "bill_no",
    amountField: "total",
    // POs have no ledger / stock impact — soft-delete only.
  },
  debit_notes: {
    table: "purchases",
    module: "Purchases",
    refField: "bill_no",
    amountField: "total",
    async onDelete(row) {
      await reverseDebitNoteImpacts(row.id as string);
      return { amountImpact: -Number(row.total || 0) };
    },
    async onRestore(row) {
      await repostDebitNoteImpacts(row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  expenses: {
    table: "expenses",
    module: "Expenses",
    refField: "expense_no",
    amountField: "amount",
    partyField: "vendor",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: "out",
        amount: Number(row.amount || 0) + Number(row.tax || 0),
        txnDate: (row.expense_date as string) || new Date().toISOString().slice(0, 10),
        bankAccountId: (row.bank_account_id as string | null) ?? null,
        referenceType: "expense",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await supabase
        .from("expenses")
        .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "bank_accounts", idField: "bank_account_id", label: "payment account" },
        { table: "expense_categories", idField: "category_id", label: "expense category" },
      ]);
    },
  },
  payment_in: {
    table: "payments",
    module: "Payments",
    refField: "reference_no",
    amountField: "amount",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: "in",
        amount: Number(row.amount || 0),
        txnDate: (row.payment_date as string) || new Date().toISOString().slice(0, 10),
        bankAccountId: null,
        category: "payment-in",
        referenceType: "payment_in",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await supabase
        .from("payments")
        .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  payment_out: {
    table: "payments",
    module: "Payments",
    refField: "reference_no",
    amountField: "amount",
    async onDelete(row) {
      await reversePaymentOutImpacts(row.id as string);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      await repostPaymentOutImpacts(row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [{ table: "parties", idField: "party_id", label: "party" }]);
    },
  },
  parties: {
    table: "parties",
    module: "Other",
    refField: "name",
    partyField: "name",
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "party_groups", idField: "group_id", label: "party group" },
      ]);
    },
  },
  party_groups: {
    table: "party_groups",
    module: "Other",
    refField: "name",
    async onDelete(row) {
      const { count } = await supabase
        .from("parties")
        .select("id", { count: "exact", head: true })
        .eq("group_id", row.id as string)
        .is("deleted_at", null);
      if ((count || 0) > 0) throw new Error(`Cannot delete — ${count} party(ies) use this group`);
      return {};
    },
  },
  items: {
    table: "items",
    module: "Other",
    refField: "name",
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "item_categories", idField: "category_id", label: "item category" },
      ]);
    },
  },
  item_categories: {
    table: "item_categories",
    module: "Other",
    refField: "name",
    async onDelete(row) {
      const { count } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("category_id", row.id as string)
        .is("deleted_at", null);
      if ((count || 0) > 0) throw new Error(`Cannot delete — ${count} item(s) use this category`);
      return {};
    },
  },
  expense_categories: {
    table: "expense_categories",
    module: "Expenses",
    refField: "name",
    async onDelete(row) {
      const [byId, byName] = await Promise.all([
        supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("company_id", row.company_id as string)
          .eq("category_id", row.id as string)
          .is("deleted_at", null),
        supabase
          .from("expenses")
          .select("id", { count: "exact", head: true })
          .eq("company_id", row.company_id as string)
          .eq("category", row.name as string)
          .is("deleted_at", null),
      ]);
      const used = (byId.count || 0) + (byName.count || 0);
      if (used > 0) throw new Error(`Cannot delete — ${used} expense(s) use this category`);
      return {};
    },
  },
  cash_in_hand: {
    table: "cash_transactions",
    module: "Cash",
    amountField: "amount",
    async onDelete(row) {
      await reverseOnce(row.id as string);
      const signed = (row.direction === "in" ? 1 : -1) * Number(row.amount || 0);
      return { amountImpact: -signed };
    },
    async onRestore(row) {
      // Reactivate the original cash_transactions row idempotently.
      if (row.status === "reversed" || row.reversed_at) {
        await supabase
          .from("cash_transactions")
          .update({ status: "posted", reversed_at: null, reversed_by: null })
          .eq("id", row.id as string);
      }
    },
  },
  bank_accounts: {
    table: "bank_accounts",
    module: "Bank",
    refField: "name",
    amountField: "current_balance",
  },
  mobile_banking: {
    table: "bank_accounts",
    module: "Mobile",
    refField: "name",
    amountField: "current_balance",
  },
  cheques: {
    table: "cheques",
    module: "Cheque",
    refField: "cheque_number",
    amountField: "amount",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      // Only re-post if it had been cleared and posted to bank previously.
      if (row.status !== "cleared" || !row.bank_account_id) return;
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: row.direction === "in" ? "in" : "out",
        amount: Number(row.amount || 0),
        txnDate:
          (row.cleared_at as string) ||
          (row.cheque_date as string) ||
          new Date().toISOString().slice(0, 10),
        bankAccountId: row.bank_account_id as string,
        category: "cheque-cleared",
        referenceType: "cheque_clear",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await supabase
        .from("cheques")
        .update({ posted_txn_id: r.id, reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "bank_accounts", idField: "bank_account_id", label: "bank account" },
      ]);
    },
  },
  loans: {
    table: "loans",
    module: "Loan",
    refField: "lender_name",
    amountField: "outstanding",
    async onDelete(row) {
      const { count } = await supabase
        .from("loan_payments")
        .select("id", { count: "exact", head: true })
        .eq("loan_id", row.id as string)
        .is("deleted_at", null);
      if ((count || 0) > 0)
        throw new Error(`Cannot delete — ${count} payment(s) recorded against this loan`);
      return {};
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "bank_accounts", idField: "payment_bank_id", label: "payment account" },
      ]);
    },
  },
  loan_payments: {
    table: "loan_payments",
    module: "Loan",
    amountField: "amount",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      const loanId = row.loan_id as string;
      const amt = Number(row.amount || 0);
      const { data: ln } = await supabase
        .from("loans")
        .select("outstanding,status")
        .eq("id", loanId)
        .maybeSingle();
      if (ln) {
        await supabase
          .from("loans")
          .update({
            outstanding: Number(ln.outstanding) + amt,
            status: ln.status === "closed" ? "active" : ln.status,
          })
          .eq("id", loanId);
      }
      return { amountImpact: -amt };
    },
    async onRestore(row) {
      const loanId = row.loan_id as string;
      const amt = Number(row.amount || 0);
      const { data: ln } = await supabase
        .from("loans")
        .select("outstanding")
        .eq("id", loanId)
        .maybeSingle();
      if (ln) {
        const next = Math.max(0, Number(ln.outstanding) - amt);
        await supabase
          .from("loans")
          .update({
            outstanding: next,
            status: next === 0 ? "closed" : "active",
          })
          .eq("id", loanId);
      }
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: "out",
        amount: amt,
        txnDate: (row.payment_date as string) || new Date().toISOString().slice(0, 10),
        bankAccountId: (row.bank_account_id as string | null) ?? null,
        category: "loan-payment",
        referenceType: "loan_payment",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await supabase
        .from("loan_payments")
        .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "loans", idField: "loan_id", label: "loan" },
        { table: "bank_accounts", idField: "bank_account_id", label: "bank account" },
      ]);
    },
  },
  employee_payments: {
    table: "employee_payments",
    module: "Salary",
    amountField: "amount",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: "out",
        amount: Number(row.amount || 0),
        txnDate: (row.payment_date as string) || new Date().toISOString().slice(0, 10),
        bankAccountId: (row.bank_account_id as string | null) ?? null,
        category: "salary",
        referenceType: "employee_payment",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await supabase
        .from("employee_payments")
        .update({ posted_txn_id: r.id, status: "posted", reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "employees", idField: "employee_id", label: "employee" },
        { table: "bank_accounts", idField: "bank_account_id", label: "bank account" },
      ]);
    },
  },
  salary_slips: {
    table: "salary_slips",
    module: "Salary",
    refField: "period_month",
    amountField: "net",
    async onDelete(row) {
      const txnId = row.posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.net || 0) };
    },
  },
  cash_reconciliations: {
    table: "cash_reconciliations",
    module: "Reconciliation",
    amountField: "difference",
    async onDelete(row) {
      const txnId = row.adjustment_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.difference || 0) };
    },
    async onRestore(row) {
      // Re-apply adjustment if the recon had one and difference is non-zero.
      const diff = Number(row.difference || 0);
      if (!diff) {
        await supabase
          .from("cash_reconciliations")
          .update({
            status: "posted",
            is_cancelled: false,
            cancelled_at: null,
            cancelled_by: null,
            reversed_at: null,
            reversed_by: null,
          })
          .eq("id", row.id as string);
        return;
      }
      const dir: "in" | "out" = diff > 0 ? "in" : "out";
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: dir,
        amount: Math.abs(diff),
        txnDate: (row.recon_date as string) || new Date().toISOString().slice(0, 10),
        category: "Reconciliation Adjustment",
        notes: `Reconciliation restored ${(row.id as string).slice(0, 8)}`,
        bankAccountId: null,
        referenceType: "reconciliation",
        referenceId: row.id as string,
      });
      await supabase
        .from("cash_reconciliations")
        .update({
          adjustment_txn_id: r.id,
          status: "posted",
          is_cancelled: false,
          cancelled_at: null,
          cancelled_by: null,
          reversed_at: null,
          reversed_by: null,
        })
        .eq("id", row.id as string);
    },
  },
  bank_transfers: {
    table: "bank_transfers",
    module: "Bank",
    amountField: "amount",
    /**
     * A transfer posts two idempotent legs keyed by the transfer id:
     *   - reference_type='bank_transfer_from' on the source account
     *   - reference_type='bank_transfer_to'   on the destination account
     * Deleting must reverse BOTH legs; restoring must re-apply BOTH legs.
     * postOnce / reverseOnce dedupe on (reference_type, reference_id, status)
     * so callers can retry safely without double-flipping balances.
     */
    async onDelete(row) {
      const [{ data: legOut }, { data: legIn }] = await Promise.all([
        supabase
          .from("cash_transactions")
          .select("id")
          .eq("company_id", row.company_id as string)
          .eq("reference_type", "bank_transfer_from")
          .eq("reference_id", row.id as string)
          .eq("status", "posted")
          .maybeSingle(),
        supabase
          .from("cash_transactions")
          .select("id")
          .eq("company_id", row.company_id as string)
          .eq("reference_type", "bank_transfer_to")
          .eq("reference_id", row.id as string)
          .eq("status", "posted")
          .maybeSingle(),
      ]);
      if (legOut?.id) await reverseOnce(legOut.id as string);
      if (legIn?.id) await reverseOnce(legIn.id as string);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      const amt = Number(row.amount || 0);
      if (!(amt > 0)) return;
      const fromBank = (row.from_bank_id as string | null) ?? null;
      const toBank = (row.to_bank_id as string | null) ?? null;
      const txnDate = (row.transfer_date as string) || new Date().toISOString().slice(0, 10);
      await postOnce({
        companyId: row.company_id as string,
        bankAccountId: fromBank,
        direction: "out",
        amount: amt,
        txnDate,
        category: "transfer",
        notes: (row.notes as string | null) ?? null,
        referenceType: "bank_transfer_from",
        referenceId: row.id as string,
      });
      await postOnce({
        companyId: row.company_id as string,
        bankAccountId: toBank,
        direction: "in",
        amount: amt,
        txnDate,
        category: "transfer",
        notes: (row.notes as string | null) ?? null,
        referenceType: "bank_transfer_to",
        referenceId: row.id as string,
      });
      await supabase
        .from("bank_transfers")
        .update({ status: "posted", reversed_at: null, reversed_by: null })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "bank_accounts", idField: "from_bank_id", label: "source account" },
        { table: "bank_accounts", idField: "to_bank_id", label: "destination account" },
      ]);
    },
  },
  warehouses: {
    table: "warehouses",
    module: "Other",
    refField: "name",
    async blockDelete(row) {
      if (row.is_default)
        return "Cannot delete the default store. Set another store as default first.";
      return null;
    },
  },
  stock_adjustments: {
    table: "stock_adjustments",
    module: "Other",
    refField: "reference_no",
    amountField: "qty_delta",
    // DB trigger reverse_adjustment_on_soft_delete() inserts the reversal movement
    // automatically when deleted_at flips, and the repost movement when it flips back.
  },
  stock_transfers: {
    table: "stock_transfers",
    module: "Other",
    refField: "transfer_no",
    // DB trigger reverse_transfer_on_soft_delete() handles both legs idempotently.
  },
  other_income: {
    table: "other_incomes",
    module: "Other Income",
    refField: "reference_no",
    amountField: "amount",
    partyField: "party_source",
    async onDelete(row) {
      const txnId = (row as any).posted_txn_id as string | null;
      if (txnId) await reverseOnce(txnId);
      return { amountImpact: -Number(row.amount || 0) };
    },
    async onRestore(row) {
      const r = await postOnce({
        companyId: row.company_id as string,
        direction: "in",
        amount: Number(row.amount || 0),
        txnDate: ((row as any).income_date as string) || new Date().toISOString().slice(0, 10),
        bankAccountId: ((row as any).bank_account_id as string | null) ?? null,
        category: "Other Income",
        referenceType: "other_income",
        referenceId: row.id as string,
        notes: (row.notes as string | null) ?? null,
      });
      await (supabase as any)
        .from("other_incomes")
        .update({ posted_txn_id: r.id })
        .eq("id", row.id as string);
    },
    async blockRestore(row) {
      return assertCanRestore(row, [
        { table: "other_income_categories", idField: "category_id", label: "income category" },
        { table: "bank_accounts", idField: "bank_account_id", label: "bank account" },
      ]);
    },
  },
};

export interface SoftDeleteInput {
  module: SoftDeleteModule;
  id: string;
  companyId: string;
  reason?: string;
}

export interface SoftDeleteResult {
  ok: boolean;
  alreadyDeleted?: boolean;
  alreadyRestored?: boolean;
  blocked?: boolean;
  error?: string;
}

/**
 * Verify dependencies referenced by a soft-deleted row still exist and aren't
 * permanently deleted. Returns null if OK, or a friendly blocking reason.
 */
export async function assertCanRestore(
  row: Record<string, unknown>,
  deps: { table: string; idField: string; label: string }[],
): Promise<string | null> {
  for (const d of deps) {
    const id = row[d.idField] as string | null | undefined;
    if (!id) continue;
    const { data } = await (supabase as any)
      .from(d.table)
      .select("id,deleted_at,permanently_deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return `Cannot restore — related ${d.label} no longer exists.`;
    if (data.permanently_deleted_at)
      return `Cannot restore — related ${d.label} was permanently deleted.`;
    if (data.deleted_at)
      return `Cannot restore — related ${d.label} is currently deleted. Restore it first.`;
  }
  return null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function softDelete(input: SoftDeleteInput): Promise<SoftDeleteResult> {
  const cfg = MODULES[input.module];
  if (!cfg) return { ok: false, error: `Unknown module: ${input.module}` };

  // Load existing row (typed loosely; tables vary).
  const { data: row, error: loadErr } = await (supabase as any)
    .from(cfg.table)
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (loadErr || !row) return { ok: false, error: loadErr?.message || "Record not found" };
  if (row.deleted_at) return { ok: true, alreadyDeleted: true };

  if (cfg.blockDelete) {
    const blocked = await cfg.blockDelete(row);
    if (blocked) {
      toast.error(blocked);
      return { ok: false, blocked: true, error: blocked };
    }
  }

  let impact: { amountImpact?: number; stockImpact?: number } = {};
  try {
    if (cfg.onDelete) impact = (await cfg.onDelete(row)) ?? {};
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const userId = await currentUserId();
  const nowIso = new Date().toISOString();

  const { error: updErr } = await (supabase as any)
    .from(cfg.table)
    .update({
      deleted_at: nowIso,
      deleted_by: userId,
      delete_reason: input.reason ?? null,
      ...(row.status !== undefined ? { status: "deleted" } : {}),
    })
    .eq("id", input.id)
    .is("deleted_at", null);
  if (updErr) return { ok: false, error: updErr.message };

  const refNo = cfg.refField ? String(row[cfg.refField] ?? "") : null;
  const amount = cfg.amountField ? Number(row[cfg.amountField] || 0) : null;
  const partyName = cfg.partyField ? String(row[cfg.partyField] ?? "") : null;

  await supabase.from("recycle_bin").insert({
    company_id: input.companyId,
    entity_type: input.module,
    entity_id: input.id,
    snapshot: row as never,
    deleted_by: userId,
    module: cfg.module as string,
    reference_no: refNo,
    party_name: partyName,
    amount,
    reason: input.reason ?? null,
    status: "deleted",
  });

  await logAudit({
    companyId: input.companyId,
    module: cfg.module,
    action: "deleted",
    entityType: input.module,
    entityId: input.id,
    referenceNo: refNo,
    amountImpact: impact.amountImpact ?? null,
    oldValue: row,
    metadata: { reason: input.reason, stock_impact: impact.stockImpact ?? null },
  });

  return { ok: true };
}

export interface RestoreInput {
  module: SoftDeleteModule;
  id: string;
  companyId: string;
}

export async function restoreDelete(input: RestoreInput): Promise<SoftDeleteResult> {
  const cfg = MODULES[input.module];
  if (!cfg) return { ok: false, error: `Unknown module: ${input.module}` };

  const { data: row } = await (supabase as any)
    .from(cfg.table)
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Record not found" };
  if (row.permanently_deleted_at) return { ok: false, error: "Record is permanently deleted" };
  // Idempotency guard — already restored.
  if (!row.deleted_at) {
    // Make sure recycle_bin row is consistent.
    await supabase
      .from("recycle_bin")
      .update({ status: "restored", restored_at: new Date().toISOString() })
      .eq("entity_id", input.id)
      .eq("entity_type", input.module)
      .neq("status", "restored");
    return { ok: true, alreadyRestored: true };
  }

  if (cfg.blockRestore) {
    const blocked = await cfg.blockRestore(row);
    if (blocked) {
      await logAudit({
        companyId: input.companyId,
        module: cfg.module,
        action: "blocked_restore",
        entityType: input.module,
        entityId: input.id,
        referenceNo: cfg.refField ? String(row[cfg.refField] ?? "") : null,
        status: "blocked",
        oldValue: row,
        metadata: { reason: blocked },
      });
      return { ok: false, blocked: true, error: blocked };
    }
  }

  try {
    if (cfg.onRestore) await cfg.onRestore(row);
  } catch (e) {
    await logAudit({
      companyId: input.companyId,
      module: cfg.module,
      action: "failed_restore",
      entityType: input.module,
      entityId: input.id,
      referenceNo: cfg.refField ? String(row[cfg.refField] ?? "") : null,
      status: "error",
      oldValue: row,
      metadata: { error: (e as Error).message },
    });
    return { ok: false, error: (e as Error).message };
  }

  const userId = await currentUserId();
  const { error: updErr } = await (supabase as any)
    .from(cfg.table)
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
      restored_at: new Date().toISOString(),
      restored_by: userId,
      ...(row.status !== undefined ? { status: "posted" } : {}),
    })
    .eq("id", input.id);
  if (updErr) return { ok: false, error: updErr.message };

  await supabase
    .from("recycle_bin")
    .update({ status: "restored", restored_at: new Date().toISOString(), restored_by: userId })
    .eq("entity_id", input.id)
    .eq("entity_type", input.module)
    .is("restored_at", null);

  const { data: newRow } = await (supabase as any)
    .from(cfg.table)
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  const amount = cfg.amountField ? Number(row[cfg.amountField] || 0) : null;
  await logAudit({
    companyId: input.companyId,
    module: cfg.module,
    action: "restored",
    entityType: input.module,
    entityId: input.id,
    referenceNo: cfg.refField ? String(row[cfg.refField] ?? "") : null,
    amountImpact: amount,
    status: "restored",
    oldValue: row,
    newValue: newRow ?? row,
    metadata: { module: input.module },
  });

  return { ok: true };
}

export async function permanentDelete(input: RestoreInput): Promise<SoftDeleteResult> {
  const cfg = MODULES[input.module];
  if (!cfg) return { ok: false, error: `Unknown module: ${input.module}` };

  const { data: row } = await (supabase as any)
    .from(cfg.table)
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Record not found" };
  if (!row.deleted_at) return { ok: false, error: "Soft-delete the record first." };

  if (cfg.blockPermanent) {
    const blocked = await cfg.blockPermanent(row);
    if (blocked) return { ok: false, error: blocked };
  }

  const userId = await currentUserId();
  const nowIso = new Date().toISOString();

  const { error } = await (supabase as any)
    .from(cfg.table)
    .update({ permanently_deleted_at: nowIso, permanently_deleted_by: userId })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("recycle_bin")
    .update({
      status: "permanently_deleted",
      permanently_deleted_at: nowIso,
      permanently_deleted_by: userId,
    })
    .eq("entity_id", input.id)
    .eq("entity_type", input.module);

  await logAudit({
    companyId: input.companyId,
    module: cfg.module,
    action: "permanently_deleted",
    entityType: input.module,
    entityId: input.id,
    referenceNo: cfg.refField ? String(row[cfg.refField] ?? "") : null,
    oldValue: row,
  });

  return { ok: true };
}

/** Convenience: delete with undo toast. */
export async function softDeleteWithUndo(
  input: SoftDeleteInput,
  opts: { onChanged?: () => void; label?: string } = {},
): Promise<SoftDeleteResult> {
  const r = await softDelete(input);
  if (!r.ok) {
    toast.error(r.error || "Delete failed");
    return r;
  }
  if (r.alreadyDeleted) {
    toast.info("Already deleted");
    opts.onChanged?.();
    return r;
  }
  toast.success(opts.label || "Deleted successfully", {
    action: {
      label: "Undo",
      onClick: async () => {
        const u = await restoreDelete({
          module: input.module,
          id: input.id,
          companyId: input.companyId,
        });
        if (u.ok && u.alreadyRestored) {
          toast.info("Already restored");
          opts.onChanged?.();
        } else if (u.ok) {
          toast.success("Restored");
          opts.onChanged?.();
        } else if (u.blocked) {
          toast.error(u.error || "Restore blocked");
        } else {
          toast.error(u.error || "Restore failed");
        }
      },
    },
  });
  opts.onChanged?.();
  return r;
}
