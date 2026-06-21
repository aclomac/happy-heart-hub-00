/**
 * Unified Sync Center.
 *
 * Shows pending / syncing / failed / synced counts per transaction kind,
 * cloud connection status, and a conflict log. No user-facing
 * "Local Mode" / "Cloud Mode" wording — sync is always on for real
 * users; demo sessions stay local automatically.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, RefreshCw, XCircle, AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OfflineQueueReplayButton } from "@/components/erp/OfflineQueueReplayButton";

import { useCurrentCompanyId } from "@/lib/use-company";
import { listRecords } from "@/lib/transaction-sync";
import { getCloudSyncAdapter } from "@/lib/transaction-sync/cloud-adapter";
import type { TxnKind, TxnSyncRecord } from "@/lib/transaction-sync/types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/sync-center")({
  component: SyncCenterPage,
});

type Section = { kind: TxnKind; label: string; description: string };

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

type ConnState = "unknown" | "checking" | "ok" | "error";

function SyncCenterPage() {
  const companyId = useCurrentCompanyId();
  const [tick, setTick] = useState(0);
  const [conn, setConn] = useState<ConnState>("unknown");
  const [connError, setConnError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Array<{
    id: string;
    table_name: string;
    record_id: string;
    reason: string | null;
    created_at: string;
  }>>([]);

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

  const runConnectionTest = async () => {
    setConn("checking");
    setConnError(null);
    const res = await getCloudSyncAdapter().testConnection();
    if (res.ok) setConn("ok");
    else {
      setConn("error");
      setConnError(res.error);
    }
  };

  useEffect(() => {
    void runConnectionTest();
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("sync_conflicts")
        .select("id,table_name,record_id,reason,created_at")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled) setConflicts((data as typeof conflicts) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, tick]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sync Center"
        subtitle="Monitor and retry cloud sync across all transaction types."
      />

      <Card data-testid="sync-connection-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Cloud connection</CardTitle>
            <ConnectionBadge state={conn} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {connError ? <span className="text-destructive">{connError}</span> : null}
          <Button
            size="sm"
            variant="outline"
            onClick={runConnectionTest}
            disabled={conn === "checking"}
            data-testid="sync-test-connection"
          >
            {conn === "checking" ? "Testing…" : "Test connection"}
          </Button>
        </CardContent>
      </Card>

      {!companyId ? (
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

          <Card data-testid="sync-conflicts-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Conflict log
                </CardTitle>
                <Badge variant={conflicts.length > 0 ? "destructive" : "outline"}>
                  {conflicts.length} open
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {conflicts.length === 0 ? (
                <p className="text-muted-foreground">No open conflicts.</p>
              ) : (
                conflicts.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-border bg-muted/30 p-2"
                    data-testid={`conflict-${c.id}`}
                  >
                    <div className="font-medium">
                      {c.table_name} · {c.record_id}
                    </div>
                    <div className="text-muted-foreground">
                      {c.reason ?? "no reason"} · {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> Counts refresh every 2 seconds.
          </p>
        </>
      )}
    </div>
  );
}

function ConnectionBadge({ state }: { state: ConnState }) {
  if (state === "ok")
    return (
      <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/40">
        <CheckCircle2 className="h-3 w-3" /> Connected
      </Badge>
    );
  if (state === "error")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Error
      </Badge>
    );
  if (state === "checking")
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <RefreshCw className="h-3 w-3 animate-spin" /> Checking
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Unknown
    </Badge>
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
