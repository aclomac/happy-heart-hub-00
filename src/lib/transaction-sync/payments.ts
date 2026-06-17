/**
 * Phase 3 — payment sync safety gates.
 *
 * Wraps the generic transaction-sync primitives with payment-specific
 * guards. No actual cloud sync happens here — these helpers only decide
 * whether a payment MAY be synced and bookkeep idempotency / double-post
 * prevention metadata so the future uploader cannot duplicate.
 *
 * Covered surfaces:
 *   • payment_in   — money received from a customer
 *   • payment_out  — money paid to a supplier / vendor
 *   • cash / bank posting double-spend guard (per company + account + ref)
 *   • invoice-payment allocation dedup (per payment + invoice)
 */
import { preflightSync, preflightSyncSync } from "./gating";
import {
  getRecord,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { PreflightResult, TxnSyncRecord } from "./types";

const POSTED_KEY = "erpovo:txn-sync:cash-bank-posted";
const ALLOC_KEY = "erpovo:txn-sync:payment-allocations";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

export type PaymentKind = "payment_in" | "payment_out";

export type AccountKind = "cash" | "bank";

export type PaymentSyncInput = {
  kind: PaymentKind;
  companyId: string;
  /** Optional pre-existing local id (resume after reload). */
  localId?: string;
  /** Payment number / voucher / cheque ref. Used by duplicate guard. */
  referenceNo?: string | null;
  /** Where the cash/bank movement is posted. */
  account?: {
    kind: AccountKind;
    id: string;
  };
  /** Positive minor-unit amount (paisa/cents). Used by posting key. */
  amount?: number;
};

export type PaymentSyncPrepared = {
  record: TxnSyncRecord;
  idempotencyKey: string;
};

// ---------------------------------------------------------------------------
// Cash / bank double-posting guard
// ---------------------------------------------------------------------------

type PostedMap = Record<string, { localId: string; at: string }>;

function readPosted(): PostedMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(POSTED_KEY);
    return raw ? (JSON.parse(raw) as PostedMap) : {};
  } catch {
    return {};
  }
}

function writePosted(m: PostedMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(POSTED_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

export function postingKey(
  kind: PaymentKind,
  companyId: string,
  account: { kind: AccountKind; id: string },
  amount: number,
  referenceNo: string | null | undefined,
): string {
  return [
    kind,
    companyId,
    account.kind,
    account.id,
    amount,
    referenceNo ?? "",
  ].join("|");
}

export function isPaymentPosted(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(readPosted(), key);
}

/**
 * Records that a (kind, company, account, amount, ref) tuple has been
 * posted. Returns false if the same posting already exists for a DIFFERENT
 * local_id — that is the double-post we refuse to let through.
 */
export function markPaymentPosted(key: string, localId: string): boolean {
  const m = readPosted();
  const cur = m[key];
  if (cur && cur.localId !== localId) return false;
  m[key] = { localId, at: new Date().toISOString() };
  writePosted(m);
  return true;
}

export function clearPaymentPosted(key: string): void {
  const m = readPosted();
  if (!(key in m)) return;
  delete m[key];
  writePosted(m);
}

// ---------------------------------------------------------------------------
// Invoice payment allocations (dedup per payment+invoice)
// ---------------------------------------------------------------------------

export type PaymentAllocation = {
  paymentLocalId: string;
  invoiceId: string;
  amount: number;
  at: string;
};

type AllocMap = Record<string, PaymentAllocation>;

function allocKey(paymentLocalId: string, invoiceId: string): string {
  return `${paymentLocalId}::${invoiceId}`;
}

function readAllocs(): AllocMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(ALLOC_KEY);
    return raw ? (JSON.parse(raw) as AllocMap) : {};
  } catch {
    return {};
  }
}

function writeAllocs(m: AllocMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(ALLOC_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

/**
 * Idempotent allocation registration. Re-registering the same
 * (paymentLocalId, invoiceId) is a no-op and returns the existing row
 * unchanged — protects against double-allocating a single payment to
 * the same invoice on retry.
 */
export function registerAllocation(input: {
  paymentLocalId: string;
  invoiceId: string;
  amount: number;
}): PaymentAllocation {
  const m = readAllocs();
  const k = allocKey(input.paymentLocalId, input.invoiceId);
  const existing = m[k];
  if (existing) return existing;
  const row: PaymentAllocation = {
    paymentLocalId: input.paymentLocalId,
    invoiceId: input.invoiceId,
    amount: input.amount,
    at: new Date().toISOString(),
  };
  m[k] = row;
  writeAllocs(m);
  return row;
}

export function listAllocations(paymentLocalId: string): PaymentAllocation[] {
  return Object.values(readAllocs()).filter(
    (a) => a.paymentLocalId === paymentLocalId,
  );
}

// ---------------------------------------------------------------------------
// Preflight + register
// ---------------------------------------------------------------------------

/**
 * Synchronous fast-path gate (no session check). Use to enable/disable a
 * "Send payment" button. The real submit MUST also call `preparePayment`.
 */
export function preflightPaymentSync(
  companyId: string | null | undefined,
): PreflightResult {
  return preflightSyncSync(companyId);
}

/**
 * Full gate: mode + company + session, then register the payment so it
 * has a stable local_id and idempotency_key. Also enforces the cash/bank
 * double-post guard when an `account` is supplied. Returns the prepared
 * record but DOES NOT call any cloud API — Phase 3 is gates only.
 */
export async function preparePaymentSync(
  input: PaymentSyncInput,
): Promise<
  | { ok: true; prepared: PaymentSyncPrepared }
  | { ok: false; reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"] | "duplicate-posting" }
> {
  const pf = await preflightSync(input.companyId);
  if (!pf.ok) return { ok: false, reason: pf.reason };

  const record = registerTransaction({
    kind: input.kind,
    companyId: input.companyId,
    localId: input.localId,
    referenceNo: input.referenceNo ?? null,
  });

  if (input.account && typeof input.amount === "number") {
    const key = postingKey(
      input.kind,
      input.companyId,
      input.account,
      input.amount,
      input.referenceNo,
    );
    const ok = markPaymentPosted(key, record.local_id);
    if (!ok) return { ok: false, reason: "duplicate-posting" };
  }

  return {
    ok: true,
    prepared: { record, idempotencyKey: record.idempotency_key },
  };
}

// ---------------------------------------------------------------------------
// State helpers (thin wrappers — keep call sites consistent)
// ---------------------------------------------------------------------------

export function beginPaymentSync(localId: string): TxnSyncRecord | null {
  return markSyncing(localId);
}

export function completePaymentSync(
  localId: string,
  cloudId: string,
): TxnSyncRecord {
  return markSynced(localId, cloudId);
}

export function failPaymentSync(
  localId: string,
  error: string,
): TxnSyncRecord | null {
  return markFailed(localId, error);
}

export function getPaymentRecord(localId: string): TxnSyncRecord | null {
  return getRecord(localId);
}

/** Test/reset helper for payment-specific stores. */
export function __resetPaymentSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(POSTED_KEY);
  localStorage.removeItem(ALLOC_KEY);
}
