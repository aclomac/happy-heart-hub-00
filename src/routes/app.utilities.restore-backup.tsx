import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import {
  readErpovoBackup,
  importErpovoBackup,
  SAFE_TABLES,
  type ErpovoBackupPreview,
  type SafeTable,
} from "@/lib/erpovo-backup";
import {
  FileArchive,
  PlayCircle,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Lock,
  Trash2,
  ListChecks,
} from "lucide-react";

export const Route = createFileRoute("/app/utilities/restore-backup")({
  component: RestoreBackupPage,
});

// Money-impacting tables that are intentionally blocked from the safe restore flow.
// Enforced at logic level — even if a future UI change tries to include them, the
// restore/dry-run pipelines strip them before any DB call.
const DISABLED_TABLES: ReadonlySet<string> = new Set([
  "sales",
  "sale_invoices",
  "sale_orders",
  "purchases",
  "purchase_invoices",
  "purchase_orders",
  "stock_movements",
  "payments",
  "payments_in",
  "payments_out",
  "payment_in",
  "payment_out",
]);
const DISABLED_MESSAGE =
  "Sales/Purchases restore is disabled for safety. Use advanced restore after extra confirmation.";

function filterDisabled<T extends string>(tables: T[]): { allowed: T[]; blocked: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];
  for (const t of tables) (DISABLED_TABLES.has(t) ? blocked : allowed).push(t);
  return { allowed, blocked };
}

type RestoreMode = "merge" | "replace";
type TableFilter = "all" | "items" | "parties" | "sales" | "purchases" | "stock" | "settings";

const FILTER_MAP: Record<TableFilter, readonly SafeTable[]> = {
  all: SAFE_TABLES,
  items: ["items", "item_categories", "units"],
  parties: ["parties", "party_groups"],
  sales: [],
  purchases: [],
  stock: ["warehouses", "item_store_stock"],
  settings: ["other_income_categories"],
};

type Safety = "safe" | "medium" | "money";
const TABLE_SAFETY: Record<string, Safety> = {
  items: "medium",
  item_categories: "safe",
  units: "safe",
  parties: "medium",
  party_groups: "safe",
  warehouses: "safe",
  item_store_stock: "money",
  other_income_categories: "safe",
  other_incomes: "money",
};

function SafetyBadge({ s }: { s: Safety }) {
  if (s === "safe") return <Badge variant="secondary" className="text-[10px]">Safe</Badge>;
  if (s === "medium") return <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">Medium Risk</Badge>;
  return <Badge variant="destructive" className="text-[10px]">Money Impacting</Badge>;
}

type HistoryEntry = {
  ts: string;
  file: string;
  mode: RestoreMode | "—";
  filter: TableFilter;
  tables: string[];
  dryRun: boolean;
  inserted: number;
  skipped: number;
  errors: number;
  status: "done" | "failed" | "dry-run" | "cancelled";
};

const HISTORY_KEY_PREFIX = "erpovo:restore-history:";
function historyKey(companyId: string) {
  return `${HISTORY_KEY_PREFIX}${companyId}`;
}
function loadHistory(companyId: string): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(historyKey(companyId)) ?? "[]"); } catch { return []; }
}
function pushHistory(companyId: string, entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  const list = [entry, ...loadHistory(companyId)].slice(0, 100);
  localStorage.setItem(historyKey(companyId), JSON.stringify(list));
}
function clearHistory(companyId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(historyKey(companyId));
}

type ProgressRow = { table: string; inserted: number; skipped: number; status: "pending" | "running" | "done" | "failed"; error?: string };

type ConflictRow = {
  table: string;
  total: number;
  willInsert: number;
  willSkip: number;
  conflicts: { reason: string; sample: string[] }[];
};

// Per-table conflict keys for duplicate detection.
const CONFLICT_KEYS: Record<string, string[]> = {
  items: ["item_code", "sku", "barcode", "name"],
  item_categories: ["name"],
  units: ["name", "short_name"],
  parties: ["mobile", "email", "name"],
  party_groups: ["name"],
  warehouses: ["name"],
  item_store_stock: [], // composite; skip detailed checks
  other_income_categories: ["name"],
  other_incomes: ["reference_no"],
};

async function buildConflictPreview(
  preview: ErpovoBackupPreview,
  companyId: string,
  tables: SafeTable[],
): Promise<ConflictRow[]> {
  const out: ConflictRow[] = [];
  for (const t of tables) {
    const rows = preview.data[t] ?? [];
    const keys = CONFLICT_KEYS[t] ?? [];
    const conflictsByReason = new Map<string, string[]>();
    let willSkip = 0;

    for (const key of keys) {
      const values = Array.from(
        new Set(
          rows
            .map((r) => (r as Record<string, unknown>)[key])
            .filter((v): v is string | number => v !== null && v !== undefined && v !== ""),
        ),
      ).slice(0, 500);
      if (values.length === 0) continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = (supabase.from(t) as any)
          .select(`${key}`)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .in(key, values);
        const { data: existing, error } = await q;
        if (error || !existing) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingSet = new Set((existing as any[]).map((r) => String(r[key])));
        const dups = values.filter((v) => existingSet.has(String(v))).map(String);
        if (dups.length) {
          conflictsByReason.set(`duplicate ${key}`, dups.slice(0, 8));
          willSkip += dups.length;
        }
      } catch {
        // ignore per-key failures
      }
    }

    const total = rows.length;
    const willInsert = Math.max(0, total - willSkip);
    out.push({
      table: t,
      total,
      willInsert,
      willSkip,
      conflicts: Array.from(conflictsByReason.entries()).map(([reason, sample]) => ({ reason, sample })),
    });
  }
  return out;
}

function RestoreBackupPage() {
  const companyId = useCurrentCompanyId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ErpovoBackupPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [filter, setFilter] = useState<TableFilter>("all");
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("idle");
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [summary, setSummary] = useState<HistoryEntry | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[] | null>(null);
  const [dryRunCompleted, setDryRunCompleted] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => (companyId ? loadHistory(companyId) : []));

  // Strip disabled (money-impacting) tables from selection regardless of UI state.
  const tableSelection = useMemo(() => {
    const allow = new Set(FILTER_MAP[filter]);
    const raw = preview
      ? (Object.keys(preview.data) as SafeTable[]).filter(
          (t) => (SAFE_TABLES as readonly string[]).includes(t) && allow.has(t),
        )
      : ([...allow] as SafeTable[]);
    return filterDisabled(raw);
  }, [filter, preview]);
  const selectedTables = tableSelection.allowed;

  // Tables present in uploaded backup that are blocked by safety policy.
  const lockedTablesInBackup = useMemo(() => {
    if (!preview) return [] as string[];
    return Object.keys(preview.data).filter((t) => DISABLED_TABLES.has(t));
  }, [preview]);

  const totalRows = useMemo(() => {
    if (!preview) return 0;
    return selectedTables.reduce((n, t) => n + (preview.data[t]?.length ?? 0), 0);
  }, [preview, selectedTables]);

  if (!companyId) return <NoCompanySelected />;

  async function onPickFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setParseError(null);
    setSummary(null);
    setConflicts(null);
    setDryRunCompleted(false);
    setRows([]);
    setPhase("idle");
    if (!f) return;
    try {
      setPhase("validating backup");
      const p = await readErpovoBackup(f);
      setPreview(p);
      setPhase("ready");
    } catch (e) {
      setParseError(
        "This backup ZIP does not contain snapshot data. Please use a backup with snapshot/manifest.json and snapshot/data.json.",
      );
      setPhase("failed");
      toast.error("Invalid backup");
      void e;
    }
  }

  async function doDryRun() {
    if (!preview || !companyId) return;
    setBusy(true);
    setPhase("analyzing conflicts");
    try {
      const safeTables = filterDisabled(selectedTables).allowed;
      if (safeTables.length !== selectedTables.length) toast.warning(DISABLED_MESSAGE);
      const result = await buildConflictPreview(preview, companyId, safeTables);
      setConflicts(result);
      const totalSkip = result.reduce((a, r) => a + r.willSkip, 0);
      const totalIns = result.reduce((a, r) => a + r.willInsert, 0);
      const entry: HistoryEntry = {
        ts: new Date().toISOString(),
        file: file?.name ?? "(unknown)",
        mode: "—",
        filter,
        tables: selectedTables,
        dryRun: true,
        inserted: totalIns,
        skipped: totalSkip,
        errors: 0,
        status: "dry-run",
      };
      setSummary(entry);
      pushHistory(companyId, entry);
      setHistory(loadHistory(companyId));
      setPhase("dry run complete");
      toast.success(`Dry run: ${totalIns} insertable, ${totalSkip} duplicates`);
    } catch (e) {
      toast.error(`Dry run failed: ${(e as Error).message}`);
      setPhase("failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    if (!preview || !companyId) return;
    if (!confirm || typed.trim().toUpperCase() !== "RESTORE") {
      toast.error("Please tick the checkbox and type RESTORE to confirm.");
      return;
    }
    setBusy(true);
    setPhase("reading snapshot");
    const progress: ProgressRow[] = selectedTables.map((t) => ({
      table: t, inserted: 0, skipped: 0, status: "pending",
    }));
    setRows(progress);

    let totalIn = 0, totalSkip = 0, totalErr = 0;
    try {
      if (mode === "replace") {
        setPhase("clearing existing data (replace mode)");
        for (const t of selectedTables) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from(t) as any)
            .update({ deleted_at: new Date().toISOString() })
            .eq("company_id", companyId)
            .is("deleted_at", null);
          if (error) totalErr++;
        }
      }

      for (let i = 0; i < selectedTables.length; i++) {
        const t = selectedTables[i];
        setPhase(`restoring ${t}`);
        progress[i] = { ...progress[i], status: "running" };
        setRows([...progress]);
        try {
          const res = await importErpovoBackup(preview, companyId, [t]);
          const r = res[0] ?? { table: t, inserted: 0, skipped: 0 };
          progress[i] = { table: t, inserted: r.inserted, skipped: r.skipped, status: "done" };
          totalIn += r.inserted;
          totalSkip += r.skipped;
        } catch (e) {
          progress[i] = { ...progress[i], status: "failed", error: (e as Error).message };
          totalErr++;
        }
        setRows([...progress]);
      }

      const entry: HistoryEntry = {
        ts: new Date().toISOString(),
        file: file?.name ?? "(unknown)",
        mode,
        filter,
        tables: selectedTables,
        dryRun: false,
        inserted: totalIn,
        skipped: totalSkip,
        errors: totalErr,
        status: totalErr > 0 ? "failed" : "done",
      };
      setSummary(entry);
      pushHistory(companyId, entry);
      setHistory(loadHistory(companyId));
      setPhase(totalErr > 0 ? "failed" : "completed");
      if (totalErr > 0) toast.error(`Restore finished with ${totalErr} errors`);
      else toast.success(`Restore complete: ${totalIn} inserted, ${totalSkip} skipped`);
    } finally {
      setBusy(false);
    }
  }

  const doneCount = rows.filter((r) => r.status === "done" || r.status === "failed").length;
  const pct = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Restore Backup" subtitle="Restore company data from an ERPOVO backup ZIP" />

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileArchive className="w-4 h-4" /> 1. Upload backup</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip,application/json,.json"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          {parseError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
          {preview && (
            <div className="text-sm text-muted-foreground space-y-1">
              <div><b>File:</b> {file?.name}</div>
              <div><b>Source company:</b> {preview.manifest.company_id ?? "—"}</div>
              <div><b>Exported at:</b> {preview.manifest.exported_at ?? "—"}</div>
              <div className="flex flex-wrap gap-1 items-center">
                <b className="mr-1">Tables in backup:</b>
                {preview.manifest.tables.map((x) => (
                  <span key={x.name} className="inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-xs">
                    {x.name} ({x.rows})
                    <SafetyBadge s={TABLE_SAFETY[x.name] ?? "safe"} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-base">2. Restore options</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm font-medium mb-2">Restore mode</div>
              <div className="flex gap-3 flex-wrap">
                {(["merge", "replace"] as RestoreMode[]).map((m) => (
                  <label key={m} className={`border rounded-md px-3 py-2 cursor-pointer text-sm ${mode === m ? "border-primary bg-primary/5" : ""}`}>
                    <input type="radio" name="mode" className="mr-2" checked={mode === m} onChange={() => setMode(m)} disabled={busy} />
                    {m === "merge" ? "Merge safely (insert new rows)" : "Replace current company data (soft-delete existing, then insert)"}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Tables to restore</div>
              <div className="flex gap-2 flex-wrap">
                {(["all", "items", "parties", "stock", "settings"] as TableFilter[]).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    disabled={busy}
                  >
                    {f === "all" ? "All safe tables" : `${f.charAt(0).toUpperCase()}${f.slice(1)} only`}
                  </Button>
                ))}
                {(["sales", "purchases"] as TableFilter[]).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    title="Disabled — money impacting"
                    className="opacity-60"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    {f.charAt(0).toUpperCase()}{f.slice(1)}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Selected: {selectedTables.length ? selectedTables.join(", ") : "(none)"} · Total rows: {totalRows}
              </div>
              <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-800 dark:text-amber-200">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Sales/Purchases restore requires extra safety confirmation because it affects money, stock and reports.</span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Safety levels: <SafetyBadge s="safe" /> low impact ·{" "}
              <SafetyBadge s="medium" /> may affect lookups ·{" "}
              <SafetyBadge s="money" /> affects balances/stock
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-base">3. Confirm &amp; run</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(!!v)} disabled={busy} />
              <span>I understand this may modify current company data</span>
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span>Type</span>
              <code className="px-1.5 py-0.5 rounded bg-muted">RESTORE</code>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="RESTORE"
                className="max-w-[180px]"
                disabled={busy}
              />
            </div>
            <div className="flex gap-2 flex-wrap pt-1">
              <Button onClick={doDryRun} variant="outline" disabled={busy || !selectedTables.length}>
                <PlayCircle className="w-4 h-4 mr-2" />Dry Run
              </Button>
              <Button
                onClick={doRestore}
                disabled={busy || !selectedTables.length || !confirm || typed.trim().toUpperCase() !== "RESTORE"}
              >
                <RotateCcw className="w-4 h-4 mr-2" />{busy ? "Restoring…" : "Restore"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {conflicts && (
        <Card>
          <CardHeader><CardTitle className="text-base">Conflict preview (dry run)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {conflicts.map((c) => (
              <div key={c.table} className="border rounded p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm flex items-center gap-2">
                    {c.table} <SafetyBadge s={TABLE_SAFETY[c.table] ?? "safe"} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    total {c.total} · will insert {c.willInsert} · will skip {c.willSkip}
                  </span>
                </div>
                {c.conflicts.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc ml-5">
                    {c.conflicts.map((x, i) => (
                      <li key={i}>
                        <b>{x.reason}</b>: {x.sample.join(", ")}{x.sample.length >= 8 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {c.conflicts.length === 0 && (
                  <div className="text-xs text-emerald-700">No conflicts detected.</div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(rows.length > 0 || phase !== "idle") && (
        <Card>
          <CardHeader><CardTitle className="text-base">Progress · {phase}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {rows.length > 0 && <Progress value={pct} />}
            <div className="space-y-1 text-sm">
              {rows.map((r) => (
                <div key={r.table} className="flex items-center justify-between border-b py-1">
                  <span className="font-mono">{r.table}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.status} · inserted {r.inserted} · skipped {r.skipped}
                    {r.error ? ` · ${r.error}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Restore summary</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><b>Mode:</b> {summary.mode} · <b>Filter:</b> {summary.filter} · <b>Status:</b> {summary.status}</div>
            <div><b>Imported:</b> {summary.inserted} · <b>Skipped:</b> {summary.skipped} · <b>Errors:</b> {summary.errors}</div>
            <div><b>Timestamp:</b> {summary.ts}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Restore history</CardTitle>
          {history.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline"><Trash2 className="w-3 h-3 mr-1" />Clear history</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear restore history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes only the local restore log for this company. Your data is not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { clearHistory(companyId!); setHistory([]); toast.success("History cleared"); }}>
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No restores yet.</div>
          ) : (
            <div className="text-xs space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex justify-between border-b py-1 gap-2">
                  <span className="truncate">
                    {h.ts} · {h.file} {h.dryRun ? "(dry run)" : ""}
                  </span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {h.status} · {h.mode}/{h.filter} · ins {h.inserted} · skip {h.skipped} · err {h.errors}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
