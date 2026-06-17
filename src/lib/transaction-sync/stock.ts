/**
 * Phase B — stock posting cloud sync gating.
 *
 * This module mirrors the sales-sync shape but is intentionally NARROW:
 * it only provides the gating + register/enqueue primitives for stock
 * movements. The uploader is deliberately omitted. The existing local
 * save path still owns the canonical stock posting; this scaffold lets
 * a later phase plug a cloud uploader in without changing the call site.
 *
 * Local Mode is always denied at the preflight gate — no payload is
 * registered, no queue entry created, no cloud call made.
 *
 * `createSalesUploader` MUST NOT post stock movements; that contract is
 * unchanged and asserted by the existing test suite.
 */
import { preflightSync, preflightSyncSync } from "./gating";
import {
  enqueue,
  getRecord,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { PreflightResult, TxnSyncRecord } from "./types";

const PAYLOAD_KEY = "erpovo:txn-sync:stock-payload";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

// ---------------------------------------------------------------------------
// Payload model
// ---------------------------------------------------------------------------

export type StockMovementPayload = {
  company_id: string;
  /** Local id of the parent transaction (sale, purchase, adjustment). */
  parent_local_id: string;
  /** Movement direction — `in` for stock-in, `out` for stock-out. */
  direction: "in" | "out";
  /** What kind of business event produced this movement. */
  source: "sale" | "purchase" | "adjustment" | "transfer";
  /** Optional reference number for human-facing trails. */
  reference_no?: string | null;
  occurred_at: string;
  lines: Array<{
    item_id: string;
    qty: number;
    unit: string;
    warehouse_id?: string | null;
    unit_cost?: number | null;
  }>;
};

type PayloadMap = Record<string, StockMovementPayload>;

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

export function getStockPayload(localId: string): StockMovementPayload | null {
  return readPayloads()[localId] ?? null;
}

export function setStockPayload(
  localId: string,
  payload: StockMovementPayload,
): void {
  const m = readPayloads();
  m[localId] = payload;
  writePayloads(m);
}

export function clearStockPayload(localId: string): void {
  const m = readPayloads();
  if (!(localId in m)) return;
  delete m[localId];
  writePayloads(m);
}

// ---------------------------------------------------------------------------
// Preflight + register
// ---------------------------------------------------------------------------

export type StockSyncInput = {
  companyId: string;
  /** Resume an existing record after reload or retry. */
  localId?: string;
  /** Optional human-facing reference (invoice no, bill no, voucher no). */
  referenceNo?: string | null;
  payload: StockMovementPayload;
};

export type StockSyncPrepared = {
  record: TxnSyncRecord;
  idempotencyKey: string;
};

/** Sync fast-path gate (mode + company). */
export function preflightStockSync(
  companyId: string | null | undefined,
): PreflightResult {
  return preflightSyncSync(companyId);
}

/**
 * Full gate (mode + company + session) then register the movement so it
 * carries a stable `local_id` and `idempotency_key`. The payload is
 * persisted so an offline-queued movement can be drained by a future
 * uploader, even across a full reload.
 */
export async function prepareStockSync(
  input: StockSyncInput,
): Promise<
  | { ok: true; prepared: StockSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const pf = await preflightSync(input.companyId);
  if (!pf.ok) return { ok: false, reason: pf.reason };

  const record = registerTransaction({
    kind: "stock_movement",
    companyId: input.companyId,
    localId: input.localId,
    referenceNo: input.referenceNo ?? null,
  });

  setStockPayload(record.local_id, input.payload);

  return {
    ok: true,
    prepared: { record, idempotencyKey: record.idempotency_key },
  };
}

/** Convenience: register + enqueue for later replay. */
export async function enqueueStockMovement(
  input: StockSyncInput,
): Promise<
  | { ok: true; prepared: StockSyncPrepared }
  | {
      ok: false;
      reason: NonNullable<Exclude<PreflightResult, { ok: true }>>["reason"];
    }
> {
  const gate = await prepareStockSync(input);
  if (!gate.ok) return gate;
  enqueue(gate.prepared.record.local_id);
  return gate;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function beginStockSync(localId: string): TxnSyncRecord | null {
  return markSyncing(localId);
}

export function completeStockSync(
  localId: string,
  cloudId: string,
): TxnSyncRecord {
  const rec = markSynced(localId, cloudId);
  clearStockPayload(localId);
  return rec;
}

export function failStockSync(
  localId: string,
  error: string,
): TxnSyncRecord | null {
  return markFailed(localId, error);
}

export function getStockRecord(localId: string): TxnSyncRecord | null {
  return getRecord(localId);
}

/** Test/reset helper. */
export function __resetStockSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PAYLOAD_KEY);
}
