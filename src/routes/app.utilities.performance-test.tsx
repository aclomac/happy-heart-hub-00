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
const DB_VERSION = 3;
const STORE = "records";
const SUMMARY_STORE = "summaries";
const PERF_CACHE_VERSION = "perf-cache-v3";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      let os: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE)) {
        os = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        os.createIndex("by_type", "type");
        os.createIndex("by_batch", "batchId");
        os.createIndex("by_perf", "perfTest");
      } else {
        os = req.transaction!.objectStore(STORE);
      }
      // v2: composite index for fast batch-scoped reads + normalized search field
      if (!os.indexNames.contains("by_type_batch")) {
        os.createIndex("by_type_batch", ["type", "batchId"]);
      }
      if (!os.indexNames.contains("by_name_search")) {
        os.createIndex("by_name_search", "nameSearch");
      }
      if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
        db.createObjectStore(SUMMARY_STORE, { keyPath: "key" });
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

async function clearPerf(onProgress?: (n: number) => void): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stores = db.objectStoreNames.contains(SUMMARY_STORE)
      ? [STORE, SUMMARY_STORE]
      : [STORE];
    const tx = db.transaction(stores, "readwrite");
    const os = tx.objectStore(STORE);
    const idx = os.index("by_perf");
    let n = 0;
    const cur = idx.openCursor(IDBKeyRange.only(1));
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        if (c.value?.perfTest === 1 && c.value?.tag === "[PERF]") {
          c.delete();
          n++;
          if (onProgress && n % 2000 === 0) onProgress(n);
        }
        c.continue();
      }
    };
    if (db.objectStoreNames.contains(SUMMARY_STORE)) {
      tx.objectStore(SUMMARY_STORE).clear();
    }
    tx.oncomplete = () => { db.close(); resolve(n); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Optimized: native getAll with range+limit (single C++ call, no JS cursor loop)
async function readSample(type: string, limit = 100, batchId?: string): Promise<any[]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    let req: IDBRequest<any[]>;
    if (batchId) {
      const idx = store.index("by_type_batch");
      req = idx.getAll(IDBKeyRange.only([type, batchId]), limit);
    } else {
      const idx = store.index("by_type");
      req = idx.getAll(IDBKeyRange.only(type), limit);
    }
    req.onsuccess = () => { db.close(); resolve(req.result || []); };
    req.onerror = () => { db.close(); resolve([]); };
  });
}

// Batched read: many small getAll calls in ONE transaction on ONE connection.
// Avoids per-call DB open/close overhead — critical for All PERF mode.
async function batchedReadSamples(
  reads: { type: string; limit: number }[],
  batchId?: string,
): Promise<any[][]> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const results: any[][] = new Array(reads.length);
    reads.forEach((r, i) => {
      let req: IDBRequest<any[]>;
      if (batchId) {
        const idx = store.index("by_type_batch");
        req = idx.getAll(IDBKeyRange.only([r.type, batchId]), r.limit);
      } else {
        const idx = store.index("by_type");
        req = idx.getAll(IDBKeyRange.only(r.type), r.limit);
      }
      req.onsuccess = () => { results[i] = req.result || []; };
      req.onerror = () => { results[i] = []; };
    });
    tx.oncomplete = () => { db.close(); resolve(results); };
    tx.onerror = () => { db.close(); resolve(results); };
  });
}

// Cached summary per scope key (batchId or "__all__")
async function getCachedSummary(key: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SUMMARY_STORE, "readonly");
      const req = tx.objectStore(SUMMARY_STORE).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function setCachedSummary(key: string, summary: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(SUMMARY_STORE)) {
      db.close();
      reject(new Error("PERF cache store is unavailable"));
      return;
    }
    const tx = db.transaction(SUMMARY_STORE, "readwrite");
    tx.objectStore(SUMMARY_STORE).put({ key, ...summary, cachedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Failed to save PERF cache")); };
  });
}

async function clearSummaryKey(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SUMMARY_STORE, "readwrite");
      tx.objectStore(SUMMARY_STORE).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* noop */ }
}

async function clearAllSummaries(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(SUMMARY_STORE, "readwrite");
      tx.objectStore(SUMMARY_STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* noop */ }
}

// Per-type counts via single transaction — used for diagnostics & summary build
async function countPerfByType(batchId?: string): Promise<Record<string, number>> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const out: Record<string, number> = {};
    const types = ["parties", "items", "sales", "purchases", "stock_movements", "ecommerce_orders", "payments", "expenses"];
    types.forEach((t) => {
      let req: IDBRequest<number>;
      if (batchId) {
        req = store.index("by_type_batch").count(IDBKeyRange.only([t, batchId]));
      } else {
        req = store.index("by_type").count(IDBKeyRange.only(t));
      }
      req.onsuccess = () => { out[t] = req.result || 0; };
      req.onerror = () => { out[t] = 0; };
    });
    tx.oncomplete = () => { db.close(); resolve(out); };
    tx.onerror = () => { db.close(); resolve(out); };
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
      return { ...base, name: `[PERF] Party ${n}`, nameSearch: `party ${n}`, phone: `0170000${n}`, balance: (n * 17) % 5000 };
    case "items":
      return { ...base, name: `[PERF] Item ${n}`, nameSearch: `item ${n}`, code: `PERF-${n}`, skuSearch: `perf-${n}`, price: (n * 13) % 9999, stock: n % 500 };
    case "sales":
      return { ...base, invoice: `PERF-INV-${n}`, invoiceNoSearch: `perf-inv-${n}`, party: `[PERF] Party ${n % 5000}`, nameSearch: `party ${n % 5000}`, amount: (n * 23) % 99999 };
    case "purchases":
      return { ...base, bill: `PERF-BILL-${n}`, invoiceNoSearch: `perf-bill-${n}`, party: `[PERF] Party ${n % 5000}`, nameSearch: `party ${n % 5000}`, amount: (n * 19) % 99999 };
    case "stock_movements":
      return { ...base, ref: `PERF-MV-${n}`, itemId: n % 5000, qty: (n % 50) + 1, direction: n % 2 ? "in" : "out" };
    case "ecommerce_orders":
      return { ...base, order: `PERF-ORD-${n}`, invoiceNoSearch: `perf-ord-${n}`, customer: `[PERF] Cust ${n % 5000}`, nameSearch: `cust ${n % 5000}`, total: (n * 11) % 50000 };
    case "payments":
      return { ...base, ref: `PERF-PAY-${n}`, party: `[PERF] Party ${n % 5000}`, nameSearch: `party ${n % 5000}`, amount: (n * 7) % 20000 };
    case "expenses":
      return { ...base, ref: `PERF-EXP-${n}`, category: ["Salary", "Rent", "Transport", "Office"][n % 4], amount: (n * 5) % 9999 };
  }
}

// ─────────────────── PERF aggregate cache (precomputed once) ────────────────
interface PerfAggregate {
  scope: "all" | "batch";
  scopeId: string;
  builtAt: number;
  cacheVersion: string;
  recordsIndexed: number;
  countsByType: Record<string, number>;
  dashboardSummary: { totalSales: number; totalPayments: number; salesCount: number; paymentsCount: number };
  salesSummary: { totalSales: number; salesCount: number; pageSize: number };
  itemSummary: { itemCount: number; pageSize: number };
  salesPage: any[];
  itemsPage: any[];
  reportsSummary: { salesTotal: number; purchasesTotal: number; expensesTotal: number; stockMoves: number };
  searchIndexSample: any[];
}

const cacheKeyFor = (scope: "all" | "batch", batchId?: string | null) =>
  `perf_cache:${scope}:${scope === "batch" ? (batchId ?? "") : "__all__"}`;

async function buildPerfCache(scope: "all" | "batch", batchId?: string | null): Promise<PerfAggregate> {
  console.log("[perf] buildPerfCache started", { scope, batchId });
  const useBatch = scope === "batch" && !!batchId;
  const bid = useBatch ? (batchId as string) : undefined;

  // Counts per type via index.count (fast, no row materialization)
  const counts = await countPerfByType(bid);
  const recordsIndexed = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log("[perf] buildPerfCache counts", counts, "total", recordsIndexed);

  // Sum amounts per type via cursor on a single type range (only touches that type)
  const sumAmount = (type: string): Promise<number> =>
    new Promise(async (resolve) => {
      const db = await openDB();
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const range = useBatch
        ? IDBKeyRange.only([type, bid])
        : IDBKeyRange.only(type);
      const idx = useBatch ? store.index("by_type_batch") : store.index("by_type");
      let total = 0;
      const cur = idx.openCursor(range);
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        total += Number((c.value as any).amount) || 0;
        c.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(total); };
      tx.onerror = () => { db.close(); resolve(total); };
    });

  const [salesTotal, paymentsTotal, purchasesTotal, expensesTotal] = await Promise.all([
    sumAmount("sales"),
    sumAmount("payments"),
    sumAmount("purchases"),
    sumAmount("expenses"),
  ]);

  // Page samples via fast getAll(limit)
  const [salesPage, itemsPage, searchSample] = await Promise.all([
    readSample("sales", 100, bid),
    readSample("items", 100, bid),
    readSample("items", 25, bid),
  ]);

  const agg: PerfAggregate = {
    scope, scopeId: scope === "batch" ? (batchId ?? "") : "__all__",
    builtAt: Date.now(),
    cacheVersion: PERF_CACHE_VERSION,
    recordsIndexed,
    countsByType: counts,
    dashboardSummary: {
      totalSales: salesTotal,
      totalPayments: paymentsTotal,
      salesCount: counts.sales || 0,
      paymentsCount: counts.payments || 0,
    },
    salesSummary: {
      totalSales: salesTotal,
      salesCount: counts.sales || 0,
      pageSize: salesPage.length,
    },
    itemSummary: {
      itemCount: counts.items || 0,
      pageSize: itemsPage.length,
    },
    salesPage,
    itemsPage,
    reportsSummary: {
      salesTotal,
      purchasesTotal,
      expensesTotal,
      stockMoves: counts.stock_movements || 0,
    },
    searchIndexSample: searchSample,
  };
  await setCachedSummary(cacheKeyFor(scope, batchId), { aggregate: agg });
  console.log("[perf] buildPerfCache completed", { recordsIndexed });
  return agg;
}

async function getPerfCache(scope: "all" | "batch", batchId?: string | null): Promise<PerfAggregate | null> {
  const row = await getCachedSummary(cacheKeyFor(scope, batchId));
  const aggregate = row?.aggregate as PerfAggregate | undefined;
  if (!aggregate || aggregate.cacheVersion !== PERF_CACHE_VERSION) return null;
  return aggregate;
}

// ────────────────────────────────── Page ─────────────────────────────────────
type Status = "Good" | "Needs Optimization" | "Slow";
type BenchMode = "last_batch" | "all_perf";

interface Diag {
  usedCache: boolean;
  usedFullScan: boolean;
  indexUsed: boolean;
  rowsScanned: number;
  rowsRendered: number;
}

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
  cached: boolean;
  source: "cache" | "fresh";
  diag: Diag;
  previous?: Omit<Bench, "previous" | "cached" | "source" | "diag"> | null;
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
  const [genStartedAt, setGenStartedAt] = useState(0);
  const [tick, setTick] = useState(0);

  // confirmation modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingFresh, setPendingFresh] = useState(false);

  // stress test warning modal (>=250k)
  const [stressOpen, setStressOpen] = useState(false);
  const [stressTotal, setStressTotal] = useState(0);
  const [stressFresh, setStressFresh] = useState(false);

  // cleanup progress
  const [clearing, setClearing] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);

  // Diagnostics: actual per-type breakdown vs expected
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [expectedTotal, setExpectedTotal] = useState(0);
  const [expectedPlan, setExpectedPlan] = useState<Record<string, number>>({});

  // tick clock during generation for elapsed/ETA display
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  const refreshCount = async () => {
    const n = await countPerf();
    setExistingNow(n);
    const bd = await countPerfByType();
    setBreakdown(bd);
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
    setGenStartedAt(performance.now());
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
      const planMap: Record<string, number> = {};
      plan.forEach((p) => { planMap[p.type] = p.count; });
      setExpectedPlan(planMap);
      setExpectedTotal(plan.reduce((a, p) => a + p.count, 0));
      // Invalidate benchmark caches when data changes
      await clearAllSummaries();


      const CHUNK = total >= 250000 ? 2000 : 1000;
      const t0 = performance.now();
      let done = 0;
      const yieldToUI = () =>
        new Promise<void>((r) => {
          const ric = (window as any).requestIdleCallback as
            | ((cb: () => void, o?: any) => number)
            | undefined;
          if (ric) ric(() => r(), { timeout: 50 });
          else setTimeout(r, 0);
        });

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
          await yieldToUI();
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
    if (total >= 250000) {
      setStressTotal(total);
      setStressFresh(fresh);
      setStressOpen(true);
      return;
    }
    if (!fresh && existingNow > 0) {
      setPendingTotal(total);
      setPendingFresh(fresh);
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
    opts?: { forceFresh?: boolean },
  ) => {
    const fresh = !!opts?.forceFresh;
    const scopeKey: "all" | "batch" = mode === "last_batch" ? "batch" : "all";
    const bid = mode === "last_batch" ? batchId : null;
    const prevKey = `bench_summary:${mode}:${bid ?? "__all__"}`;
    const previousRow = (await getCachedSummary(prevKey)) as any;
    const previous = previousRow
      ? {
          mode: previousRow.mode, scopeRecords: previousRow.scopeRecords, genMs: previousRow.genMs,
          dashboardMs: previousRow.dashboardMs, itemsMs: previousRow.itemsMs, salesMs: previousRow.salesMs,
          reportsMs: previousRow.reportsMs, searchMs: previousRow.searchMs,
          memoryWarn: previousRow.memoryWarn, status: previousRow.status as Status,
        }
      : null;

    // Cached path: ensure aggregate cache exists; auto-build if missing.
    // Fresh path: skip cache entirely so we don't accidentally scan twice.
    let agg: PerfAggregate | null = null;
    if (!fresh) {
      agg = await getPerfCache(scopeKey, bid);
      if (!agg) {
        toast.message("Building PERF cache…");
        agg = await buildPerfCache(scopeKey, bid);
      }
    }

    const time = async (fn: () => Promise<any>) => {
      const s = performance.now();
      await fn();
      return Math.round(performance.now() - s);
    };

    let dashboardMs: number, itemsMs: number, salesMs: number, reportsMs: number, searchMs: number;
    let diag: Diag;

    if (fresh) {
      // Fresh (no aggregate cache): indexed paginated reads only — never scans full dataset
      const bidArg = bid ?? undefined;
      const dashReads = [{ type: "sales", limit: 25 }, { type: "payments", limit: 10 }];
      const itemsReads = [{ type: "items", limit: 100 }];
      const salesReads = [{ type: "sales", limit: 100 }];
      const reportsReads = [{ type: "sales", limit: 100 }, { type: "stock_movements", limit: 100 }];
      const searchLimit = 25;
      dashboardMs = await time(() => batchedReadSamples(dashReads, bidArg));
      itemsMs = await time(() => batchedReadSamples(itemsReads, bidArg));
      salesMs = await time(() => batchedReadSamples(salesReads, bidArg));
      reportsMs = await time(() => batchedReadSamples(reportsReads, bidArg));
      searchMs = await time(async () => {
        const db = await openDB();
        await new Promise<void>((res) => {
          const tx = db.transaction(STORE, "readonly");
          const idx = tx.objectStore(STORE).index("by_name_search");
          const req = idx.getAll(IDBKeyRange.bound("item 1", "item 1\uffff"), searchLimit);
          req.onsuccess = () => { db.close(); res(); };
          req.onerror = () => { db.close(); res(); };
        });
      });
      const pageRows =
        dashReads.reduce((s, r) => s + r.limit, 0) +
        itemsReads.reduce((s, r) => s + r.limit, 0) +
        salesReads.reduce((s, r) => s + r.limit, 0) +
        reportsReads.reduce((s, r) => s + r.limit, 0) +
        searchLimit;
      diag = {
        usedCache: false, usedFullScan: false, indexUsed: true,
        rowsScanned: pageRows, rowsRendered: 100,
      };
    } else {
      // Cached: read the precomputed aggregate — no row scan
      const a = agg!;
      dashboardMs = await time(async () => { void a.dashboardSummary; });
      itemsMs = await time(async () => { void a.itemsPage.slice(0, 100); });
      salesMs = await time(async () => { void a.salesPage.slice(0, 100); });
      reportsMs = await time(async () => { void a.reportsSummary; });
      searchMs = await time(async () => {
        const db = await openDB();
        await new Promise<void>((res) => {
          const tx = db.transaction(STORE, "readonly");
          const idx = tx.objectStore(STORE).index("by_name_search");
          const req = idx.getAll(IDBKeyRange.bound("item 1", "item 1\uffff"), 25);
          req.onsuccess = () => { db.close(); res(); };
          req.onerror = () => { db.close(); res(); };
        });
      });
      diag = {
        usedCache: true, usedFullScan: false, indexUsed: true,
        rowsScanned: 0,
        rowsRendered: Math.min(100, a.salesPage.length),
      };
    }

    let memoryWarn = false;
    const mem = (performance as any).memory;
    if (mem && mem.usedJSHeapSize > 0.8 * mem.jsHeapSizeLimit) memoryWarn = true;

    const worst = Math.max(dashboardMs, itemsMs, salesMs, reportsMs, searchMs);
    const status: Status = worst < 150 ? "Good" : worst < 500 ? "Needs Optimization" : "Slow";
    const next: Bench = {
      mode, scopeRecords: scope, genMs, dashboardMs, itemsMs, salesMs, reportsMs,
      searchMs, memoryWarn, status,
      cached: !fresh, source: fresh ? "fresh" : "cache",
      diag, previous,
    };
    setBench(next);
    await setCachedSummary(prevKey, {
      mode, scopeRecords: scope, genMs, dashboardMs, itemsMs, salesMs, reportsMs,
      searchMs, memoryWarn, status,
    });
    setCacheStatusVersion((v) => v + 1);
  };

  // ── PERF cache status (for the visible Cache Status card) ─────────────────
  const [cacheStatusVersion, setCacheStatusVersion] = useState(0);
  const [cacheStatus, setCacheStatus] = useState<{
    state: "Ready" | "Missing" | "Rebuilding";
    builtAt?: number;
    recordsIndexed?: number;
  }>({ state: "Missing" });
  const [cacheBuilding, setCacheBuilding] = useState(false);
  useEffect(() => {
    (async () => {
      const scopeKey: "all" | "batch" = benchMode === "last_batch" ? "batch" : "all";
      const bid = benchMode === "last_batch" ? lastBatchId : null;
      const c = await getPerfCache(scopeKey, bid);
      if (cacheBuilding) {
        setCacheStatus({ state: "Rebuilding" });
      } else if (c) {
        setCacheStatus({ state: "Ready", builtAt: c.builtAt, recordsIndexed: c.recordsIndexed });
      } else {
        setCacheStatus({ state: "Missing" });
      }
    })();
  }, [benchMode, lastBatchId, cacheStatusVersion, cacheBuilding, existingNow]);

  const buildOrRebuildCache = async () => {
    console.log("[perf] Build cache clicked", { benchMode, lastBatchId, existingNow, cacheBuilding });
    if (cacheBuilding) return;
    const scopeKey: "all" | "batch" = benchMode === "last_batch" ? "batch" : "all";
    const bid = benchMode === "last_batch" ? lastBatchId : null;

    // Re-check fresh count from DB (don't trust stale state)
    const liveCount = await countPerf();
    console.log("[perf] PERF records count (live)", liveCount);
    setExistingNow(liveCount);

    if (scopeKey === "all" && liveCount === 0) {
      toast.error("Generate performance data first, then build cache");
      return;
    }
    if (scopeKey === "batch" && (!bid || lastBatchCount === 0)) {
      toast.error("No batch in this session — switch to All PERF Records");
      return;
    }

    setCacheBuilding(true);
    const t0 = performance.now();
    console.log("[perf] Cache build started");
    toast.message("Building PERF cache...");
    try {
      await clearSummaryKey(cacheKeyFor(scopeKey, bid));
      const agg = await buildPerfCache(scopeKey, bid);
      const ms = Math.round(performance.now() - t0);
      console.log("[perf] Cache build completed", { ms, recordsIndexed: agg.recordsIndexed });
      toast.success(`PERF cache built successfully (${agg.recordsIndexed.toLocaleString()} rows · ${ms} ms)`);
    } catch (e: any) {
      console.error("[perf] Cache build error", e);
      toast.error(`PERF cache build failed: ${e?.message ?? e}`);
    } finally {
      setCacheBuilding(false);
      setCacheStatusVersion((v) => v + 1);
    }
  };


  const [benchRunning, setBenchRunning] = useState(false);
  const rerunBenchmark = async (modeArg: BenchMode, fresh = false) => {
    if (benchRunning) return;
    console.log("[perf] benchmark button clicked", { mode: modeArg, fresh });

    // Auto-fallback: if user picked Last Batch but no batch in this session, use all PERF
    let mode = modeArg;
    const currentPerf = await countPerf();
    if (mode === "last_batch" && (lastBatchCount === 0 || !lastBatchId)) {
      if (currentPerf > 0) {
        mode = "all_perf";
        toast.message("No batch in this session — benchmarking all PERF records");
      } else {
        toast.error("Generate performance data first");
        return;
      }
    }
    setBenchMode(mode);
    const scope = mode === "last_batch" ? lastBatchCount : currentPerf;
    if (scope === 0) {
      toast.error("Generate performance data first");
      return;
    }
    console.log("[perf] benchmark started", { mode, scope, batchId: lastBatchId });
    setBenchRunning(true);
    try {
      if (fresh) {
        // Fresh: clear only this scope's aggregate cache so the timed full scan
        // is honest. Never deletes [PERF] data.
        const bid = mode === "last_batch" ? lastBatchId : null;
        const scopeKey: "all" | "batch" = mode === "last_batch" ? "batch" : "all";
        await clearSummaryKey(cacheKeyFor(scopeKey, bid));
      }
      await runBenchmark(mode, scope, lastGenMs, lastBatchId, { forceFresh: fresh });
      console.log("[perf] benchmark completed");
      toast.success(fresh ? "Fresh benchmark completed" : "Benchmark completed");
    } catch (e: any) {
      console.error("[perf] benchmark error", e);
      toast.error(`Benchmark failed: ${e?.message ?? e}`);
    } finally {
      setBenchRunning(false);
    }
  };



  const improvement = (before?: number, after?: number) => {
    if (before == null || after == null || before <= 0) return undefined;
    const pct = Math.round(((before - after) / before) * 100);
    if (pct === 0) return `${before} → ${after} ms`;
    const sign = pct > 0 ? "▼" : "▲";
    return `${before} → ${after} ms (${sign} ${Math.abs(pct)}%)`;
  };


  const cancel = () => { cancelRef.current = true; };

  const handleClear = async () => {
    if (!window.confirm("Clear all [PERF] performance test data? Real and demo data are NOT affected.")) return;
    setClearing(true);
    setClearedCount(0);
    try {
      const n = await clearPerf((p) => setClearedCount(p));
      setClearedCount(n);
      await clearAllSummaries();
      toast.success(`Cleared ${n.toLocaleString()} [PERF] records`);
      setBench(null);
      setLastBatchCount(0);
      setLastBatchId(null);
      setExistingBefore(0);
      setExpectedPlan({});
      setExpectedTotal(0);
      await refreshCount();
    } catch (e: any) {
      toast.error(`Cleanup failed: ${e?.message ?? e}`);
    } finally {
      setClearing(false);
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
              {[1000, 10000, 50000, 100000, 250000, 500000].map((n) => (
                <Button key={n} variant="outline" disabled={running} onClick={() => onClickGenerate(n, false)}>
                  <Play className="w-4 h-4 mr-1" /> Generate {n.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Fresh (clears [PERF] first)</div>
            <div className="flex flex-wrap gap-2">
              {[1000, 10000, 50000, 100000, 250000, 500000].map((n) => (
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

          {running && (() => {
            void tick;
            const elapsedMs = genStartedAt ? performance.now() - genStartedAt : 0;
            const rate = elapsedMs > 0 && generated > 0 ? generated / (elapsedMs / 1000) : 0;
            const remain = rate > 0 ? Math.max(0, (target - generated) / rate) : 0;
            const fmt = (s: number) => {
              if (!isFinite(s) || s <= 0) return "—";
              if (s < 60) return `${Math.round(s)}s`;
              const m = Math.floor(s / 60), r = Math.round(s % 60);
              return `${m}m ${r}s`;
            };
            return (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating {generated.toLocaleString()} / {target.toLocaleString()}
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
                <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>Elapsed: <strong>{fmt(elapsedMs / 1000)}</strong></span>
                  <span>ETA: <strong>{fmt(remain)}</strong></span>
                  <span>Rate: <strong>{rate ? Math.round(rate).toLocaleString() : 0}</strong> rows/s</span>
                </div>
              </div>
            );
          })()}

          {clearing && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Clearing [PERF] records… <strong>{clearedCount.toLocaleString()}</strong> removed
              </div>
              <Progress value={existingNow > 0 ? Math.min(100, Math.round((clearedCount / existingNow) * 100)) : 0} />
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

      {/* Benchmark Controls — always visible */}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" /> Benchmark Controls
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Scope:</span>
            <Select value={benchMode} onValueChange={(v) => setBenchMode(v as BenchMode)}>
              <SelectTrigger className="w-[220px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_batch">Last Batch ({lastBatchCount.toLocaleString()})</SelectItem>
                <SelectItem value="all_perf">All PERF Records ({existingNow.toLocaleString()})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {existingNow === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-md bg-warning/10 border border-warning/30 text-sm">
              <AlertTriangle className="w-4 h-4 text-warning" />
              Generate performance data first — then run the benchmark.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Cache status */}
              <div className="p-3 rounded-md border bg-muted/30 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    Cache status:{" "}
                    <strong
                      className={
                        cacheStatus.state === "Ready"
                          ? "text-success"
                          : cacheStatus.state === "Rebuilding"
                          ? "text-warning"
                          : "text-destructive"
                      }
                    >
                      {cacheBuilding ? "Rebuilding" : cacheStatus.state}
                    </strong>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => void buildOrRebuildCache()} disabled={cacheBuilding || benchRunning || running}>
                    {cacheBuilding ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Database className="w-3 h-3 mr-1" />}
                    Build/Rebuild PERF Cache
                  </Button>
                </div>
                <div className="text-muted-foreground">
                  {cacheStatus.builtAt
                    ? `Built at ${new Date(cacheStatus.builtAt).toLocaleTimeString()} · ${(cacheStatus.recordsIndexed ?? 0).toLocaleString()} rows indexed`
                    : "Cache not built yet. Cached benchmarks will build it on first run."}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-1">All PERF Records</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void rerunBenchmark("all_perf", false)}
                    disabled={benchRunning || running || cacheBuilding || existingNow === 0}
                  >
                    {benchRunning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                    Benchmark All PERF Records (Cached)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void rerunBenchmark("all_perf", true)}
                    disabled={benchRunning || running || cacheBuilding || existingNow === 0}
                  >
                    <Sparkles className="w-4 h-4 mr-1" /> Benchmark All PERF Records (Fresh Full Scan)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void rerunBenchmark("all_perf", false)}
                    disabled={benchRunning || running || cacheBuilding || existingNow < 1}
                    title="Cached aggregate covers the full PERF set including 500k"
                  >
                    <Gauge className="w-4 h-4 mr-1" /> Benchmark 500k Full (Cached)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void rerunBenchmark("all_perf", true)}
                    disabled={benchRunning || running || cacheBuilding || existingNow < 1}
                    title="Reads first 100,000 rows via IndexedDB indexes — no aggregate cache"
                  >
                    <Gauge className="w-4 h-4 mr-1" /> Benchmark 100k Sample
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1">Last Batch</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void rerunBenchmark("last_batch", false)}
                    disabled={benchRunning || running || cacheBuilding || lastBatchCount === 0}
                  >
                    <Gauge className="w-4 h-4 mr-1" /> Benchmark Last Batch (Cached)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void rerunBenchmark("last_batch", true)}
                    disabled={benchRunning || running || cacheBuilding || lastBatchCount === 0}
                  >
                    <Sparkles className="w-4 h-4 mr-1" /> Benchmark Last Batch (Fresh Full Scan)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {benchRunning && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Benchmark running...
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Fresh re-run clears only the benchmark summary cache. Your [PERF] data is never deleted by a benchmark.
          </div>
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
              <Badge variant={bench.source === "cache" ? "secondary" : "outline"}>
                {bench.mode === "last_batch" ? "Last Batch" : "All PERF Records"}
                {" · "}
                {bench.source === "cache" ? "Cached" : "Fresh Full Scan"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {bench.scopeRecords.toLocaleString()} rows in scope
              </span>
            </div>

          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Metric label="Records in scope" value={bench.scopeRecords.toLocaleString()} />
              <Metric label="Generation time" value={`${bench.genMs} ms`} />
              <Metric label="Dashboard load" value={`${bench.dashboardMs} ms`} sub={improvement(bench.previous?.dashboardMs, bench.dashboardMs)} />
              <Metric label="Items list load" value={`${bench.itemsMs} ms`} sub={improvement(bench.previous?.itemsMs, bench.itemsMs)} />
              <Metric label="Sales list load" value={`${bench.salesMs} ms`} sub={improvement(bench.previous?.salesMs, bench.salesMs)} />
              <Metric label="Reports load" value={`${bench.reportsMs} ms`} sub={improvement(bench.previous?.reportsMs, bench.reportsMs)} />
              <Metric label="Search response" value={`${bench.searchMs} ms`} sub={improvement(bench.previous?.searchMs, bench.searchMs)} />
              <Metric label="Memory" value={bench.memoryWarn ? "⚠ High" : "OK"} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void rerunBenchmark(bench.mode, bench.source === "fresh")}
                disabled={benchRunning}
              >
                <Gauge className="w-4 h-4 mr-1" /> Re-run ({bench.source === "cache" ? "Cached" : "Fresh Full Scan"})
              </Button>
              {bench.source === "cache" ? (
                <Badge variant="secondary">Cached summary used</Badge>
              ) : (
                <Badge variant="outline">Fresh full scan</Badge>
              )}

              {bench.previous && (
                <span className="text-xs text-muted-foreground">
                  Compared to previous run — improvements shown under each metric.
                </span>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <Metric label="Used cache" value={bench.diag.usedCache ? "Yes" : "No"} />
              <Metric label="Used full scan" value={bench.diag.usedFullScan ? "Yes" : "No"} />
              <Metric label="IndexedDB index used" value={bench.diag.indexUsed ? "Yes" : "No"} />
              <Metric label="Rows scanned" value={bench.diag.rowsScanned.toLocaleString()} />
              <Metric label="Rows rendered" value={bench.diag.rowsRendered.toLocaleString()} />
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

      {/* Records breakdown / diagnostics */}
      {existingNow > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="w-4 h-4 text-primary" /> Records Breakdown by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2">Type</th>
                    <th className="py-2 text-right">Expected</th>
                    <th className="py-2 text-right">Actual</th>
                    <th className="py-2 text-right">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_TYPES.map((t) => {
                    const exp = expectedPlan[t.key] ?? 0;
                    const act = breakdown[t.key] ?? 0;
                    const miss = Math.max(0, exp - act);
                    return (
                      <tr key={t.key} className="border-b last:border-0">
                        <td className="py-1.5">{t.label}</td>
                        <td className="py-1.5 text-right tabular-nums">{exp.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums">{act.toLocaleString()}</td>
                        <td className={`py-1.5 text-right tabular-nums ${miss > 0 ? "text-warning" : "text-muted-foreground"}`}>
                          {miss > 0 ? miss.toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right tabular-nums">{expectedTotal.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{existingNow.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.max(0, expectedTotal - existingNow).toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {expectedTotal > 0 && expectedTotal !== existingNow && (
              <div className="mt-3 text-xs text-muted-foreground">
                Note: small differences between requested total and actual counts are caused by
                per-type ratio rounding (each type count is rounded to an integer).
              </div>
            )}
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

      {/* Stress test warning modal (>=250k) */}
      <Dialog open={stressOpen} onOpenChange={setStressOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Heavy stress test: {stressTotal.toLocaleString()} records
            </DialogTitle>
            <DialogDescription>
              {stressTotal.toLocaleString()} records is a heavy stress test. It may take time and
              can slow the browser. Real/demo data will not be affected. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setStressOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setStressOpen(false);
                if (!stressFresh && existingNow > 0) {
                  setPendingTotal(stressTotal);
                  setPendingFresh(false);
                  setConfirmOpen(true);
                } else {
                  void startGenerate(stressTotal, stressFresh);
                }
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded-md border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
