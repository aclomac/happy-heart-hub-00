/**
 * Phase 3 — offline queue recovery.
 *
 * Replays queued transactions after the device reconnects. The uploader
 * is injected so this module stays free of real network I/O and is fully
 * testable.
 *
 * Duplicate-safety guarantees:
 *   • A record that already carries a `cloud_id` is dequeued WITHOUT
 *     calling the uploader (the previous attempt succeeded; the queue
 *     entry is just leftover).
 *   • Every uploader call carries the record's stable `idempotency_key`,
 *     so a server-side retry resolves to the same row.
 *   • `markSynced` rejects mismatched `cloud_id`s (double-post guard).
 *   • A re-entrant `replayQueue` call is a no-op while one is in flight,
 *     so an `online` event firing twice cannot double-post.
 */
import { preflightSync } from "./gating";
import {
  dequeue,
  enqueue,
  getRecord,
  markFailed,
  markSynced,
  markSyncing,
  peekQueue,
  recordReplayOutcome,
} from "./idempotency";
import type { TxnSyncRecord } from "./types";

export type UploadResult = { cloud_id: string };

export type Uploader = (
  record: TxnSyncRecord,
) => Promise<UploadResult> | UploadResult;

export type RetryPolicy = {
  /** Total attempts per record (1 = no retry). Default 1. */
  maxAttempts: number;
  /** First retry delay in ms. Default 0 (no wait). */
  baseDelayMs?: number;
  /** Cap for any single backoff wait. Default 30_000. */
  maxDelayMs?: number;
  /** Exponential growth factor. Default 2. */
  factor?: number;
  /** Add up to ±50% jitter to each delay. Default false. */
  jitter?: boolean;
};

export const DEFAULT_RETRY: Required<RetryPolicy> = {
  maxAttempts: 1,
  baseDelayMs: 0,
  maxDelayMs: 30_000,
  factor: 2,
  jitter: false,
};

export type ReplayOptions = {
  companyId: string;
  uploader: Uploader;
  /** Override the navigator.onLine check (tests). Defaults to true on server. */
  isOnline?: () => boolean;
  /** Per-record retry/backoff policy. Default = no retry. */
  retry?: RetryPolicy;
  /** Test hook to skip real sleeps. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

export type ReplayReport = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Total uploader invocations across all records (includes retries). */
  attempts: number;
  /** Reason the run aborted early, if any. */
  abortedReason?:
    | "offline"
    | "local-mode"
    | "no-company"
    | "no-session"
    | "in-flight";
};

let inFlight = false;

function defaultIsOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/**
 * Drain the offline queue once. Safe to call repeatedly — concurrent
 * invocations short-circuit.
 */
export async function replayQueue(opts: ReplayOptions): Promise<ReplayReport> {
  const report: ReplayReport = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    attempts: 0,
  };
  const retry: Required<RetryPolicy> = { ...DEFAULT_RETRY, ...(opts.retry ?? {}) };
  if (retry.maxAttempts < 1) retry.maxAttempts = 1;
  const sleep = opts.sleep ?? defaultSleep;

  if (inFlight) return { ...report, abortedReason: "in-flight" };
  const isOnline = opts.isOnline ?? defaultIsOnline;
  if (!isOnline()) {
    const r = { ...report, abortedReason: "offline" as const };
    recordReplayOutcome(r);
    return r;
  }

  // Latch BEFORE any await so a re-entrant call can't slip past preflight.
  inFlight = true;
  try {
    const pre = await preflightSync(opts.companyId);
    if (!pre.ok) {
      const r = { ...report, abortedReason: pre.reason };
      recordReplayOutcome(r);
      return r;
    }
    // Snapshot the queue — new enqueues during the run are picked up on
    // the next replay rather than mutating our iteration.
    const ids = peekQueue();
    for (const localId of ids) {
      const rec = getRecord(localId);
      if (!rec) {
        // Orphan queue entry — drop it.
        dequeue(localId);
        report.skipped += 1;
        continue;
      }
      // Belongs to a different company in a multi-company device — leave
      // it queued for when that company is active.
      if (rec.company_id !== opts.companyId) {
        report.skipped += 1;
        continue;
      }
      // Already successfully synced previously; the queue entry is stale.
      if (rec.status === "synced" && rec.cloud_id) {
        dequeue(localId);
        report.skipped += 1;
        continue;
      }

      report.attempted += 1;
      markSyncing(localId);

      let lastErr: string | null = null;
      let ok = false;
      for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
        report.attempts += 1;
        try {
          const result = await opts.uploader({ ...rec });
          if (!result?.cloud_id) {
            throw new Error("uploader returned no cloud_id");
          }
          markSynced(localId, result.cloud_id);
          dequeue(localId);
          report.succeeded += 1;
          ok = true;
          break;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          if (attempt < retry.maxAttempts) {
            await sleep(computeBackoff(attempt, retry));
          }
        }
      }
      if (!ok) {
        markFailed(localId, lastErr ?? "unknown error");
        report.failed += 1;
      }
    }
  } finally {
    inFlight = false;
  }

  recordReplayOutcome(report);
  return report;
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/** Exponential backoff with optional ±50% jitter, capped at maxDelayMs. */
export function computeBackoff(
  attempt: number,
  policy: Required<RetryPolicy>,
): number {
  const raw = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1);
  const capped = Math.min(raw, policy.maxDelayMs);
  if (!policy.jitter) return Math.max(0, Math.round(capped));
  const j = capped * (0.5 + Math.random()); // 0.5x – 1.5x
  return Math.max(0, Math.round(Math.min(j, policy.maxDelayMs)));
}

/**
 * Wire `window.addEventListener("online", ...)` to drain the queue.
 * Returns a disposer. No-op on the server.
 */
export function installQueueAutoReplay(
  getOpts: () => ReplayOptions | null,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    const opts = getOpts();
    if (!opts) return;
    void replayQueue(opts);
  };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

/** Convenience: register-and-enqueue helper used by callers. */
export function queueForSync(localId: string): void {
  enqueue(localId);
}

/** Test-only escape hatch — clears the in-flight latch. */
export function __resetReplayLatch(): void {
  inFlight = false;
}
