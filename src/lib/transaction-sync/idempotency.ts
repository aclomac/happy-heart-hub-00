/**
 * Phase 3 — transaction idempotency + local↔cloud id mapping.
 *
 * Persists per-transaction sync metadata in localStorage so:
 *   • The same logical transaction has ONE stable `local_id` across retries.
 *   • Each cloud write carries an `idempotency_key` derived from that id —
 *     a retry with the same key MUST update, never duplicate.
 *   • Duplicate invoice/bill numbers in the same company are blocked
 *     before any network call.
 *
 * No network I/O — this is the gating layer only. Phase 3+ will plug an
 * actual uploader on top.
 */
import type { TxnKind, TxnSyncRecord, TxnSyncState } from "./types";

const MAP_KEY = "erpovo:txn-sync:map";
const QUEUE_KEY = "erpovo:txn-sync:queue";

const isBrowser = () =>
  typeof window !== "undefined" && typeof localStorage !== "undefined";

type RecordMap = Record<string, TxnSyncRecord>;

function readMap(): RecordMap {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as RecordMap) : {};
  } catch {
    return {};
  }
}

function writeMap(m: RecordMap): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(m));
  } catch {
    /* ignore quota */
  }
}

function readQueue(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: string[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* ignore */
  }
}

/** RFC4122-ish v4. Uses crypto when available, falls back to Math.random. */
export function newLocalId(): string {
  const g = (typeof globalThis !== "undefined" ? globalThis : {}) as {
    crypto?: { randomUUID?: () => string };
  };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback — good enough for test envs without WebCrypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stable idempotency key derived from (kind, company, local_id). Same
 * inputs always yield the same key so a retry CANNOT bypass the server's
 * unique-constraint check.
 */
export function makeIdempotencyKey(
  kind: TxnKind,
  companyId: string,
  localId: string,
): string {
  return `${kind}:${companyId}:${localId}`;
}

export type RegisterInput = {
  kind: TxnKind;
  companyId: string;
  /** Optional pre-existing local id (resume after reload). */
  localId?: string;
  referenceNo?: string | null;
};

/**
 * Idempotent register. If `localId` already exists, returns the existing
 * record unchanged — duplicate-submit guard for the same submission.
 */
export function registerTransaction(input: RegisterInput): TxnSyncRecord {
  const map = readMap();
  const localId = input.localId || newLocalId();
  const existing = map[localId];
  if (existing) return existing;

  // Reference-no duplicate guard (per kind + company).
  if (input.referenceNo) {
    const dup = Object.values(map).find(
      (r) =>
        r.kind === input.kind &&
        r.company_id === input.companyId &&
        r.reference_no === input.referenceNo &&
        r.status !== "failed",
    );
    if (dup) {
      throw new Error(
        `Duplicate ${input.kind} reference "${input.referenceNo}" in this company.`,
      );
    }
  }

  const rec: TxnSyncRecord = {
    local_id: localId,
    cloud_id: null,
    kind: input.kind,
    company_id: input.companyId,
    idempotency_key: makeIdempotencyKey(input.kind, input.companyId, localId),
    reference_no: input.referenceNo ?? null,
    status: "pending",
    attempts: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  map[localId] = rec;
  writeMap(map);
  return rec;
}

export function getRecord(localId: string): TxnSyncRecord | null {
  return readMap()[localId] ?? null;
}

export function listRecords(filter?: {
  kind?: TxnKind;
  status?: TxnSyncState;
  companyId?: string;
}): TxnSyncRecord[] {
  const rows = Object.values(readMap());
  return rows.filter(
    (r) =>
      (!filter?.kind || r.kind === filter.kind) &&
      (!filter?.status || r.status === filter.status) &&
      (!filter?.companyId || r.company_id === filter.companyId),
  );
}

function patch(localId: string, p: Partial<TxnSyncRecord>): TxnSyncRecord | null {
  const map = readMap();
  const cur = map[localId];
  if (!cur) return null;
  const next: TxnSyncRecord = {
    ...cur,
    ...p,
    updated_at: new Date().toISOString(),
  };
  map[localId] = next;
  writeMap(map);
  return next;
}

export function markSyncing(localId: string): TxnSyncRecord | null {
  const cur = readMap()[localId];
  if (!cur) return null;
  return patch(localId, {
    status: "syncing",
    attempts: cur.attempts + 1,
    last_error: null,
  });
}

/**
 * Mark a transaction as successfully synced. If the record already has a
 * `cloud_id`, asserts the incoming id matches — protects against a buggy
 * uploader handing back a fresh row on retry.
 */
export function markSynced(localId: string, cloudId: string): TxnSyncRecord {
  const cur = readMap()[localId];
  if (!cur) {
    throw new Error(`markSynced: unknown local_id ${localId}`);
  }
  if (cur.cloud_id && cur.cloud_id !== cloudId) {
    throw new Error(
      `markSynced: cloud_id mismatch for ${localId} (had ${cur.cloud_id}, got ${cloudId}) — refusing to overwrite to prevent duplicate posting.`,
    );
  }
  return patch(localId, {
    status: "synced",
    cloud_id: cloudId,
    last_error: null,
  })!;
}

export function markFailed(localId: string, error: string): TxnSyncRecord | null {
  return patch(localId, { status: "failed", last_error: error });
}

/** Queue (FIFO of localIds awaiting upload). Dedups on enqueue. */
export function enqueue(localId: string): void {
  const q = readQueue();
  if (q.includes(localId)) return;
  q.push(localId);
  writeQueue(q);
}

export function dequeue(localId: string): void {
  writeQueue(readQueue().filter((x) => x !== localId));
}

export function peekQueue(): string[] {
  return readQueue();
}

/** Test/reset helper. */
export function __resetTxnSyncStore(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(MAP_KEY);
  localStorage.removeItem(QUEUE_KEY);
}
