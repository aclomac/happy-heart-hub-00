import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AUDIT_REGISTRY, summarizeAudit, type ButtonStatus, type AuditEntry } from "@/lib/qa/audit-registry";
import { CheckCircle2, AlertCircle, Clock, XCircle, ExternalLink, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/app/utilities/qa-audit")({ component: QaAuditPage });

const STATUS_META: Record<ButtonStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  working: { label: "Working", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  partial: { label: "Partial", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: AlertCircle },
  soon: { label: "Coming soon", tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30", icon: Clock },
  broken: { label: "Broken", tone: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30", icon: XCircle },
};

type ProbeResult = "pending" | "ok" | "fail";

function QaAuditPage() {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ButtonStatus | "all">("all");
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState(false);

  const summary = summarizeAudit();

  const filtered = useMemo<AuditEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    return AUDIT_REGISTRY.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.label.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q) ||
        (e.route || "").toLowerCase().includes(q)
      );
    });
  }, [filter, statusFilter]);

  const moduleGroups = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.module) || [];
      list.push(e);
      map.set(e.module, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const runProbes = async () => {
    setProbing(true);
    const next: Record<string, ProbeResult> = {};
    const unique = Array.from(new Set(AUDIT_REGISTRY.map((e) => e.route).filter(Boolean) as string[]));
    await Promise.all(
      unique.map(async (route) => {
        try {
          const res = await fetch(route, { method: "HEAD", redirect: "manual" });
          const ok = res.status < 500;
          for (const e of AUDIT_REGISTRY) if (e.route === route) next[e.id] = ok ? "ok" : "fail";
        } catch {
          for (const e of AUDIT_REGISTRY) if (e.route === route) next[e.id] = "fail";
        }
      }),
    );
    setProbes(next);
    setProbing(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="QA Audit"
        subtitle="Module-by-module status of every audited button and route"
        actions={
          <Button size="sm" onClick={runProbes} disabled={probing}>
            <PlayCircle className="w-4 h-4 mr-1.5" />
            {probing ? "Probing…" : "Probe routes"}
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile label="Total audited" value={summary.total} />
        <SummaryTile label="Working" value={summary.working} tone="text-emerald-600" />
        <SummaryTile label="Partial" value={summary.partial} tone="text-amber-600" />
        <SummaryTile label="Coming soon" value={summary.soon} tone="text-slate-500" />
        <SummaryTile label="Broken" value={summary.broken} tone="text-red-600" />
      </div>

      <div className="flex flex-wrap gap-2 items-center p-3 bg-card border rounded-md">
        <Input
          placeholder="Filter by label, module, route…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 max-w-xs"
        />
        {(["all", "working", "partial", "soon", "broken"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All" : STATUS_META[s].label}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {moduleGroups.map(([mod, items]) => (
          <div key={mod} className="bg-card border rounded-md overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/30 font-semibold text-sm flex items-center justify-between">
              <span>{mod}</span>
              <span className="text-xs text-muted-foreground">{items.length} items</span>
            </div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Button / action</th>
                  <th>Route</th>
                  <th>Probe</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const meta = STATUS_META[e.status];
                  const Icon = meta.icon;
                  const probe = probes[e.id];
                  return (
                    <tr key={e.id}>
                      <td>
                        <Badge variant="outline" className={`gap-1 ${meta.tone}`}>
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="font-medium">{e.label}</td>
                      <td className="text-xs">
                        {e.route ? (
                          <Link to={e.route} className="text-primary hover:underline inline-flex items-center gap-1">
                            {e.route}
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {probe === "ok" ? (
                          <span className="text-emerald-600">✓ reachable</span>
                        ) : probe === "fail" ? (
                          <span className="text-red-600">✗ failed</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground max-w-md">{e.note || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {moduleGroups.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground bg-card border rounded-md">
            No entries match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-card border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${tone || ""}`}>{value}</div>
    </div>
  );
}
