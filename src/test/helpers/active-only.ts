/**
 * Regression helpers for soft-delete exclusion.
 *
 * The canonical list of tables that carry a `deleted_at` column.
 * Keep in sync with src/lib/active-query.ts and the recycle-bin module map.
 */
export const SOFT_DELETE_TABLES = [
  "sales",
  "purchases",
  "payments",
  "expenses",
  "parties",
  "party_groups",
  "items",
  "item_categories",
  "expense_categories",
  "bank_accounts",
  "cash_transactions",
  "cheques",
  "bank_transfers",
  "loans",
  "loan_payments",
  "employee_payments",
  "cash_reconciliations",
  "salary_slips",
] as const;

export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

/**
 * Files that are EXPECTED to read deleted rows.
 *
 * - Recycle bin + soft-delete engine read deleted rows by design.
 * - Cash ledger, purchase-bills, debit-notes, expenses do idempotent by-id
 *   lookups for posting/reversal — they must see rows regardless of state.
 * - security-tests is a security harness that intentionally probes raw access.
 */
export const DELETED_READ_ALLOWLIST = [
  "src/routes/app.recycle-bin.tsx",
  "src/lib/soft-delete.ts",
  "src/lib/active-query.ts",
  "src/lib/cash-ledger.ts",
  "src/lib/purchase-bills.ts",
  "src/lib/sale-invoices.ts",
  "src/lib/debit-notes.ts",
  "src/lib/expenses.ts",
  "src/lib/payment-out.ts",
  "src/lib/security-tests.ts",
  "src/lib/demo/",
  "src/test/",
];

export function withDeleted<T extends object>(
  row: T,
  when = new Date(),
): T & { deleted_at: string } {
  return { ...row, deleted_at: when.toISOString() };
}

export function withoutDeleted<T extends object>(row: T): T & { deleted_at: null } {
  return { ...row, deleted_at: null };
}

/** Filters rows the way `activeOnly()` filters a Supabase query — for asserting in mock tests. */
export function applyActiveOnly<T extends { deleted_at?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.deleted_at == null);
}

export function expectNoDeletedLeak<T extends { deleted_at?: string | null }>(rows: T[]): void {
  const leak = rows.find((r) => r.deleted_at != null);
  if (leak) {
    throw new Error(`Deleted row leaked into result set: ${JSON.stringify(leak).slice(0, 200)}`);
  }
}
