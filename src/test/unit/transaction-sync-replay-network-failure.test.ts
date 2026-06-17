/** @vitest-environment jsdom */
/**
 * Integration test — a transient network failure during cloud upload
 * must NOT create duplicate cloud rows on retry. The replay flow re-uses
 * the same idempotent (company_id, invoice_no) payload, and the second
 * attempt either short-circuits via the duplicate lookup or performs the
 * single insert. Either way, exactly one cloud row exists at the end.
 *
 * Scenario:
 *   1. Cloud Mode is active. A sales invoice is enqueued; the local
 *      record sits in `pending` status in the offline queue.
 *   2. The first `replayQueue` call uses an uploader whose first attempt
 *      throws a network-shaped error (`TypeError: Failed to fetch`)
 *      BEFORE the request reaches Supabase — no `sales` insert happens.
 *      With `maxAttempts: 1`, the record is marked failed; the queue
 *      still holds it because the underlying record is in `error`
 *      status (not `synced`), so a manual re-enqueue is unnecessary —
 *      we simply re-call `replayQueue` and it picks the record back up.
 *   3. The second `replayQueue` call uses the real Supabase uploader.
 *      It does the (company_id, invoice_no) lookup, finds no row, and
 *      issues exactly one `sales` insert with the same
 *      `idempotency_key`.
 *   4. Final state: exactly one cloud `sales` row, record is `synced`,
 *      queue is empty.
 *
 * Also verifies the retry-within-a-single-replay path: with
 * `maxAttempts: 2`, a first-attempt network failure followed by a
 * successful second attempt still produces exactly one cloud row.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

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

  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
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

  return { client, inserts, rows, reset };
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
  type Uploader,
} from "@/lib/transaction-sync";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-net-fail";
const INV = "INV-NET-1";

function payload(invoiceNo = INV): SalesInvoicePayload {
  return {
    company_id: CO,
    invoice_no: invoiceNo,
    invoice_date: "2026-06-17",
    due_date: null,
    party_id: "party-1",
    billing_name: "Cust",
    notes: null,
    status: "open",
    subtotal: 100,
    discount: 0,
    tax: 0,
    delivery_charge: 0,
    labor_charge: 0,
    total: 100,
    paid: 0,
    balance: 100,
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
        price: 100,
        discount_pct: 0,
        tax_pct: 0,
        amount: 100,
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

describe("replay network failure — retries without duplicate cloud rows", () => {
  test("a failed first replay (network error) followed by a second replay produces exactly one cloud row", async () => {
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-net-1",
      invoiceNo: INV,
      payload: payload(),
    });
    if (!enq.ok) throw new Error("gate denied");
    const idempotencyKey = enq.prepared.idempotencyKey;
    expect(peekQueue()).toEqual(["local-net-1"]);

    // --- First replay: simulate a transient network failure BEFORE the
    // request reaches Supabase (classic fetch rejection in the browser).
    let netCalls = 0;
    const flakyUploader: Uploader = async () => {
      netCalls += 1;
      throw new TypeError("Failed to fetch");
    };
    const r1 = await replayQueue({ companyId: CO, uploader: flakyUploader });
    expect(netCalls).toBe(1);
    expect(r1.attempted).toBe(1);
    expect(r1.succeeded).toBe(0);
    expect(r1.failed).toBe(1);
    expect(r1.attemptsLog[0]?.outcome).toBe("error");
    expect(r1.attemptsLog[0]?.error).toMatch(/Failed to fetch/);

    // No Supabase round-trip happened.
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(0);
    expect(stub.rows.size).toBe(0);

    // Record is in error state but still tracked locally.
    const afterFail = getSalesRecord("local-net-1");
    expect(afterFail?.status).toBe("error");
    expect(afterFail?.last_error).toMatch(/Failed to fetch/);
    // Queue still holds the entry (markFailed does not dequeue).
    expect(peekQueue()).toEqual(["local-net-1"]);

    // --- Second replay: network is back, use the real Supabase uploader.
    const realUploader = createSalesUploader(stub.client);
    const r2 = await replayQueue({ companyId: CO, uploader: realUploader });
    expect(r2.abortedReason).toBeUndefined();
    expect(r2.attempted).toBe(1);
    expect(r2.succeeded).toBe(1);
    expect(r2.failed).toBe(0);

    // Exactly one sales insert across BOTH replays — no duplicate row.
    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.company_id).toBe(CO);
    expect(salesInserts[0]!.row.invoice_no).toBe(INV);
    expect(salesInserts[0]!.row.idempotency_key).toBe(idempotencyKey);
    expect(stub.rows.size).toBe(1);

    const synced = getSalesRecord("local-net-1");
    expect(synced?.status).toBe("synced");
    expect(synced?.cloud_id).toMatch(/^cloud-/);
    expect(peekQueue()).toEqual([]);

    // --- A follow-up replay is a no-op — the queue is drained.
    const r3 = await replayQueue({ companyId: CO, uploader: realUploader });
    expect(r3.attempted).toBe(0);
    expect(stub.inserts.filter((i) => i.table === "sales")).toHaveLength(1);
    expect(stub.rows.size).toBe(1);
  });

  test("intra-replay retry (maxAttempts=2): first attempt fails with a network error, second succeeds, exactly one cloud row", async () => {
    const INV2 = "INV-NET-2";
    const enq = await enqueueSalesInvoice({
      companyId: CO,
      localId: "local-net-2",
      invoiceNo: INV2,
      payload: payload(INV2),
    });
    if (!enq.ok) throw new Error("gate denied");
    const idempotencyKey = enq.prepared.idempotencyKey;

    const realUploader = createSalesUploader(stub.client);
    let calls = 0;
    const retryingUploader: Uploader = async (rec) => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return realUploader(rec);
    };

    const r = await replayQueue({
      companyId: CO,
      uploader: retryingUploader,
      retry: { maxAttempts: 2, baseDelayMs: 0 },
      sleep: async () => {},
    });

    expect(calls).toBe(2);
    expect(r.attempted).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.attempts).toBe(2);
    expect(r.attemptsLog[0]?.outcome).toBe("error");
    expect(r.attemptsLog[1]?.outcome).toBe("success");

    const salesInserts = stub.inserts.filter((i) => i.table === "sales");
    expect(salesInserts).toHaveLength(1);
    expect(salesInserts[0]!.row.invoice_no).toBe(INV2);
    expect(salesInserts[0]!.row.idempotency_key).toBe(idempotencyKey);
    expect(stub.rows.size).toBe(1);

    const rec = getSalesRecord("local-net-2");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-/);
    expect(peekQueue()).toEqual([]);
  });
});
