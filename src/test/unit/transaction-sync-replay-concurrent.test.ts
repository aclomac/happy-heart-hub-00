/** @vitest-environment jsdom */
/**
 * Integration test — two simultaneous replay actions for the same
 * (company_id, invoice_no) must result in exactly ONE cloud upload row.
 *
 * Two independent safety nets back this up:
 *   1. `replayQueue` has an `inFlight` latch. The second concurrent call
 *      short-circuits with `abortedReason: "in-flight"` and never invokes
 *      the uploader.
 *   2. Even if both calls reached the uploader (e.g. across tabs, where
 *      the in-process latch wouldn't protect), the uploader's
 *      (company_id, invoice_no) lookup against the cloud would reuse the
 *      existing row instead of inserting a duplicate.
 *
 * This test asserts both: the in-flight latch fires, AND we end with
 * exactly one cloud row.
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
  let session: { access_token: string } | null = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, SalesRow>();
  let nextId = 1;
  // Gate that holds the first sales insert until released — used to make
  // both replay calls overlap deterministically.
  let release: (() => void) | null = null;
  let pending: Promise<void> | null = null;
  let blockedOnce = false;

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    session = { access_token: "tok" };
    release = null;
    pending = null;
    blockedOnce = false;
  };

  const armSalesInsertHold = () => {
    blockedOnce = true;
    pending = new Promise<void>((resolve) => {
      release = resolve;
    });
  };

  const releaseSalesInsert = () => {
    release?.();
    release = null;
  };

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
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
              if (table === "sales" && blockedOnce && pending) {
                blockedOnce = false;
                await pending;
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
    armSalesInsertHold,
    releaseSalesInsert,
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

const CO = "co-concurrent";
const INV = "INV-CONCURRENT-1";

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
    subtotal: 300,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 300,
    paid: 0,
    balance: 300,
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
        price: 300,
        discount_pct: 0,
        tax_pct: 0,
        amount: 300,
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

describe("two simultaneous replay actions — single cloud row per (company, invoice)", () => {
  test("concurrent replayQueue calls produce exactly one cloud row; second call short-circuits", async () => {
    const uploader = createSalesUploader(stub.client);

    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-concurrent-1",
      invoiceNo: INV,
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");
    expect(peekQueue()).toEqual(["local-concurrent-1"]);

    // Hold the sales insert open so the first replay is still in-flight
    // when the second one is launched.
    stub.armSalesInsertHold();

    const p1 = replayQueue({ companyId: CO, uploader });
    // Yield so p1 starts its uploader call and parks inside the insert.
    await Promise.resolve();
    await Promise.resolve();
    const p2 = replayQueue({ companyId: CO, uploader });

    // The second concurrent run must short-circuit on the in-flight latch
    // — no uploader invocation, no attempt counted.
    const r2 = await p2;
    expect(r2.abortedReason).toBe("in-flight");
    expect(r2.attempted).toBe(0);
    expect(r2.succeeded).toBe(0);

    // Now let the first run finish.
    stub.releaseSalesInsert();
    const r1 = await p1;
    expect(r1.succeeded).toBe(1);
    expect(r1.failed).toBe(0);

    // Exactly one sales insert reached the cloud — no duplicate.
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.company_id).toBe(CO);
    expect(salesInserts[0]!.row.invoice_no).toBe(INV);
    expect(stub.rows.size).toBe(1);

    const rec = getSalesRecord("local-concurrent-1");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    expect(peekQueue()).toEqual([]);

    // A follow-up replay after both have settled stays a no-op — queue
    // drained, no extra inserts even if the user clicks again.
    const r3 = await replayQueue({ companyId: CO, uploader });
    expect(r3.attempted).toBe(0);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);
    expect(stub.rows.size).toBe(1);
  });
});
