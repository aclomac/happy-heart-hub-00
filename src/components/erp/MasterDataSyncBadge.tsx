/**
 * Master data sync badge — Phase 2.
 *
 * Inline indicator + manual resync button shown in master-data page
 * headers. Reflects the adapter's per-entity sync state from localStorage.
 * In Cloud Mode, surfaces the last sync error and lets the user retry the
 * cloud read on demand (also invalidates the matching React-Query cache so
 * the page re-renders with fresh rows).
 */
import { useState } from "react";
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
  listItems,
  listItemCategories,
  listParties,
  listPartyGroups,
  listWarehouses,
  useMasterDataSyncStatus,
  markFailed,
  markSynced,
  type MasterEntity,
} from "@/lib/master-data";

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

const ENTITY_LISTERS: Record<
  MasterEntity,
  (companyId: string) => Promise<unknown>
> = {
  items: listItems,
  item_categories: listItemCategories,
  parties: listParties,
  party_groups: listPartyGroups,
  warehouses: listWarehouses,
};

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
    if (!companyId) {
      toast.error("No active company. Cannot resync.");
      return;
    }
    setRetrying(true);
    try {
      await ENTITY_LISTERS[entity](companyId);
      // Match the route's useQuery keys: ["<entity>", companyId].
      qc.invalidateQueries({ queryKey: [entity, companyId] });
      markSynced(entity);
      toast.success(`${ENTITY_LABEL[entity]} resynced`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Resync failed";
      markFailed(entity, msg);
      toast.error(`Resync failed: ${msg}`);
    } finally {
      setRetrying(false);
    }
  }

  if (mode === "local") {
    const pending = status.pendingChanges;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        title="Local mode — changes are stored on this device only"
        data-testid={`sync-badge-${entity}`}
      >
        <CloudOff className="h-3 w-3" />
        Local{pending > 0 ? ` · ${pending} pending` : ""}
      </span>
    );
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs";

  // Cloud mode — render badge + retry button as a single group.
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
        title="Resync from cloud"
        aria-label={`Resync ${ENTITY_LABEL[entity]} from cloud`}
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
