/**
 * Per-row cloud sync status badge for a stock_movement.
 *
 * Mirrors SalesSyncBadge: in Local Mode renders nothing (the status bar
 * shows the "only in Cloud Mode" notice). In Cloud Mode, looks up the
 * local sync record by `localId` or `cloudId` and renders the current
 * pending/syncing/synced/failed state with a safe error tooltip.
 */
import { cn } from "@/lib/utils";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getStockRecord,
  getStockRecordByCloudId,
} from "@/lib/transaction-sync/stock";
import type { TxnSyncRecord, TxnSyncState } from "@/lib/transaction-sync/types";

const styles: Record<TxnSyncState | "unknown", string> = {
  synced: "bg-success/15 text-success border-success/30",
  syncing: "bg-primary/10 text-primary border-primary/30",
  pending: "bg-warning/20 text-foreground border-warning/40",
  failed: "bg-destructive/15 text-destructive border-destructive/40",
  unknown: "bg-muted text-muted-foreground border-border",
};

const labels: Record<TxnSyncState, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  pending: "Pending",
  failed: "Failed",
};

function safeError(msg: string | null | undefined): string {
  if (!msg) return "";
  const m = msg.split("\n")[0]!.replace(/\s+at\s+.*$/i, "").trim();
  return m.length > 140 ? `${m.slice(0, 140)}…` : m;
}

export function StockSyncBadge({
  localId,
  cloudId,
  companyId,
  className,
}: {
  localId?: string | null;
  cloudId?: string | null;
  companyId?: string | null;
  className?: string;
}) {
  if (getLaunchMode() !== "cloud") return null;

  let rec: TxnSyncRecord | null = null;
  if (localId) rec = getStockRecord(localId);
  if (!rec && companyId && cloudId) {
    rec = getStockRecordByCloudId(companyId, cloudId);
  }
  if (!rec) return null;

  const tooltipParts: string[] = [];
  if (rec.updated_at) {
    try {
      tooltipParts.push(`Updated ${new Date(rec.updated_at).toLocaleString()}`);
    } catch {
      /* ignore */
    }
  }
  if (rec.status === "failed") {
    const err = safeError(rec.last_error);
    if (err) tooltipParts.push(err);
  }

  return (
    <span
      data-testid={`stock-sync-badge-${rec.status}`}
      data-stock-sync-status={rec.status}
      title={tooltipParts.join(" · ")}
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap",
        styles[rec.status] ?? styles.unknown,
        className,
      )}
    >
      {labels[rec.status]}
    </span>
  );
}
