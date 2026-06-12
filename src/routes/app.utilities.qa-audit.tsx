import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BUILD_LABEL, BUILD_STAMP, BUILD_NOTES } from "@/lib/build-info";
import {
  AUDIT_REGISTRY,
  summarizeAudit,
  type ButtonStatus,
  type AuditEntry,
} from "@/lib/qa/audit-registry";
import {
  ALL_WORKFLOWS,
  ALL_ECOMMERCE_WORKFLOWS,
  itemsWorkflow,
  partiesWorkflow,
  saleInvoiceWorkflow,
  posWorkflow,
  estimateWorkflow,
  purchaseWorkflow,
  expenseWorkflow,
  verifyDataChecks,
  printPdfChecks,
  permissionCheck,
  type WorkflowResult,
} from "@/lib/qa/workflows";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  XCircle,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
  PlayCircle,
  Download,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/app/utilities/qa-audit")({
  component: QaAuditPage,
});

const STATUS_META: Record<
  ButtonStatus,
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  working: {
    label: "Working",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: AlertCircle,
  },
  soon: {
    label: "Coming soon",
    tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
    icon: Clock,
  },
  broken: {
    label: "Broken",
    tone: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    icon: XCircle,
  },
  critical: {
    label: "Critical",
    tone: "bg-red-600/20 text-red-700 dark:text-red-300 border-red-600/40 font-semibold",
    icon: ShieldAlert,
  },
  not_tested: {
    label: "Not tested",
    tone: "bg-slate-400/10 text-slate-500 border-slate-400/30",
    icon: HelpCircle,
  },
};

type ProbeResult = "pending" | "ok" | "fail";

function QaAuditPage() {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ButtonStatus | "all">("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({});
  const [probing, setProbing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ButtonStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [workflowResults, setWorkflowResults] = useState<WorkflowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastTested, setLastTested] = useState<string | null>(null);

  const merged = useMemo(
    () =>
      AUDIT_REGISTRY.map((e) => ({
        ...e,
        status: overrides[e.id] ?? e.status,
        note: notes[e.id] ?? e.note,
      })),
    [overrides, notes],
  );

  const summary = summarizeAudit(merged);

  const modules = useMemo(
    () => Array.from(new Set(AUDIT_REGISTRY.map((e) => e.module))),
    [],
  );

  const filtered = useMemo<AuditEntry[]>(() => {
    const q = filter.trim().toLowerCase();
    return merged.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (!q) return true;
      return (
        e.label.toLowerCase().includes(q) ||
        e.module.toLowerCase().includes(q) ||
        (e.route || "").toLowerCase().includes(q) ||
        (e.page || "").toLowerCase().includes(q)
      );
    });
  }, [merged, filter, statusFilter, moduleFilter]);

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
    const unique = Array.from(
      new Set(AUDIT_REGISTRY.map((e) => e.route).filter(Boolean) as string[]),
    );
    await Promise.all(
      unique.map(async (route) => {
        try {
          const res = await fetch(route, { method: "HEAD", redirect: "manual" });
          const ok = res.status < 500;
          for (const e of AUDIT_REGISTRY)
            if (e.route === route) next[e.id] = ok ? "ok" : "fail";
        } catch {
          for (const e of AUDIT_REGISTRY)
            if (e.route === route) next[e.id] = "fail";
        }
      }),
    );
    setProbes(next);
    setProbing(false);
    toast.success("Route probe finished");
  };

  // Map workflow result → registry overrides
  const applyWorkflowResults = (results: WorkflowResult[]) => {
    const o = { ...overrides };
    const n = { ...notes };
    const mark = (id: string, r: WorkflowResult, critical = false) => {
      const failed = r.steps.filter((s) => s.status === "fail").length;
      const warned = r.steps.filter((s) => s.status === "warn").length;
      o[id] = failed
        ? critical
          ? "critical"
          : "broken"
        : warned
          ? "partial"
          : "working";
      n[id] = `${r.steps.length} step(s) · ${failed} fail · ${warned} warn (${r.durationMs}ms)`;
    };
    for (const r of results) {
      if (r.id === "wf-items") {
        mark("btn-item-add", r);
        mark("nav-items", r);
      } else if (r.id === "wf-parties") {
        mark("nav-parties", r);
      } else if (r.id === "wf-sale") {
        mark("btn-sale-save", r, true);
        mark("nav-sales", r);
      } else if (r.id === "wf-pos") {
        mark("btn-pos-save-sales", r, true);
        mark("btn-pos-checkout", r);
      } else if (r.id === "wf-est") {
        mark("btn-est-convert", r);
        mark("btn-est-duplicate", r);
      } else if (r.id === "wf-pur") {
        mark("btn-pur-save", r, true);
      } else if (r.id === "wf-exp") {
        mark("btn-exp-save", r);
      } else if (r.id === "wf-eco-website") {
        mark("eco-smoke-website", r);
        mark("eco-websites", r);
      } else if (r.id === "wf-eco-product") {
        mark("eco-smoke-product", r);
        mark("eco-products", r);
      } else if (r.id === "wf-eco-sync") {
        mark("eco-smoke-sync", r);
        mark("eco-sync", r);
        mark("eco-logs", r);
      } else if (r.id === "wf-eco-lifecycle") {
        mark("eco-smoke-lifecycle", r);
        mark("eco-orders", r);
        mark("eco-tracking", r);
      } else if (r.id === "wf-eco-cod") {
        mark("eco-smoke-cod", r);
        mark("eco-cod", r);
      } else if (r.id === "wf-eco-return") {
        mark("eco-smoke-return", r);
        mark("eco-returns", r);
      } else if (r.id === "wf-eco-convert") {
        mark("eco-smoke-convert", r);
        mark("eco-wf-convert", r, true);
      } else if (r.id === "wf-eco-reports") {
        mark("eco-smoke-reports", r);
        mark("eco-reports", r);
        mark("eco-pl", r);
      }
    }
    setOverrides(o);
    setNotes(n);
  };

  const runWorkflows = async (subset?: (() => Promise<WorkflowResult>)[]) => {
    setRunning(true);
    const list = subset ?? ALL_WORKFLOWS;
    const results: WorkflowResult[] = [];
    for (const wf of list) results.push(await wf());
    setWorkflowResults((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      for (const r of results) map.set(r.id, r);
      return Array.from(map.values());
    });
    applyWorkflowResults(results);
    setLastTested(new Date().toLocaleString());
    setRunning(false);
    const fails = results.filter((r) => !r.ok).length;
    fails === 0
      ? toast.success(`All ${results.length} workflows passed`)
      : toast.warning(`${fails}/${results.length} workflows reported failures`);
  };

  const runFullAudit = async () => {
    await runProbes();
    await runWorkflows();
  };

  const resetResults = () => {
    setOverrides({});
    setNotes({});
    setWorkflowResults([]);
    setProbes({});
    setLastTested(null);
    toast.info("QA results cleared");
  };

  const downloadReport = (kind: "json" | "csv") => {
    const summarySnap = summarizeAudit(merged);
    if (kind === "json") {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              generated_at: new Date().toISOString(),
              summary: summarySnap,
              entries: merged,
              workflows: workflowResults,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      triggerDownload(blob, `erpovo-qa-${stamp()}.json`);
    } else {
      const header =
        "status,module,page,label,route,kind,expected,note,fix\n";
      const rows = merged
        .map((e) =>
          [
            e.status,
            e.module,
            e.page || "",
            e.label,
            e.route || "",
            e.kind,
            e.expected || "",
            e.note || "",
            e.fix || "",
          ]
            .map(csvCell)
            .join(","),
        )
        .join("\n");
      triggerDownload(
        new Blob([header + rows], { type: "text/csv" }),
        `erpovo-qa-${stamp()}.csv`,
      );
    }
    toast.success(`QA report exported (${kind.toUpperCase()})`);
  };

  // Top 10 fixes: critical + broken + partial, ordered
  const topFixes = useMemo(() => {
    const order: Record<ButtonStatus, number> = {
      critical: 0,
      broken: 1,
      partial: 2,
      soon: 3,
      not_tested: 4,
      working: 5,
    };
    return [...merged]
      .filter((e) =>
        ["critical", "broken", "partial"].includes(e.status as string),
      )
      .sort((a, b) => order[a.status] - order[b.status])
      .slice(0, 10);
  }, [merged]);

  return (
    <div className="space-y-4">
      {/* Stable Build banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
            {BUILD_LABEL}
          </div>
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          >
            {BUILD_STAMP}
          </Badge>
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {BUILD_NOTES.map((n: string) => (
            <span key={n} className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              {n}
            </span>
          ))}
        </div>
      </div>

      <PageHeader
        title="ERPOVO Functional QA Audit"
        subtitle="Verify every menu, submenu, route, button and core workflow"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={runFullAudit} disabled={probing || running}>
              <PlayCircle className="w-4 h-4 mr-1.5" />
              Run Full Audit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runProbes}
              disabled={probing}
            >
              {probing ? "Probing…" : "Probe Routes"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                runWorkflows([
                  itemsWorkflow,
                  partiesWorkflow,
                  saleInvoiceWorkflow,
                  posWorkflow,
                  estimateWorkflow,
                  purchaseWorkflow,
                  expenseWorkflow,
                ])
              }
              disabled={running}
            >
              Test CRUD Workflows
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runWorkflows(ALL_ECOMMERCE_WORKFLOWS)}
              disabled={running}
            >
              Test Ecommerce Workflows
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runWorkflows([printPdfChecks])}
              disabled={running}
            >
              Test Print/PDF/Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runWorkflows([verifyDataChecks, permissionCheck])}
              disabled={running}
            >
              Test Buttons
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                toast.info("Running CI smoke suite in browser…");
                await runWorkflows(ALL_WORKFLOWS);
                toast.message("CLI equivalent: bun run qa:smoke");
              }}
              disabled={running}
            >
              <PlayCircle className="w-4 h-4 mr-1.5" />
              Run CI Smoke Tests
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadReport("csv")}>
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => downloadReport("json")}>
              <Download className="w-4 h-4 mr-1.5" />
              Export JSON
            </Button>
            <Button size="sm" variant="ghost" onClick={resetResults}>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reset
            </Button>
          </div>
        }
      />

      {/* Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Tile label="Menus checked" value={summary.menus} />
        <Tile label="Buttons checked" value={summary.buttons} />
        <Tile label="Working" value={summary.working} tone="text-emerald-600" />
        <Tile label="Partial" value={summary.partial} tone="text-amber-600" />
        <Tile label="Coming Soon" value={summary.soon} tone="text-slate-500" />
        <Tile label="Broken" value={summary.broken} tone="text-red-600" />
        <Tile label="Critical" value={summary.critical} tone="text-red-700" />
        <Tile label="Not Tested" value={summary.notTested} tone="text-slate-400" />
      </div>

      {lastTested && (
        <div className="text-xs text-muted-foreground">
          Last tested: {lastTested}
        </div>
      )}

      {/* Top fixes */}
      {topFixes.length > 0 && (
        <div className="bg-card border rounded-md">
          <div className="px-4 py-2 border-b bg-muted/30 font-semibold text-sm">
            Top {topFixes.length} fixes needed
          </div>
          <ol className="p-3 list-decimal pl-8 space-y-1 text-sm">
            {topFixes.map((e) => (
              <li key={e.id}>
                <span className="font-medium">{e.module}</span> · {e.label}{" "}
                <Badge variant="outline" className={STATUS_META[e.status].tone}>
                  {STATUS_META[e.status].label}
                </Badge>{" "}
                {e.fix && (
                  <span className="text-xs text-muted-foreground">— {e.fix}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center p-3 bg-card border rounded-md">
        <Input
          placeholder="Filter by label, module, route…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 max-w-xs"
        />
        <select
          className="h-9 px-2 border rounded-md text-sm bg-background"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {(
          ["all", "working", "partial", "soon", "broken", "critical", "not_tested"] as const
        ).map((s) => (
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

      {/* Workflow results */}
      {workflowResults.length > 0 && (
        <div className="bg-card border rounded-md overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/30 font-semibold text-sm">
            Workflow results
          </div>
          <div className="divide-y">
            {workflowResults.map((r) => (
              <details key={r.id} className="px-4 py-2">
                <summary className="cursor-pointer flex items-center gap-2 text-sm">
                  {r.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.steps.length} steps · {r.durationMs}ms
                  </span>
                </summary>
                <ul className="ml-6 mt-2 space-y-0.5 text-xs">
                  {r.steps.map((s, i) => (
                    <li key={i}>
                      <span
                        className={
                          s.status === "pass"
                            ? "text-emerald-600"
                            : s.status === "fail"
                              ? "text-red-600"
                              : s.status === "warn"
                                ? "text-amber-600"
                                : "text-slate-500"
                        }
                      >
                        [{s.status}]
                      </span>{" "}
                      {s.name}
                      {s.detail && (
                        <span className="text-muted-foreground"> — {s.detail}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Audit grouped table */}
      <div className="space-y-4">
        {moduleGroups.map(([mod, items]) => (
          <div key={mod} className="bg-card border rounded-md overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/30 font-semibold text-sm flex items-center justify-between">
              <span>{mod}</span>
              <span className="text-xs text-muted-foreground">{items.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Button / feature</th>
                    <th>Page</th>
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
                        <td className="text-xs uppercase text-muted-foreground">
                          {e.kind}
                        </td>
                        <td className="font-medium">{e.label}</td>
                        <td className="text-xs">{e.page || "—"}</td>
                        <td className="text-xs">
                          {e.route ? (
                            <Link
                              to={e.route}
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {e.route}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-xs">
                          {probe === "ok" ? (
                            <span className="text-emerald-600">✓</span>
                          ) : probe === "fail" ? (
                            <span className="text-red-600">✗</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-xs text-muted-foreground max-w-md">
                          {e.note || e.expected || ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="bg-card border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${tone || ""}`}>{value}</div>
    </div>
  );
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function csvCell(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
