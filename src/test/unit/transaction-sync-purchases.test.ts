/** @vitest-environment jsdom */
/**
 * Phase D — purchase bill cloud sync.
 *
 * Guarantees verified:
 *   1. Local Mode never reaches the uploader (no register, no enqueue).
 *   2. Cloud Mode enqueueing registers a stable local_id + idempotency_key.
 *   3. Retry: an already-landed (company, bill_no) row is reused — no
 *      duplicate purchase is created.
 *   4. Postgres 23505 race resolves as a non-fatal duplicate-success.
 *   5. Duplicate bill_no in the same company is blocked BEFORE any cloud
 *      call by the reference-no guard in registerTransaction.
 *   6. A failed sync leaves the record `failed`/queued for retry.
 *   7. A successful sync clears the queue and persists local→cloud map.
 *   8. The purchase uploader does NOT touch stock_movements.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";

const stub = vi.hoisted(() => {
  const session = { access_token: "tok" };
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const rows = new Map<string, { id: string; company_id: string; bill_no: string }>();
  let nextId = 1;
  let failNext: string | null = null;
  let dupNext = false;
  const reset = () => {
    inserts.length = 0;
    rows.clear();
    nextId = 1;
    failNext = null;
    dupNext = false;
  };
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
    from(table: string) {
      return {
        select: (_c: string) => ({
          is: (_c0: string, _v0: null) => ({
            eq: (_c1: string, v1: string) => ({
              eq: (_c2: string, v2: string) => ({
                maybeSingle: async () => {
                  const found = [...rows.values()].find(
                    (r) => r.company_id === v1 && r.bill_no === v2,
                  );
                  return { data: found ? { id: found.id } : null, error: null };
                },
              }),
            }),
          }),
        }),
        insert: (row: Record<string, unknown> | Record<string, unknown>[]) => ({
          select: (_cols: string) => ({
            single: async () => {
              const r = Array.isArray(row) ? row[0]! : row;
              if (table === "purchases" && failNext) {
                const msg = failNext;
                failNext = null;
                return { data: null, error: { message: msg, code: "NETERR" } };
              }
              if (table === "purchases" && dupNext) {
                dupNext = false;
                return {
                  data: null,
                  error: {
                    message:
                      'duplicate key value violates unique constraint "purchases_company_idempotency_key_uidx"',
                    code: "23505",
                  },
                };
              }
              inserts.push({ table, row: r });
              if (table === "purchases") {
                const id = `cloud-p-${nextId++}`;
                rows.set(id, {
                  id,
                  company_id: String(r.company_id),
                  bill_no: String(r.bill_no),
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
    failNext(msg: string) {
      failNext = msg;
    },
    forceDupNext() {
      dupNext = true;
    },
    seedExisting(companyId: string, billNo: string, id: string) {
      rows.set(id, { id, company_id: companyId, bill_no: billNo });
    },
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: stub.client }));

import {
  __resetTxnSyncStore,
  __resetPurchaseSyncStore,
  __resetReplayLatch,
  __resetUploaderInstall,
  preflightPurchaseSync,
  preparePurchaseSync,
  enqueuePurchase,
  installSalesUploader,
  replayQueue,
  peekQueue,
  getPurchaseRecord,
  listRecords,
  type PurchasePayload,
} from "@/lib/transaction-sync";
import { getActiveUploader } from "@/lib/transaction-sync/active-uploader";
import { setLaunchMode, clearLaunchMode } from "@/lib/launch-mode";

const CO = "co-purch";

function payload(over: Partial<PurchasePayload> = {}): PurchasePayload {
  return {
    company_id: CO,
    bill_no: "BILL-1",
    bill_date: "2026-06-17",
    due_date: null,
    party_id: null,
    notes: null,
    status: "unpaid",
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    paid: 0,
    balance: 100,
    doc_type: "bill",
    items: [
      {
        item_id: "i1",
        item_name: "Widget",
        qty: 5,
        unit: "pcs",
        price: 20,
        discount_pct: 0,
        tax_pct: 0,
        amount: 100,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  __resetTxnSyncStore();
  __resetPurchaseSyncStore();
  __resetReplayLatch();
  __resetUploaderInstall();
  stub.reset();
  clearLaunchMode();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

describe("Local Mode is fully denied", () => {
  test("preflight denies Local Mode synchronously", () => {
    setLaunchMode("local");
    expect(preflightPurchaseSync(CO)).toEqual({ ok: false, reason: "local-mode" });
  });

  test("enqueuePurchase in Local Mode does not register or queue", async () => {
    setLaunchMode("local");
    const r = await enqueuePurchase({
      companyId: CO,
      localId: "P-LOC",
      billNo: "BILL-LOC",
      payload: payload(),
    });
    expect(r.ok).toBe(false);
    expect(getPurchaseRecord("P-LOC")).toBeNull();
    expect(peekQueue()).toEqual([]);
  });
});

describe("Cloud Mode purchase sync", () => {
  beforeEach(() => {
    setLaunchMode("cloud");
    installSalesUploader();
  });

  test("prepare mints stable local_id + idempotency_key, persists payload", async () => {
    const r = await preparePurchaseSync({
      companyId: CO,
      localId: "P-OK",
      billNo: "BILL-OK",
      payload: payload({ bill_no: "BILL-OK" }),
    });
    if (!r.ok) throw new Error("gate denied");
    expect(r.prepared.record.kind).toBe("purchase");
    expect(r.prepared.record.local_id).toBe("P-OK");
    expect(r.prepared.idempotencyKey).toBe("purchase:co-purch:P-OK");
  });

  test("happy path: replay creates exactly one cloud purchase + lines and clears queue", async () => {
    const enq = await enqueuePurchase({
      companyId: CO,
      localId: "P-HAPPY",
      billNo: "BILL-HAPPY",
      payload: payload({ bill_no: "BILL-HAPPY" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({ companyId: CO, uploader: getActiveUploader()! });
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(0);

    const rec = getPurchaseRecord("P-HAPPY");
    expect(rec?.status).toBe("synced");
    expect(rec?.cloud_id).toMatch(/^cloud-p-/);

    expect(stub.inserts.filter((i) => i.table === "purchases")).toHaveLength(1);
    expect(stub.inserts.filter((i) => i.table === "purchase_items")).toHaveLength(1);

    // Stock is NOT touched in Phase D.
    expect(stub.inserts.some((i) => i.table === "stock_movements")).toBe(false);

    // Queue drained.
    expect(peekQueue()).not.toContain("P-HAPPY");
  });

  test("retry reuses existing (company, bill_no) row — no duplicate purchase", async () => {
    stub.seedExisting(CO, "BILL-REUSE", "cloud-p-existing");
    const enq = await enqueuePurchase({
      companyId: CO,
      localId: "P-REUSE",
      billNo: "BILL-REUSE",
      payload: payload({ bill_no: "BILL-REUSE" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({ companyId: CO, uploader: getActiveUploader()! });
    expect(r.succeeded).toBe(1);
    expect(stub.inserts.filter((i) => i.table === "purchases")).toHaveLength(0);
    expect(getPurchaseRecord("P-REUSE")?.cloud_id).toBe("cloud-p-existing");
  });

  test("Postgres 23505 race → duplicate-resolved success, no retry", async () => {
    stub.forceDupNext();
    const enq = await enqueuePurchase({
      companyId: CO,
      localId: "P-DUP",
      billNo: "BILL-DUP",
      payload: payload({ bill_no: "BILL-DUP" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({
      companyId: CO,
      uploader: getActiveUploader()!,
      retry: { maxAttempts: 3 },
    });
    expect(r.succeeded).toBe(1);
    expect(r.attempts).toBe(1);
    expect(getPurchaseRecord("P-DUP")?.status).toBe("synced");
  });

  test("duplicate bill_no in same company is blocked at register, before any cloud call", async () => {
    const first = await enqueuePurchase({
      companyId: CO,
      localId: "P-FIRST",
      billNo: "BILL-DUP-LOCAL",
      payload: payload({ bill_no: "BILL-DUP-LOCAL" }),
    });
    expect(first.ok).toBe(true);

    await expect(
      enqueuePurchase({
        companyId: CO,
        localId: "P-SECOND",
        billNo: "BILL-DUP-LOCAL",
        payload: payload({ bill_no: "BILL-DUP-LOCAL" }),
      }),
    ).rejects.toThrow(/Duplicate purchase reference/);
  });

  test("failed sync stays pending in queue with status=failed", async () => {
    stub.failNext("network down");
    const enq = await enqueuePurchase({
      companyId: CO,
      localId: "P-FAIL",
      billNo: "BILL-FAIL",
      payload: payload({ bill_no: "BILL-FAIL" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    const r = await replayQueue({ companyId: CO, uploader: getActiveUploader()! });
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(getPurchaseRecord("P-FAIL")?.status).toBe("failed");
    expect(peekQueue()).toContain("P-FAIL");
  });

  test("purchase replay does not register any stock_movement records", async () => {
    const enq = await enqueuePurchase({
      companyId: CO,
      localId: "P-NOSTOCK",
      billNo: "BILL-NOSTOCK",
      payload: payload({ bill_no: "BILL-NOSTOCK" }),
    });
    if (!enq.ok) throw new Error("gate denied");

    await replayQueue({ companyId: CO, uploader: getActiveUploader()! });

    expect(listRecords({ kind: "stock_movement" })).toHaveLength(0);
    expect(stub.inserts.some((i) => i.table === "stock_movements")).toBe(false);
  });
});
