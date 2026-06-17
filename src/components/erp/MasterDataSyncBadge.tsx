/**
 * Master data sync badge — Phase 2.
 *
 * Tiny inline indicator shown in master-data page headers. Reflects the
 * adapter's per-entity sync state from localStorage.
 */
import { Check, CloudOff, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  useMasterDataSyncStatus,
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

export function MasterDataSyncBadge({
  entity,
  className,
}: {
  entity: MasterEntity;
  className?: string;
}) {
  const status = useMasterDataSyncStatus(entity);
  const mode = getLaunchMode();

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

  if (status.state === "failed") {
    return (
      <span
        className={cn(base, "bg-destructive/10 text-destructive", className)}
        title={status.error ?? "Sync failed"}
        data-testid={`sync-badge-${entity}`}
      >
        <TriangleAlert className="h-3 w-3" />
        Sync failed
      </span>
    );
  }
  if (status.state === "syncing") {
    return (
      <span
        className={cn(base, "bg-muted text-muted-foreground", className)}
        data-testid={`sync-badge-${entity}`}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing…
      </span>
    );
  }
  if (status.state === "pending" || status.pendingChanges > 0) {
    return (
      <span
        className={cn(base, "bg-amber-500/10 text-amber-600", className)}
        data-testid={`sync-badge-${entity}`}
      >
        <RotateCw className="h-3 w-3" />
        {status.pendingChanges} pending
      </span>
    );
  }
  if (status.state === "synced" && status.lastSyncedAt) {
    return (
      <span
        className={cn(base, "bg-emerald-500/10 text-emerald-600", className)}
        title={`Last synced ${new Date(status.lastSyncedAt).toLocaleString()}`}
        data-testid={`sync-badge-${entity}`}
      >
        <Check className="h-3 w-3" />
        Synced · {relativeTime(status.lastSyncedAt)}
      </span>
    );
  }
  return (
    <span
      className={cn(base, "bg-muted text-muted-foreground", className)}
      data-testid={`sync-badge-${entity}`}
    >
      <CloudOff className="h-3 w-3" />
      Idle
    </span>
  );
}
