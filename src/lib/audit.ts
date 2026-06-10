import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "reversed"
  | "cancelled"
  | "approved"
  | "rejected"
  | "posted"
  | "login"
  | "logout"
  | "adjust";

export type AuditModule =
  | "Sales"
  | "Purchases"
  | "Payments"
  | "Expenses"
  | "Cash"
  | "Bank"
  | "Mobile"
  | "Cheque"
  | "Loan"
  | "Salary"
  | "Reconciliation"
  | "Subscription"
  | "Auth"
  | "Settings"
  | "Other";

export interface LogAuditInput {
  companyId: string | null | undefined;
  module: AuditModule | string;
  action: AuditAction | string;
  entityType?: string | null;
  entityId?: string | null;
  referenceNo?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  amountImpact?: number | null;
  status?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit log writer. Never blocks UI; failures are swallowed
 * (audit must never break the parent flow).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    if (!input.companyId) return;
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;

    const { error } = await supabase.rpc("log_audit_event", {
      _company_id: input.companyId,
      _module: String(input.module),
      _action: String(input.action),
      _entity_type: input.entityType ?? undefined,
      _entity_id: input.entityId ?? undefined,
      _reference_no: input.referenceNo ?? undefined,
      _old_value: (input.oldValue ?? undefined) as never,
      _new_value: (input.newValue ?? undefined) as never,
      _amount_impact: input.amountImpact ?? undefined,
      _status: input.status ?? undefined,
      _user_agent: userAgent ?? undefined,
      _metadata: (input.metadata ?? {}) as never,
    });

    if (error) throw error;
  } catch (e) {
    console.warn("[audit] log failed", e);
  }
}
