/**
 * Helper to scope a Supabase select chain to active (non-deleted) rows only.
 *
 * Usage:
 *   const q = activeOnly(supabase.from("sales").select("*"));
 *
 * Only call on tables that have a `deleted_at` column. Tables in this project
 * with soft delete: sales, purchases, expenses, payments, parties, party_groups,
 * items, item_categories, expense_categories, bank_accounts, cash_transactions,
 * cheques, bank_transfers, loans, loan_payments, employee_payments,
 * cash_reconciliations, salary_slips.
 *
 * The Recycle Bin (src/routes/app.recycle-bin.tsx) and src/lib/soft-delete.ts
 * are the only places allowed to read deleted rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function activeOnly<T extends { is: (col: string, value: any) => T }>(q: T): T {
  return q.is("deleted_at", null);
}
