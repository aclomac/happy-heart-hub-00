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
  listRecords,
  markFailed,
  markSynced,
  markSyncing,
  registerTransaction,
} from "./idempotency";
import type { Uploader, UploadResult } from "./replay";
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

/** All stock_movement sync records for a company. */
export function listStockSyncRecords(companyId: string): TxnSyncRecord[] {
  return listRecords({ kind: "stock_movement", companyId });
}

/** Look up a stock_movement sync record by its cloud_id, scoped to a company. */
export function getStockRecordByCloudId(
  companyId: string,
  cloudId: string,
): TxnSyncRecord | null {
  return (
    listStockSyncRecords(companyId).find((r) => r.cloud_id === cloudId) ?? null
  );
}

/** Test/reset helper. */
export function __resetStockSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(PAYLOAD_KEY);
}

// ---------------------------------------------------------------------------
// Uploader factory — Phase C cloud sync.
//
// Inserts the escrowed stock movement payload into the `stock_movements`
// table once and only once. Duplicate safety is enforced at two layers:
//
//   1. Pre-insert lookup by (company_id, idempotency_key) — a previous
//      attempt that landed but whose response we never saw will be
//      detected and reused, so we never double-post stock-out.
//   2. Database unique index `stock_movements_company_idempotency_key_uidx`
//      — a racing writer triggers Postgres 23505, which `replayQueue`
//      treats as a non-fatal duplicate-resolved success.
//
// Each line in the payload writes one stock_movements row, keyed as
// `${record.idempotency_key}#${i}`, so per-line uniqueness is preserved
// without changing the parent record's idempotency key.
//
// IMPORTANT: this uploader does NOT recompute stock. The local save path
// already debited/credited inventory; the cloud row is a mirror of that
// already-applied movement. Retries cannot reduce stock twice because
// the unique index rejects the second insert of the same key.
// ---------------------------------------------------------------------------

export type StockSyncSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { id: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
      select: (cols: string) => {
        // Replay calls only need the first inserted id; we use it as the
        // record's cloud_id (the "anchor" row). Subsequent lines for the
        // same record share the same record.cloud_id via the key prefix.
        single: () => Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

function mapSourceToReferenceType(source: StockMovementPayload["source"]): string {
  // Keep the existing `reference_type` vocabulary the local writer uses
  // (sale / purchase / adjustment / transfer_in|out). For paired sale/
  // purchase movements the direction disambiguates in/out, so source
  // alone is enough here; the transfer pair is already split into two
  // payloads at the call site.
  return source;
}

export function createStockUploader(sb: StockSyncSupabase): Uploader {
  return async (record: TxnSyncRecord): Promise<UploadResult> => {
    if (record.kind !== "stock_movement") {
      throw new Error(
        `createStockUploader: refusing to upload non-stock_movement kind "${record.kind}"`,
      );
    }
    const payload = getStockPayload(record.local_id);
    if (!payload) {
      throw new Error(
        `createStockUploader: no persisted payload for ${record.local_id}`,
      );
    }
    if (!payload.lines.length) {
      throw new Error(
        `createStockUploader: empty lines for ${record.local_id}`,
      );
    }

    // Already synced — return the prior cloud_id without touching the cloud.
    if (record.cloud_id) {
      return { cloud_id: record.cloud_id };
    }

    const anchorKey = `${record.idempotency_key}#0`;

    // Idempotency pre-check: did a previous attempt already land the
    // anchor row for this record? Reuse it instead of re-inserting.
    const existing = await sb
      .from("stock_movements")
      .select("id")
      .eq("company_id", payload.company_id)
      .eq("idempotency_key", anchorKey)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.id) {
      return { cloud_id: existing.data.id };
    }

    // Resolve parent cloud id (sale/purchase) via the sync map — best
    // effort; if not yet known we leave reference_id null. The unique
    // idempotency_key still prevents duplicates.
    const parentRec = getRecord(payload.parent_local_id);
    const referenceId = parentRec?.cloud_id ?? null;
    const referenceType = mapSourceToReferenceType(payload.source);
    const movementDate = payload.occurred_at.slice(0, 10);

    const rows = payload.lines.map((line, i) => ({
      company_id: payload.company_id,
      item_id: line.item_id,
      variant_id: null,
      warehouse_id: line.warehouse_id ?? null,
      direction: payload.direction,
      qty: line.qty,
      movement_date: movementDate,
      reference_type: referenceType,
      reference_id: referenceId,
      reference_no: payload.reference_no ?? null,
      idempotency_key: `${record.idempotency_key}#${i}`,
    }));

    const ins = await sb
      .from("stock_movements")
      .insert(rows)
      .select("id")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    if (!ins.data?.id) throw new Error("stock_movements insert returned no id");
    return { cloud_id: ins.data.id };
  };
}
