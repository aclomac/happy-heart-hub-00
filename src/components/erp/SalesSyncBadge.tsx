/**
 * Per-row cloud sync status badge for a sales invoice.
 *
 * Looks up the local sync record by either `localId` or `cloudId` and
 * renders a small badge reflecting the latest known status. Tooltip
 * surfaces the safe error text + last sync time.
 *
 * In Local Mode this renders nothing — the message "Cloud Sync is only
 * available in Cloud Mode." lives on the SalesSyncStatusBar.
 */
import { cn } from "@/lib/utils";
import { getLaunchMode } from "@/lib/launch-mode";
import {
  getSalesRecord,
  getSalesRecordByCloudId,
} from "@/lib/transaction-sync/sales";
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
  // Keep PII / SQL details out of the tooltip — truncate and strip any
  // postgres position markers / stack hints.
  const m = msg.split("\n")[0]!.replace(/\s+at\s+.*$/i, "").trim();
  return m.length > 140 ? `${m.slice(0, 140)}…` : m;
}

export function SalesSyncBadge({
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
  if (localId) rec = getSalesRecord(localId);
  if (!rec && companyId && cloudId) {
    rec = getSalesRecordByCloudId(companyId, cloudId);
  }

  // A cloud row with no local record on THIS device is treated as already
  // synced from elsewhere; rendering nothing keeps the table uncluttered.
  if (!rec) return null;

  const label = labels[rec.status];
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
      data-testid={`sales-sync-badge-${rec.status}`}
      data-sales-sync-status={rec.status}
      title={tooltipParts.join(" · ")}
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap",
        styles[rec.status] ?? styles.unknown,
        className,
      )}
    >
      {label}
    </span>
  );
}
