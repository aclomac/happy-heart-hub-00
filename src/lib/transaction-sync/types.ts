/**
 * Phase 3 — transaction sync gating types.
 *
 * Pure types only. No runtime imports so this file is safe to load from
 * anywhere (tests, server, browser) without side-effects.
 */

export type TxnKind =
  | "sale_invoice"
  | "purchase"
  | "stock_movement"
  | "payment_in"
  | "payment_out";

export type TxnSyncState = "pending" | "syncing" | "synced" | "failed";

export type TxnSyncRecord = {
  /** Stable id minted locally before any cloud write. Never changes. */
  local_id: string;
  /** Remote PK once the row has been written successfully. */
  cloud_id: string | null;
  kind: TxnKind;
  company_id: string;
  /**
   * Stable hash derived from (kind, company_id, local_id). Sent on every
   * write so the server can reject a second attempt with the same key.
   */
  idempotency_key: string;
  /**
   * Optional human-facing reference (invoice no, bill no, voucher no).
   * Used by the duplicate-number guard.
   */
  reference_no: string | null;
  status: TxnSyncState;
  attempts: number;
  last_error: string | null;
  updated_at: string;
};

export type PreflightResult =
  | { ok: true }
  | {
      ok: false;
      reason: "local-mode" | "no-company" | "no-session";
    };
