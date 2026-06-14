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
import { useCurrentCompanyId } from "@/lib/use-company";
import { supabase } from "@/integrations/supabase/client";
import {
  readErpovoBackup,
  importErpovoBackup,
  SAFE_TABLES,
  type ErpovoBackupPreview,
  type SafeTable,
} from "@/lib/erpovo-backup";
import { FileArchive, Upload, PlayCircle, RotateCcw, History, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/utilities/restore-backup")({
  component: RestoreBackupPage,
});

type RestoreMode = "merge" | "replace";
type TableFilter = "all" | "items" | "parties" | "sales" | "purchases" | "stock" | "settings";

const FILTER_MAP: Record<TableFilter, readonly SafeTable[]> = {
  all: SAFE_TABLES,
  items: ["items", "item_categories", "units"],
  parties: ["parties", "party_groups"],
  sales: [], // sales/purchases not in SAFE_TABLES — intentionally protected
  purchases: [],
  stock: ["warehouses", "item_store_stock"],
  settings: ["other_income_categories"],
};

type HistoryEntry = {
  ts: string;
  file: string;
  mode: RestoreMode;
  filter: TableFilter;
  inserted: number;
  skipped: number;
  errors: number;
  status: "done" | "failed" | "dry-run";
};

const HISTORY_KEY = "erpovo:restore-history";
function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function pushHistory(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  const list = [entry, ...loadHistory()].slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

type ProgressRow = { table: string; inserted: number; skipped: number; status: "pending" | "running" | "done" | "failed"; error?: string };

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
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());

  const selectedTables = useMemo<SafeTable[]>(() => {
    const allow = new Set(FILTER_MAP[filter]);
    if (!preview) return [...allow] as SafeTable[];
    return (Object.keys(preview.data) as SafeTable[]).filter((t) =>
      (SAFE_TABLES as readonly string[]).includes(t) && allow.has(t),
    );
  }, [filter, preview]);

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
    if (!preview) return;
    const entry: HistoryEntry = {
      ts: new Date().toISOString(),
      file: file?.name ?? "(unknown)",
      mode,
      filter,
      inserted: 0,
      skipped: 0,
      errors: 0,
      status: "dry-run",
    };
    setSummary(entry);
    pushHistory(entry);
    setHistory(loadHistory());
    toast.success(`Dry run: ${totalRows} rows across ${selectedTables.length} tables`);
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
      // Replace mode: soft-delete existing rows in selected tables for this company.
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
        inserted: totalIn,
        skipped: totalSkip,
        errors: totalErr,
        status: totalErr > 0 ? "failed" : "done",
      };
      setSummary(entry);
      pushHistory(entry);
      setHistory(loadHistory());
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
              <div><b>Tables in backup:</b> {preview.manifest.tables.map((x) => `${x.name} (${x.rows})`).join(", ")}</div>
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
                {(["all", "items", "parties", "sales", "purchases", "stock", "settings"] as TableFilter[]).map((f) => (
                  <Button
                    key={f}
                    type="button"
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    disabled={busy}
                  >
                    {f === "all" ? "All tables" : `${f.charAt(0).toUpperCase()}${f.slice(1)} only`}
                  </Button>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Selected: {selectedTables.length ? selectedTables.join(", ") : "(none — this filter has no safe tables in the backup)"}
                {" · "}Total rows: {totalRows}
              </div>
              {(filter === "sales" || filter === "purchases") && (
                <div className="text-xs text-amber-700 mt-1">
                  Sales and Purchases are intentionally excluded from restore (money-impacting). Use module-specific tools.
                </div>
              )}
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
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Restore history</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No restores yet.</div>
          ) : (
            <div className="text-xs space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex justify-between border-b py-1">
                  <span>{h.ts} · {h.file}</span>
                  <span className="text-muted-foreground">
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
