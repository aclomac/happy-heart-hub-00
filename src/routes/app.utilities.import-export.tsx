import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/erp/PageHeader";
import { NoCompanySelected } from "@/components/erp/NoCompanySelected";
import { useCurrentCompanyId } from "@/lib/use-company";
import { useRoleAndPermissions } from "@/lib/permissions";
import { downloadCSV } from "@/lib/csv";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { logAudit } from "@/lib/audit";
import {
  parseVyaparFile,
  buildPreview,
  runImport,
  detectFileKind,
  ImportCancelledError,
  type ParsedDb,
  type VyaparPreview,
  type VyaparModule,
  type ImportReport,
  type ProgressEvent,
} from "@/lib/vyapar-import";
import {
  exportErpovoBackup,
  readErpovoBackup,
  importErpovoBackup,
  SAFE_TABLES,
  type ErpovoBackupPreview,
  type SafeTable,
} from "@/lib/erpovo-backup";
import {
  appendHistory,
  loadHistory,
  newBatchId,
  summarize,
  toReportFile,
  toReportCsv,
  filterHistory,
  inferFileType,
  type ImportHistoryEntry,
  type ImportHistoryStatus,
} from "@/lib/import-history";
import { Upload, Download, Database, FileArchive, History, XCircle, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/app/utilities/import-export")({
  component: ImportExportPage,
});

const MODULES: { key: VyaparModule; label: string }[] = [
  { key: "items", label: "Items" },
  { key: "parties", label: "Parties (Customers & Suppliers)" },
  { key: "stores", label: "Stores / Warehouses" },
  { key: "images", label: "Images" },
];

type Phase = "idle" | "parsing" | "previewed" | "importing" | "done" | "failed";

function ImportExportPage() {
  const companyId = useCurrentCompanyId();
  const { t } = useI18n();
  const { data: perms } = useRoleAndPermissions();
  const vyapInputRef = useRef<HTMLInputElement>(null);
  const erpInputRef = useRef<HTMLInputElement>(null);
  const [db, setDb] = useState<ParsedDb | null>(null);
  const [preview, setPreview] = useState<VyaparPreview | null>(null);
  const [selected, setSelected] = useState<Set<VyaparModule>>(
    new Set(["items", "parties", "stores", "images"]),
  );
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Record<string, ProgressEvent>>({});
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [lastBatch, setLastBatch] = useState<{
    entry: ImportHistoryEntry;
    reports: ImportReport[];
  } | null>(null);
  const [currentFile, setCurrentFile] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<{ batchId: string } | null>(null);

  // History filters
  const [fStatus, setFStatus] = useState<ImportHistoryStatus | "all">("all");
  const [fType, setFType] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [fSearch, setFSearch] = useState<string>("");

  const [erpBackup, setErpBackup] = useState<ErpovoBackupPreview | null>(null);
  const [erpSel, setErpSel] = useState<Set<SafeTable>>(new Set(SAFE_TABLES));
  const [erpResults, setErpResults] = useState<
    { table: string; inserted: number; skipped: number }[]
  >([]);

  useEffect(() => {
    if (companyId) setHistory(loadHistory(companyId));
  }, [companyId]);

  if (!companyId) return <NoCompanySelected />;

  const isOwnerOrAdmin = perms?.isOwner || perms?.role === "owner" || perms?.role === "admin";
  if (perms && !isOwnerOrAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("Import / Export")} />
        <div className="rounded-md border bg-muted/30 p-6 text-sm">
          {t("Only company owner or admin can use Import / Export.")}{" "}
          <Link to="/app/utilities" className="text-primary underline">
            {t("Back to Utilities")}
          </Link>
        </div>
      </div>
    );
  }

  const handleVyaparFile = async (file: File) => {
    const kind = detectFileKind(file.name);
    if (kind === "unknown") {
      toast.error(t("Unsupported file. Use .vyb, .zip, or .vyp"));
      return;
    }
    setBusy(true);
    setPhase("parsing");
    setProgress({ parse: { module: "parse", phase: "start", message: t("Parsing File") } });
    setCurrentFile({ name: file.name, size: file.size, type: inferFileType(file.name) });
    try {
      const parsed = await parseVyaparFile(file);
      setDb(parsed);
      setPreview(buildPreview(parsed));
      setPhase("previewed");
      setProgress({ parse: { module: "parse", phase: "done" } });
      await logAudit({
        companyId,
        module: "utilities",
        action: "data_import.previewed",
        amountImpact: null,
        newValue: {
          file_size: file.size,
          file_type: inferFileType(file.name),
          source: "vyapar",
        },
      });
      toast.success(t("Vyapar backup loaded"));
    } catch (e) {
      setPhase("failed");
      toast.error(e instanceof Error ? e.message : "Could not read backup");
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    abortRef.current?.abort();
  };

  const doImport = async () => {
    if (!db || !companyId) return;
    setBusy(true);
    setPhase("importing");
    setReports([]);
    setProgress({});
    const onProgress = (e: ProgressEvent) => {
      setProgress((p) => ({ ...p, [e.module]: e }));
    };
    const controller = new AbortController();
    abortRef.current = controller;
    const batchId = retryRef.current?.batchId ?? newBatchId();
    const isRetry = !!retryRef.current;
    retryRef.current = null;

    await logAudit({
      companyId,
      module: "utilities",
      action: isRetry ? "data_import.retried" : "data_import.started",
      amountImpact: null,
      newValue: {
        batch_id: batchId,
        modules: Array.from(selected),
        file_size: currentFile?.size ?? 0,
        file_type: currentFile?.type ?? "",
      },
    });

    let res: ImportReport[] = [];
    let cancelled = false;
    try {
      res = await runImport(db, companyId, Array.from(selected), onProgress, controller.signal, {
        onModuleStart: async (mod) => {
          await logAudit({
            companyId,
            module: "utilities",
            action: "data_import.module_started",
            amountImpact: null,
            newValue: { batch_id: batchId, module: mod },
          });
        },
        onModuleEnd: async (mod, r) => {
          await logAudit({
            companyId,
            module: "utilities",
            action: "data_import.module_completed",
            amountImpact: null,
            newValue: {
              batch_id: batchId,
              module: mod,
              inserted_count: r.inserted,
              skipped_count: r.skipped,
              error_count: r.errors.length,
              cancelled: !!r.cancelled,
            },
          });
        },
      });
      cancelled = controller.signal.aborted || res.some((r) => r.cancelled);
    } catch (e) {
      if (e instanceof ImportCancelledError) {
        cancelled = true;
      } else {
        setPhase("failed");
        await logAudit({
          companyId,
          module: "utilities",
          action: "data_import.failed",
          amountImpact: null,
          newValue: {
            batch_id: batchId,
            error: e instanceof Error ? e.message : "unknown",
          },
        });
        toast.error(e instanceof Error ? e.message : t("Import Failed"));
        setBusy(false);
        abortRef.current = null;
        return;
      }
    }

    setReports(res);
    const totals = summarize(res);
    const status: ImportHistoryStatus = cancelled
      ? "cancelled"
      : totals.errors > 0 && totals.inserted === 0
        ? "failed"
        : "imported";
    const entry: ImportHistoryEntry = {
      batchId,
      fileName: currentFile?.name ?? "vyapar-backup",
      fileSize: currentFile?.size ?? 0,
      fileType: currentFile?.type ?? "",
      at: new Date().toISOString(),
      status,
      source: "vyapar",
      reports: res.map((r) => ({
        module: r.module,
        inserted: r.inserted,
        skipped: r.skipped,
        errorCount: r.errors.length,
      })),
      totals,
    };
    const next = appendHistory(companyId, entry);
    setHistory(next);
    setLastBatch({ entry, reports: res });
    setPhase(cancelled ? "failed" : "done");

    await logAudit({
      companyId,
      module: "utilities",
      action: cancelled ? "data_import.cancelled" : "data_import.completed",
      amountImpact: null,
      newValue: {
        batch_id: batchId,
        modules: Array.from(selected),
        inserted_count: totals.inserted,
        skipped_count: totals.skipped,
        error_count: totals.errors,
        file_size: currentFile?.size ?? 0,
        file_type: currentFile?.type ?? "",
      },
    });

    if (cancelled) toast.warning(t("Import Cancelled"));
    else toast.success(`${t("Import Completed")}: ${totals.inserted}`);

    setBusy(false);
    abortRef.current = null;
  };

  const doErpovoExport = async () => {
    if (!companyId) return;
    setBusy(true);
    try {
      const blob = await exportErpovoBackup(companyId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `erpovo-backup-${new Date().toISOString().slice(0, 10)}.erpovo`;
      a.click();
      URL.revokeObjectURL(url);
      await logAudit({
        companyId,
        module: "utilities",
        action: "data_export.created",
        amountImpact: null,
        newValue: { source: "erpovo" },
      });
      toast.success(t("Backup exported"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const handleErpFile = async (file: File) => {
    setBusy(true);
    try {
      const pv = await readErpovoBackup(file);
      setErpBackup(pv);
      toast.success(t("ERPOVO backup loaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read backup");
    } finally {
      setBusy(false);
    }
  };

  const doErpovoImport = async () => {
    if (!erpBackup || !companyId) return;
    setBusy(true);
    try {
      const res = await importErpovoBackup(erpBackup, companyId, Array.from(erpSel));
      setErpResults(res);
      const total = res.reduce((a, r) => a + r.inserted, 0);
      await logAudit({
        companyId,
        module: "utilities",
        action: "erpovo.backup.import",
        amountImpact: null,
        newValue: { tables: Array.from(erpSel), inserted: total },
      });
      toast.success(`${t("Imported")}: ${total}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const exportVyaparCsv = async (kind: "items" | "parties" | "stock" | "payments") => {
    if (!companyId) return;
    let table: "items" | "parties" | "item_store_stock" | "payments" = "items";
    if (kind === "parties") table = "parties";
    else if (kind === "stock") table = "item_store_stock";
    else if (kind === "payments") table = "payments";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if (error) {
      toast.error(error.message);
      return;
    }
    downloadCSV(`${kind}-vyapar.csv`, (data ?? []) as Record<string, unknown>[]);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadReportJson = () => {
    if (!lastBatch) return;
    downloadBlob(
      toReportFile(lastBatch.entry, lastBatch.reports),
      `import-report-${lastBatch.entry.batchId}.json`,
    );
  };

  const downloadReportCsv = () => {
    if (!lastBatch) return;
    downloadBlob(
      toReportCsv(lastBatch.entry, lastBatch.reports),
      `import-report-${lastBatch.entry.batchId}.csv`,
    );
  };

  const retryImport = (h: ImportHistoryEntry) => {
    retryRef.current = { batchId: h.batchId };
    if (db && currentFile && currentFile.name === h.fileName) {
      void doImport();
    } else {
      toast.info(t("Please re-upload the original backup file"));
      vyapInputRef.current?.click();
    }
  };

  const filteredHistory = useMemo(
    () =>
      filterHistory(history, {
        status: fStatus,
        fileType: fType,
        from: fFrom || undefined,
        to: fTo || undefined,
        search: fSearch || undefined,
      }),
    [history, fStatus, fType, fFrom, fTo, fSearch],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("Import / Export")} />

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          <h2 className="font-semibold">{t("Import from Vyapar")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Supported: .vyb, .zip (with .vyp), or .vyp SQLite database.")}
        </p>
        <input
          ref={vyapInputRef}
          type="file"
          accept=".vyb,.zip,.vyp,.db,.sqlite"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleVyaparFile(f);
          }}
        />
        <Button onClick={() => vyapInputRef.current?.click()} disabled={busy}>
          {t("Choose Vyapar backup")}
        </Button>

        {phase === "parsing" && (
          <div className="text-sm text-muted-foreground" data-testid="parse-progress">
            {t("Parsing File")}…
          </div>
        )}

        {preview && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              <Stat label={t("Items")} v={preview.counts.items} />
              <Stat label={t("Parties")} v={preview.counts.parties} />
              <Stat label={t("Stores")} v={preview.counts.stores} />
              <Stat label={t("Categories")} v={preview.counts.categories} />
              <Stat label={t("Units")} v={preview.counts.units} />
              <Stat label={t("Transactions")} v={preview.counts.transactions} />
            </div>
            <div className="text-xs text-muted-foreground">
              {t("Tables detected")}:{" "}
              {preview.tables.map((t) => `${t.name}(${t.rows})`).join(", ") || "none"}
            </div>
            <div className="flex flex-wrap gap-3">
              {MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(m.key)}
                    onCheckedChange={(c) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (c) n.add(m.key);
                        else n.delete(m.key);
                        return n;
                      })
                    }
                  />
                  {t(m.label)}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={doImport} disabled={busy || selected.size === 0}>
                {t("Import selected")}
              </Button>
              {phase === "importing" && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={cancelImport}
                  data-testid="cancel-import"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t("Cancel Import")}
                </Button>
              )}
            </div>

            {(phase === "importing" || phase === "done") && (
              <div className="rounded-md border p-3 space-y-2" data-testid="import-progress">
                <div className="text-sm font-medium">{t("Import Progress")}</div>
                {Array.from(selected).map((mod) => {
                  const p = progress[mod];
                  const total = p?.total ?? 0;
                  const cur = p?.current ?? 0;
                  const pct =
                    p?.phase === "done"
                      ? 100
                      : total > 0
                        ? Math.round((cur / total) * 100)
                        : p?.phase === "start" || p?.phase === "progress"
                          ? 40
                          : 0;
                  return (
                    <div key={mod} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>{t(mod.charAt(0).toUpperCase() + mod.slice(1))}</span>
                        <span className="text-muted-foreground">
                          {p?.phase === "done"
                            ? t("Import Completed")
                            : total > 0
                              ? `${cur}/${total}`
                              : p?.phase
                                ? "…"
                                : ""}
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}

            {reports.length > 0 && (
              <div className="space-y-2">
                <ul className="text-sm space-y-1" data-testid="import-report">
                  {reports.map((r) => (
                    <li key={r.module}>
                      <span className="font-medium">
                        {r.module === "images"
                          ? t("Images Imported")
                          : t(r.module.charAt(0).toUpperCase() + r.module.slice(1))}
                      </span>
                      : {r.inserted} {t("inserted")}, {r.skipped} {t("Skipped Rows")}
                      {r.errors.length > 0 && (
                        <span className="text-destructive">
                          {" "}
                          — {r.errors.length} {t("errors")}: {r.errors[0]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {lastBatch && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={downloadReportJson}>
                      <Download className="h-3 w-3 mr-1" />
                      {t("Export Report JSON")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadReportCsv}>
                      <Download className="h-3 w-3 mr-1" />
                      {t("Export Report CSV")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <h2 className="font-semibold">{t("ERPOVO Backup")}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={doErpovoExport} disabled={busy}>
            <Download className="h-4 w-4 mr-1" />
            {t("Export ERPOVO backup")}
          </Button>
          <input
            ref={erpInputRef}
            type="file"
            accept=".erpovo,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleErpFile(f);
            }}
          />
          <Button variant="outline" onClick={() => erpInputRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-1" />
            {t("Import ERPOVO backup")}
          </Button>
        </div>
        {erpBackup && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {t("Exported at")}: {erpBackup.manifest.exported_at}
            </div>
            <div className="flex flex-wrap gap-3">
              {SAFE_TABLES.map((tn) => (
                <label key={tn} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={erpSel.has(tn)}
                    onCheckedChange={(c) =>
                      setErpSel((s) => {
                        const n = new Set(s);
                        if (c) n.add(tn);
                        else n.delete(tn);
                        return n;
                      })
                    }
                  />
                  {tn} ({(erpBackup.data[tn] ?? []).length})
                </label>
              ))}
            </div>
            <Button onClick={doErpovoImport} disabled={busy || erpSel.size === 0}>
              {t("Import selected")}
            </Button>
            {erpResults.length > 0 && (
              <ul className="text-sm space-y-1">
                {erpResults.map((r) => (
                  <li key={r.table}>
                    {r.table}: {r.inserted} {t("inserted")}, {r.skipped} {t("skipped")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3" data-testid="import-history">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4" />
          <h2 className="font-semibold">{t("Import History")}</h2>
        </div>

        <div
          className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs"
          data-testid="history-filters"
        >
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value as ImportHistoryStatus | "all")}
          >
            <option value="all">
              {t("All")} · {t("Status")}
            </option>
            <option value="imported">{t("Import Completed")}</option>
            <option value="failed">{t("Import Failed")}</option>
            <option value="cancelled">{t("Import Cancelled")}</option>
            <option value="previewed">{t("Previewed")}</option>
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={fType}
            onChange={(e) => setFType(e.target.value)}
          >
            <option value="all">
              {t("All")} · {t("File type")}
            </option>
            <option value="vyb">vyb</option>
            <option value="zip">zip</option>
            <option value="vyp">vyp</option>
            <option value="erpovo">erpovo</option>
          </select>
          <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          <Input
            placeholder={t("Search file or batch id")}
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
          />
        </div>

        {filteredHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="text-sm divide-y">
            {filteredHistory.map((h) => (
              <li
                key={h.batchId}
                className="py-2 flex flex-wrap items-center gap-2 justify-between"
              >
                <div className="space-y-0.5">
                  <div className="font-mono text-xs text-muted-foreground">
                    {t("Import Batch")} {h.batchId}
                  </div>
                  <div>
                    <span className="font-medium">{h.fileName}</span>{" "}
                    <span className="text-muted-foreground">
                      ({Math.round(h.fileSize / 1024)} KB) · {new Date(h.at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs">
                    {h.status === "imported"
                      ? t("Import Completed")
                      : h.status === "failed"
                        ? t("Import Failed")
                        : h.status === "cancelled"
                          ? t("Import Cancelled")
                          : h.status}{" "}
                    · {h.totals.inserted} {t("inserted")} · {h.totals.skipped} {t("Skipped Rows")} ·{" "}
                    {h.totals.errors} {t("errors")}
                  </div>
                </div>
                {(h.status === "failed" || h.status === "cancelled") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retryImport(h)}
                    data-testid="retry-import"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {t("Retry Import")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileArchive className="h-4 w-4" />
          <h2 className="font-semibold">{t("Vyapar-compatible CSV export")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("CSV files for re-import or migration. Not a direct Vyapar restore.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportVyaparCsv("items")}>
            items.csv
          </Button>
          <Button variant="outline" onClick={() => exportVyaparCsv("parties")}>
            parties.csv
          </Button>
          <Button variant="outline" onClick={() => exportVyaparCsv("stock")}>
            stock.csv
          </Button>
          <Button variant="outline" onClick={() => exportVyaparCsv("payments")}>
            payments.csv
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{v}</div>
    </div>
  );
}
