// Centralized audit logger for every report export / print / share action.
// Thin wrapper around `logAudit` so the existing audit_logs table + RLS work
// unchanged; metadata holds report-specific fields (slug, rowCount, filters,
// fileName, error). Fire-and-forget — never blocks or throws.

import { logAudit } from "@/lib/audit";

export type ExportAuditAction = "export_csv" | "export_pdf" | "print" | "share";
export type ExportAuditStatus = "success" | "blocked_empty" | "failed";

export interface ExportAuditInput {
  companyId: string | null | undefined;
  reportSlug: string;
  action: ExportAuditAction;
  status: ExportAuditStatus;
  rowCount: number;
  module?: string;
  fileName?: string | null;
  filters?: Record<string, unknown> | null;
  error?: string | null;
}

const MODULE_BY_SLUG: Record<string, string> = {
  // Sales
  "sales-report": "Sales",
  "sales-summary": "Sales",
  "party-statement": "Sales",
  // Purchases
  "purchase-report": "Purchases",
  "purchase-summary": "Purchases",
  // Expenses
  "expense-report": "Expenses",
  "expense-summary": "Expenses",
  // Cash & Bank
  "cash-bank-statement": "Cash",
  "bank-statement": "Cash",
  "cash-in-hand": "Cash",
  "cash-reconciliation": "Cash",
  cheques: "Cash",
  "loan-accounts": "Cash",
  "loan-payments": "Cash",
  "mobile-banking-statement": "Cash",
  // Core accounting
  "day-book": "Accounting",
  "profit-loss": "Accounting",
  "balance-sheet": "Accounting",
  "trial-balance": "Accounting",
  "tax-report": "Accounting",
  "receivables-report": "Accounting",
  "payables-report": "Accounting",
  // Inventory
  "stock-summary": "Inventory",
  "low-stock": "Inventory",
  "stock-movement-ledger": "Inventory",
  "stock-transfers": "Inventory",
  "warehouse-stock": "Inventory",
  "inventory-valuation": "Inventory",
  // Payroll
  "monthly-salary-report": "Salary",
  "employee-wise-salary-report": "Salary",
  "attendance-report": "Salary",
  "advance-salary-report": "Salary",
  "bonus-deduction-report": "Salary",
  "salary-payments-report": "Salary",
  "employees-report": "Salary",
  "payroll-reports": "Salary",
  // Other
  "audit-history": "Audit",
  "recycle-bin": "RecycleBin",
};

export function moduleFromSlug(slug: string | null | undefined): string {
  if (!slug) return "Other";
  return MODULE_BY_SLUG[slug] ?? "Other";
}

/** Fire-and-forget. Resolves even if the underlying insert fails. */
export async function logExportAudit(input: ExportAuditInput): Promise<void> {
  try {
    await logAudit({
      companyId: input.companyId ?? null,
      module: input.module ?? moduleFromSlug(input.reportSlug),
      action: input.action,
      status: input.status,
      entityType: "report",
      referenceNo: input.reportSlug,
      metadata: {
        reportSlug: input.reportSlug,
        rowCount: input.rowCount,
        fileName: input.fileName ?? null,
        filters: input.filters ?? null,
        error: input.error ?? null,
      },
    });
  } catch {
    // never break the export flow
  }
}
