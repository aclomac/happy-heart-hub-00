/**
 * Unified Sync Center.
 *
 * Single dashboard showing every transaction-sync kind that's wired up:
 *   • Sales invoices  (Phase A)
 *   • Stock movements (Phase C)
 *   • Purchases       (Phase D)
 *   • Payments In/Out (Phase F)
 *
 * Renders pending / syncing / failed / synced counts per kind plus a
 * single "Replay offline queue" button. In Local Mode shows a friendly
 * note — cloud sync is intentionally disabled.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CloudOff, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OfflineQueueReplayButton } from "@/components/erp/OfflineQueueReplayButton";

import { useCurrentCompanyId } from "@/lib/use-company";
import { getLaunchMode } from "@/lib/launch-mode";
import { listRecords } from "@/lib/transaction-sync";
import type { TxnKind, TxnSyncRecord } from "@/lib/transaction-sync/types";

export const Route = createFileRoute("/app/sync-center")({
  component: SyncCenterPage,
});

type Section = {
  kind: TxnKind;
  label: string;
  description: string;
};

const SECTIONS: Section[] = [
  { kind: "sale_invoice", label: "Sales invoices", description: "POS + invoice cloud sync" },
  { kind: "stock_movement", label: "Stock movements", description: "Mirrors already-applied local stock changes" },
  { kind: "purchase", label: "Purchases", description: "Purchase bills + line items" },
  { kind: "payment_in", label: "Payments In", description: "Receipts from customers" },
  { kind: "payment_out", label: "Payments Out", description: "Disbursements to suppliers / expenses" },
];

function summarize(records: TxnSyncRecord[]) {
  const init = { pending: 0, syncing: 0, synced: 0, failed: 0 };
  for (const r of records) {
    if (r.status in init) (init as Record<string, number>)[r.status] += 1;
  }
  return init;
}

function SyncCenterPage() {
  const companyId = useCurrentCompanyId();
  const [tick, setTick] = useState(0);

  // Refresh on cross-tab storage events + a soft poll so newly synced
  // rows reflect without manual navigation.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setTick((n) => n + 1);
    window.addEventListener("storage", refresh);
    const id = window.setInterval(refresh, 2000);
    return () => {
      window.removeEventListener("storage", refresh);
      window.clearInterval(id);
    };
  }, []);

  const mode = getLaunchMode();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sync Center"
        subtitle="Monitor and retry cloud sync across all transaction types."
      />

      {mode !== "cloud" ? (
        <Card data-testid="sync-center-local-mode">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <CloudOff className="h-5 w-5" />
            Cloud Sync is only available in Cloud Mode. All data stays on this device.
          </CardContent>
        </Card>
      ) : !companyId ? (
        <NoCompanySelected />
      ) : (
        <>
          <div className="flex justify-end">
            <OfflineQueueReplayButton companyId={companyId} />
          </div>
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="sync-center-grid"
            data-tick={tick}
          >
            {SECTIONS.map((s) => {
              const recs = listRecords({ kind: s.kind, companyId });
              const c = summarize(recs);
              const outstanding = c.pending + c.syncing + c.failed;
              return (
                <Card key={s.kind} data-testid={`sync-section-${s.kind}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{s.label}</CardTitle>
                      {outstanding > 0 ? (
                        <Badge variant={c.failed > 0 ? "destructive" : "secondary"}>
                          {outstanding} pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          all clear
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-2 text-center text-xs">
                    <Stat label="Pending" value={c.pending} testId={`${s.kind}-pending`} />
                    <Stat label="Syncing" value={c.syncing} testId={`${s.kind}-syncing`} />
                    <Stat
                      label="Failed"
                      value={c.failed}
                      tone={c.failed > 0 ? "danger" : "muted"}
                      testId={`${s.kind}-failed`}
                    />
                    <Stat label="Synced" value={c.synced} testId={`${s.kind}-synced`} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> Counts refresh every 2 seconds.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
  testId,
}: {
  label: string;
  value: number;
  tone?: "default" | "muted" | "danger";
  testId?: string;
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-md bg-muted/40 px-1.5 py-1">
      <div className={`text-base font-semibold ${color}`} data-testid={testId}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
