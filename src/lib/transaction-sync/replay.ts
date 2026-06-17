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

export type ReplayOptions = {
  companyId: string;
  uploader: Uploader;
  /** Override the navigator.onLine check (tests). Defaults to true on server. */
  isOnline?: () => boolean;
};

export type ReplayReport = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
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
  };

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
      try {
        const result = await opts.uploader({ ...rec });
        if (!result?.cloud_id) {
          throw new Error("uploader returned no cloud_id");
        }
        markSynced(localId, result.cloud_id);
        dequeue(localId);
        report.succeeded += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        markFailed(localId, msg);
        // Stay queued so the next reconnect retries it.
        report.failed += 1;
      }
    }
  } finally {
    inFlight = false;
  }

  return report;
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
