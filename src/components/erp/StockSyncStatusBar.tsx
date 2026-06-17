/**
 * Top-of-list status bar for stock_movement cloud sync.
 *
 * Mirrors SalesSyncStatusBar. Cloud Mode + outstanding rows → summary +
 * Replay action. Local Mode → informational notice.
 */
import { useEffect, useState } from "react";
import { getLaunchMode } from "@/lib/launch-mode";
import { listStockSyncRecords } from "@/lib/transaction-sync/stock";
import { OfflineQueueReplayButton } from "./OfflineQueueReplayButton";

export function StockSyncStatusBar({ companyId }: { companyId?: string | null }) {
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
        data-testid="stock-sync-local-mode-note"
      >
        Cloud Sync is only available in Cloud Mode.
      </div>
    );
  }

  if (!companyId) return null;

  const records = listStockSyncRecords(companyId);
  const pending = records.filter((r) => r.status === "pending").length;
  const syncing = records.filter((r) => r.status === "syncing").length;
  const failed = records.filter((r) => r.status === "failed").length;
  const outstanding = pending + syncing + failed;
  if (outstanding === 0) return null;

  return (
    <div
      className="mb-2 rounded-md border border-border bg-card px-3 py-2 text-xs space-y-2"
      data-testid="stock-sync-status-bar"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Stock cloud sync</span>
        {pending > 0 && (
          <span data-testid="stock-sync-count-pending">
            Pending: <span className="font-semibold">{pending}</span>
          </span>
        )}
        {syncing > 0 && (
          <span data-testid="stock-sync-count-syncing">
            Syncing: <span className="font-semibold">{syncing}</span>
          </span>
        )}
        {failed > 0 && (
          <span className="text-destructive" data-testid="stock-sync-count-failed">
            Failed: <span className="font-semibold">{failed}</span>
          </span>
        )}
      </div>
      <OfflineQueueReplayButton companyId={companyId} />
    </div>
  );
}
