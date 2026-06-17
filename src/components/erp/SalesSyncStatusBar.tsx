/**
 * Top-of-list status bar for sales cloud sync.
 *
 *   • Cloud Mode + any pending/syncing/failed records → renders a small
 *     summary with the Replay offline queue action.
 *   • Cloud Mode + nothing pending → renders nothing.
 *   • Local Mode → renders an informational note that cloud sync is
 *     unavailable, so users aren't left wondering why no badges appear.
 */
import { useEffect, useState } from "react";
import { getLaunchMode } from "@/lib/launch-mode";
import { listSalesSyncRecords } from "@/lib/transaction-sync/sales";
import { OfflineQueueReplayButton } from "./OfflineQueueReplayButton";

export function SalesSyncStatusBar({ companyId }: { companyId?: string | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => force((n) => n + 1);
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const mode = getLaunchMode();
  if (mode !== "cloud") {
    return (
      <div
        className="mb-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground"
        data-testid="sales-sync-local-mode-note"
      >
        Cloud Sync is only available in Cloud Mode.
      </div>
    );
  }

  if (!companyId) return null;

  const records = listSalesSyncRecords(companyId);
  const pending = records.filter((r) => r.status === "pending").length;
  const syncing = records.filter((r) => r.status === "syncing").length;
  const failed = records.filter((r) => r.status === "failed").length;
  const outstanding = pending + syncing + failed;
  if (outstanding === 0) return null;

  return (
    <div
      className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs space-y-2"
      data-testid="sales-sync-status-bar"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Cloud sync</span>
        {pending > 0 && (
          <span data-testid="sales-sync-count-pending">
            Pending: <span className="font-semibold">{pending}</span>
          </span>
        )}
        {syncing > 0 && (
          <span data-testid="sales-sync-count-syncing">
            Syncing: <span className="font-semibold">{syncing}</span>
          </span>
        )}
        {failed > 0 && (
          <span className="text-destructive" data-testid="sales-sync-count-failed">
            Failed: <span className="font-semibold">{failed}</span>
          </span>
        )}
      </div>
      <OfflineQueueReplayButton companyId={companyId} />
    </div>
  );
}
