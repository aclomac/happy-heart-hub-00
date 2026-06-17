/**
 * Phase F — payment cloud sync (Payment In + Payment Out).
 *
 * Mirrors purchase/sales sync: gate → register → enqueue → upload.
 * One uploader handles both directions via `record.kind` =
 * `"payment_in"` | `"payment_out"`.
 *
 * Cash/bank posting safety: the LOCAL payment-posting code already
 * creates the matching cash_transactions / bank_transfers row. This
 * uploader ONLY mirrors the `payments` row; it never inserts cash or
 * bank rows, so cash/bank posting still happens exactly once (locally).
 * `posted_txn_id` is intentionally NOT mirrored — local cash/bank IDs
 * don't exist in the cloud, and Phase G's cash/bank uploader (future)
 * will re-resolve the mapping when those tables go live.
 *
 * Invoice allocation safety: payment-to-invoice allocation is encoded
 * via `party_id` + `reference_no` (and existing party balance updates
 * run in local triggers). The cloud row carries the same fields, so a
 * single payment row = single allocation. Retries reuse the existing
 * cloud row by `(company_id, idempotency_key)` (DB unique index) or by
 * `(company_id, reference_no)` when `reference_no` is set.
 */
import { preflightSync, preflightSyncSync } from "./gating";
import {
  enqueue,
  getRecord,
  listRecords,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { Uploader, UploadResult } from "./replay";
import type { PreflightResult, TxnKind, TxnSyncRecord } from "./types";

const PAYLOAD_KEY = "erpovo:txn-sync:payment-payload";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

// ---------------------------------------------------------------------------
// Payload model
// ---------------------------------------------------------------------------

export type PaymentDirection = "in" | "out";

export type PaymentPayload = {
  company_id: string;
  direction: PaymentDirection;
  party_id: string | null;
  method: string;
  amount: number;
  payment_date: string;
  reference_no?: string | null;
  notes?: string | null;
  status?: string | null;
  posted_at?: string | null;
  reversed_at?: string | null;
  deleted_at?: string | null;
};

type PayloadMap = Record<string, PaymentPayload>;

function readPayloads(): PayloadMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(PAYLOAD_KEY);
    return raw ? (JSON.parse(raw) as PayloadMap) : {};
  } catch {
    return {};
  }
}

function writePayloads(m: PayloadMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(PAYLOAD_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

export function getPaymentPayload(localId: string): PaymentPayload | null {
  return readPayloads()[localId] ?? null;
}

export function setPaymentPayload(localId: string, payload: PaymentPayload): void {
  const m = readPayloads();
  m[localId] = payload;
  writePayloads(m);
}

export function clearPaymentPayload(localId: string): void {
  const m = readPayloads();
  if (!(localId in m)) return;
  delete m[localId];
  writePayloads(m);
}

// ---------------------------------------------------------------------------
// Preflight + register + enqueue
// ---------------------------------------------------------------------------

export type PaymentSyncInput = {
  companyId: string;
  localId?: string;
  /** Optional — kept for legacy gate call sites that don't carry a payload. */
  kind?: Extract<TxnKind, "payment_in" | "payment_out">;
  /** Optional — legacy gate call sites pass ref directly. */
  referenceNo?: string | null;
  /** Optional cash/bank account, used for double-posting dedup. */
  account?: { kind: "cash" | "bank"; id: string };
  /** Optional amount, used for double-posting dedup. */
  amount?: number;
  /** Optional full payload — required only when a real upload will run. */
  payload?: PaymentPayload;
};

export type PaymentSyncPrepared = {
  record: TxnSyncRecord;
  idempotencyKey: string;
};

function kindFor(direction: PaymentDirection): TxnKind {
  return direction === "in" ? "payment_in" : "payment_out";
}

export function preflightPaymentSync(
  companyId: string | null | undefined,
): PreflightResult {
  return preflightSyncSync(companyId);
}

export async function preparePaymentSync(
  input: PaymentSyncInput,
): Promise<
  | { ok: true; prepared: PaymentSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const pf = await preflightSync(input.companyId);
  if (!pf.ok) return { ok: false, reason: pf.reason };

  const ref =
    (input.payload?.reference_no ?? input.referenceNo ?? "").toString().trim();
  const refOrNull = ref.length > 0 ? ref : null;

  const direction: PaymentDirection =
    input.payload?.direction ?? (input.kind === "payment_out" ? "out" : "in");
  const recordKind: TxnKind = input.kind ?? kindFor(direction);

  const record = registerTransaction({
    kind: recordKind,
    companyId: input.companyId,
    localId: input.localId,
    referenceNo: refOrNull ?? undefined,
  });

  if (input.payload) {
    setPaymentPayload(record.local_id, input.payload);
  }

  // Cash/bank double-posting dedup — same (kind, company, account, amount,
  // ref) cannot be claimed by a different localId. Same localId is OK
  // (idempotent retry of the SAME payment).
  if (input.account && typeof input.amount === "number") {
    const key = postingKey(
      recordKind,
      input.companyId,
      input.account,
      input.amount,
      refOrNull,
    );
    markPaymentPosted(key, record.local_id);
  }

  return { ok: true, prepared: { record, idempotencyKey: record.idempotency_key } };
}

export async function enqueuePayment(
  input: PaymentSyncInput,
): Promise<
  | { ok: true; prepared: PaymentSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const gate = await preparePaymentSync(input);
  if (!gate.ok) return gate;
  enqueue(gate.prepared.record.local_id);
  return gate;
}

// ---------------------------------------------------------------------------
// Cash/bank posting dedup (in-memory) — prevents the same logical posting
// from being applied twice across different localIds in a session. The
// authoritative source of truth is still the local cash/bank transaction
// row; this is an additional guard for the cloud-sync surface.
// ---------------------------------------------------------------------------

const postedKeys = new Map<string, string>(); // key → owning localId

export function postingKey(
  kind: TxnKind,
  companyId: string,
  account: { kind: "cash" | "bank"; id: string },
  amount: number,
  referenceNo: string | null,
): string {
  return [
    kind,
    companyId,
    account.kind,
    account.id,
    amount.toFixed(2),
    referenceNo ?? "",
  ].join("|");
}

export function markPaymentPosted(key: string, localId: string): boolean {
  const owner = postedKeys.get(key);
  if (owner && owner !== localId) return false;
  postedKeys.set(key, localId);
  return true;
}

export function isPaymentPosted(key: string): boolean {
  return postedKeys.has(key);
}

// ---------------------------------------------------------------------------
// Invoice allocation dedup (in-memory) — same (payment, invoice) pair
// resolves to a single allocation row. Different invoices under the same
// payment are independent allocations.
// ---------------------------------------------------------------------------

export type AllocationInput = {
  paymentLocalId: string;
  invoiceId: string;
  amount: number;
};

export type AllocationRecord = AllocationInput & { id: string };

const allocations = new Map<string, AllocationRecord[]>();

function allocKey(a: AllocationInput): string {
  return `${a.paymentLocalId}|${a.invoiceId}`;
}

export function registerAllocation(input: AllocationInput): AllocationRecord {
  const list = allocations.get(input.paymentLocalId) ?? [];
  const existing = list.find((r) => allocKey(r) === allocKey(input));
  if (existing) return existing;
  const rec: AllocationRecord = { ...input, id: `${allocKey(input)}#${list.length}` };
  list.push(rec);
  allocations.set(input.paymentLocalId, list);
  return rec;
}

export function listAllocations(paymentLocalId: string): AllocationRecord[] {
  return [...(allocations.get(paymentLocalId) ?? [])];
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function beginPaymentSync(localId: string): TxnSyncRecord | null {
  return markSyncing(localId);
}

export function completePaymentSync(localId: string, cloudId: string): TxnSyncRecord {
  const rec = markSynced(localId, cloudId);
  clearPaymentPayload(localId);
  return rec;
}

export function failPaymentSync(localId: string, error: string): TxnSyncRecord | null {
  return markFailed(localId, error);
}

export function getPaymentRecord(localId: string): TxnSyncRecord | null {
  return getRecord(localId);
}

export function listPaymentSyncRecords(companyId: string): TxnSyncRecord[] {
  return [
    ...listRecords({ kind: "payment_in", companyId }),
    ...listRecords({ kind: "payment_out", companyId }),
  ];
}

// ---------------------------------------------------------------------------
// Uploader
// ---------------------------------------------------------------------------

export type PaymentSyncSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      is: (col: string, val: null) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    insert: (row: Record<string, unknown>) => {
      select: (cols: string) => {
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  };
};

const UNIQUE_VIOLATION = "23505";

export function createPaymentUploader(sb: PaymentSyncSupabase): Uploader {
  return async (record: TxnSyncRecord): Promise<UploadResult> => {
    if (record.kind !== "payment_in" && record.kind !== "payment_out") {
      throw new Error(
        `createPaymentUploader: refusing to upload non-payment kind "${record.kind}"`,
      );
    }
    const payload = getPaymentPayload(record.local_id);
    if (!payload) {
      throw new Error(
        `createPaymentUploader: no persisted payload for ${record.local_id}`,
      );
    }
    if (record.cloud_id) return { cloud_id: record.cloud_id };

    // Reference-no idempotency: same (company, reference_no, direction)
    // → reuse the existing cloud row.
    if (payload.reference_no && payload.reference_no.trim().length > 0) {
      const existing = await sb
        .from("payments")
        .select("id")
        .is("deleted_at", null)
        .eq("company_id", payload.company_id)
        .eq("reference_no", payload.reference_no)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.id) return { cloud_id: existing.data.id };
    }

    const row = {
      company_id: payload.company_id,
      party_id: payload.party_id,
      direction: payload.direction,
      method: payload.method,
      amount: payload.amount,
      reference_no: payload.reference_no ?? null,
      payment_date: payload.payment_date,
      notes: payload.notes ?? null,
      status: payload.status ?? "posted",
      posted_at: payload.posted_at ?? new Date().toISOString(),
      idempotency_key: record.idempotency_key,
      deleted_at: payload.deleted_at ?? null,
    };

    const ins = await sb.from("payments").insert(row).select("id").single();
    if (ins.error) {
      // 23505 race on (company_id, idempotency_key) — re-throw with the
      // SQLSTATE so replay.ts's isUniqueViolation() resolves it as a
      // non-fatal duplicate-success via markDuplicateResolved().
      const err = new Error(ins.error.message) as Error & { code?: string };
      if (ins.error.code) err.code = ins.error.code;
      throw err;
    }
    if (!ins.data?.id) throw new Error("payments insert returned no id");
    return { cloud_id: ins.data.id };
  };
}

/** Test/reset helper. */
export function __resetPaymentSyncStore(): void {
  postedKeys.clear();
  allocations.clear();
  if (!isBrowser()) return;
  localStorage.removeItem(PAYLOAD_KEY);
}
