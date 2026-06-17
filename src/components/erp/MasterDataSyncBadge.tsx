/**
 * Master data sync badge — Phase 2.
 *
 * Inline indicator + manual resync button shown in master-data page
 * headers. Reflects the adapter's per-entity sync state from localStorage.
 *
 * Behaviour by launch mode:
 *
 *   • Local Mode: cloud sync is disabled, button is hidden, the badge
 *     explains that Cloud Sync only runs in Cloud Mode.
 *   • Cloud Mode: clicking "Sync Now" re-fetches the entity from Supabase,
 *     invalidates the matching React Query cache, and updates the badge.
 *     If a sync fails we keep the failed state, surface the error, and
 *     start a bounded background-retry timer (see `background-retry.ts`).
 *     If there is no authenticated session or no active company, we render
 *     a safe warning instead of crashing.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CloudOff,
  Loader2,
  RefreshCw,
  RotateCw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  useMasterDataSyncStatus,
  type MasterEntity,
} from "@/lib/master-data";
import {
  ENTITY_LISTERS,
  resetRetryAttempts,
  runResync,
  scheduleRetry,
} from "@/lib/master-data/background-retry";

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || Number.isNaN(diff)) return "—";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const ENTITY_LABEL: Record<MasterEntity, string> = {
  items: "Items",
  item_categories: "Item categories",
  parties: "Parties",
  party_groups: "Party groups",
  warehouses: "Warehouses",
};

export function MasterDataSyncBadge({
  entity,
  companyId,
  className,
}: {
  entity: MasterEntity;
  companyId?: string | null;
  className?: string;
}) {
  const status = useMasterDataSyncStatus(entity);
  const mode = getLaunchMode();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      // Manual "Sync Now" — clear any pending backoff so the user's click
      // takes effect immediately and starts a fresh attempt cycle.
      resetRetryAttempts(entity);
      const res = await runResync(entity, companyId ?? null, {
        queryClient: qc,
      });
      if (res.ok) {
        toast.success(`${ENTITY_LABEL[entity]} synced`);
        return;
      }
      if (res.reason === "no-company") {
        toast.error("No active company. Cannot resync.");
      } else if (res.reason === "no-session") {
        toast.error("Sign in to sync with cloud.");
      } else if (res.reason === "local-mode") {
        toast.error("Cloud Sync is only available in Cloud Mode.");
      } else {
        toast.error(`Resync failed: ${res.error ?? "Unknown error"}`);
      }
    } finally {
      setRetrying(false);
    }
  }

  // Background retry: when a sync is in the "failed" state and we're in
  // Cloud Mode with a company, schedule a bounded backoff retry. The runner
  // skips the session check so the timer can fire silently when the user
  // briefly drops a connection; if there's still no session, runResync will
  // mark the entity failed again and the next backoff step fires.
  useEffect(() => {
    if (mode !== "cloud" || !companyId) return;
    if (status.state === "synced") {
      resetRetryAttempts(entity);
      return;
    }
    if (status.state !== "failed") return;
    scheduleRetry(entity, () =>
      runResync(entity, companyId, {
        queryClient: qc,
        requireSession: false,
      }),
    );
  }, [status.state, mode, companyId, entity, qc]);

  // Local Mode badge.
  if (mode === "local") {
    const pending = status.pendingChanges;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        title="Cloud Sync is only available in Cloud Mode."
        data-testid={`sync-badge-${entity}`}
        data-mode="local"
      >
        <CloudOff className="h-3 w-3" />
        Local Mode{pending > 0 ? ` · ${pending} pending` : ""}
      </span>
    );
  }

  // Cloud Mode (no company yet) — safe warning, no crash, no button.
  if (!companyId) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        title="Select a company to enable Cloud Sync."
        data-testid={`sync-badge-${entity}`}
        data-mode="cloud-nocompany"
      >
        <CloudOff className="h-3 w-3" />
        No company
      </span>
    );
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs";

  let body: React.ReactNode;
  let tone = "bg-muted text-muted-foreground";

  if (status.state === "failed") {
    tone = "bg-destructive/10 text-destructive";
    body = (
      <>
        <TriangleAlert className="h-3 w-3" />
        Sync failed
      </>
    );
  } else if (status.state === "syncing" || retrying) {
    body = (
      <>
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing…
      </>
    );
  } else if (status.state === "pending" || status.pendingChanges > 0) {
    tone = "bg-amber-500/10 text-amber-600";
    body = (
      <>
        <RotateCw className="h-3 w-3" />
        {status.pendingChanges} pending
      </>
    );
  } else if (status.state === "synced" && status.lastSyncedAt) {
    tone = "bg-emerald-500/10 text-emerald-600";
    body = (
      <>
        <Check className="h-3 w-3" />
        Synced · {relativeTime(status.lastSyncedAt)}
      </>
    );
  } else {
    body = (
      <>
        <CloudOff className="h-3 w-3" />
        Idle
      </>
    );
  }

  const tooltip =
    status.state === "failed" && status.error
      ? `Last error: ${status.error}`
      : status.lastSyncedAt
        ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`
        : "Click resync to fetch latest from cloud";

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      data-testid={`sync-badge-${entity}`}
      data-mode="cloud"
    >
      <span className={cn(base, tone)} title={tooltip}>
        {body}
      </span>
      {status.state === "failed" && status.error ? (
        <span
          className="max-w-[240px] truncate text-xs text-destructive"
          title={status.error}
          data-testid={`sync-error-${entity}`}
        >
          {status.error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleRetry}
        disabled={retrying || status.state === "syncing"}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full border border-input bg-background text-muted-foreground transition-colors",
          "hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
        )}
        title="Sync Now"
        aria-label={`Sync ${ENTITY_LABEL[entity]} now`}
        data-testid={`sync-retry-${entity}`}
      >
        <RefreshCw
          className={cn("h-3 w-3", retrying && "animate-spin")}
          aria-hidden
        />
      </button>
    </span>
  );
}

// Keep listers re-exported from here for any legacy importers.
export { ENTITY_LISTERS };
