import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/erp/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Play,
  Square,
  Trash2,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/app/utilities/performance-test")({
  component: PerformanceTestPage,
});

// ─────────────────────────────── IndexedDB helpers ───────────────────────────
const DB_NAME = "erpovo_perf_test";
const DB_VERSION = 1;
const STORE = "records";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        os.createIndex("by_type", "type");
        os.createIndex("by_batch", "batchId");
        os.createIndex("by_perf", "perfTest");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function bulkInsert(rows: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const r of rows) os.add(r);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function countPerf(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("by_perf");
      const req = idx.count(IDBKeyRange.only(1));
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); resolve(0); };
    });
  } catch { return 0; }
}

async function clearPerf(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const idx = os.index("by_perf");
    let n = 0;
    const cur = idx.openCursor(IDBKeyRange.only(1));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        // safety: only delete records that are truly [PERF] tagged
        if (c.value?.perfTest === 1 && c.value?.tag === "[PERF]") {
          c.delete();
          n++;
        }
        c.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(n); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function readSample(type: string, limit = 100, batchId?: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("by_type");
    const out: any[] = [];
    const cur = idx.openCursor(IDBKeyRange.only(type));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c && out.length < limit) {
        if (!batchId || c.value?.batchId === batchId) out.push(c.value);
        c.continue();
      } else { db.close(); resolve(out); }
    };
  });
}

// ─────────────────────────────── Generators ──────────────────────────────────
type DataType =
  | "parties" | "items" | "sales" | "purchases"
  | "stock_movements" | "ecommerce_orders" | "payments" | "expenses";

const DATA_TYPES: { key: DataType; label: string; defaultRatio: number }[] = [
  { key: "parties", label: "Parties / Customers", defaultRatio: 0.05 },
  { key: "items", label: "Items", defaultRatio: 0.05 },
  { key: "sales", label: "Sale Invoices", defaultRatio: 0.30 },
  { key: "purchases", label: "Purchase Invoices", defaultRatio: 0.20 },
  { key: "stock_movements", label: "Stock Movements", defaultRatio: 0.25 },
  { key: "ecommerce_orders", label: "Ecommerce Orders", defaultRatio: 0.10 },
  { key: "payments", label: "Payments", defaultRatio: 0.03 },
  { key: "expenses", label: "Expenses", defaultRatio: 0.02 },
];

function makeRecord(type: DataType, n: number, batchId: string) {
  const base = {
    perfTest: 1 as const,
    tag: "[PERF]",
    createdBy: "performance-test",
    batchId,
    type,
    createdAt: new Date().toISOString(),
  };
  switch (type) {
    case "parties":
      return { ...base, name: `[PERF] Party ${n}`, phone: `0170000${n}`, balance: (n * 17) % 5000 };
    case "items":
      return { ...base, name: `[PERF] Item ${n}`, code: `PERF-${n}`, price: (n * 13) % 9999, stock: n % 500 };
    case "sales":
      return { ...base, invoice: `PERF-INV-${n}`, party: `[PERF] Party ${n % 5000}`, amount: (n * 23) % 99999 };
    case "purchases":
      return { ...base, bill: `PERF-BILL-${n}`, party: `[PERF] Party ${n % 5000}`, amount: (n * 19) % 99999 };
    case "stock_movements":
      return { ...base, ref: `PERF-MV-${n}`, itemId: n % 5000, qty: (n % 50) + 1, direction: n % 2 ? "in" : "out" };
    case "ecommerce_orders":
      return { ...base, order: `PERF-ORD-${n}`, customer: `[PERF] Cust ${n % 5000}`, total: (n * 11) % 50000 };
    case "payments":
      return { ...base, ref: `PERF-PAY-${n}`, party: `[PERF] Party ${n % 5000}`, amount: (n * 7) % 20000 };
    case "expenses":
      return { ...base, ref: `PERF-EXP-${n}`, category: ["Salary", "Rent", "Transport", "Office"][n % 4], amount: (n * 5) % 9999 };
  }
}

// ────────────────────────────────── Page ─────────────────────────────────────
type Status = "Good" | "Needs Optimization" | "Slow";
type BenchMode = "last_batch" | "all_perf";

interface Bench {
  mode: BenchMode;
  scopeRecords: number;
  genMs: number;
  dashboardMs: number;
  itemsMs: number;
  salesMs: number;
  reportsMs: number;
  searchMs: number;
  memoryWarn: boolean;
  status: Status;
}

function PerformanceTestPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Record<DataType, boolean>>(
    Object.fromEntries(DATA_TYPES.map((t) => [t.key, true])) as Record<DataType, boolean>,
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generated, setGenerated] = useState(0);
  const [target, setTarget] = useState(0);

  const [existingBefore, setExistingBefore] = useState(0);
  const [existingNow, setExistingNow] = useState(0);
  const [lastBatchCount, setLastBatchCount] = useState(0);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [lastGenMs, setLastGenMs] = useState(0);

  const [bench, setBench] = useState<Bench | null>(null);
  const [benchMode, setBenchMode] = useState<BenchMode>("last_batch");
  const [storageWarn, setStorageWarn] = useState(false);
  const cancelRef = useRef(false);

  // confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);

  const refreshCount = async () => {
    const n = await countPerf();
    setExistingNow(n);
    return n;
  };
  useEffect(() => { void refreshCount(); }, []);

  const toggle = (k: DataType) => setSelected((s) => ({ ...s, [k]: !s[k] }));

  const startGenerate = async (total: number, fresh: boolean) => {
    if (running) return;
    const types = DATA_TYPES.filter((t) => selected[t.key]);
    if (!types.length) { toast.error("Select at least one data type"); return; }
    if (total >= 50000) setStorageWarn(true);

    setRunning(true);
    cancelRef.current = false;
    setProgress(0);
    setGenerated(0);
    setTarget(total);
    setBench(null);

    let before = existingNow;
    try {
      if (fresh && before > 0) {
        const cleared = await clearPerf();
        toast.message(`Cleared ${cleared.toLocaleString()} old [PERF] records`);
        before = 0;
      }
      setExistingBefore(before);

      const batchId = `batch_${Date.now()}`;
      const ratioSum = types.reduce((a, t) => a + t.defaultRatio, 0);
      const plan = types.map((t) => ({ type: t.key, count: Math.round((t.defaultRatio / ratioSum) * total) }));

      const CHUNK = 1000;
      const t0 = performance.now();
      let done = 0;

      for (const p of plan) {
        let i = 0;
        while (i < p.count) {
          if (cancelRef.current) throw new Error("cancelled");
          const size = Math.min(CHUNK, p.count - i);
          const rows = Array.from({ length: size }, (_, k) => makeRecord(p.type, done + k + 1, batchId));
          await bulkInsert(rows);
          i += size;
          done += size;
          setGenerated(done);
          setProgress(Math.round((done / total) * 100));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      const genMs = Math.round(performance.now() - t0);
      setLastBatchId(batchId);
      setLastBatchCount(done);
      setLastGenMs(genMs);
      toast.success(`Generated ${done.toLocaleString()} [PERF] records in ${genMs} ms`);
      await refreshCount();
      await runBenchmark("last_batch", done, genMs, batchId);
    } catch (e: any) {
      if (e?.message === "cancelled") {
        toast.warning(`Cancelled at ${generated.toLocaleString()} records`);
      } else {
        toast.error(`Generation failed: ${e?.message ?? e}`);
      }
      await refreshCount();
    } finally {
      setRunning(false);
    }
  };

  const onClickGenerate = (total: number, fresh: boolean) => {
    if (!fresh && existingNow > 0) {
      setPendingTotal(total);
      setConfirmOpen(true);
      return;
    }
    void startGenerate(total, fresh);
  };

  const runBenchmark = async (
    mode: BenchMode,
    scope: number,
    genMs: number,
    batchId: string | null,
  ) => {
    const bid = mode === "last_batch" ? batchId ?? undefined : undefined;
    const time = async (fn: () => Promise<any>) => {
      const s = performance.now();
      await fn();
      return Math.round(performance.now() - s);
    };
    const dashboardMs = await time(() => readSample("sales", 50, bid));
    const itemsMs = await time(() => readSample("items", 100, bid));
    const salesMs = await time(() => readSample("sales", 100, bid));
    const reportsMs = await time(async () => {
      await readSample("sales", 100, bid);
      await readSample("stock_movements", 100, bid);
    });
    const searchMs = await time(async () => {
      const rows = await readSample("items", 200, bid);
      rows.filter((r) => r.name?.includes("Item 1"));
    });

    let memoryWarn = false;
    const mem = (performance as any).memory;
    if (mem && mem.usedJSHeapSize > 0.8 * mem.jsHeapSizeLimit) memoryWarn = true;

    const worst = Math.max(dashboardMs, itemsMs, salesMs, reportsMs, searchMs);
    const status: Status = worst < 150 ? "Good" : worst < 500 ? "Needs Optimization" : "Slow";
    setBench({ mode, scopeRecords: scope, genMs, dashboardMs, itemsMs, salesMs, reportsMs, searchMs, memoryWarn, status });
  };

  const rerunBenchmark = async (mode: BenchMode) => {
    setBenchMode(mode);
    const scope = mode === "last_batch" ? lastBatchCount : existingNow;
    if (scope === 0) {
      toast.error(mode === "last_batch" ? "No last batch yet" : "No PERF records to benchmark");
      return;
    }
    await runBenchmark(mode, scope, lastGenMs, lastBatchId);
  };

  const cancel = () => { cancelRef.current = true; };

  const handleClear = async () => {
    if (!window.confirm("Clear all [PERF] performance test data? Real and demo data are NOT affected.")) return;
    try {
      const n = await clearPerf();
      toast.success(`Cleared ${n.toLocaleString()} [PERF] records`);
      setBench(null);
      setLastBatchCount(0);
      setLastBatchId(null);
      setExistingBefore(0);
      await refreshCount();
    } catch (e: any) {
      toast.error(`Cleanup failed: ${e?.message ?? e}`);
    }
  };

  const statusColor = bench?.status === "Good"
    ? "text-success" : bench?.status === "Needs Optimization" ? "text-warning" : "text-destructive";

  return (
    <div>
      <PageHeader
        title="Performance Test"
        subtitle="Generate tagged [PERF] demo data in IndexedDB to benchmark ERPOVO. Real and demo business data are untouched."
      />

      {/* Count summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Metric label="Existing PERF records" value={existingNow.toLocaleString()} />
        <Metric label="Last generated batch" value={lastBatchCount.toLocaleString()} />
        <Metric label="Total PERF after generation" value={existingNow.toLocaleString()} />
      </div>

      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" /> Large Data Generator
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Existing [PERF]: {existingNow.toLocaleString()}</Badge>
            <Button variant="destructive" size="sm" onClick={handleClear} disabled={running}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear Performance Test Data
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Data types</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {DATA_TYPES.map((t) => (
                <label key={t.key} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent">
                  <Checkbox checked={selected[t.key]} onCheckedChange={() => toggle(t.key)} disabled={running} />
                  <span className="text-sm">{t.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{Math.round(t.defaultRatio * 100)}%</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Add to existing</div>
            <div className="flex flex-wrap gap-2">
              {[1000, 10000, 50000, 100000].map((n) => (
                <Button key={n} variant="outline" disabled={running} onClick={() => onClickGenerate(n, false)}>
                  <Play className="w-4 h-4 mr-1" /> Generate {n.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Fresh (clears [PERF] first)</div>
            <div className="flex flex-wrap gap-2">
              {[1000, 10000, 50000, 100000].map((n) => (
                <Button key={n} variant="secondary" disabled={running} onClick={() => onClickGenerate(n, true)}>
                  <Sparkles className="w-4 h-4 mr-1" /> Generate Fresh {n.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          {running && (
            <Button variant="destructive" onClick={cancel}>
              <Square className="w-4 h-4 mr-1" /> Cancel
            </Button>
          )}

          {storageWarn && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
              <div>
                Large data test may exceed browser localStorage limits. ERPOVO Performance Test
                uses <strong>IndexedDB</strong> for [PERF] records — this is the recommended local
                database for testing &gt;10k rows.
              </div>
            </div>
          )}

          {running && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Generating {generated.toLocaleString()} / {target.toLocaleString()}
                </span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {lastBatchCount > 0 && !running && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              Existing before: <strong>{existingBefore.toLocaleString()}</strong> · Generated now:{" "}
              <strong>{lastBatchCount.toLocaleString()}</strong> · Total PERF records:{" "}
              <strong>{existingNow.toLocaleString()}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {bench && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="flex items-center gap-2">
              <Gauge className="w-5 h-5 text-primary" /> Benchmark Results
              <span className={`ml-2 text-sm ${statusColor}`}>● {bench.status}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {bench.mode === "last_batch"
                  ? `Benchmarking last batch (${bench.scopeRecords.toLocaleString()} rows)`
                  : `Benchmarking all PERF records (${bench.scopeRecords.toLocaleString()} rows)`}
              </span>
              <Select value={benchMode} onValueChange={(v) => void rerunBenchmark(v as BenchMode)}>
                <SelectTrigger className="w-[240px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_batch">Benchmark Last Batch</SelectItem>
                  <SelectItem value="all_perf">Benchmark All PERF Records</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Metric label="Records in scope" value={bench.scopeRecords.toLocaleString()} />
              <Metric label="Generation time" value={`${bench.genMs} ms`} />
              <Metric label="Dashboard load" value={`${bench.dashboardMs} ms`} />
              <Metric label="Items list load" value={`${bench.itemsMs} ms`} />
              <Metric label="Sales list load" value={`${bench.salesMs} ms`} />
              <Metric label="Reports load" value={`${bench.reportsMs} ms`} />
              <Metric label="Search response" value={`${bench.searchMs} ms`} />
              <Metric label="Memory" value={bench.memoryWarn ? "⚠ High" : "OK"} />
            </div>

            {bench.status !== "Good" && (
              <div className="mt-4 p-3 rounded-md bg-muted/50 text-sm">
                <div className="font-semibold mb-1">Optimization recommendations</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Enable pagination on list pages (10 / 25 / 50 / 100 page sizes)</li>
                  <li>Use IndexedDB instead of localStorage for &gt;10k rows</li>
                  <li>Cache dashboard summary instead of recomputing every render</li>
                  <li>Lazy-load reports and add server-side search indexes</li>
                  <li>Use virtualized tables (react-virtual / TanStack Virtual) for &gt;1,000 rows</li>
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app" })}>Open Dashboard</Button>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/items" })}>Open Items</Button>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/sales" })}>Open Sales</Button>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/reports" })}>Open Reports</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="w-4 h-4 text-success" /> Safety
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>• All generated rows carry <code>perfTest: 1</code>, <code>tag: "[PERF]"</code>, <code>createdBy: "performance-test"</code> and a batchId.</div>
          <div>• Data is stored in an isolated IndexedDB database (<code>erpovo_perf_test</code>) — Sale Invoices, POS, Items, Purchases, Ecommerce, Dashboard and QA Audit are not affected.</div>
          <div>• Cleanup removes only [PERF] rows. Demo and real business data remain intact.</div>
        </CardContent>
      </Card>

      {/* Confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Existing PERF data found</DialogTitle>
            <DialogDescription>
              You already have <strong>{existingNow.toLocaleString()}</strong> performance test records.
              Do you want to add <strong>{pendingTotal.toLocaleString()}</strong> more, or clear old data
              first and generate fresh?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="outline"
              onClick={() => { setConfirmOpen(false); void startGenerate(pendingTotal, false); }}
            >
              Add More
            </Button>
            <Button
              onClick={() => { setConfirmOpen(false); void startGenerate(pendingTotal, true); }}
            >
              Clear Old Data & Generate Fresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
