/** @vitest-environment jsdom */
/**
 * Integration test — a replay that crashes mid-flight must release the
 * `inFlight` latch so the next replay can run and drain the queue
 * without creating duplicate cloud rows.
 *
 * Scenario:
 *   1. A sales invoice is enqueued in Cloud Mode.
 *   2. The first `replayQueue` call crashes mid-flight: the latch is set,
 *      preflight has begun, and `supabase.auth.getSession` rejects with
 *      a network-style error. The promise rejects to the caller.
 *   3. The crash MUST NOT leave the in-flight latch stuck. A second
 *      `replayQueue` call must NOT short-circuit with `"in-flight"` and
 *      must reach the uploader.
 *   4. Final state: exactly one cloud row, no duplicates, queue drained,
 *      record bound to the single cloud id.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

// --- Supabase client mock --------------------------------------------------

type SalesRow = {
  id: string;
  company_id: string;
  invoice_no: string;
  idempotency_key: string;
};

const stub = vi.hoisted(() => {
  const okSession = { access_token: "tok" } as { access_token: string };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  let failSalesInsertOnce = false;

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failSalesInsertOnce = false;
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: okSession },
        error: null,
      })),
    },
    from(table: string) {
      return {
        select: (_cols: string) => ({
          is: (_c0: string, _v0: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  const found = [...rows.values()].find(
                    (r) => r.company_id === v1 && r.invoice_no === v2,
                  );
                  return {
                    data: found ? { id: found.id } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              if (table === "sales" && failSalesInsertOnce) {
                failSalesInsertOnce = false;
                return { data: null, error: { message: "transient" } };
              }
              const r = Array.isArray(row) ? row[0]! : row;
              inserts.push({ table, row: r });
              if (table === "sales") {
                const id = `cloud-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  invoice_no: String(r.invoice_no),
                  idempotency_key: String(r.idempotency_key),
                });
                return { data: { id }, error: null };
              }
              return { data: { id: `${table}-${nextId++}` }, error: null };
            },
          }),
        }),
      };
    },
  };

  return {
    client,
    inserts,
    rows,
    reset,
    armSalesInsertFailure() {
      failSalesInsertOnce = true;
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: stub.client,
}));

import {
  __resetTxnSyncStore,
  __resetSalesSyncStore,
  __resetReplayLatch,
  enqueueSalesInvoice,
  getSalesRecord,
  peekQueue,
  replayQueue,
  createSalesUploader,
  type SalesInvoicePayload,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-crash";
const INV = "INV-CRASH-1";

function payload(): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: INV,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cust",
    notes: null,
    status: "open",
    subtotal: 250,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 250,
    paid: 0,
    balance: 250,
    payment_method: "cash",
    doc_type: "invoice",
    items: [
      {
        item_id: "i1",
        item_code: "SKU-1",
        item_name: "Widget",
        description: null,
        qty: 1,
        unit: "pcs",
        price: 250,
        discount_pct: 0,
        tax_pct: 0,
        amount: 250,
      },
    ],
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetSalesSyncStore();
  __resetReplayLatch();
  stub.reset();
  clearLaunchMode();
  setLaunchMode("cloud");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("replay crash mid-flight — in-flight latch is released", () => {
  test("after a mid-flight crash, the next replay drains the queue with no duplicates", async () => {
    const uploader = createSalesUploader(stub.client);

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-crash-1",
      invoiceNo: INV,
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");
    const idempotencyKey = enq.prepared.idempotencyKey;
    expect(peekQueue()).toEqual(["local-crash-1"]);

    // --- Crash mid-flight: the FIRST upload attempt fails (caught by the
    // per-attempt retry), then `sleep()` between attempt 1 and attempt 2
    // throws. `sleep` runs INSIDE the outer `try/finally` but OUTSIDE the
    // per-attempt inner `try/catch`, so the throw escapes the run and
    // rejects to the caller — exactly the "crash mid-flight" path.
    stub.armSalesInsertFailure();
    const crashingSleep = vi.fn(async () => {
      throw new Error("sleep crashed mid-flight");
    });
    await expect(
      replayQueue({
        companyId: CO,
        uploader,
        retry: { maxAttempts: 3, baseDelayMs: 5, maxDelayMs: 5, factor: 1 },
        sleep: crashingSleep,
      }),
    ).rejects.toThrow(/sleep crashed mid-flight/);
    expect(crashingSleep).toHaveBeenCalled();

    // Nothing was uploaded, queue still holds the record.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);
    expect(peekQueue()).toEqual(["local-crash-1"]);

    // --- The latch must be cleared: a follow-up replay actually runs.
    // If the latch were stuck, this would short-circuit with
    // `abortedReason: "in-flight"` and `attempted === 0`.
    const r2 = await replayQueue({ companyId: CO, uploader });
    expect(r2.abortedReason).toBeUndefined();
    expect(r2.attempted).toBe(1);
    expect(r2.succeeded).toBe(1);
    expect(r2.failed).toBe(0);

    // Exactly one sales insert across BOTH attempts — no duplicate.
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.company_id).toBe(CO);
    expect(salesInserts[0]!.row.invoice_no).toBe(INV);
    expect(salesInserts[0]!.row.idempotency_key).toBe(idempotencyKey);
    expect(stub.rows.size).toBe(1);

    const rec = getSalesRecord("local-crash-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    expect(peekQueue()).toEqual([]);

    // Sanity: a third replay stays a no-op — latch isn't stuck the other
    // way (i.e. perma-released yet still blocking further reads).
    const r3 = await replayQueue({ companyId: CO, uploader });
    expect(r3.attempted).toBe(0);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);
    expect(stub.rows.size).toBe(1);
  });
});
