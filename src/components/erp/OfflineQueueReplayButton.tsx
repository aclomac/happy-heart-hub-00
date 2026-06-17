/**
 * Manual "Replay offline queue" action (Phase 3).
 *
 * Lets the user re-trigger `replayQueue` from the UI and shows the
 * outcome inline + via toast. The button is safe to click repeatedly:
 * `replayQueue` has an in-flight latch and per-record idempotency keys,
 * so multiple clicks cannot double-post.
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getQueueState,
  replayQueue,
  type AttemptLogEntry,
  type QueueState,
  type ReplayReport,
  type RetryPolicy,
} from "@/lib/transaction-sync";
import { getActiveUploader } from "@/lib/transaction-sync/active-uploader";

type Outcome =
  | { kind: "idle" }
  | { kind: "success"; report: ReplayReport; at: string }
  | { kind: "error"; message: string; at: string; report?: ReplayReport };

const ABORT_MESSAGE: Record<NonNullable<ReplayReport["abortedReason"]>, string> = {
  offline: "You're offline — replay will run automatically when you reconnect.",
  "local-mode": "Cloud Sync is only available in Cloud Mode.",
  "no-company": "No active company. Cannot replay queued transactions.",
  "no-session": "Sign in to replay queued transactions.",
  "in-flight": "Replay is already in progress.",
};

/** Sensible default for a user-initiated manual retry. */
export const DEFAULT_MANUAL_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  factor: 2,
  jitter: true,
};

export function OfflineQueueReplayButton({
  companyId,
  className,
  retry = DEFAULT_MANUAL_RETRY,
}: {
  companyId?: string | null;
  className?: string;
  retry?: RetryPolicy;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [queue, setQueue] = useState<QueueState>(() => getQueueState());

  // Re-read queue state on mount + after each click + when storage changes
  // from another tab.
  useEffect(() => {
    setQueue(getQueueState());
    if (typeof window === "undefined") return;
    const onStorage = () => setQueue(getQueueState());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function handleClick() {
    if (!companyId) {
      toast.error("No active company. Cannot replay.");
      return;
    }
    setBusy(true);
    try {
      const report = await replayQueue({
        companyId,
        uploader: getActiveUploader(),
        retry,
      });
      setQueue(getQueueState());
      const at = new Date().toISOString();
      if (report.abortedReason) {
        const msg = ABORT_MESSAGE[report.abortedReason] ?? report.abortedReason;
        setOutcome({ kind: "error", message: msg, at });
        toast.error(`Replay aborted: ${msg}`);
        return;
      }
      setOutcome({ kind: "success", report, at });
      if (report.failed > 0) {
        toast.error(
          `Replay finished with ${report.failed} failed of ${report.attempted} attempted.`,
        );
      } else if (report.attempted === 0) {
        toast.success("Offline queue is already empty.");
      } else {
        toast.success(
          `Replayed ${report.succeeded} of ${report.attempted} queued transactions.`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setOutcome({ kind: "error", message, at: new Date().toISOString() });
      toast.error(`Replay failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)} data-testid="offline-queue-replay">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={busy}
          data-testid="offline-queue-replay-button"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCcw className="w-4 h-4" />
          )}
          Replay offline queue
        </Button>
        <span className="text-xs text-muted-foreground">
          {queue.size} queued
          {queue.lastReplayAt
            ? ` · last run ${new Date(queue.lastReplayAt).toLocaleString()}`
            : ""}
        </span>
      </div>

      {outcome.kind === "success" && (
        <div
          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 space-y-2"
          data-testid="offline-queue-replay-success"
        >
          <div>
            Replay completed at {new Date(outcome.at).toLocaleTimeString()} —
            {" "}attempted {outcome.report.attempted},
            {" "}succeeded {outcome.report.succeeded},
            {" "}failed {outcome.report.failed},
            {" "}skipped {outcome.report.skipped}
            {" "}· uploader calls {outcome.report.attempts}
            {" "}(retry up to {retry.maxAttempts}x).
          </div>
          <AttemptsTable entries={outcome.report.attemptsLog} />
        </div>
      )}
      {outcome.kind === "error" && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-testid="offline-queue-replay-error"
        >
          {outcome.message}
        </div>
      )}
    </div>
  );
}
